//! Fetch + disk-cache the KRCG static card data exports.

use std::collections::BTreeSet;
use std::path::Path;
use std::time::{Duration, SystemTime};

const SOURCE_URL: &str = "https://static.krcg.org/data/vtes.json";
/// KRCG's API-v5-schema export of the same cards. Undocumented on
/// static.krcg.org's index, but it is what vdb's own card-update script pulls
/// from (`misc/cards-update/download_resources.sh`), it is regenerated in
/// lockstep with `/data/vtes.json`, and it is the ONLY machine-readable
/// statement anywhere of which cards are V5-legal by exception
/// (docs/adr/0014-v5-pool-from-krcg-formats.md).
const V5_SOURCE_URL: &str = "https://static.krcg.org/data/v5/vtes.json";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

fn fetch_cached(
    cache_dir: &Path,
    file_name: &str,
    url: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(cache_dir)?;
    let cache_file = cache_dir.join(file_name);

    let fresh = std::fs::metadata(&cache_file)
        .and_then(|m| m.modified())
        .map(|modified| {
            SystemTime::now()
                .duration_since(modified)
                .unwrap_or(Duration::MAX)
                < CACHE_TTL
        })
        .unwrap_or(false);

    if fresh {
        eprintln!("krcg: using cached {}", cache_file.display());
        Ok(std::fs::read_to_string(&cache_file)?)
    } else {
        eprintln!("krcg: fetching {url}");
        let body = ureq::get(url).call()?.into_string()?;
        std::fs::write(&cache_file, &body)?;
        Ok(body)
    }
}

/// Returns the raw KRCG card array, using a local disk cache under
/// `data/.cache/vtes.json` (gitignored) so repeated `build` runs during
/// development don't hammer the network. CI always has network access, so
/// a fresh checkout simply fetches once per run.
pub fn fetch_cards(cache_dir: &Path) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
    let body = fetch_cached(cache_dir, "vtes.json", SOURCE_URL)?;
    Ok(serde_json::from_str(&body)?)
}

/// Card ids KRCG marks as V5-legal *by exception* — cards whose own printings
/// are all in non-V5 products but which Black Chantry's V5 format text
/// individually legalises (the Promo Pack 3/4 cards). Read from the
/// `formats` array on KRCG's v5-schema export; a card qualifies when that
/// array contains `"V5"`.
///
/// This is deliberately the ONE part of the pool definition that is fetched
/// rather than hardcoded: it is the part that grows silently (a new promo
/// pack legalises more cards without any new *set* appearing), which is
/// exactly how 16 legal promos went missing from the site before
/// docs/adr/0014. Set membership has no such feed and stays curated.
pub fn fetch_v5_exception_ids(
    cache_dir: &Path,
) -> Result<BTreeSet<i64>, Box<dyn std::error::Error>> {
    let body = fetch_cached(cache_dir, "vtes-v5.json", V5_SOURCE_URL)?;
    let cards: Vec<serde_json::Value> = serde_json::from_str(&body)?;

    let mut ids: BTreeSet<i64> = cards
        .iter()
        .filter(|card| {
            card.get("formats")
                .and_then(|f| f.as_array())
                .is_some_and(|formats| formats.iter().any(|f| f.as_str() == Some("V5")))
        })
        .filter_map(|card| card.get("id").and_then(|id| id.as_i64()))
        .collect();

    for (wrong, right) in crate::v5pool::KRCG_FORMAT_CORRECTIONS {
        if ids.remove(wrong) {
            eprintln!("krcg: correcting upstream formats bug — {wrong} -> {right}");
        }
        ids.insert(*right);
    }

    // Every crypt card Black Chantry legalises by name is from the V5 card
    // line, i.e. group 5 or later; the promos are all G6/G7. A group-2 vampire
    // carrying formats=["V5"] is an upstream data error, not a discovery — that
    // is exactly how Tegyrius, Vizier (G2) reached the live site. Fail rather
    // than publish a classic-era card on a V5-only site.
    let suspicious: Vec<String> = cards
        .iter()
        .filter(|card| {
            card.get("id")
                .and_then(|id| id.as_i64())
                .is_some_and(|id| ids.contains(&id))
        })
        .filter(|card| {
            card.get("group")
                .and_then(|g| g.as_i64())
                .is_some_and(|g| g < 5)
        })
        .map(|card| {
            format!(
                "{} (id {}, group {})",
                card.get("printed_name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("?"),
                card.get("id").and_then(|i| i.as_i64()).unwrap_or(-1),
                card.get("group").and_then(|g| g.as_i64()).unwrap_or(-1),
            )
        })
        .collect();
    if !suspicious.is_empty() {
        return Err(format!(
            "KRCG marks pre-V5 crypt card(s) as V5-legal: {}. Every V5 promo \
             vampire is group 5 or later, so this is an upstream data error. \
             Check the card against Black Chantry's promo list and add a \
             correction to v5pool::KRCG_FORMAT_CORRECTIONS.",
            suspicious.join(", ")
        )
        .into());
    }

    // A structural change upstream (field renamed, format string changed)
    // would silently empty this set and quietly drop every promo from the
    // pool. Fail the build loudly instead — the whole point of ADR 0014 is
    // that pool drift must never be silent.
    if ids.is_empty() {
        return Err(format!(
            "KRCG {V5_SOURCE_URL} yielded no cards with formats containing \"V5\" — \
             the upstream schema likely changed. Refusing to build a pool that \
             silently drops every V5-legal promo card."
        )
        .into());
    }

    eprintln!("krcg: {} V5 format exception cards", ids.len());
    Ok(ids)
}
