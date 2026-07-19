//! Derived library-card capacity requirements.
//!
//! VDB recognizes four English card-text forms inside one `Requires ...`
//! line. Keeping this parser in the shared Rust core makes the ingest rule
//! testable and prevents data-pipeline-specific interpretations.

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CapacityRequirement {
    /// Inclusive lower bound (`capacity N or more`, `capacity above N`).
    pub min: Option<u8>,
    /// Inclusive upper bound (`capacity N or less`, `capacity less than N`).
    pub max: Option<u8>,
}

/// Parses the capacity bound(s) VDB treats as library-card requirements.
///
/// Deliberately line-scoped: JavaScript's `.` in VDB's source regex does not
/// cross newlines, so a later effect mentioning “with capacity” must not be
/// mistaken for an earlier `Requires ...` clause.
pub fn parse_capacity_requirement(card_text: &str) -> CapacityRequirement {
    let mut result = CapacityRequirement::default();

    for line in card_text.lines() {
        let line = line.to_lowercase();
        let Some(requires_at) = line.find("requires ") else {
            continue;
        };
        let requires_clause = &line[requires_at..];
        for separator in [" of capacity ", " with capacity "] {
            let Some(capacity_at) = requires_clause.find(separator) else {
                continue;
            };
            let suffix = &requires_clause[capacity_at + separator.len()..];
            if let Some(value) = suffix
                .strip_prefix("less than ")
                .and_then(parse_leading_number)
            {
                update_max(&mut result.max, value.saturating_sub(1));
                continue;
            }
            if let Some(value) = suffix.strip_prefix("above ").and_then(parse_leading_number) {
                update_min(&mut result.min, value.saturating_add(1));
                continue;
            }
            let Some(value) = parse_leading_number(suffix) else {
                continue;
            };
            let remainder = suffix
                .trim_start_matches(|character: char| character.is_ascii_digit())
                .trim_start();
            if remainder.starts_with("or less") {
                update_max(&mut result.max, value);
            } else if remainder.starts_with("or more") {
                update_min(&mut result.min, value);
            }
        }
    }

    result
}

fn parse_leading_number(value: &str) -> Option<u8> {
    let digits = value
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>();
    (!digits.is_empty()).then(|| digits.parse().ok()).flatten()
}

// VDB ORs matches of the same direction. Keeping the largest lower bound and
// smallest upper bound preserves each direction's existential threshold test.
fn update_min(current: &mut Option<u8>, candidate: u8) {
    *current = Some(current.map_or(candidate, |value| value.max(candidate)));
}

fn update_max(current: &mut Option<u8>, candidate: u8) {
    *current = Some(current.map_or(candidate, |value| value.min(candidate)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_inclusive_and_strict_capacity_forms() {
        assert_eq!(
            parse_capacity_requirement(
                "Requires an Independent or Anarch vampire with capacity 5 or more."
            ),
            CapacityRequirement {
                min: Some(5),
                max: None,
            }
        );
        assert_eq!(
            parse_capacity_requirement("Requires a vampire of capacity above 4."),
            CapacityRequirement {
                min: Some(5),
                max: None,
            }
        );
        assert_eq!(
            parse_capacity_requirement("Requires a vampire with capacity 6 or less."),
            CapacityRequirement {
                min: None,
                max: Some(6),
            }
        );
        assert_eq!(
            parse_capacity_requirement("Requires a vampire of capacity less than 6."),
            CapacityRequirement {
                min: None,
                max: Some(5),
            }
        );
    }

    #[test]
    fn does_not_cross_lines_or_match_non_requirement_effects() {
        assert_eq!(
            parse_capacity_requirement(
                "Requires a Sabbat vampire.\nChoose a Sabbat vampire with capacity 7 or more."
            ),
            CapacityRequirement::default()
        );
        assert_eq!(
            parse_capacity_requirement(
                "Successful referendum burns 3 pool if they control a ready vampire with capacity 8 or more."
            ),
            CapacityRequirement::default()
        );
    }

    #[test]
    fn handles_case_and_combines_same_direction_matches() {
        assert_eq!(
            parse_capacity_requirement(
                "REQUIRES A VAMPIRE WITH CAPACITY 5 OR MORE.\nRequires an ally of capacity above 6."
            ),
            CapacityRequirement {
                min: Some(7),
                max: None,
            }
        );
    }
}
