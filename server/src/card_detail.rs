//! `get_card`: full detail for one card by id — base fields, disciplines,
//! printings (with set names), artists, rulings, translations. Shared by MCP
//! and REST (AGENTS.md hard rule #2), same as crypt/library search.

use rusqlite::{Connection, OptionalExtension};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct GetCardParams {
    /// The card's numeric id, as returned by search_crypt/search_library.
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct GetCardByNameParams {
    /// Exact canonical or ASCII-folded card name (case-insensitive).
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Discipline {
    pub code: String,
    pub superior: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Printing {
    pub set: String,
    pub precon: Option<String>,
    pub rarity: Option<String>,
    pub first_print: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Ruling {
    pub text: String,
    pub refs: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct Translation {
    pub lang: String,
    pub name: Option<String>,
    pub card_text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CardDetail {
    pub id: i64,
    pub kind: String,
    pub name: String,
    pub card_text: Option<String>,
    /// KRCG-hosted card scan (hotlinked, never stored — Dark Pack rule).
    pub image_url: Option<String>,
    // Crypt-only fields (None on library cards).
    pub clan: Option<String>,
    pub capacity: Option<i64>,
    pub group: Option<i64>,
    pub title: Option<String>,
    pub path: Option<String>,
    // Library-only fields (None on crypt cards).
    pub types: Option<Vec<String>>,
    pub blood_cost: Option<String>,
    pub pool_cost: Option<String>,
    pub disciplines: Vec<Discipline>,
    pub printings: Vec<Printing>,
    pub artists: Vec<String>,
    pub rulings: Vec<Ruling>,
    pub translations: Vec<Translation>,
}

pub fn get_card(conn: &Connection, params: &GetCardParams) -> rusqlite::Result<Option<CardDetail>> {
    let base = conn
        .query_row(
            "SELECT kind, name, card_text, clan, capacity, grp, title, types, blood_cost, pool_cost, image_url, path
             FROM cards WHERE id = ?1",
            [params.id],
            |row| {
                let clan: Option<String> = row.get(3)?;
                let types_json: Option<String> = row.get(7)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    clan.filter(|c| !c.is_empty()),
                    row.get::<_, Option<i64>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    types_json,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                ))
            },
        )
        .optional()?;

    let Some((
        kind,
        name,
        card_text,
        clan,
        capacity,
        group,
        title,
        types_json,
        blood_cost,
        pool_cost,
        image_url,
        path,
    )) = base
    else {
        return Ok(None);
    };

    let is_crypt = kind == "crypt";
    Ok(Some(CardDetail {
        id: params.id,
        kind,
        name,
        card_text,
        image_url,
        // clan is meaningful on both kinds (crypt: the vampire's clan;
        // library: the clan/path requirement to play it) — same column,
        // reused deliberately (see server/src/cards_db.rs::LibraryCard).
        clan,
        capacity: if is_crypt { capacity } else { None },
        group: if is_crypt { group } else { None },
        title: if is_crypt { title } else { None },
        path,
        types: if is_crypt {
            None
        } else {
            types_json.map(|t| serde_json::from_str(&t).unwrap_or_default())
        },
        blood_cost: if is_crypt { None } else { blood_cost },
        pool_cost: if is_crypt { None } else { pool_cost },
        disciplines: disciplines_for(conn, params.id)?,
        printings: printings_for(conn, params.id)?,
        artists: artists_for(conn, params.id)?,
        rulings: rulings_for(conn, params.id)?,
        translations: translations_for(conn, params.id)?,
    }))
}

pub fn get_card_by_name(
    conn: &Connection,
    params: &GetCardByNameParams,
) -> rusqlite::Result<Option<CardDetail>> {
    let name = params.name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    let id = conn
        .query_row(
            "SELECT id FROM cards
             WHERE name = ?1 COLLATE NOCASE OR name_ascii = ?1 COLLATE NOCASE
             ORDER BY CASE WHEN name = ?1 COLLATE NOCASE THEN 0 ELSE 1 END, id
             LIMIT 1",
            [name],
            |row| row.get(0),
        )
        .optional()?;
    match id {
        Some(id) => get_card(conn, &GetCardParams { id }),
        None => Ok(None),
    }
}

fn disciplines_for(conn: &Connection, id: i64) -> rusqlite::Result<Vec<Discipline>> {
    let mut stmt = conn.prepare(
        "SELECT discipline, superior FROM card_disciplines WHERE card_id = ?1 ORDER BY superior DESC, discipline",
    )?;
    let rows = stmt.query_map([id], |row| {
        Ok(Discipline {
            code: row.get(0)?,
            superior: row.get::<_, i64>(1)? != 0,
        })
    })?;
    rows.collect()
}

fn printings_for(conn: &Connection, id: i64) -> rusqlite::Result<Vec<Printing>> {
    let mut stmt = conn.prepare(
        "SELECT s.name, p.precon, p.rarity, p.first_print
         FROM printings p JOIN sets s ON s.id = p.set_id
         WHERE p.card_id = ?1 ORDER BY s.release_date",
    )?;
    let rows = stmt.query_map([id], |row| {
        Ok(Printing {
            set: row.get(0)?,
            precon: row.get(1)?,
            rarity: row.get(2)?,
            first_print: row.get::<_, i64>(3)? != 0,
        })
    })?;
    rows.collect()
}

fn artists_for(conn: &Connection, id: i64) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT a.name FROM card_artists ca JOIN artists a ON a.id = ca.artist_id WHERE ca.card_id = ?1",
    )?;
    let rows = stmt.query_map([id], |row| row.get(0))?;
    rows.collect()
}

fn rulings_for(conn: &Connection, id: i64) -> rusqlite::Result<Vec<Ruling>> {
    let mut stmt = conn.prepare("SELECT text, refs FROM rulings WHERE card_id = ?1")?;
    let rows = stmt.query_map([id], |row| {
        let refs_json: String = row.get(1)?;
        Ok(Ruling {
            text: row.get(0)?,
            refs: serde_json::from_str(&refs_json).unwrap_or(serde_json::Value::Null),
        })
    })?;
    rows.collect()
}

fn translations_for(conn: &Connection, id: i64) -> rusqlite::Result<Vec<Translation>> {
    let mut stmt =
        conn.prepare("SELECT lang, name, card_text FROM translations WHERE card_id = ?1")?;
    let rows = stmt.query_map([id], |row| {
        Ok(Translation {
            lang: row.get(0)?,
            name: row.get(1)?,
            card_text: row.get(2)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE cards(id INT PRIMARY KEY, kind TEXT, name TEXT, name_ascii TEXT,
               card_text TEXT, clan TEXT, capacity INT, grp INT, title TEXT,
               types TEXT, blood_cost TEXT, pool_cost TEXT, image_url TEXT, path TEXT);
             CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
             CREATE TABLE sets(id INTEGER PRIMARY KEY, abbrev TEXT, name TEXT, release_date TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT);
             CREATE TABLE artists(id INTEGER PRIMARY KEY, name TEXT);
             CREATE TABLE card_artists(card_id INT, artist_id INT);
             CREATE TABLE rulings(card_id INT, text TEXT, refs TEXT);
             CREATE TABLE translations(card_id INT, lang TEXT, name TEXT, card_text TEXT);

             INSERT INTO cards VALUES
               (1,'crypt','Aaradhya','aaradhya','tyrant text','Ventrue',10,6,'Cardinal','[\"Vampire\"]',NULL,NULL,'https://static.krcg.org/card/aaradhyag6.jpg','Power and the Inner Voice'),
               (2,'library','Villein','villein','blood bound','',NULL,NULL,NULL,'[\"Master\"]',NULL,'2',NULL,NULL),
               (3,'library','Arcane Library','arcane library','','Tremere',NULL,NULL,NULL,'[\"Master\"]',NULL,'2',NULL,'Caine');
             INSERT INTO card_disciplines VALUES (1,'dom',1),(1,'for',0);
             INSERT INTO sets VALUES (1,'SV5','Sabbat V5','2025-10-26');
             INSERT INTO printings VALUES (1,1,'Path of Power',NULL,1);
             INSERT INTO artists VALUES (1,'Some Artist');
             INSERT INTO card_artists VALUES (1,1);
             INSERT INTO rulings VALUES (1,'Torpor ruling.','[{\"label\":\"X\"}]');
             INSERT INTO translations VALUES (1,'es','Aaradhya ES','texto');",
        )
        .unwrap();
    }

    #[test]
    fn returns_none_for_unknown_id() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        assert!(get_card(&conn, &GetCardParams { id: 999 })
            .unwrap()
            .is_none());
    }

    #[test]
    fn looks_up_card_by_exact_name_case_insensitively() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let card = get_card_by_name(
            &conn,
            &GetCardByNameParams {
                name: "  AARADHYA  ".into(),
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(card.id, 1);
        assert_eq!(card.name, "Aaradhya");

        assert!(get_card_by_name(
            &conn,
            &GetCardByNameParams {
                name: "unknown card".into(),
            }
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn crypt_card_has_crypt_fields_and_no_library_fields() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let card = get_card(&conn, &GetCardParams { id: 1 }).unwrap().unwrap();
        assert_eq!(card.name, "Aaradhya");
        assert_eq!(card.clan.as_deref(), Some("Ventrue"));
        assert_eq!(card.capacity, Some(10));
        assert_eq!(card.path.as_deref(), Some("Power and the Inner Voice"));
        assert_eq!(card.types, None);
        assert_eq!(card.blood_cost, None);
        assert_eq!(
            card.image_url.as_deref(),
            Some("https://static.krcg.org/card/aaradhyag6.jpg")
        );
    }

    #[test]
    fn library_card_has_library_fields_and_no_crypt_fields() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let card = get_card(&conn, &GetCardParams { id: 2 }).unwrap().unwrap();
        assert_eq!(card.types, Some(vec!["Master".to_string()]));
        assert_eq!(card.pool_cost.as_deref(), Some("2"));
        assert_eq!(card.clan, None); // no clan requirement on this card
        assert_eq!(card.capacity, None);
        assert_eq!(card.image_url, None);
    }

    #[test]
    fn library_card_reports_its_clan_requirement() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let card = get_card(&conn, &GetCardParams { id: 3 }).unwrap().unwrap();
        assert_eq!(card.clan.as_deref(), Some("Tremere"));
        assert_eq!(card.path.as_deref(), Some("Caine"));
        assert_eq!(card.capacity, None); // still not a crypt-only field leak
    }

    #[test]
    fn joins_disciplines_printings_artists_rulings_translations() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let card = get_card(&conn, &GetCardParams { id: 1 }).unwrap().unwrap();
        assert_eq!(card.disciplines.len(), 2);
        assert!(card.disciplines[0].superior); // superior-first ordering
        assert_eq!(card.printings.len(), 1);
        assert_eq!(card.printings[0].set, "Sabbat V5");
        assert_eq!(card.printings[0].precon.as_deref(), Some("Path of Power"));
        assert_eq!(card.artists, vec!["Some Artist".to_string()]);
        assert_eq!(card.rulings.len(), 1);
        assert_eq!(card.translations.len(), 1);
        assert_eq!(card.translations[0].lang, "es");
    }
}
