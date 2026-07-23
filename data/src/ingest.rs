//! Transform raw KRCG card JSON into `cards.sqlite` rows, restricted to the
//! V5 pool (`v5pool::is_in_v5_pool`).
//!
//! Known gaps, left NULL rather than guessed (tracked in
//! docs/feature-parity.md, marked ✎ for verification):
//! - `requirement_clan`, `requirement_title`, and `requirement_sect`: legacy
//!   scalar columns superseded by normalized requirement tables.

use rusqlite::{params, Connection};
use schrecknet_core::capacity::parse_capacity_requirement;
use schrecknet_core::crypt_metadata::CryptMetadata;
use schrecknet_core::requirements::normalize_library_requirements;
use schrecknet_core::traits::{classify_crypt_traits, classify_library_traits, LibraryTraitFacts};
use serde_json::Value;

use crate::v5pool::{is_in_v5_pool, precon_name, V5_SET_NAMES};
use crate::vekn::{LibraryMetadata, LibraryRequirements, VeknMetadata};

pub fn run(
    conn: &Connection,
    all_cards: &[Value],
    vekn: &VeknMetadata,
) -> Result<IngestStats, Box<dyn std::error::Error>> {
    let pool: Vec<&Value> = all_cards.iter().filter(|c| is_in_v5_pool(c)).collect();

    let mut stats = IngestStats::default();
    for card in &pool {
        let kind = if is_crypt(card) { "crypt" } else { "library" };
        let id = card.get("id").and_then(Value::as_i64).unwrap_or_default();
        let crypt_metadata = vekn.crypt.get(&id);
        let library_metadata = vekn.library.get(&id);
        insert_card(conn, card, kind, crypt_metadata, library_metadata)?;
        insert_disciplines(conn, card)?;
        insert_capacity_requirement(conn, card, kind)?;
        insert_requirements(conn, card, kind, &vekn.library_requirements)?;
        insert_traits(
            conn,
            card,
            kind,
            crypt_metadata,
            library_metadata,
            &vekn.library_requirements,
        )?;
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

fn insert_card(
    conn: &Connection,
    card: &Value,
    kind: &str,
    crypt_metadata: Option<&CryptMetadata>,
    library_metadata: Option<&LibraryMetadata>,
) -> rusqlite::Result<()> {
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
         (id, kind, name, name_ascii, aka, card_text, clan, sect, path, capacity, grp, title,
          votes, adv, banned, types, blood_cost, pool_cost, burn_option,
          requirement_clan, requirement_title, requirement_sect,
          image_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?20, ?9, ?10, ?11,
                 ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                 NULL, NULL, NULL, ?19)",
        params![
            id,
            kind,
            name,
            ascii_fold(name),
            str_field(card, "name"),
            str_field(card, "card_text"),
            card.get("clans").map(join_str_array),
            crypt_metadata.and_then(|metadata| metadata.sect.as_deref()),
            card.get("capacity").and_then(|v| v.as_i64()),
            card.get("group")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<i64>().ok()),
            crypt_metadata
                .and_then(|metadata| metadata.title.as_deref())
                .or_else(|| str_field(card, "title")),
            crypt_metadata.map(|metadata| metadata.votes),
            crypt_metadata.map(|metadata| i64::from(metadata.advanced)),
            crypt_metadata
                .and_then(|metadata| metadata.banned.as_deref())
                .or_else(|| library_metadata.and_then(|metadata| metadata.banned.as_deref())),
            types_json,
            str_field(card, "blood_cost"),
            str_field(card, "pool_cost"),
            library_metadata.map(|metadata| i64::from(metadata.burn_option)),
            str_field(card, "url"),
            str_field(card, "path"),
        ],
    )?;
    Ok(())
}

