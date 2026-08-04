//! Plain-text deck list parsing/formatting — Lackey/JOL-style: one card per
//! line as `"<qty>x <name>"` or `"<qty> x <name>"` (the space before `x`,
//! and `x` itself, are each independently optional — verified against JOL's
//! actual export via smeea/vdb#40 and its fix, commit fe3feb8, whose own
//! parser uses `^\s*([0-9]+) ?x?\s*(.*)`; this mirrors that), blank
//! lines/comments (`#`/`//`) and header-only lines ignored. VTES card names
//! are globally unique, so resolving a name to a card id/kind is a frontend
//! concern (it needs `cards.sqlite`); this module only owns the text <->
//! (name, qty) shape (AGENTS.md hard rule #1: domain serialization lives in
//! core/).

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NamedQty {
    pub name: String,
    pub qty: u16,
}

/// Parses a plain-text deck list into (name, qty) pairs, in file order.
pub fn parse(text: &str) -> Vec<NamedQty> {
    text.lines()
        .filter_map(|line| parse_line(line.trim()))
        .collect()
}

fn parse_line(line: &str) -> Option<NamedQty> {
    if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
        return None;
    }
    let digits_end = line.find(|c: char| !c.is_ascii_digit())?;
    if digits_end == 0 {
        return None;
    }
    let qty: u16 = line[..digits_end].parse().ok()?;
    if qty == 0 {
        return None;
    }
    let after_qty = &line[digits_end..];
    let rest = after_qty.strip_prefix(' ').unwrap_or(after_qty);
    let rest = rest.strip_prefix(['x', 'X']).unwrap_or(rest);
    let name = rest.trim_start();
    if name.is_empty() {
        return None;
    }
    Some(NamedQty {
        name: name.to_string(),
        qty,
    })
}

fn format_section(header: &str, cards: &[NamedQty]) -> String {
    if cards.is_empty() {
        return String::new();
    }
    let mut s = String::new();
    s.push_str(header);
    s.push('\n');
    for c in cards {
        s.push_str(&format!("{}x {}\n", c.qty, c.name));
    }
    s
}

/// Formats crypt + library (name, qty) pairs as a human-readable plain-text
/// deck list with section headers. Headers are cosmetic — `parse` ignores
/// any line that doesn't start with a quantity, so this round-trips through
/// `parse` (modulo section boundaries, which the caller already knows from
/// which list a name came from).
pub fn format(crypt: &[NamedQty], library: &[NamedQty]) -> String {
    let crypt_block = format_section("Crypt", crypt);
    let library_block = format_section("Library", library);
    if !crypt_block.is_empty() && !library_block.is_empty() {
        format!("{crypt_block}\n{library_block}")
    } else {
        format!("{crypt_block}{library_block}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_qty_x_name_and_qty_name() {
        assert_eq!(
            parse("4x Aaradhya, The Callous Tyrant\n2 Villein"),
            vec![
                NamedQty {
                    name: "Aaradhya, The Callous Tyrant".into(),
                    qty: 4
                },
                NamedQty {
                    name: "Villein".into(),
                    qty: 2
                },
            ]
        );
    }

    #[test]
    fn parses_jol_export_format_with_space_before_x() {
        // Verbatim sample from smeea/vdb#40 (the JOL-format import bug
        // report) that VDB itself fixed in commit fe3feb8 — locks the exact
        // input real JOL exports produce, not a guessed shape.
        let text = "4 x Handsome Dan\n\
                     1 x Laura Goldman\n\
                     4 x Alabástrom\n\
                     2 x Malachai\n\
                     3 x Anarch Convert";
        assert_eq!(
            parse(text),
            vec![
                NamedQty {
                    name: "Handsome Dan".into(),
                    qty: 4
                },
                NamedQty {
                    name: "Laura Goldman".into(),
                    qty: 1
                },
                NamedQty {
                    name: "Alabástrom".into(),
                    qty: 4
                },
                NamedQty {
                    name: "Malachai".into(),
                    qty: 2
                },
                NamedQty {
                    name: "Anarch Convert".into(),
                    qty: 3
                },
            ]
        );
    }

    #[test]
    fn ignores_blank_lines_comments_and_headers() {
        let text = "Crypt\n# a comment\n\n// another comment\n2x Villein\nLibrary (not a qty line)\n1x Deflection";
        assert_eq!(
            parse(text),
            vec![
                NamedQty {
                    name: "Villein".into(),
                    qty: 2
                },
                NamedQty {
                    name: "Deflection".into(),
                    qty: 1
                },
            ]
        );
    }

    #[test]
    fn ignores_zero_and_malformed_quantities() {
        assert_eq!(parse("0x Nothing\nabc Something\nDeflection"), vec![]);
    }

    #[test]
    fn format_round_trips_through_parse() {
        let crypt = vec![NamedQty {
            name: "Aaradhya, The Callous Tyrant".into(),
            qty: 1,
        }];
        let library = vec![
            NamedQty {
                name: "Deflection".into(),
                qty: 4,
            },
            NamedQty {
                name: "Villein".into(),
                qty: 2,
            },
        ];
        let text = format(&crypt, &library);
        assert!(text.starts_with("Crypt\n1x Aaradhya"));
        assert!(text.contains("Library\n4x Deflection\n2x Villein"));
        let parsed = parse(&text);
        assert_eq!(parsed, [crypt, library].concat());
    }

    #[test]
    fn format_omits_empty_sections() {
        let library = vec![NamedQty {
            name: "Villein".into(),
            qty: 1,
        }];
        let text = format(&[], &library);
        assert!(!text.contains("Crypt"));
        assert!(text.starts_with("Library"));
    }
}
