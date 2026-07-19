//! VDB-compatible card-trait classification used by the data pipeline.
//!
//! Traits are derived once from canonical English card data and stored in
//! `card_traits`; browser/server search then performs indexed lookups only.
//! This module is native-only because classification is a build-time concern,
//! keeping the browser WASM bundle free of the regex engine.

use std::sync::OnceLock;

use regex::{Regex, RegexBuilder};

pub const CRYPT_TRAITS: &[&str] = &[
    "1 intercept",
    "1 stealth",
    "1 bleed",
    "2 bleed",
    "1 strength",
    "2 strength",
    "maneuver",
    "additional strike",
    "aggravated",
    "prevent",
    "press",
    "enter combat",
    "unlock",
    "black hand",
    "seraph",
    "infernal",
    "red list",
    "flight",
    "hand size",
    "advancement",
    "banned",
];

pub const LIBRARY_TRAITS: &[&str] = &[
    "intercept",
    "stealth",
    "bleed",
    "votes-title",
    "strength",
    "block denial",
    "dodge",
    "maneuver",
    "additional strike",
    "aggravated",
    "prevent",
    "press",
    "combat ends",
    "multi-type",
    "multi-discipline",
    "enter combat",
    "embrace",
    "put blood",
    "bounce bleed",
    "reduce bleed",
    "unlock",
    "black hand",
    "seraph",
    "infernal",
    "burn",
    "banned",
    "no-requirements",
];

macro_rules! regex_matcher {
    ($name:ident, $pattern:literal) => {
        fn $name(text: &str) -> bool {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| {
                RegexBuilder::new($pattern)
                    .case_insensitive(true)
                    .build()
                    .expect("static trait regex must compile")
            })
            .is_match(text)
        }
    };
}

regex_matcher!(crypt_press, r"gets (.*)?optional press");
regex_matcher!(crypt_bleed_one, r"[:.] \+\d bleed.");
regex_matcher!(crypt_bleed_two, r"[:.] \+[2-9] bleed.");
regex_matcher!(crypt_strength_one, r"[:.] \+\d strength.");
regex_matcher!(crypt_strength_two, r"[:.] \+[2-9] strength.");
regex_matcher!(
    crypt_intercept,
    r"[:.] \+\d intercept.| gets \+\d intercept "
);
regex_matcher!(
    crypt_stealth,
    r"([:.] \+\d stealth.|gets \+\d stealth on each of (his|her|they) actions)"
);
regex_matcher!(crypt_black_hand, r"black hand[ .:]");
regex_matcher!(
    crypt_hand_size,
    r"(\+(\d|x) hand size)|(hand size is.*(increased|larger))"
);
regex_matcher!(crypt_seraph, r"seraph[.:]");
regex_matcher!(crypt_infernal, r"infernal[.:]");
regex_matcher!(crypt_red_list, r"red list[.:]");
regex_matcher!(crypt_flight, r"\[flight\]\.");
regex_matcher!(additional_strike, r"additional strike");

regex_matcher!(
    library_intercept_positive,
    r"\+\d+ intercept|gets -(\d|x)+ stealth|stealth to 0"
);
regex_matcher!(library_stealth_negative, r"-\d+ intercept");
regex_matcher!(library_bleed, r"\+(\d+|x) bleed");
regex_matcher!(library_block_denial, r"cannot (attempt to )?block");
regex_matcher!(library_strength, r"\+\d+ strength");
regex_matcher!(library_embrace, r"becomes a.*(\d[ -]|same.*)capacity");
regex_matcher!(
    library_bounce_bleed,
    r"change the target of the bleed|is now bleeding"
);
regex_matcher!(
    library_votes_title,
    r"receive .* title|gains . vote|\+. vote|additional vote|represent the .* title"
);
regex_matcher!(
    library_reduce_bleed,
    r"reduce (a|the)(.*) bleed (amount)?|bleed amount is reduced"
);
regex_matcher!(
    library_put_blood,
    r"(move|add) .* blood (from the blood bank )?to .* in your uncontrolled region"
);

