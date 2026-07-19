//! V5 deck-construction legality (docs/domain-vtes.md).

use serde::Serialize;

/// V5 deck-construction bounds.
pub const CRYPT_MIN: u32 = 12;
pub const LIBRARY_MIN: u32 = 60;
pub const LIBRARY_MAX: u32 = 90;

/// The group rule: a crypt may only mix vampires from two consecutive groups.
/// An empty crypt is trivially group-legal (other checks catch emptiness).
pub fn crypt_groups_legal(groups: &[u8]) -> bool {
    match (groups.iter().min(), groups.iter().max()) {
        (Some(min), Some(max)) => max - min <= 1,
        _ => true,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Violation {
    CryptTooSmall { count: u32 },
    GroupsIllegal { groups: Vec<u8> },
    LibraryTooSmall { count: u32 },
    LibraryTooLarge { count: u32 },
}

/// Validate deck-size and group constraints. Card-pool legality (every card in
/// the V5 pool) is checked against `cards.sqlite` by the caller and out of
/// scope here.
pub fn validate_counts(
    crypt_groups: &[u8],
    crypt_count: u32,
    library_count: u32,
) -> Vec<Violation> {
    let mut violations = Vec::new();
    if crypt_count < CRYPT_MIN {
        violations.push(Violation::CryptTooSmall { count: crypt_count });
    }
    if !crypt_groups_legal(crypt_groups) {
        violations.push(Violation::GroupsIllegal {
            groups: crypt_groups.to_vec(),
        });
    }
    if library_count < LIBRARY_MIN {
        violations.push(Violation::LibraryTooSmall {
            count: library_count,
        });
    }
    if library_count > LIBRARY_MAX {
        violations.push(Violation::LibraryTooLarge {
            count: library_count,
        });
    }
    violations
}

/// Human-readable description of a violation, for direct display in the UI.
/// Kept in `core` alongside the rule it describes (AGENTS.md hard rule #1) so
/// wasm and native callers show identical text.
pub fn describe(v: &Violation) -> String {
    match v {
        Violation::CryptTooSmall { count } => {
            format!("Crypt has {count} vampire(s); the V5 minimum is {CRYPT_MIN}.")
        }
        Violation::GroupsIllegal { groups } => {
            let mut sorted = groups.clone();
            sorted.sort_unstable();
            sorted.dedup();
            format!(
                "Crypt groups {sorted:?} span more than 2 consecutive groups \
                 (the group rule: every vampire must be within 1 group of every other)."
            )
        }
        Violation::LibraryTooSmall { count } => {
            format!("Library has {count} card(s); the V5 minimum is {LIBRARY_MIN}.")
        }
        Violation::LibraryTooLarge { count } => {
            format!("Library has {count} card(s); the V5 maximum is {LIBRARY_MAX}.")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consecutive_groups_are_legal() {
        assert!(crypt_groups_legal(&[6, 6, 7, 7]));
        assert!(crypt_groups_legal(&[6, 6, 6]));
        assert!(crypt_groups_legal(&[]));
    }

    #[test]
    fn split_groups_are_illegal() {
        assert!(!crypt_groups_legal(&[5, 7]));
        assert!(!crypt_groups_legal(&[5, 6, 7]));
    }

    #[test]
    fn legal_deck_has_no_violations() {
        assert!(validate_counts(&[6, 7], 12, 60).is_empty());
        assert!(validate_counts(&[7], 13, 90).is_empty());
    }

    #[test]
    fn violations_are_reported() {
        let v = validate_counts(&[5, 7], 11, 91);
        assert_eq!(
            v,
            vec![
                Violation::CryptTooSmall { count: 11 },
                Violation::GroupsIllegal { groups: vec![5, 7] },
                Violation::LibraryTooLarge { count: 91 },
            ]
        );
    }

    #[test]
    fn descriptions_are_human_readable_and_mention_the_offending_number() {
        assert!(describe(&Violation::CryptTooSmall { count: 11 }).contains("11"));
        assert!(describe(&Violation::LibraryTooLarge { count: 91 }).contains("91"));
        let msg = describe(&Violation::GroupsIllegal {
            groups: vec![7, 5, 5],
        });
        assert!(msg.contains("[5, 7]")); // sorted + deduped for readability
    }
}
