//! The V5 card pool definition — the one piece of domain knowledge in this
//! pipeline that determines "is this card on SchreckNet at all" (AGENTS.md:
//! "V5 only").
//!
//! A card is in the pool when EITHER
//!   (a) one of its KRCG set names is in [`V5_SET_NAMES`] — the 10 KRCG set
//!       names that cover Black Chantry's 28 official V5 products (KRCG groups
//!       several products under one set name), curated below; or
//!   (b) Black Chantry individually legalised it despite it appearing only in
//!       non-V5 products — the Promo Pack 3/4 cards. Those are NOT hardcoded:
//!       they come from KRCG's `formats` field
//!       (`krcg::fetch_v5_exception_ids`), because that list grows without any
//!       new *set* ever appearing.
//!
//! Authority, in order: Black Chantry's official format post
//! <https://www.blackchantry.com/2025/09/16/introducing-the-official-vampire-the-eternal-struggle-v5-format/>
//! ("28 products … i.e. non-Legacy products"), then vdb.im's maintained
//! `limitedV5.json` (our feature-parity target, CLAUDE.md). Both were checked
//! entry by entry on 2026-07-24; see docs/adr/0014-v5-pool-from-krcg-formats.md.
//!
//! ## The trap this list keeps falling into
//!
//! Release date does NOT imply V5. Black Chantry ships V5 *and* Standard
//! Constructed products in the same years, and KRCG's data has no field that
//! distinguishes them (no `format`, no `legality` marker — `legality` is just
//! the earliest print date). Three incidents came from guessing:
//!   * "Sabbat Preconstructed" (2019) — V5-era date, actually a Standard
//!     Constructed reprint product; leaked 59 classic vampires.
//!   * "Fall of London" / "Shadows of Berlin" — genuinely V5, simply never added.
//!   * "First Blood" + "Twenty-Fifth Anniversary" (both 2019) — V5-era dates,
//!     absent from Black Chantry's 28; leaked 74 classic cards including
//!     Rutor (G5), the card that triggered this audit. Black Chantry itself
//!     files both under /products/legacy/.
//!
//! So: never add a set here because its date looks right. Check it against the
//! product list in the post above. `cargo test -p schrecknet-data v5pool`
//! fails loudly when a KRCG set is neither listed here nor explicitly
//! classified as non-V5 in [`KNOWN_NON_V5_SETS`].
pub const V5_SET_NAMES: &[&str] = &[
    // 14 Fifth Edition preconstructed decks. KRCG splits these across three
    // set names; the Hecata and Lasombra decks that vdb tracks as separate
    // sets (V5H/V5L) are *precons inside* KRCG's "Fifth Edition".
    "Fifth Edition",
    "Fifth Edition (Anarch)",
    "Fifth Edition (Companion)",
    // 11 (+3) Fifth Edition New Blood packs. vdb's "New Blood III (Companion)"
    // (NB3C) is likewise a precon inside KRCG's "New Blood III".
    "New Blood",
    "New Blood II",
    "New Blood III",
    // Sabbat Fifth Edition, released 2025-10-26 as pre-announced in the post.
    // KRCG calls it "Sabbat V5"; vdb calls it "V5 Sabbat". Same four Path precons.
    "Sabbat V5",
    // "Other releases (3 packs)" — the post names exactly these three.
    "Fall of London",
    "Shadows of Berlin",
    "Thirtieth Anniversary",
];

