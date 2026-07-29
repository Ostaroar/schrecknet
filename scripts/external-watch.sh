#!/usr/bin/env bash
# External change watch for the card-data pipeline and the upstream community
# projects we track. Cheap by design: HEAD requests + tiny GitHub API calls,
# compared against a locally cached fingerprint. Prints a compact report and
# only downloads the 7 MB KRCG card blob when its ETag actually moved.
#
#   scripts/external-watch.sh          # check, update state, print report
#   scripts/external-watch.sh --dry    # check without writing state
#
# Exit codes: 0 = no changes, 10 = changes found, 1 = hard error.
set -uo pipefail

STATE_DIR="${EXTERNAL_WATCH_STATE:-$(cd "$(dirname "$0")/.." && pwd)/.claude/external-watch}"
STATE_FILE="$STATE_DIR/state.env"
CARD_INDEX="$STATE_DIR/cards.txt"
DRY=0
[ "${1:-}" = "--dry" ] && DRY=1
mkdir -p "$STATE_DIR"
touch "$STATE_FILE"
# shellcheck disable=SC1090
. "$STATE_FILE"

NEW_STATE=""
CHANGES=""
NOTES=""

remember() { NEW_STATE+="$1=$(printf '%q' "$2")"$'\n'; }
changed()  { CHANGES+="- $1"$'\n'; }
note()     { NOTES+="  $1"$'\n'; }

prev() { eval "printf '%s' \"\${$1:-}\""; }

# --- HTTP fingerprints (ETag, falls back to Last-Modified) -------------------
check_http() {
  local key="$1" label="$2" url="$3"
  local hdr fp
  hdr=$(curl -sSI -m 30 --retry 2 "$url" 2>/dev/null)
  [ -z "$hdr" ] && { note "$label: unreachable"; remember "$key" "$(prev "$key")"; return; }
  case "$hdr" in *"200"*) ;; *) note "$label: non-200 response"; remember "$key" "$(prev "$key")"; return;; esac
  fp=$(printf '%s' "$hdr" | tr -d '\r' | awk 'BEGIN{IGNORECASE=1} /^etag:|^last-modified:/ {print}' | sort | tr '\n' ' ')
  local old; old=$(prev "$key")
  [ -n "$old" ] && [ "$old" != "$fp" ] && changed "$label CHANGED — $url (was: $old / now: $fp)"
  remember "$key" "$fp"
}

# --- GitHub repo head commit ------------------------------------------------
check_repo() {
  local key="$1" repo="$2"
  local sha
  sha=$(curl -sS -m 30 --retry 2 -H 'Accept: application/vnd.github+json' \
        "https://api.github.com/repos/$repo/commits?per_page=1" 2>/dev/null \
        | awk -F'"' '/"sha"/ {print $4; exit}')
  [ -z "$sha" ] && { note "$repo: GitHub API unavailable (rate limit?)"; remember "$key" "$(prev "$key")"; return; }
  local old; old=$(prev "$key")
  [ -n "$old" ] && [ "$old" != "$sha" ] && \
    changed "$repo has new commits — https://github.com/$repo/compare/$old...$sha"
  remember "$key" "$sha"
}

check_http krcg_cards  "KRCG card data (vtes.json)" https://static.krcg.org/data/vtes.json
check_http krcg_twda   "KRCG TWDA (twda.json)"      https://static.krcg.org/data/twda.json
check_http vekn_csv    "VEKN official CSV bundle"   https://www.vekn.net/images/stories/downloads/vtescsv_utf8.zip

check_repo repo_krcg        lionel-panhaleux/krcg          # rulings + normalization logic
check_repo repo_krcg_static lionel-panhaleux/krcg-static   # published data files
check_repo repo_vtescsv     lionel-panhaleux/vtescsv       # VEKN CSV mirror
check_repo repo_vdb         smeea/vdb                      # feature-parity reference

# --- Card-level diff, only when the KRCG blob moved -------------------------
if printf '%s' "$CHANGES" | grep -q 'KRCG card data'; then
  tmp=$(mktemp)
  if curl -sS -m 120 --retry 2 https://static.krcg.org/data/vtes.json -o "$tmp"; then
    new_index=$(python3 - "$tmp" <<'PY'
import json, sys
cards = json.load(open(sys.argv[1]))
for c in cards:
    sets = ",".join(sorted((c.get("sets") or {}).keys()))
    print(f'{c.get("id")}\t{c.get("name")}\t{sets}')
PY
)
    if [ -s "$CARD_INDEX" ]; then
      added=$(comm -13 <(sort "$CARD_INDEX") <(printf '%s\n' "$new_index" | sort) | cut -f2 | sort -u)
      removed=$(comm -23 <(sort "$CARD_INDEX") <(printf '%s\n' "$new_index" | sort) | cut -f2 | sort -u)
      [ -n "$added" ]   && changed "New/changed cards ($(printf '%s\n' "$added" | wc -l | tr -d ' ')): $(printf '%s' "$added" | head -30 | paste -sd', ' -)"
      [ -n "$removed" ] && changed "Cards removed/renamed ($(printf '%s\n' "$removed" | wc -l | tr -d ' ')): $(printf '%s' "$removed" | head -30 | paste -sd', ' -)"
    else
      note "card index baseline created ($(printf '%s\n' "$new_index" | wc -l | tr -d ' ') cards)"
    fi
    [ "$DRY" -eq 0 ] && printf '%s\n' "$new_index" > "$CARD_INDEX"
  else
    note "could not download vtes.json for card diff"
  fi
  rm -f "$tmp"
fi

# --- Legal/compliance review cadence (weekly, Mondays) ----------------------
if [ "$(date +%u)" = "1" ]; then
  changed "LEGAL REVIEW DUE (weekly): re-check DSGVO/TTDSG, EU Accessibility Act (BFSG),
  and Black Chantry Dark Pack licence terms against docs + LegalPage.tsx"
fi

# --- Report -----------------------------------------------------------------
[ "$DRY" -eq 0 ] && printf '%s' "$NEW_STATE" > "$STATE_FILE"

if [ -z "$CHANGES" ]; then
  echo "NO CHANGES ($(date +%F))"
  [ -n "$NOTES" ] && { echo "notes:"; printf '%s' "$NOTES"; }
  exit 0
fi

echo "CHANGES DETECTED ($(date +%F))"
printf '%s' "$CHANGES"
[ -n "$NOTES" ] && { echo "notes:"; printf '%s' "$NOTES"; }
exit 10
