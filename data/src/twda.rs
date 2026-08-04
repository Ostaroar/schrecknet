//! Fetch tournament-winning decks from KRCG's public TWDA API.
//!
//! `api.krcg.org`'s deck ids use the exact same KRCG numbering we already
//! build `cards.sqlite` from (100xxx library, 200xxx crypt) — confirmed
//! against the live OpenAPI spec — so no id-translation layer is needed.
//!
//! This module only fetches and parses; deciding which decks are actually
//! V5-legal (docs/adr/0018) happens in `main.rs`, by checking every card id
//! against the already-built `cards` table, not by trusting `date_from`.
//! `date_from` here is purely a fetch-size optimization (Fifth Edition
//! released 2020-11-30, so nothing earlier can possibly qualify).

use std::path::Path;
use std::time::{Duration, SystemTime};

use serde::Deserialize;

pub const API_URL: &str = "https://api.krcg.org/twda";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
/// Nothing before Fifth Edition's release can be V5-legal; this just bounds
/// the fetch. The real V5 gate is the card-membership check in `main.rs`.
const DATE_FROM: &str = "2020-01-01";

#[derive(Debug, Deserialize)]
pub struct TwdaCardCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
pub struct TwdaCrypt {
    pub cards: Vec<TwdaCardCount>,
}

#[derive(Debug, Deserialize)]
pub struct TwdaLibrarySection {
    pub cards: Vec<TwdaCardCount>,
}

#[derive(Debug, Deserialize)]
pub struct TwdaLibrary {
    pub cards: Vec<TwdaLibrarySection>,
}

#[derive(Debug, Deserialize)]
pub struct TwdaDeck {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub event: Option<String>,
    #[serde(default)]
    pub place: Option<String>,
    pub date: String,
    #[serde(default)]
    pub player: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub players_count: Option<i64>,
    #[serde(default)]
    pub tournament_format: Option<String>,
    #[serde(default)]
    pub score: Option<String>,
    #[serde(default)]
    pub comments: Option<String>,
    pub crypt: TwdaCrypt,
    pub library: TwdaLibrary,
}

/// All (crypt id, qty) and (library id, qty) pairs in a deck, section-tagged.
pub fn deck_card_counts(deck: &TwdaDeck) -> Vec<(i64, i64, &'static str)> {
    let mut counts: Vec<(i64, i64, &'static str)> = deck
        .crypt
        .cards
        .iter()
        .map(|c| (c.id, c.count, "crypt"))
        .collect();
    counts.extend(
        deck.library
            .cards
            .iter()
            .flat_map(|section| &section.cards)
            .map(|c| (c.id, c.count, "library")),
    );
    counts
}

/// Fetches every TWDA deck from `DATE_FROM` on, using a local disk cache
/// under `data/.cache/twda.json` (gitignored), same pattern as `krcg.rs`.
pub fn fetch_decks(cache_dir: &Path) -> Result<Vec<TwdaDeck>, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(cache_dir)?;
    let cache_file = cache_dir.join("twda.json");

    let fresh = std::fs::metadata(&cache_file)
        .and_then(|m| m.modified())
        .map(|modified| {
            SystemTime::now()
                .duration_since(modified)
                .unwrap_or(Duration::MAX)
                < CACHE_TTL
        })
        .unwrap_or(false);

    let body = if fresh {
        eprintln!("twda: using cached {}", cache_file.display());
        std::fs::read_to_string(&cache_file)?
    } else {
        eprintln!("twda: fetching {API_URL} (date_from={DATE_FROM})");
        let body = ureq::post(API_URL)
            .send_json(serde_json::json!({ "date_from": DATE_FROM }))?
            .into_string()?;
        std::fs::write(&cache_file, &body)?;
        body
    };

    let decks: Vec<TwdaDeck> = serde_json::from_str(&body)?;
    eprintln!("twda: {} decks fetched since {DATE_FROM}", decks.len());
    Ok(decks)
}