/// Classifies one crypt card with the same public trait tokens and text rules
/// as VDB's `CryptTraitsRegexMap`/`missingTrait` implementation.
pub fn classify_crypt_traits(
    name: &str,
    text: &str,
    advanced: bool,
    banned: bool,
) -> Vec<&'static str> {
    let mut traits = Vec::new();
    let lower = text.to_lowercase();
    let rules: &[(&str, bool)] = &[
        ("1 intercept", crypt_intercept(text)),
        ("1 stealth", crypt_stealth(text)),
        ("1 bleed", crypt_bleed_one(text)),
        ("2 bleed", crypt_bleed_two(text)),
        ("1 strength", crypt_strength_one(text)),
        ("2 strength", crypt_strength_two(text)),
        ("maneuver", lower.contains("maneuver")),
        ("additional strike", additional_strike(text)),
        ("aggravated", qualified_aggravated(&lower)),
        ("prevent", qualified_prevent(&lower)),
        ("press", crypt_press(text)),
        ("enter combat", crypt_enter_combat(name, text)),
        ("unlock", unlocks(&lower)),
        ("black hand", crypt_black_hand(text)),
        ("seraph", crypt_seraph(text)),
        ("infernal", crypt_infernal(text)),
        ("red list", crypt_red_list(text)),
        ("flight", crypt_flight(text)),
        ("hand size", crypt_hand_size(text)),
        ("advancement", advanced),
        ("banned", banned),
    ];
    traits.extend(
        rules
            .iter()
            .filter_map(|(name, matched)| matched.then_some(*name)),
    );
    debug_assert!(traits.iter().all(|value| CRYPT_TRAITS.contains(value)));
    traits
}

/// Structured fields needed for VDB's library-only special traits.
#[derive(Debug, Clone, Copy, Default)]
pub struct LibraryTraitFacts {
    pub type_count: usize,
    pub discipline_count: usize,
    pub burn_option: bool,
    pub banned: bool,
    /// True when VEKN requirements, disciplines, clans/paths, or the exact
    /// VDB fallback phrase `requires a` mark this card as restricted.
    pub has_requirements: bool,
}

/// Classifies one library card with VDB's curated regex rules and structured
/// special cases (`multi-*`, Burn Option, Banned, No Requirement).
pub fn classify_library_traits(text: &str, facts: LibraryTraitFacts) -> Vec<&'static str> {
    let lower = text.to_lowercase();
    let rules: &[(&str, bool)] = &[
        ("intercept", library_intercept(text)),
        ("stealth", library_stealth(text)),
        ("bleed", library_bleed(text)),
        ("votes-title", library_votes_title(text)),
        ("strength", library_strength(text)),
        ("block denial", library_block_denial(text)),
        ("dodge", lower.contains("dodge")),
        ("maneuver", lower.contains("maneuver")),
        ("additional strike", additional_strike(text)),
        ("aggravated", qualified_aggravated(&lower)),
        ("prevent", qualified_prevent(&lower)),
        ("press", lower.contains("press")),
        ("combat ends", lower.contains("combat ends")),
        ("multi-type", facts.type_count > 1),
        ("multi-discipline", facts.discipline_count > 1),
        ("enter combat", lower.contains("enter combat")),
        ("embrace", library_embrace(text)),
        ("put blood", library_put_blood(text)),
        ("bounce bleed", library_bounce_bleed(text)),
        ("reduce bleed", library_reduce_bleed(text)),
        ("unlock", unlocks(&lower)),
        ("black hand", lower.contains("black hand")),
        ("seraph", lower.contains("seraph")),
        ("infernal", lower.contains("infernal")),
        ("burn", facts.burn_option),
        ("banned", facts.banned),
        ("no-requirements", !facts.has_requirements),
    ];
    let mut traits = Vec::new();
    traits.extend(
        rules
            .iter()
            .filter_map(|(name, matched)| matched.then_some(*name)),
    );
    debug_assert!(traits.iter().all(|value| LIBRARY_TRAITS.contains(value)));
    traits
}

fn crypt_enter_combat(name: &str, text: &str) -> bool {
    let first_name = name
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .replace(',', "");
    let subjects = format!("he|she|it|they|{}", regex::escape(&first_name));
    let pattern = format!(r"(?i)(?:{subjects}) (can|may|attempt)([^\n]*?)enter combat");
    let Ok(re) = Regex::new(&pattern) else {
        return false;
    };
    let matched = re.captures_iter(text).any(|captures| {
        let between = captures.get(2).map_or("", |value| value.as_str());
        let trimmed_start = between.trim_start();
        if trimmed_start.starts_with("not") {
            return false;
        }
        between.trim().is_empty() || between.trim_end().ends_with(" to") || between.trim() == "to"
    });
    matched
}

fn unlocks(lower: &str) -> bool {
    if lower.contains("wakes") {
        return true;
    }
    lower.match_indices("unlock").any(|(index, _)| {
        let after = &lower[index + "unlock".len()..];
        !after.starts_with(" phase") && !after.starts_with("ed")
    })
}

fn qualified_aggravated(lower: &str) -> bool {
    lower
        .match_indices("aggravated")
        .any(|(index, _)| index > 0 && !matches!(lower.as_bytes()[index - 1], b'n' | b'o' | b'-'))
}

