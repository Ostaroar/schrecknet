//! The modern Black Chantry card pool definition — the one piece of domain knowledge in this
//! pipeline that determines "is this card on SchreckNet at all" (AGENTS.md:
//! "V5 only"). It includes the currently supported V5 card line plus official
//! Black Chantry preconstructed products the app exposes. Keep this list current;
//! it is intentionally the only place that names sets, so a new expansion is
//! a one-line change here rather than a hunt through the pipeline.
//!
//! Sourced from KRCG's `sets` field on https://static.krcg.org/data/vtes.json
//! (2026-07-24 snapshot), cross-checked against Black Chantry's official V5
//! format definition (https://www.blackchantry.com/2025/09/16/introducing-the-official-vampire-the-eternal-struggle-v5-format/).
//! Names like "Anarchs" or "Sabbat War" are *not* included even though they
//! sound V5-adjacent — those are original-era set names KRCG reuses; the
//! actual V5 line uses the names below.
//!
//! "Sabbat Preconstructed" (2019) is deliberately excluded too, for a
//! subtler reason: unlike every other set here, it's a *Standard
//! Constructed* (classic-rules) product — four reprint precons of
//! pre-V5 crypt cards — despite its "V5-era release date" making it look
//! like it belongs. Including it leaked 59 classic-only vampires (e.g.
//! America Johnson, Antón de Concepción) onto the site.
pub const V5_SET_NAMES: &[&str] = &[
    "Twenty-Fifth Anniversary",
    "First Blood",
    "Fifth Edition",
    "Fifth Edition (Anarch)",
    "Fifth Edition (Companion)",
    "New Blood",
    "New Blood II",
    "New Blood III",
    "Thirtieth Anniversary",
    "Sabbat V5",
    "V5 Polish Edition promo",
    "Fall of London",
    "Shadows of Berlin",
];

const TWENTY_FIFTH_EXTRAS: &[&str] = &[
    "Alamut",
    "Ankara Citadel, Turkey, The",
    "Black Metamorphosis",
    "Camarilla Vitae Slave",
    "Entombment",
    "Femur of Toomler",
    "Form of Corruption",
    "Grimgroth",
    "Hand of Conrad",
    "Heidelberg Castle, Germany",
    "Homunculus",
    "Khobar Towers, Al-Khubar",
    "Legendary Vampire",
    "Life Boon",
    "Rutor's Hand",
    "Sargon Fragment, The",
    "Signet of King Saul, The",
    "Talbot's Chainsaw",
    "Una",
];

const THIRTIETH_EXTRAS: &[&str] = &[
    "Annabelle Triabell",
    "Dónal O'Connor",
    "Ian Carfax",
    "Juliet Parr",
    "Lucinde, Alastor",
    "Molly MacDonald",
    "Nikolaus Vermeulen",
    "Alastor",
    "Anathema",
    "Banu Haqim Justicar",
    "Lasombra Justicar",
    "Protected Resources",
    "Pulled Fangs",
    "Third Tradition: Progeny",
];

/// KRCG identifies ordinary starter printings directly. The anniversary
/// products instead expose one set-level `copies` list containing both the
/// ready-to-play 100-card deck and its separate bonus cards. Keep those
/// official product distinctions here so the precon browser never presents
/// the bonus pack as part of the playable deck.
pub fn precon_name<'a>(
    set_name: &str,
    card_name: &str,
    source_precon: Option<&'a str>,
) -> Option<&'a str> {
    if source_precon.is_some() {
        return source_precon;
    }
    match set_name {
        "Twenty-Fifth Anniversary" if !TWENTY_FIFTH_EXTRAS.contains(&card_name) => {
            Some("Reign of Stanislava")
        }
        "Thirtieth Anniversary" if !THIRTIETH_EXTRAS.contains(&card_name) => {
            Some("The Endless Dance")
        }
        _ => None,
    }
}

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
    fn card_only_in_sabbat_preconstructed_is_excluded() {
        // Regression test: "Sabbat Preconstructed" (2019) looks V5-era but is
        // a Standard Constructed reprint product of classic crypt cards — see
        // the module doc for the incident this caused.
        let card = json!({"sets": {"Sabbat Preconstructed": [{}]}});
        assert!(!is_in_v5_pool(&card));
    }

    #[test]
    fn card_in_fall_of_london_or_shadows_of_berlin_is_in_pool() {
        let a = json!({"sets": {"Fall of London": [{}]}});
        let b = json!({"sets": {"Shadows of Berlin": [{}]}});
        assert!(is_in_v5_pool(&a));
        assert!(is_in_v5_pool(&b));
    }

    #[test]
    fn card_with_no_sets_is_excluded() {
        assert!(!is_in_v5_pool(&json!({})));
    }

    #[test]
    fn anniversary_products_expose_only_the_playable_deck_as_a_precon() {
        assert_eq!(
            precon_name("Twenty-Fifth Anniversary", "Stanislava", None),
            Some("Reign of Stanislava")
        );
        assert_eq!(
            precon_name("Twenty-Fifth Anniversary", "Grimgroth", None),
            None
        );
        assert_eq!(
            precon_name("Thirtieth Anniversary", "François Villon", None),
            Some("The Endless Dance")
        );
        assert_eq!(
            precon_name("Thirtieth Anniversary", "Annabelle Triabell", None),
            None
        );
    }
}
