//! Read-only access to `twda_decks`/`twda_deck_cards` — tournament-winning
//! decks confirmed V5 at build time (docs/adr/0018, `data/src/twda.rs`).
//! Same shared-service pattern as `cards_db.rs` (AGENTS.md hard rule #2).

use rusqlite::{Connection, OptionalExtension};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, JsonSchema, utoipa::ToSchema, utoipa::IntoParams)]
pub struct TwdaSearchParams {
    /// Case-insensitive substring match against the player's name.
    #[serde(default)]
    pub player: Option<String>,
    /// Only decks containing a card whose name matches this substring
    /// (case-insensitive).
    #[serde(default)]
    pub card_name: Option<String>,
    /// Only decks from this date on (inclusive, YYYY-MM-DD).
    #[serde(default)]
    pub date_from: Option<String>,
    /// Only decks up to this date (inclusive, YYYY-MM-DD).
    #[serde(default)]
    pub date_to: Option<String>,
    /// Maximum results, 1 through 200 (default 50).
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct TwdaDeckSummary {
    pub id: String,
    pub name: Option<String>,
    pub event: Option<String>,
    pub place: Option<String>,
    pub date: String,
    pub player: Option<String>,
    pub players_count: Option<i64>,
}

/// Lists decks matching the given filters, newest first.
pub fn search_decks(
    conn: &Connection,
    params: &TwdaSearchParams,
) -> rusqlite::Result<Vec<TwdaDeckSummary>> {
    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let card_name = params.card_name.as_deref().unwrap_or("");

    let mut stmt = conn.prepare(
        "SELECT DISTINCT d.id, d.name, d.event, d.place, d.date, d.player, d.players_count
         FROM twda_decks d
         WHERE (?1 = '' OR d.player LIKE '%' || ?1 || '%' COLLATE NOCASE)
           AND (?2 IS NULL OR d.date >= ?2)
           AND (?3 IS NULL OR d.date <= ?3)
           AND (
             ?4 = '' OR EXISTS (
               SELECT 1 FROM twda_deck_cards tc JOIN cards c ON c.id = tc.card_id
               WHERE tc.deck_id = d.id AND c.name LIKE '%' || ?4 || '%' COLLATE NOCASE
             )
           )
         ORDER BY d.date DESC, d.id
         LIMIT ?5",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![
            params.player.as_deref().unwrap_or(""),
            params.date_from,
            params.date_to,
            card_name,
            limit,
        ],
        |row| {
            Ok(TwdaDeckSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                event: row.get(2)?,
                place: row.get(3)?,
                date: row.get(4)?,
                player: row.get(5)?,
                players_count: row.get(6)?,
            })
        },
    )?;
    rows.collect()
}

#[derive(Debug, Clone, Deserialize, JsonSchema, utoipa::ToSchema, utoipa::IntoParams)]
pub struct TwdaDeckParams {
    /// The deck's TWDA id, as returned by search_twda_decks.
    pub id: String,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct TwdaDeckCard {
    pub card_id: i64,
    pub name: String,
    pub quantity: i64,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct TwdaDeckDetail {
    pub id: String,
    pub name: Option<String>,
    pub event: Option<String>,
    pub place: Option<String>,
    pub date: String,
    pub player: Option<String>,
    pub author: Option<String>,
    pub players_count: Option<i64>,
    pub tournament_format: Option<String>,
    pub score: Option<String>,
    pub comments: Option<String>,
    pub crypt: Vec<TwdaDeckCard>,
    pub library: Vec<TwdaDeckCard>,
}

/// Full crypt/library breakdown for one deck, card names joined in. Returns
/// `None` if the id doesn't match any confirmed-V5 deck.
pub fn get_deck(
    conn: &Connection,
    params: &TwdaDeckParams,
) -> rusqlite::Result<Option<TwdaDeckDetail>> {
    let deck = conn
        .query_row(
            "SELECT id, name, event, place, date, player, author, players_count,
                    tournament_format, score, comments
             FROM twda_decks WHERE id = ?1",
            [&params.id],
            |row| {
                Ok(TwdaDeckDetail {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    event: row.get(2)?,
                    place: row.get(3)?,
                    date: row.get(4)?,
                    player: row.get(5)?,
                    author: row.get(6)?,
                    players_count: row.get(7)?,
                    tournament_format: row.get(8)?,
                    score: row.get(9)?,
                    comments: row.get(10)?,
                    crypt: Vec::new(),
                    library: Vec::new(),
                })
            },
        )
        .optional()?;

    let Some(mut deck) = deck else {
        return Ok(None);
    };

    let mut stmt = conn.prepare(
        "SELECT tc.section, tc.card_id, c.name, tc.quantity
         FROM twda_deck_cards tc JOIN cards c ON c.id = tc.card_id
         WHERE tc.deck_id = ?1
         ORDER BY tc.section, c.name",
    )?;
    let rows = stmt.query_map([&params.id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            TwdaDeckCard {
                card_id: row.get(1)?,
                name: row.get(2)?,
                quantity: row.get(3)?,
            },
        ))
    })?;
    for row in rows {
        let (section, card) = row?;
        if section == "crypt" {
            deck.crypt.push(card);
        } else {
            deck.library.push(card);
        }
    }

    Ok(Some(deck))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cards(id INTEGER PRIMARY KEY, name TEXT);
             INSERT INTO cards VALUES (200001, 'Alpha'), (100001, 'Villein');
             CREATE TABLE twda_decks(id TEXT PRIMARY KEY, name TEXT, event TEXT, place TEXT,
               date TEXT, player TEXT, author TEXT, players_count INT, tournament_format TEXT,
               score TEXT, comments TEXT);
             INSERT INTO twda_decks VALUES
               ('2024a', 'Deck A', 'NC 2024', 'Paris', '2024-06-01', 'Alice', NULL, 20, '3R+F', '1', NULL),
               ('2023a', 'Deck B', 'GP 2023', 'Berlin', '2023-06-01', 'Bob', NULL, 15, '3R+F', '1', NULL);
             CREATE TABLE twda_deck_cards(deck_id TEXT, card_id INT, section TEXT, quantity INT);
             INSERT INTO twda_deck_cards VALUES
               ('2024a', 200001, 'crypt', 4),
               ('2024a', 100001, 'library', 6);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn search_filters_by_player_and_date() {
        let conn = open_test_db();
        let results = search_decks(
            &conn,
            &TwdaSearchParams {
                player: Some("alice".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "2024a");

        let results = search_decks(
            &conn,
            &TwdaSearchParams {
                date_from: Some("2024-01-01".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "2024a");
    }

    #[test]
    fn search_filters_by_card_name() {
        let conn = open_test_db();
        let results = search_decks(
            &conn,
            &TwdaSearchParams {
                card_name: Some("villein".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "2024a");
    }

    #[test]
    fn get_deck_returns_full_crypt_and_library_breakdown() {
        let conn = open_test_db();
        let deck = get_deck(&conn, &TwdaDeckParams { id: "2024a".into() })
            .unwrap()
            .unwrap();
        assert_eq!(deck.crypt.len(), 1);
        assert_eq!(deck.crypt[0].name, "Alpha");
        assert_eq!(deck.library[0].name, "Villein");
    }

    #[test]
    fn get_deck_returns_none_for_unknown_id() {
        let conn = open_test_db();
        assert!(get_deck(&conn, &TwdaDeckParams { id: "nope".into() })
            .unwrap()
            .is_none());
    }
}
