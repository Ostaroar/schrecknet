//! VTES bracket-token parsing and canonical symbol metadata.
//!
//! KRCG/VDB card text uses tokens such as `[dom]`, `[DOM]`, and
//! `[POLITICAL ACTION]`. Unknown tokens remain plain text so newer card data
//! can never lose rules text merely because this client lacks an asset.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Segment {
    Text {
        value: String,
    },
    Discipline {
        token: String,
        code: String,
        label: &'static str,
        asset: &'static str,
        superior: bool,
    },
    CardType {
        token: String,
        asset: &'static str,
        label: &'static str,
    },
}

fn discipline_metadata(code: &str) -> Option<(&'static str, &'static str)> {
    match code {
        "abo" => Some(("Abombwe", "abo")),
        "ani" => Some(("Animalism", "ani")),
        "aus" => Some(("Auspex", "aus")),
        "cel" => Some(("Celerity", "cel")),
        "chi" => Some(("Chimerstry", "chi")),
        "dem" => Some(("Dementation", "dem")),
        "dom" => Some(("Dominate", "dom")),
        "for" => Some(("Fortitude", "for")),
        "nec" => Some(("Necromancy", "nec")),
        "obf" => Some(("Obfuscate", "obf")),
        "obl" => Some(("Oblivion", "obl")),
        "obt" => Some(("Obtenebration", "obt")),
        "pot" => Some(("Potence", "pot")),
        "pre" => Some(("Presence", "pre")),
        "pro" => Some(("Protean", "pro")),
        "ser" => Some(("Serpentis", "ser")),
        "tha" => Some(("Blood Sorcery", "tha")),
        "vic" => Some(("Vicissitude", "vic")),
        _ => None,
    }
}

/// Returns canonical metadata for one discipline code.
pub fn discipline_symbol(code: &str, superior: bool) -> Option<Segment> {
    let code = code.trim().to_lowercase();
    let (label, asset) = discipline_metadata(&code)?;
    let token = if superior {
        code.to_uppercase()
    } else {
        code.clone()
    };
    Some(Segment::Discipline {
        token,
        code,
        label,
        asset,
        superior,
    })
}

/// Returns canonical metadata for a card-type symbol.
pub fn card_type_symbol(card_type: &str) -> Option<Segment> {
    let token = card_type.trim().to_uppercase();
    let (asset, label) = match token.as_str() {
        "ACTION" => ("action", "Action"),
        "ACTION MODIFIER" => ("actionmodifier", "Action Modifier"),
        "ALLY" => ("ally", "Ally"),
        "COMBAT" => ("combat", "Combat"),
        "EQUIPMENT" => ("equipment", "Equipment"),
        "EVENT" => ("event", "Event"),
        "MASTER" => ("master", "Master"),
        "POLITICAL ACTION" => ("politicalaction", "Political Action"),
        "REACTION" => ("reaction", "Reaction"),
        "RETAINER" => ("retainer", "Retainer"),
        _ => return None,
    };
    Some(Segment::CardType {
        token,
        asset,
        label,
    })
}

fn token_symbol(token: &str) -> Option<Segment> {
    let code = token.to_lowercase();
    if discipline_metadata(&code).is_some() && (token == code || token == token.to_uppercase()) {
        return discipline_symbol(&code, token == token.to_uppercase());
    }
    card_type_symbol(token)
}

fn push_text(segments: &mut Vec<Segment>, value: &str) {
    if !value.is_empty() {
        segments.push(Segment::Text {
            value: value.to_owned(),
        });
    }
}

/// Splits card text into plain text and recognized visual-symbol segments.
pub fn parse(text: &str) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut emit_cursor = 0;
    let mut search_cursor = 0;

    while let Some(relative_open) = text[search_cursor..].find('[') {
        let open = search_cursor + relative_open;
        let token_start = open + 1;
        let remainder = &text[token_start..];
        let Some(relative_close) = remainder.find(']') else {
            break;
        };
        let close = token_start + relative_close;
        let token = &text[token_start..close];
        if token.is_empty() || token.contains('\n') {
            search_cursor = token_start;
            continue;
        }

        push_text(&mut segments, &text[emit_cursor..open]);
        if let Some(symbol) = token_symbol(token) {
            segments.push(symbol);
        } else {
            push_text(&mut segments, &text[open..=close]);
        }
        emit_cursor = close + 1;
        search_cursor = emit_cursor;
    }

    push_text(&mut segments, &text[emit_cursor..]);
    segments
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_every_discipline_present_in_the_v5_pool_at_both_levels() {
        for (code, label, asset) in [
            ("abo", "Abombwe", "abo"),
            ("ani", "Animalism", "ani"),
            ("aus", "Auspex", "aus"),
            ("cel", "Celerity", "cel"),
            ("chi", "Chimerstry", "chi"),
            ("dem", "Dementation", "dem"),
            ("dom", "Dominate", "dom"),
            ("for", "Fortitude", "for"),
            ("nec", "Necromancy", "nec"),
            ("obf", "Obfuscate", "obf"),
            ("obl", "Oblivion", "obl"),
            ("obt", "Obtenebration", "obt"),
            ("pot", "Potence", "pot"),
            ("pre", "Presence", "pre"),
            ("pro", "Protean", "pro"),
            ("ser", "Serpentis", "ser"),
            ("tha", "Blood Sorcery", "tha"),
            ("vic", "Vicissitude", "vic"),
        ] {
            assert_eq!(
                parse(&format!("[{code}]")),
                vec![Segment::Discipline {
                    token: code.into(),
                    code: code.into(),
                    label,
                    asset,
                    superior: false,
                }]
            );
            assert_eq!(
                parse(&format!("[{}]", code.to_uppercase())),
                vec![Segment::Discipline {
                    token: code.to_uppercase(),
                    code: code.into(),
                    label,
                    asset,
                    superior: true,
                }]
            );
        }
    }

    #[test]
    fn recognizes_supported_card_types() {
        for (token, asset, label) in [
            ("ACTION", "action", "Action"),
            ("ACTION MODIFIER", "actionmodifier", "Action Modifier"),
            ("ALLY", "ally", "Ally"),
            ("COMBAT", "combat", "Combat"),
            ("EQUIPMENT", "equipment", "Equipment"),
            ("EVENT", "event", "Event"),
            ("MASTER", "master", "Master"),
            ("POLITICAL ACTION", "politicalaction", "Political Action"),
            ("REACTION", "reaction", "Reaction"),
            ("RETAINER", "retainer", "Retainer"),
        ] {
            assert_eq!(
                parse(&format!("[{token}]")),
                vec![Segment::CardType {
                    token: token.into(),
                    asset,
                    label,
                }]
            );
        }
    }

    #[test]
    fn preserves_unknown_tokens_html_and_line_breaks_verbatim() {
        assert_eq!(
            parse("before [FUTURE TOKEN]\nafter <b>safe</b>"),
            vec![
                Segment::Text {
                    value: "before ".into()
                },
                Segment::Text {
                    value: "[FUTURE TOKEN]".into()
                },
                Segment::Text {
                    value: "\nafter <b>safe</b>".into()
                },
            ]
        );
    }

    #[test]
    fn mixed_case_discipline_is_not_a_valid_token() {
        assert_eq!(
            parse("[Dom]"),
            vec![Segment::Text {
                value: "[Dom]".into()
            }]
        );
    }
}
