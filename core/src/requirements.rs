//! Normalization of VEKN library-card requirement metadata.
//!
//! The official CSV supplies comma-separated requirement tokens. VDB adds an
//! implied sect for title requirements before filtering; this shared module
//! keeps that compatibility rule out of the data-pipeline adapter.

use std::collections::BTreeMap;

pub const REQUIREMENT_KIND_SECT: &str = "sect";
pub const REQUIREMENT_KIND_TITLE: &str = "title";
pub const REQUIREMENT_KIND_OTHER: &str = "other";

pub const SECT_REQUIREMENTS: &[&str] = &[
    "camarilla",
    "sabbat",
    "laibon",
    "independent",
    "anarch",
    "imbued",
];

/// VDB's `requiredTitleList`, used by its synthetic “Titled (specific)”
/// selection. Generic `titled` and `non-titled` remain exact tokens rather
/// than members of this list, matching the original behavior.
pub const SPECIFIC_TITLE_REQUIREMENTS: &[&str] = &[
    "primogen",
    "prince",
    "justicar",
    "inner circle",
    "baron",
    "bishop",
    "archbishop",
    "priscus",
    "cardinal",
    "regent",
    "magaji",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequirementToken {
    pub value: String,
    pub kind: &'static str,
}

/// Splits one official `Requirement` field, lowercases/deduplicates its
/// tokens, classifies filter families, and adds VDB's implied title sects.
pub fn normalize_library_requirements(raw: &str) -> Vec<RequirementToken> {
    let mut tokens = raw
        .split(',')
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .map(|value| {
            let kind = classify(&value);
            (value, kind)
        })
        .collect::<BTreeMap<_, _>>();

    let implied_sects = tokens
        .keys()
        .filter_map(|title| implied_title_sect(title))
        .collect::<Vec<_>>();
    for sect in implied_sects {
        tokens.insert(sect.to_owned(), REQUIREMENT_KIND_SECT);
    }
    if tokens.values().any(|kind| *kind == REQUIREMENT_KIND_TITLE) {
        tokens.insert("titled_specific".to_owned(), REQUIREMENT_KIND_OTHER);
    }

    tokens
        .into_iter()
        .map(|(value, kind)| RequirementToken { value, kind })
        .collect()
}

fn classify(value: &str) -> &'static str {
    if SECT_REQUIREMENTS.contains(&value) {
        REQUIREMENT_KIND_SECT
    } else if SPECIFIC_TITLE_REQUIREMENTS.contains(&value) {
        REQUIREMENT_KIND_TITLE
    } else {
        REQUIREMENT_KIND_OTHER
    }
}

// Kept byte-for-byte compatible with VDB's generate_library.py mapping. The
// current V5 pool does not contain a Bishop requirement, so its historical
// Camarilla mapping has no effect but remains explicit for golden parity.
fn implied_title_sect(title: &str) -> Option<&'static str> {
    match title {
        "primogen" | "prince" | "justicar" | "inner circle" | "bishop" => Some("camarilla"),
        "archbishop" | "priscus" | "cardinal" | "regent" => Some("sabbat"),
        "1 vote" | "2 votes" => Some("independent"),
        "magaji" | "kholo" => Some("laibon"),
        "baron" => Some("anarch"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_deduplicates_and_classifies_tokens() {
        assert_eq!(
            normalize_library_requirements(" Independent, ANARCH,anarch,capacity 5 or more "),
            vec![
                RequirementToken {
                    value: "anarch".into(),
                    kind: REQUIREMENT_KIND_SECT,
                },
                RequirementToken {
                    value: "capacity 5 or more".into(),
                    kind: REQUIREMENT_KIND_OTHER,
                },
                RequirementToken {
                    value: "independent".into(),
                    kind: REQUIREMENT_KIND_SECT,
                },
            ]
        );
    }

    #[test]
    fn adds_the_same_title_implied_sects_as_vdb() {
        let tokens = normalize_library_requirements("prince,justicar,baron,cardinal");
        let values = tokens
            .iter()
            .map(|token| (token.value.as_str(), token.kind))
            .collect::<Vec<_>>();
        assert!(values.contains(&("prince", REQUIREMENT_KIND_TITLE)));
        assert!(values.contains(&("cardinal", REQUIREMENT_KIND_TITLE)));
        assert!(values.contains(&("titled_specific", REQUIREMENT_KIND_OTHER)));
        assert!(values.contains(&("camarilla", REQUIREMENT_KIND_SECT)));
        assert!(values.contains(&("anarch", REQUIREMENT_KIND_SECT)));
        assert!(values.contains(&("sabbat", REQUIREMENT_KIND_SECT)));
    }

    #[test]
    fn generic_titled_is_not_a_specific_title() {
        assert_eq!(
            normalize_library_requirements("sabbat,titled"),
            vec![
                RequirementToken {
                    value: "sabbat".into(),
                    kind: REQUIREMENT_KIND_SECT,
                },
                RequirementToken {
                    value: "titled".into(),
                    kind: REQUIREMENT_KIND_OTHER,
                },
            ]
        );
    }
}