fn qualified_prevent(lower: &str) -> bool {
    lower.match_indices("prevent").any(|(index, _)| {
        let end = index + "prevent".len();
        index > 0
            && end < lower.len()
            && !matches!(lower.as_bytes()[index - 1], b'u' | b'n')
            && !matches!(lower.as_bytes()[end], b'a' | b'b' | b'l' | b'e')
    })
}

fn library_intercept(text: &str) -> bool {
    if library_intercept_positive(text) {
        return true;
    }
    let lower = text.to_lowercase();
    static NEGATIVE_STEALTH: OnceLock<Regex> = OnceLock::new();
    NEGATIVE_STEALTH
        .get_or_init(|| Regex::new(r"-\d+ stealth").expect("static trait regex must compile"))
        .find_iter(&lower)
        .any(|matched| {
            let after = &lower[matched.end()..];
            if after.starts_with(" (d)") || after.starts_with(" ⓓ") {
                return false;
            }
            !after
                .strip_prefix(' ')
                .and_then(|rest| rest.chars().next())
                .is_some_and(|character| character.is_ascii_alphanumeric() || character == '_')
        })
}

fn library_stealth(text: &str) -> bool {
    if library_stealth_negative(text) {
        return true;
    }
    let lower = text.to_lowercase();
    static POSITIVE_STEALTH: OnceLock<Regex> = OnceLock::new();
    const EXCLUDED: &[&str] = &[
        " action",
        " equip",
        " hunt",
        " employ",
        " political",
        " (d)",
        " ⓓ",
    ];
    POSITIVE_STEALTH
        .get_or_init(|| Regex::new(r"\+\d+ stealth").expect("static trait regex must compile"))
        .find_iter(&lower)
        .any(|matched| {
            let after = &lower[matched.end()..];
            !EXCLUDED.iter().any(|prefix| after.starts_with(prefix))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crypt_rules_match_vdb_positive_and_negative_examples() {
        let traits = classify_crypt_traits(
            "Aaradhya, The Callous Tyrant",
            "Sabbat cardinal: Aaradhya can unlock after a political action. +1 bleed.",
            false,
            false,
        );
        assert!(traits.contains(&"unlock"));
        assert!(traits.contains(&"1 bleed"));
        assert!(!traits.contains(&"2 bleed"));

        let excluded = classify_crypt_traits(
            "Example",
            "Example cannot unlock during the unlock phase. Damage is non-aggravated and unpreventable.",
            false,
            false,
        );
        // VDB's negative lookahead is placed immediately before `unlock`, so
        // `cannot unlock` still matches; only `unlock phase`/`unlocked` do not.
        assert!(excluded.contains(&"unlock"));
        assert!(!excluded.contains(&"aggravated"));
        assert!(!excluded.contains(&"prevent"));
    }

    #[test]
    fn crypt_enter_combat_uses_pronouns_or_first_name_and_rejects_not() {
        assert!(classify_crypt_traits(
            "Theo Bell",
            "Theo may burn 1 blood to enter combat with a minion.",
            false,
            false
        )
        .contains(&"enter combat"));
        assert!(
            !classify_crypt_traits("Theo Bell", "Theo may not enter combat.", false, false)
                .contains(&"enter combat")
        );
    }

    #[test]
    fn library_rules_preserve_exclusions_and_structured_traits() {
        let traits = classify_library_traits(
            "+1 stealth action. +2 stealth. This card can dodge and provides an additional strike.",
            LibraryTraitFacts {
                type_count: 2,
                discipline_count: 2,
                burn_option: true,
                banned: false,
                has_requirements: true,
            },
        );
        assert!(traits.contains(&"stealth"));
        assert!(traits.contains(&"dodge"));
        assert!(traits.contains(&"additional strike"));
        assert!(traits.contains(&"multi-type"));
        assert!(traits.contains(&"multi-discipline"));
        assert!(traits.contains(&"burn"));
        assert!(!traits.contains(&"no-requirements"));

        let directed_action = classify_library_traits(
            "This minion gets +1 stealth Ⓓ action.",
            LibraryTraitFacts::default(),
        );
        assert!(!directed_action.contains(&"stealth"));
    }

    #[test]
    fn no_requirement_is_structured_not_a_text_guess() {
        let no_requirement =
            classify_library_traits("Put this card in play.", LibraryTraitFacts::default());
        assert!(no_requirement.contains(&"no-requirements"));

        let required = classify_library_traits(
            "Requires an Anarch vampire.",
            LibraryTraitFacts {
                has_requirements: true,
                ..LibraryTraitFacts::default()
            },
        );
        assert!(!required.contains(&"no-requirements"));
    }
}
