//! Transform raw KRCG card JSON into `cards.sqlite` rows, restricted to the
//! V5 pool (`v5pool::is_in_v5_pool`).
//!
//! Known gaps, left NULL rather than guessed (tracked in
//! docs/feature-parity.md, marked ✎ for verification):
//! - `sect`: KRCG's export doesn't carry clan→sect mapping directly and we'd
//!   rather ship NULL than a wrong Camarilla/Sabbat/Independent guess.
//! - `votes`, `banned`, `requirement_*`, `burn_option`: not reliably present
//!   in this data source at Phase 1; revisit against VEKN's rulebook data.

use rusqlite::{params, Connection};
use serde_json::Value;

use crate::v5pool::is_in_v5_pool;

pub fn run(
    conn: &Connection,
    all_cards: &[Value],
) -> Result<IngestStats, Box<dyn std::error::Error>> {
    let pool: Vec<&Value> = all_cards.iter().filter(|c| is_in_v5_pool(c)).collect();

    let mut stats = IngestStats::default();
    for card in &pool {
        let kind = if is_crypt(card) { "crypt" } else { "library" };
        insert_card(conn, card, kind)?;
        insert_disciplines(conn, card)?;
        insert_printings(conn, card)?;
        insert_artists(conn, card)?;
        insert_rulings(conn, card)?;
        insert_translations(conn, card)?;

        if kind == "crypt" {
            stats.crypt += 1;
        } else {
            stats.library += 1;
        }
    }
    Ok(stats)
}

#[derive(Default)]
pub struct IngestStats {
    pub crypt: u32,
    pub library: u32,
}

fn is_crypt(card: &Value) -> bool {
    card.get("types")
        .and_then(|t| t.as_array())
        .map(|types| types.iter().any(|t| t == "Vampire" || t == "Imbued"))
        .unwrap_or(false)
}

fn str_field<'a>(card: &'a Value, key: &str) -> Option<&'a str> {
    card.get(key).and_then(|v| v.as_str())
}

fn ascii_fold(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'á' | 'à' | 'â' | 'ä' => 'a',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ñ' => 'n',
            'ç' => 'c',
            other => other,
        })
        .collect()
}

fn insert_card(conn: &Connection, card: &Value, kind: &str) -> rusqlite::Result<()> {
    let id = card.get("id").and_then(|v| v.as_i64()).unwrap_or_default();
    let name = str_field(card, "printed_name")
        .or_else(|| str_field(card, "name"))
        .unwrap_or_default();
    let types_json = card
        .get("types")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "[]".to_string());

    conn.execute(
        "INSERT OR REPLACE INTO cards
         (id, kind, name, name_ascii, aka, card_text, clan, sect, capacity, grp, title,
          votes, adv, banned, types, blood_cost, pool_cost, burn_option,
          requirement_clan, requirement_capacity, requirement_title, requirement_sect,
          image_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10,
                 NULL, 0, NULL, ?11, ?12, ?13, NULL,
                 NULL, NULL, NULL, NULL, ?14)",
        params![
            id,
            kind,
            name,
            ascii_fold(name),
            str_field(card, "name"),
            str_field(card, "card_text"),
            card.get("clans").map(join_str_array),
            card.get("capacity").and_then(|v| v.as_i64()),
            card.get("group")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<i64>().ok()),
            str_field(card, "title"),
            types_json,
            str_field(card, "blood_cost"),
            str_field(card, "pool_cost"),
            str_field(card, "url"),
        ],
    )?;
    Ok(())
}

fn join_str_array(v: &Value) -> String {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default()
}

fn insert_disciplines(conn: &Connection, card: &Value) -> rusqlite::Result<()> {
    let id = card.get("id").and_then(|v| v.as_i64()).unwrap_or_default();
    let Some(disciplines) = card.get("disciplines").and_then(|v| v.as_array()) else {
        return Ok(());
    };
    for d in disciplines {
        let Some(code) = d.as_str() else { continue };
        let superior = code.chars().next().is_some_and(|c| c.is_uppercase());
        conn.execute(
            "INSERT INTO card_disciplines (card_id, discipline, superior) VALUES (?1, ?2, ?3)",
            params![id, code.to_lowercase(), superior as i64],
        )?;
    }
    Ok(())
}

