//! Stateless deck tools: validate, diff, import/export as plain text.
//! Thin adapters over `core::legality`/`core::diff`/`core::dtext`, same
//! shared-service pattern as `draw_hand.rs` — no deck storage, so these need
//! only `cards.sqlite` (name/id/kind/group lookups), never `app.sqlite`.

use rusqlite::{Connection, OptionalExtension};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use schrecknet_core::diff::{self, CardQtys};
use schrecknet_core::dtext::{self, NamedQty};
use schrecknet_core::legality::{self, Violation};

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct DeckCard {
    pub id: u32,
    pub quantity: u16,
}

fn to_card_qtys(cards: &[DeckCard]) -> CardQtys {
    cards.iter().map(|c| (c.id, c.quantity)).collect()
}

/// Loads `grp` for a set of crypt card ids, in one query (avoids N+1 for
/// however many vampires a deck has).
fn crypt_groups(conn: &Connection, ids: &[u32]) -> rusqlite::Result<Vec<u8>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT grp FROM cards WHERE kind = 'crypt' AND id IN ({placeholders})");
    let mut stmt = conn.prepare(&sql)?;
    let params = ids.iter().map(|id| *id as i64).collect::<Vec<_>>();
    let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        row.get::<_, Option<i64>>(0)
    })?;
    rows.filter_map(|r| r.transpose())
        .map(|r| r.map(|g| g as u8))
        .collect()
}