fn insert_traits(
    conn: &Connection,
    card: &Value,
    kind: &str,
    crypt_metadata: Option<&CryptMetadata>,
    library_metadata: Option<&LibraryMetadata>,
    requirements: &LibraryRequirements,
) -> rusqlite::Result<()> {
    let id = card.get("id").and_then(Value::as_i64).unwrap_or_default();
    let name = str_field(card, "printed_name")
        .or_else(|| str_field(card, "name"))
        .unwrap_or_default();
    let text = str_field(card, "card_text").unwrap_or_default();
    let traits = if kind == "crypt" {
        classify_crypt_traits(
            name,
            text,
            crypt_metadata.is_some_and(|metadata| metadata.advanced),
            crypt_metadata.is_some_and(|metadata| metadata.banned.is_some()),
        )
    } else {
        let type_count = card
            .get("types")
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        let discipline_count = card
            .get("disciplines")
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        // Preserve VDB's exact No Requirement special case: its historical
        // predicate checks Clan but not the separate Path field.
        let has_clan = card
            .get("clans")
            .and_then(Value::as_array)
            .is_some_and(|values| !values.is_empty());
        let has_requirements = requirements.contains_key(&id)
            || discipline_count > 0
            || has_clan
            || text.to_ascii_lowercase().contains("requires a");
        classify_library_traits(
            text,
            LibraryTraitFacts {
                type_count,
                discipline_count,
                burn_option: library_metadata.is_some_and(|metadata| metadata.burn_option),
                banned: library_metadata.is_some_and(|metadata| metadata.banned.is_some()),
                has_requirements,
            },
        )
    };
    for trait_name in traits {
        conn.execute(
            "INSERT INTO card_traits (card_id, trait) VALUES (?1, ?2)",
            params![id, trait_name],
        )?;
    }
    Ok(())
}

fn insert_capacity_requirement(
    conn: &Connection,
    card: &Value,
    kind: &str,
) -> rusqlite::Result<()> {
    if kind != "library" {
        return Ok(());
    }
    let requirement = parse_capacity_requirement(str_field(card, "card_text").unwrap_or_default());
    if requirement.min.is_none() && requirement.max.is_none() {
        return Ok(());
    }
    let id = card
        .get("id")
        .and_then(|value| value.as_i64())
        .unwrap_or_default();
    conn.execute(
        "INSERT INTO card_capacity_requirements (card_id, min_capacity, max_capacity)
         VALUES (?1, ?2, ?3)",
        params![id, requirement.min, requirement.max],
    )?;
    Ok(())
}

