//! The V5 card pool definition — the one piece of domain knowledge in this
//! pipeline that determines "is this card on SchreckNet at all" (AGENTS.md:
//! "V5 only"). Keep this list current as VEKN releases new V5-line products;
//! it is intentionally the only place that names sets, so a new expansion is
//! a one-line change here rather than a hunt through the pipeline.
//!
//! Sourced from KRCG's `sets` field on https://static.krcg.org/data/vtes.json
//! (2026-07-18 snapshot). Names like "Anarchs" or "Sabbat War" are *not*
//! included even though they sound V5-adjacent — those are original-era set
//! names KRCG reuses; the actual V5 line uses the names below.
pub const V5_SET_NAMES: &[&str] = &[
    "Fifth Edition",
    "Fifth Edition (Anarch)",
    "Fifth Edition (Companion)",
    "New Blood",
    "New Blood II",
    "New Blood III",
    "Sabbat V5",
    "V5 Polish Edition promo",
];

pub fn card_sets(card: &serde_json::Value) -> impl Iterator<Item = &str> {
    card.get("sets")
        .and_then(|s| s.as_object())
        .into_iter()
        .flat_map(|m| m.keys().map(String::as_str))
}

pub fn is_in_v5_pool(card: &serde_json::Value) -> bool {
    card_sets(card).any(|s| V5_SET_NAMES.contains(&s))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn card_in_a_v5_set_is_in_pool() {
        let card = json!({"sets": {"Fifth Edition": [{"release_date": "2020-11-30"}]}});
        assert!(is_in_v5_pool(&card));
    }

    #[test]
    fn card_only_in_classic_sets_is_excluded() {
        // "Sabbat War" and "Anarchs" are original-era KRCG set names that are
        // NOT part of the V5 line (see the module doc) — this is the case the
        // filter must get right, or classic-era cards leak into the V5 site.
        let card = json!({"sets": {"Sabbat War": [{}], "Anarchs": [{}]}});
        assert!(!is_in_v5_pool(&card));
    }

    #[test]
    fn card_with_no_sets_is_excluded() {
        assert!(!is_in_v5_pool(&json!({})));
    }
}