fn insert_printings(conn: &Connection, card: &Value) -> rusqlite::Result<()> {
    let id = card.get("id").and_then(|v| v.as_i64()).unwrap_or_default();
    let Some(sets) = card.get("sets").and_then(|v| v.as_object()) else {
        return Ok(());
    };
    for (set_name, printings) in sets {
        let set_id = upsert_set(conn, set_name, printings.as_array().and_then(|a| a.first()))?;
        let Some(printings) = printings.as_array() else {
            continue;
        };
        for (i, p) in printings.iter().enumerate() {
            let precon = p.get("precon").and_then(|v| v.as_str());
            let rarity = p.get("rarity").and_then(|v| v.as_str());
            conn.execute(
                "INSERT INTO printings (card_id, set_id, precon, rarity, first_print) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, set_id, precon, rarity, (i == 0) as i64],
            )?;
        }
    }
    Ok(())
}

fn upsert_set(conn: &Connection, name: &str, sample: Option<&Value>) -> rusqlite::Result<i64> {
    if let Ok(id) = conn.query_row("SELECT id FROM sets WHERE name = ?1", [name], |r| r.get(0)) {
        return Ok(id);
    }
    let release_date = sample
        .and_then(|p| p.get("release_date"))
        .and_then(|v| v.as_str());
    conn.execute(
        "INSERT INTO sets (abbrev, name, release_date) VALUES (?1, ?2, ?3)",
        params![name, name, release_date],
    )?;
    Ok(conn.last_insert_rowid())
}

fn insert_artists(conn: &Connection, card: &Value) -> rusqlite::Result<()> {
    let id = card.get("id").and_then(|v| v.as_i64()).unwrap_or_default();
    let Some(artists) = card.get("artists").and_then(|v| v.as_array()) else {
        return Ok(());
    };
    for a in artists {
        let Some(name) = a.as_str() else { continue };
        let artist_id = if let Ok(aid) =
            conn.query_row("SELECT id FROM artists WHERE name = ?1", [name], |r| {
                r.get::<_, i64>(0)
            }) {
            aid
        } else {
            conn.execute("INSERT INTO artists (name) VALUES (?1)", [name])?;
            conn.last_insert_rowid()
        };
        conn.execute(
            "INSERT INTO card_artists (card_id, artist_id) VALUES (?1, ?2)",
            params![id, artist_id],
        )?;
    }
    Ok(())
}

fn insert_rulings(conn: &Connection, card: &Value) -> rusqlite::Result<()> {
    let id = card.get("id").and_then(|v| v.as_i64()).unwrap_or_default();
    let Some(rulings) = card.get("rulings").and_then(|v| v.as_array()) else {
        return Ok(());
    };
    for r in rulings {
        let text = r.get("text").and_then(|v| v.as_str()).unwrap_or_default();
        let refs = r
            .get("references")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "[]".to_string());
        conn.execute(
            "INSERT INTO rulings (card_id, text, refs) VALUES (?1, ?2, ?3)",
            params![id, text, refs],
        )?;
    }
    Ok(())
}

fn insert_translations(conn: &Connection, card: &Value) -> rusqlite::Result<()> {
    let id = card.get("id").and_then(|v| v.as_i64()).unwrap_or_default();
    let Some(i18n) = card.get("_i18n").and_then(|v| v.as_object()) else {
        return Ok(());
    };
    for (lang, t) in i18n {
        conn.execute(
            "INSERT INTO translations (card_id, lang, name, card_text) VALUES (?1, ?2, ?3, ?4)",
            params![
                id,
                lang,
                t.get("name").and_then(|v| v.as_str()),
                t.get("card_text").and_then(|v| v.as_str()),
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn crypt_detection_matches_vampire_and_imbued() {
        assert!(is_crypt(&json!({"types": ["Vampire"]})));
        assert!(is_crypt(&json!({"types": ["Imbued"]})));
        assert!(!is_crypt(&json!({"types": ["Equipment"]})));
        assert!(!is_crypt(&json!({})));
    }

    #[test]
    fn discipline_case_marks_superior() {
        // Superior disciplines are uppercase in KRCG's export (e.g. "DOM"),
        // inferior ones lowercase ("dom") — see docs/domain-vtes.md.
        let card = json!({"id": 1, "disciplines": ["DOM", "obf"]});
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT)",
        )
        .unwrap();
        insert_disciplines(&conn, &card).unwrap();
        let mut stmt = conn
            .prepare("SELECT discipline, superior FROM card_disciplines ORDER BY discipline")
            .unwrap();
        let rows: Vec<(String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(rows, vec![("dom".into(), 1), ("obf".into(), 0)]);
    }

    #[test]
    fn ascii_fold_strips_accents() {
        assert_eq!(ascii_fold("Théo Bell"), "Theo Bell");
    }
}