/// Every other KRCG set name, explicitly classified as NOT V5.
///
/// This exists so that "we have never considered this set" and "we considered
/// it and it is not V5" are different states. `every_krcg_set_is_classified`
/// fails when KRCG publishes a set that appears in neither list — which is the
/// moment a human must go read Black Chantry's product list, and precisely the
/// moment that was silently missed three times before.
// Consumed only by `every_krcg_set_is_classified`; it is a classification
// record, not runtime data — the pool itself is driven by V5_SET_NAMES.
#[cfg_attr(not(test), allow(dead_code))]
pub const KNOWN_NON_V5_SETS: &[&str] = &[
    // Classic-era expansions (Wizards / White Wolf / CCP).
    "1996 Promo",
    "2003 Tournament promo",
    "2004 promo",
    "2005 Storyline promo",
    "2005 Tournament promo",
    "2006 Championship promo",
    "2006 EC Tournament promo",
    "2006 Storyline promo",
    "2006 Tournament promo",
    "2007 Promo",
    "2008 Storyline promo",
    "2008 Tournament promo",
    "2009 Tournament / Storyline promo",
    "2010 Storyline promo",
    "2015 Storyline Rewards",
    "2018 Humble Bundle",
    "2019 AC Promo",
    "2019 ACC Promo",
    "2019 DriveThruCards Promo",
    "2019 EC Promo",
    "2019 Grand Prix Promo",
    "2019 NAC Promo",
    "2019 Promo",
    "2019 Promo Pack 1",
    "2019 SAC Promo",
    "2020 GP Promo",
    "2020 Promo Pack 2",
    "2021 Kickstarter Promo",
    "2021 Mind’s Eye Theatre Promo",
    "2021 Resellers Promo",
    "2021 SAC Promo",
    "2022 EC Promo",
    "2022 European GP Promo",
    "2022 Fee Stake Promo",
    "2022 Promo",
    "2023 Andalusian Open Promo",
    "2023 Belgian Championship Promo",
    "2023 Chapters Promo",
    "2023 Mineiro Promo",
    "2023 Ropecon Promo",
    "2023 Spanish National Promo",
    "2023 War of the Ages Promo",
    "2023 Zaragosa Promo",
    "2025 CC Promo",
    "2025 European GP Promo",
    "Anarch Unbound",
    "Anarchs",
    "Anarchs promo",
    "Ancient Hearts",
    "Anthology",
    "Black Hand",
    "Black Hand promo",
    "Blood Shadowed Court",
    "Bloodlines",
    "Bloodlines promo",
    "Camarilla Edition",
    "Camarilla Edition promo",
    "Danse Macabre",
    "Dark Sovereigns",
    "Ebony Kingdom",
    "Echoes of Gehenna",
    "Fall 2002 Storyline promo",
    "Fall 2004 Storyline promo",
    "Final Nights",
    "Final Nights promo",
    "Gehenna",
    "Gehenna promo",
    "Heirs to the Blood",
    "Heirs to the Blood Reprint",
    "Jyhad",
    "Keepers of Tradition",
    "Keepers of Tradition Reprint",
    "Kindred Most Wanted",
    "Kindred Most Wanted promo",
    "Legacies of Blood",
    "Legacies of Blood promo",
    "Lords of the Night",
    "Lost Kindred",
    "Nights of Reckoning",
    "Print on Demand",
    "Promo",
    "Prophecies league promo",
    "Sabbat",
    "Sabbat War",
    "Sabbat War promo",
    "Summer 2003 Storyline promo",
    "Sword of Caine",
    "Sword of Caine promo",
    "Tenth Anniversary",
    "The Unaligned",
    "Third Edition",
    "Third Edition promo",
    "Twilight Rebellion",
    "Vampire: The Eternal Struggle",
    "Winter 2002 Storyline promo",
    // --- Black-Chantry-era products that are NOT part of the V5 format ---
    // All three have V5-era release dates and were (or nearly were) mistaken
    // for V5. None appears in Black Chantry's 28-product list.
    //
    // Standard Constructed reprint product (4 precons of classic crypt cards).
    "Sabbat Preconstructed",
    // 2019 intro/starter product. 109 cards, 0 of them new: every card is a
    // reprint (56 first printed in Jyhad 1994). Source of the Rutor (G5) bug.
    "First Blood",
    // 2019 anniversary reprint product; 61 cards, 1 new, and the pool's only
    // source of group-2/group-3 vampires. Only the *Thirtieth* Anniversary
    // (2024) is a V5 product.
    "Twenty-Fifth Anniversary",
    // A single card (Bolesław Gutowski, 201528). He IS V5-legal — but as a
    // named Promo Pack 4 card via KRCG's `formats` exception list, not because
    // the Polish promo is a V5 product. Listing the set here instead would be
    // right by accident.
    "V5 Polish Edition promo",
    // A promo pack, not one of Black Chantry's 28 V5 products — so it is not
    // listed as a V5 set even though all 11 of its cards are in fact in the
    // pool today: 10 via the `formats` exception list, and "Judgment:
    // Camarilla Segregation" independently via New Blood II / Thirtieth
    // Anniversary. Whitelisting the set would give the right answer here by
    // coincidence while asserting something false about the product, and it
    // would silently admit whatever a future reprint adds to this set.
    "2021 Promo Pack 3",
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

use std::collections::BTreeSet;

pub fn card_sets(card: &serde_json::Value) -> impl Iterator<Item = &str> {
    card.get("sets")
        .and_then(|s| s.as_object())
        .into_iter()
        .flat_map(|m| m.keys().map(String::as_str))
}

/// True when the card is in a V5 product, OR when Black Chantry individually
/// legalised it (`exception_ids`, from `krcg::fetch_v5_exception_ids`).
///
/// The exception arm is not a nicety: those cards' only printings are in
/// classic sets like Jyhad and Camarilla Edition, so no set-based rule can
/// ever express them. That is why 16 legal promos were missing from the site.
pub fn is_in_v5_pool(card: &serde_json::Value, exception_ids: &BTreeSet<i64>) -> bool {
    if card_sets(card).any(|s| V5_SET_NAMES.contains(&s)) {
        return true;
    }
    card.get("id")
        .and_then(|id| id.as_i64())
        .is_some_and(|id| exception_ids.contains(&id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn no_exceptions() -> BTreeSet<i64> {
        BTreeSet::new()
    }

    #[test]
    fn card_in_a_v5_set_is_in_pool() {
        let card = json!({"sets": {"Fifth Edition": [{"release_date": "2020-11-30"}]}});
        assert!(is_in_v5_pool(&card, &no_exceptions()));
    }

    #[test]
    fn card_only_in_classic_sets_is_excluded() {
        // "Sabbat War" and "Anarchs" are original-era KRCG set names that are
        // NOT part of the V5 line (see the module doc) — this is the case the
        // filter must get right, or classic-era cards leak into the V5 site.
        let card = json!({"sets": {"Sabbat War": [{}], "Anarchs": [{}]}});
        assert!(!is_in_v5_pool(&card, &no_exceptions()));
    }

    #[test]
    fn card_only_in_sabbat_preconstructed_is_excluded() {
        // Regression test: "Sabbat Preconstructed" (2019) looks V5-era but is
        // a Standard Constructed reprint product of classic crypt cards — see
        // the module doc for the incident this caused.
        let card = json!({"sets": {"Sabbat Preconstructed": [{}]}});
        assert!(!is_in_v5_pool(&card, &no_exceptions()));
    }

    #[test]
    fn card_in_fall_of_london_or_shadows_of_berlin_is_in_pool() {
        let a = json!({"sets": {"Fall of London": [{}]}});
        let b = json!({"sets": {"Shadows of Berlin": [{}]}});
        assert!(is_in_v5_pool(&a, &no_exceptions()));
        assert!(is_in_v5_pool(&b, &no_exceptions()));
    }

    #[test]
    fn card_only_in_first_blood_or_twenty_fifth_is_excluded() {
        // Regression test for the Rutor (G5) report: both products have
        // V5-era release dates but neither is among Black Chantry's 28
        // official V5 products.
        let rutor = json!({"id": 201213, "sets": {
            "Keepers of Tradition": [{}], "Keepers of Tradition Reprint": [{}],
            "First Blood": [{"release_date": "2019-10-01"}]}});
        assert!(!is_in_v5_pool(&rutor, &no_exceptions()));

        let twenty_fifth = json!({"id": 100286, "sets": {"Twenty-Fifth Anniversary": [{}]}});
        assert!(!is_in_v5_pool(&twenty_fifth, &no_exceptions()));
    }

    #[test]
    fn individually_legalised_promo_is_in_pool_despite_only_classic_sets() {
        // Bolesław Gutowski: his only printings are the Polish promo and the
        // generic "Promo" set, neither of which is a V5 product — he is legal
        // purely because Black Chantry named him, i.e. via KRCG's `formats`.
        // No set-based rule can express this.
        let card = json!({"id": 201528, "sets": {"Promo": [{}], "V5 Polish Edition promo": [{}]}});
        assert!(!is_in_v5_pool(&card, &no_exceptions()));
        assert!(is_in_v5_pool(&card, &BTreeSet::from([201528])));
    }

    #[test]
    fn v5_and_non_v5_set_lists_are_disjoint_and_have_no_duplicates() {
        for name in V5_SET_NAMES {
            assert!(
                !KNOWN_NON_V5_SETS.contains(name),
                "{name} is in both V5_SET_NAMES and KNOWN_NON_V5_SETS"
            );
        }
        let uniq: BTreeSet<_> = V5_SET_NAMES.iter().collect();
        assert_eq!(uniq.len(), V5_SET_NAMES.len(), "duplicate in V5_SET_NAMES");
        let uniq: BTreeSet<_> = KNOWN_NON_V5_SETS.iter().collect();
        assert_eq!(
            uniq.len(),
            KNOWN_NON_V5_SETS.len(),
            "duplicate in KNOWN_NON_V5_SETS"
        );
    }

    /// THE anti-drift guard. Every set KRCG publishes must be explicitly
    /// classified as V5 or not-V5. When Black Chantry ships a new product,
    /// this fails and forces a human to check it against the official product
    /// list — instead of the set silently sitting outside the pool (how Fall
    /// of London and Shadows of Berlin went missing) or being waved in on the
    /// strength of its release date (how First Blood and Sabbat
    /// Preconstructed got in).
    #[test]
    fn every_krcg_set_is_classified() {
        let cache_dir = std::path::Path::new(".cache");
        let cards = match crate::krcg::fetch_cards(cache_dir) {
            Ok(cards) => cards,
            Err(err) => {
                eprintln!("skipping live-data set-classification check: {err}");
                return;
            }
        };

        let mut unclassified: Vec<&str> = cards
            .iter()
            .flat_map(card_sets)
            .filter(|s| !V5_SET_NAMES.contains(s) && !KNOWN_NON_V5_SETS.contains(s))
            .collect();
        unclassified.sort_unstable();
        unclassified.dedup();

        assert!(
            unclassified.is_empty(),
            "KRCG publishes {} set(s) that are in neither V5_SET_NAMES nor \
             KNOWN_NON_V5_SETS: {unclassified:?}\n\
             Check each against Black Chantry's official V5 product list \
             (see this module's doc comment) and add it to the correct list. \
             Do NOT guess from the release date.",
            unclassified.len()
        );
    }

    /// Runs against the real, live KRCG feed (network required, 24h cached —
    /// see `krcg::fetch_cards`) rather than synthetic JSON, so it catches the
    /// actual incident this module's doc comment describes: a set that gets
    /// added to `V5_SET_NAMES` on the strength of its release date alone,
    /// without checking whether it's really a V5 product. If someone adds a
    /// wrong set name, this test fails against real data — it doesn't rely
    /// on the same person remembering to also write a synthetic case for it.
    #[test]
    fn live_krcg_data_excludes_known_classic_only_vampires() {
        let cache_dir = std::path::Path::new(".cache");
        let cards = match crate::krcg::fetch_cards(cache_dir) {
            Ok(cards) => cards,
            Err(err) => {
                eprintln!("skipping live-data v5pool check: {err}");
                return;
            }
        };

        // Each of these leaked into the pool via a set that looked V5 but
        // wasn't: the first three via "Sabbat Preconstructed", Rutor via
        // "First Blood", Camarilla Vitae Slave via "Twenty-Fifth Anniversary".
        // None is legalised by the promo exception list either, so they must
        // stay out regardless of what KRCG's `formats` says.
        const KNOWN_CLASSIC_ONLY: &[&str] = &[
            "America Johnson (G5)",
            "Antón de Concepción (G4)",
            "Antonio d'Erlette (G4)",
            "Rutor (G5)",
            "Camarilla Vitae Slave",
        ];

        let exceptions =
            crate::krcg::fetch_v5_exception_ids(cache_dir).unwrap_or_else(|_| BTreeSet::new());

        for card in &cards {
            let Some(name) = card.get("name").and_then(|n| n.as_str()) else {
                continue;
            };
            if KNOWN_CLASSIC_ONLY.contains(&name) {
                assert!(
                    !is_in_v5_pool(card, &exceptions),
                    "{name} is classic-only and must not be in the V5 pool \
                     (did a non-V5 set get added to V5_SET_NAMES?)"
                );
            }
        }

        // And the sets this incident revealed were *missing* stay included.
        let sample_included = cards.iter().any(|c| {
            c.get("sets")
                .and_then(|s| s.as_object())
                .is_some_and(|m| m.contains_key("Fall of London"))
        });
        assert!(
            sample_included,
            "expected at least one Fall of London card in the live KRCG feed"
        );
    }

    #[test]
    fn card_with_no_sets_is_excluded() {
        assert!(!is_in_v5_pool(&json!({}), &no_exceptions()));
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