/// Inserts only the decks where every single card id already exists in the
/// (already-built, V5-filtered) `cards` table — docs/adr/0018's "confirmed
/// V5, never guessed by date" rule. A deck with even one non-V5 card is
/// dropped whole, not partially imported. `v5_card_ids` is the full pool,
/// loaded once (it's ~750 ids) rather than queried per card.
pub fn ingest(
    conn: &rusqlite::Connection,
    decks: &[TwdaDeck],
    v5_card_ids: &std::collections::HashSet<i64>,
) -> rusqlite::Result<TwdaIngestStats> {
    let mut fetched = 0u32;
    let mut confirmed = 0u32;

    for deck in decks {
        fetched += 1;
        let counts = deck_card_counts(deck);
        if counts.is_empty() || !counts.iter().all(|(id, _, _)| v5_card_ids.contains(id)) {
            continue;
        }

        conn.execute(
            "INSERT INTO twda_decks(id, name, event, place, date, player, author, players_count, tournament_format, score, comments)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                deck.id,
                deck.name,
                deck.event,
                deck.place,
                deck.date,
                deck.player,
                deck.author,
                deck.players_count,
                deck.tournament_format,
                deck.score,
                deck.comments,
            ],
        )?;
        for (card_id, qty, section) in counts {
            conn.execute(
                "INSERT INTO twda_deck_cards(deck_id, card_id, section, quantity) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![deck.id, card_id, section, qty],
            )?;
        }
        confirmed += 1;
    }

    Ok(TwdaIngestStats { fetched, confirmed })
}

pub struct TwdaIngestStats {
    pub fetched: u32,
    pub confirmed: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_deck() -> TwdaDeck {
        serde_json::from_value(serde_json::json!({
            "id": "2024test",
            "name": "Test Deck",
            "date": "2024-01-01",
            "crypt": { "count": 1, "cards": [{ "count": 2, "id": 200001, "name": "A" }] },
            "library": {
                "count": 3,
                "cards": [
                    { "type": "Master", "count": 1, "cards": [{ "count": 1, "id": 100001, "name": "B" }] },
                    { "type": "Combat", "count": 2, "cards": [{ "count": 2, "id": 100002, "name": "C" }] }
                ]
            }
        }))
        .unwrap()
    }

    #[test]
    fn deck_card_counts_flattens_crypt_and_every_library_section() {
        let deck = sample_deck();
        let counts = deck_card_counts(&deck);
        assert_eq!(
            counts,
            vec![
                (200001, 2, "crypt"),
                (100001, 1, "library"),
                (100002, 2, "library"),
            ]
        );
    }

    #[test]
    fn parses_optional_fields_as_absent() {
        let deck: TwdaDeck = serde_json::from_value(serde_json::json!({
            "id": "x",
            "date": "2024-01-01",
            "crypt": { "count": 0, "cards": [] },
            "library": { "count": 0, "cards": [] }
        }))
        .unwrap();
        assert!(deck.name.is_none());
        assert!(deck.player.is_none());
    }

    fn schema() -> &'static str {
        "CREATE TABLE twda_decks(id TEXT PRIMARY KEY, name TEXT, event TEXT, place TEXT,
           date TEXT, player TEXT, author TEXT, players_count INT, tournament_format TEXT,
           score TEXT, comments TEXT);
         CREATE TABLE twda_deck_cards(deck_id TEXT, card_id INT, section TEXT, quantity INT);"
    }

    #[test]
    fn drops_a_deck_whole_when_any_card_is_not_v5_confirmed() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(schema()).unwrap();
        // Missing 100002 from the known-V5 set — the whole deck must vanish,
        // not just that one card.
        let v5_ids: std::collections::HashSet<i64> = [200001, 100001].into_iter().collect();

        let stats = ingest(&conn, &[sample_deck()], &v5_ids).unwrap();
        assert_eq!(stats.fetched, 1);
        assert_eq!(stats.confirmed, 0);

        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM twda_decks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 0);
    }

    #[test]
    fn keeps_a_deck_when_every_card_is_v5_confirmed() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(schema()).unwrap();
        let v5_ids: std::collections::HashSet<i64> =
            [200001, 100001, 100002].into_iter().collect();

        let stats = ingest(&conn, &[sample_deck()], &v5_ids).unwrap();
        assert_eq!(stats.confirmed, 1);

        let card_rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM twda_deck_cards", [], |r| r.get(0))
            .unwrap();
        assert_eq!(card_rows, 3);
    }
}