fn insert_requirements(
    conn: &Connection,
    card: &Value,
    kind: &str,
    requirements: &LibraryRequirements,
) -> rusqlite::Result<()> {
    if kind != "library" {
        return Ok(());
    }
    let id = card.get("id").and_then(Value::as_i64).unwrap_or_default();
    let Some(raw) = requirements.get(&id) else {
        return Ok(());
    };
    for token in normalize_library_requirements(raw) {
        conn.execute(
            "INSERT INTO card_requirements (card_id, requirement, kind) VALUES (?1, ?2, ?3)",
            params![id, token.value, token.kind],
        )?;
    }
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
    let card_name = str_field(card, "_name")
        .or_else(|| str_field(card, "printed_name"))
        .or_else(|| str_field(card, "name"))
        .unwrap_or_default();
    let Some(sets) = card.get("sets").and_then(|v| v.as_object()) else {
        return Ok(());
    };
    for (set_name, printings) in sets {
        // A card can be V5-legal via one printing while also carrying
        // classic-era printings from its original (pre-V5) release — this
        // site is V5-only (v5pool.rs), so those don't belong in `printings`/
        // `sets` at all, or a card detail page / precon browser would leak
        // non-V5 product names (e.g. "Anarchs", "Sabbat War").
        if !V5_SET_NAMES.contains(&set_name.as_str()) {
            continue;
        }
        let set_id = upsert_set(conn, set_name, printings.as_array().and_then(|a| a.first()))?;
        let Some(printings) = printings.as_array() else {
            continue;
        };
        for (i, p) in printings.iter().enumerate() {
            let precon = precon_name(
                set_name,
                card_name,
                p.get("precon").and_then(|v| v.as_str()),
            );
            let rarity = p.get("rarity").and_then(|v| v.as_str());
            // KRCG records how many physical copies of this card one copy of
            // the precon itself contains (some V5 precon crypts do ship a
            // vampire twice) — only meaningful when `precon` is set; defaults
            // to 1 for the (rare) precon entries that omit it.
            let precon_copies =
                precon.map(|_| p.get("copies").and_then(|v| v.as_i64()).unwrap_or(1));
            conn.execute(
                "INSERT INTO printings (card_id, set_id, precon, rarity, first_print, precon_copies) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, set_id, precon, rarity, (i == 0) as i64, precon_copies],
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

    #[test]
    fn official_crypt_metadata_populates_filter_columns() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cards(
               id INT, kind TEXT, name TEXT, name_ascii TEXT, aka TEXT, card_text TEXT,
               clan TEXT, sect TEXT, path TEXT, capacity INT, grp INT, title TEXT, votes INT,
               adv INT, banned TEXT, types TEXT, blood_cost TEXT, pool_cost TEXT,
               burn_option INT, requirement_clan TEXT, requirement_title TEXT,
               requirement_sect TEXT, image_url TEXT);",
        )
        .unwrap();
        let card = json!({
            "id": 201733,
            "name": "Aaradhya, The Callous Tyrant",
            "card_text": "Sabbat cardinal: text",
            "clans": ["Ventrue"],
            "capacity": 10,
            "group": "6",
            "path": "Power and the Inner Voice",
            "types": ["Vampire"]
        });
        let metadata = CryptMetadata {
            sect: Some("Sabbat".into()),
            title: Some("Cardinal".into()),
            votes: 3,
            advanced: true,
            banned: Some("Banned".into()),
        };
        insert_card(&conn, &card, "crypt", Some(&metadata), None).unwrap();

        let stored: (String, String, String, i64, i64, String) = conn
            .query_row(
                "SELECT sect, path, title, votes, adv, banned FROM cards WHERE id=201733",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            stored,
            (
                "Sabbat".into(),
                "Power and the Inner Voice".into(),
                "Cardinal".into(),
                3,
                1,
                "Banned".into()
            )
        );
    }

    #[test]
    fn vdb_traits_and_official_library_flags_are_inserted() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cards(
               id INT, kind TEXT, name TEXT, name_ascii TEXT, aka TEXT, card_text TEXT,
               clan TEXT, sect TEXT, path TEXT, capacity INT, grp INT, title TEXT, votes INT,
               adv INT, banned TEXT, types TEXT, blood_cost TEXT, pool_cost TEXT,
               burn_option INT, requirement_clan TEXT, requirement_title TEXT,
               requirement_sect TEXT, image_url TEXT);
             CREATE TABLE card_traits(card_id INT, trait TEXT);",
        )
        .unwrap();
        let card = json!({
            "id": 101780,
            "name": "Sight Beyond Sight",
            "card_text": "+1 intercept. This card can be used to prevent damage.",
            "types": ["Reaction"],
            "disciplines": ["aus"]
        });
        let metadata = LibraryMetadata {
            burn_option: true,
            banned: None,
        };
        insert_card(&conn, &card, "library", None, Some(&metadata)).unwrap();
        insert_traits(
            &conn,
            &card,
            "library",
            None,
            Some(&metadata),
            &LibraryRequirements::new(),
        )
        .unwrap();

        let burn_option: i64 = conn
            .query_row("SELECT burn_option FROM cards WHERE id=101780", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(burn_option, 1);
        let traits = conn
            .prepare("SELECT trait FROM card_traits WHERE card_id=101780 ORDER BY trait")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(traits.contains(&"burn".into()));
        assert!(traits.contains(&"intercept".into()));
        assert!(traits.contains(&"prevent".into()));
        assert!(!traits.contains(&"no-requirements".into()));
    }

    #[test]
    fn capacity_requirements_are_derived_only_for_library_cards() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE card_capacity_requirements(
               card_id INT PRIMARY KEY, min_capacity INT, max_capacity INT);",
        )
        .unwrap();
        let card = json!({
            "id": 42,
            "card_text": "Requires an Anarch vampire with capacity 5 or more."
        });
        insert_capacity_requirement(&conn, &card, "library").unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT min_capacity, max_capacity FROM card_capacity_requirements WHERE card_id=42",
                [],
                |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?)),
            )
            .unwrap(),
            (Some(5), None)
        );

        let crypt = json!({
            "id": 43,
            "card_text": "Requires a vampire with capacity 7 or more."
        });
        insert_capacity_requirement(&conn, &crypt, "crypt").unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM card_capacity_requirements",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn official_requirements_are_normalized_only_for_library_cards() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE card_requirements(
               card_id INT, requirement TEXT, kind TEXT,
               PRIMARY KEY(card_id, requirement));",
        )
        .unwrap();
        let requirements = LibraryRequirements::from([(42, "prince,justicar".to_owned())]);
        let card = json!({ "id": 42 });
        insert_requirements(&conn, &card, "library", &requirements).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT requirement, kind FROM card_requirements
                 WHERE card_id=42 ORDER BY requirement",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                ("camarilla".into(), "sect".into()),
                ("justicar".into(), "title".into()),
                ("prince".into(), "title".into()),
                ("titled_specific".into(), "other".into()),
            ]
        );

        insert_requirements(&conn, &card, "crypt", &requirements).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM card_requirements", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 4);
    }

    #[test]
    fn insert_printings_skips_non_v5_sets() {
        // A card can be V5-legal via one printing while also carrying a
        // classic-era printing (e.g. a vampire reprinted in Fifth Edition
        // that was originally released in the pre-V5 "Anarchs" set). Only
        // the V5-legal printing should land in the sets/printings tables —
        // this site is V5-only (v5pool.rs::V5_SET_NAMES).
        let card = json!({
            "id": 1,
            "sets": {
                "Fifth Edition": [{"release_date": "2020-11-30", "precon": "Ventrue"}],
                "Anarchs": [{"release_date": "1998-01-01", "precon": "Gangrel"}],
            },
        });
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sets(id INTEGER PRIMARY KEY, abbrev TEXT, name TEXT, release_date TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT, precon_copies INT);",
        )
        .unwrap();
        insert_printings(&conn, &card).unwrap();

        let set_names: Vec<String> = conn
            .prepare("SELECT name FROM sets")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(set_names, vec!["Fifth Edition".to_string()]);

        let printing_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM printings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(printing_count, 1);
    }

    #[test]
    fn insert_printings_reads_precon_copies_from_the_source_and_defaults_to_one() {
        let card = json!({
            "id": 1,
            "sets": {
                "Fifth Edition": [{"release_date": "2020-11-30", "precon": "Salubri", "copies": 2}],
                "New Blood": [{"release_date": "2022-04-17", "precon": "Ventrue"}],
                "Sabbat V5": [{"release_date": "2025-10-26"}],
            },
        });
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sets(id INTEGER PRIMARY KEY, abbrev TEXT, name TEXT, release_date TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT, precon_copies INT);",
        )
        .unwrap();
        insert_printings(&conn, &card).unwrap();

        let mut rows: Vec<(String, Option<i64>)> = conn
            .prepare(
                "SELECT precon, precon_copies FROM printings p JOIN sets s ON s.id = p.set_id ORDER BY s.name",
            )
            .unwrap()
            .query_map([], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        rows.sort();
        assert_eq!(
            rows,
            vec![
                ("".to_string(), None), // not a precon printing at all -> NULL, not 1
                ("Salubri".to_string(), Some(2)), // explicit "copies": 2
                ("Ventrue".to_string(), Some(1)), // precon set, "copies" omitted -> defaults to 1
            ]
        );
    }

    #[test]
    fn anniversary_printings_separate_decks_from_bonus_cards() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sets(id INTEGER PRIMARY KEY, abbrev TEXT, name TEXT, release_date TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT, precon_copies INT);",
        )
        .unwrap();
        for card in [
            json!({"id": 1, "_name": "François Villon", "sets": {
                "Thirtieth Anniversary": [{"copies": 3}]
            }}),
            json!({"id": 2, "_name": "Annabelle Triabell", "sets": {
                "Thirtieth Anniversary": [{"copies": 2}]
            }}),
            json!({"id": 3, "_name": "Stanislava", "sets": {
                "Twenty-Fifth Anniversary": [{"copies": 4}]
            }}),
            json!({"id": 4, "_name": "Signet of King Saul, The", "sets": {
                "Twenty-Fifth Anniversary": [{"copies": 1}]
            }}),
        ] {
            insert_printings(&conn, &card).unwrap();
        }

        let rows: Vec<(i64, Option<String>, Option<i64>)> = conn
            .prepare(
                "SELECT card_id, precon, precon_copies
                 FROM printings ORDER BY card_id",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                (1, Some("The Endless Dance".into()), Some(3)),
                (2, None, None),
                (3, Some("Reign of Stanislava".into()), Some(4)),
                (4, None, None),
            ]
        );
    }
}