// ---------------------------------------------------------------------------
// validate_deck
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ValidateDeckParams {
    pub crypt: Vec<DeckCard>,
    pub library: Vec<DeckCard>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValidateDeckResult {
    pub legal: bool,
    pub violations: Vec<Violation>,
    pub descriptions: Vec<String>,
}

pub fn validate_deck(
    conn: &Connection,
    params: &ValidateDeckParams,
) -> rusqlite::Result<ValidateDeckResult> {
    let crypt_count: u32 = params.crypt.iter().map(|c| c.quantity as u32).sum();
    let library_count: u32 = params.library.iter().map(|c| c.quantity as u32).sum();
    let ids: Vec<u32> = params.crypt.iter().map(|c| c.id).collect();
    let groups = crypt_groups(conn, &ids)?;
    let violations = legality::validate_counts(&groups, crypt_count, library_count);
    let descriptions = violations.iter().map(legality::describe).collect();
    Ok(ValidateDeckResult {
        legal: violations.is_empty(),
        violations,
        descriptions,
    })
}

// ---------------------------------------------------------------------------
// diff_decks
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct DiffDecksParams {
    pub crypt_a: Vec<DeckCard>,
    pub library_a: Vec<DeckCard>,
    pub crypt_b: Vec<DeckCard>,
    pub library_b: Vec<DeckCard>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffDecksResult {
    pub crypt: Vec<diff::Entry>,
    pub library: Vec<diff::Entry>,
}

/// Pure card-id comparison, no DB lookup needed.
pub fn diff_decks(params: &DiffDecksParams) -> DiffDecksResult {
    DiffDecksResult {
        crypt: diff::compare(
            &to_card_qtys(&params.crypt_a),
            &to_card_qtys(&params.crypt_b),
        ),
        library: diff::compare(
            &to_card_qtys(&params.library_a),
            &to_card_qtys(&params.library_b),
        ),
    }
}

// ---------------------------------------------------------------------------
// import_deck (plain text -> card ids)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ImportDeckParams {
    /// Lackey/JOL-style plain text: one card per line, "<qty>x <name>".
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportedCard {
    pub id: u32,
    pub name: String,
    pub quantity: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportDeckResult {
    pub crypt: Vec<ImportedCard>,
    pub library: Vec<ImportedCard>,
    /// Names that appear in the text but don't match any card — surfaced
    /// rather than silently dropped, since a typo'd card is exactly the kind
    /// of thing a paste-in import needs to flag.
    pub unresolved: Vec<String>,
}

pub fn import_deck(
    conn: &Connection,
    params: &ImportDeckParams,
) -> rusqlite::Result<ImportDeckResult> {
    let mut crypt = Vec::new();
    let mut library = Vec::new();
    let mut unresolved = Vec::new();

    for NamedQty { name, qty } in dtext::parse(&params.text) {
        let found = conn
            .query_row(
                "SELECT id, name, kind FROM cards
                 WHERE name = ?1 COLLATE NOCASE OR name_ascii = ?1 COLLATE NOCASE
                 ORDER BY CASE WHEN name = ?1 COLLATE NOCASE THEN 0 ELSE 1 END, id
                 LIMIT 1",
                [&name],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? as u32,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        match found {
            Some((id, canonical_name, kind)) => {
                let card = ImportedCard {
                    id,
                    name: canonical_name,
                    quantity: qty,
                };
                if kind == "crypt" {
                    crypt.push(card);
                } else {
                    library.push(card);
                }
            }
            None => unresolved.push(name),
        }
    }

    Ok(ImportDeckResult {
        crypt,
        library,
        unresolved,
    })
}

// ---------------------------------------------------------------------------
// export_deck (card ids -> plain text)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ExportDeckParams {
    pub crypt: Vec<DeckCard>,
    pub library: Vec<DeckCard>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportDeckResult {
    pub text: String,
}

fn names_for(conn: &Connection, cards: &[DeckCard]) -> rusqlite::Result<Vec<NamedQty>> {
    cards
        .iter()
        .map(|card| {
            let name: String = conn.query_row(
                "SELECT name FROM cards WHERE id = ?1",
                [card.id as i64],
                |row| row.get(0),
            )?;
            Ok(NamedQty {
                name,
                qty: card.quantity,
            })
        })
        .collect()
}

pub fn export_deck(
    conn: &Connection,
    params: &ExportDeckParams,
) -> rusqlite::Result<ExportDeckResult> {
    let crypt = names_for(conn, &params.crypt)?;
    let library = names_for(conn, &params.library)?;
    Ok(ExportDeckResult {
        text: dtext::format(&crypt, &library),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cards(id INTEGER PRIMARY KEY, kind TEXT, name TEXT, name_ascii TEXT, grp INT);
             INSERT INTO cards VALUES (1, 'crypt', 'Alpha', 'Alpha', 6);
             INSERT INTO cards VALUES (2, 'crypt', 'Beta', 'Beta', 7);
             INSERT INTO cards VALUES (3, 'crypt', 'Gamma', 'Gamma', 4);
             INSERT INTO cards VALUES (10, 'library', 'Villein', 'Villein', NULL);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn validate_deck_reports_group_and_size_violations() {
        let conn = open_test_db();
        let result = validate_deck(
            &conn,
            &ValidateDeckParams {
                crypt: vec![
                    DeckCard { id: 1, quantity: 6 },
                    DeckCard { id: 3, quantity: 6 },
                ],
                library: vec![DeckCard {
                    id: 10,
                    quantity: 60,
                }],
            },
        )
        .unwrap();
        assert!(!result.legal);
        assert!(matches!(
            result.violations[0],
            Violation::GroupsIllegal { .. }
        ));
    }

    #[test]
    fn validate_deck_accepts_a_legal_deck() {
        let conn = open_test_db();
        let result = validate_deck(
            &conn,
            &ValidateDeckParams {
                crypt: vec![
                    DeckCard { id: 1, quantity: 6 },
                    DeckCard { id: 2, quantity: 6 },
                ],
                library: vec![DeckCard {
                    id: 10,
                    quantity: 60,
                }],
            },
        )
        .unwrap();
        assert!(result.legal);
    }

    #[test]
    fn diff_decks_compares_each_section_independently() {
        let result = diff_decks(&DiffDecksParams {
            crypt_a: vec![DeckCard { id: 1, quantity: 2 }],
            library_a: vec![],
            crypt_b: vec![DeckCard { id: 1, quantity: 3 }],
            library_b: vec![DeckCard {
                id: 10,
                quantity: 1,
            }],
        });
        assert_eq!(result.crypt[0].change, diff::Change::Changed);
        assert_eq!(result.library[0].change, diff::Change::OnlyB);
    }

    #[test]
    fn import_deck_resolves_names_case_insensitively_and_flags_unresolved() {
        let conn = open_test_db();
        let result = import_deck(
            &conn,
            &ImportDeckParams {
                text: "2x alpha\n1 Villein\n3x Nonexistent".to_string(),
            },
        )
        .unwrap();
        assert_eq!(result.crypt.len(), 1);
        assert_eq!(result.crypt[0].name, "Alpha");
        assert_eq!(result.crypt[0].quantity, 2);
        assert_eq!(result.library.len(), 1);
        assert_eq!(result.unresolved, vec!["Nonexistent".to_string()]);
    }

    #[test]
    fn export_deck_round_trips_through_import() {
        let conn = open_test_db();
        let exported = export_deck(
            &conn,
            &ExportDeckParams {
                crypt: vec![DeckCard { id: 1, quantity: 2 }],
                library: vec![DeckCard {
                    id: 10,
                    quantity: 4,
                }],
            },
        )
        .unwrap();
        assert!(exported.text.contains("2x Alpha"));
        assert!(exported.text.contains("4x Villein"));

        let reimported = import_deck(
            &conn,
            &ImportDeckParams {
                text: exported.text,
            },
        )
        .unwrap();
        assert_eq!(reimported.crypt[0].id, 1);
        assert_eq!(reimported.library[0].id, 10);
        assert!(reimported.unresolved.is_empty());
    }
}
