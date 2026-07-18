//! Read-only access to `cards.sqlite`, shared by the MCP and REST surfaces
//! (AGENTS.md hard rule #2: both adapters call the same service code).
//!
//! Query shape mirrors frontend/src/lib/cryptSearch.ts — same filters, same
//! result shape — so client and server agree on what "crypt search" means.
//! Phase 1 MVP: text/name search, clan, group. See docs/feature-parity.md.

use rusqlite::Connection;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct CryptSearchParams {
    /// Substring match against card name or card text (case-sensitive as stored).
    #[serde(default)]
    pub text: String,
    /// Exact-ish clan filter (substring match, e.g. "Ventrue").
    #[serde(default)]
    pub clan: Option<String>,
    /// Crypt group (V5 pool is limited to groups 5-7).
    #[serde(default)]
    pub group: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Discipline {
    pub code: String,
    pub superior: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CryptCard {
    pub id: i64,
    pub name: String,
    pub clan: String,
    pub capacity: i64,
    pub group: i64,
    pub title: Option<String>,
    pub disciplines: Vec<Discipline>,
}

pub fn open(data_dir: &str) -> rusqlite::Result<Connection> {
    Connection::open(format!("{data_dir}/cards.sqlite"))
}

pub fn search_crypt(
    conn: &Connection,
    params: &CryptSearchParams,
) -> rusqlite::Result<Vec<CryptCard>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.clan, c.capacity, c.grp, c.title,
                GROUP_CONCAT(cd.discipline || ':' || cd.superior) AS disc
         FROM cards c
         LEFT JOIN card_disciplines cd ON cd.card_id = c.id
         WHERE c.kind = 'crypt'
           AND (?1 = '' OR c.name_ascii LIKE '%' || ?1 || '%' OR c.card_text LIKE '%' || ?1 || '%')
           AND (?2 IS NULL OR c.clan LIKE '%' || ?2 || '%')
           AND (?3 IS NULL OR c.grp = ?3)
         GROUP BY c.id
         ORDER BY c.capacity DESC, c.name ASC
         LIMIT 200",
    )?;

    let rows = stmt.query_map(
        rusqlite::params![params.text.trim(), params.clan, params.group],
        |row| {
            let disc: Option<String> = row.get(6)?;
            Ok(CryptCard {
                id: row.get(0)?,
                name: row.get(1)?,
                clan: row.get(2)?,
                capacity: row.get(3)?,
                group: row.get(4)?,
                title: row.get(5)?,
                disciplines: parse_disciplines(disc),
            })
        },
    )?;

    rows.collect()
}

fn parse_disciplines(disc: Option<String>) -> Vec<Discipline> {
    let Some(disc) = disc else { return Vec::new() };
    let mut list: Vec<Discipline> = disc
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|entry| {
            let (code, superior) = entry.split_once(':')?;
            Some(Discipline {
                code: code.to_string(),
                superior: superior == "1",
            })
        })
        .collect();
    list.sort_by_key(|d| !d.superior);
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE cards(id INT, kind TEXT, name TEXT, name_ascii TEXT, card_text TEXT,
               clan TEXT, capacity INT, grp INT, title TEXT);
             CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
             INSERT INTO cards VALUES
               (1,'crypt','Aaradhya','aaradhya','tyrant text','Ventrue',10,6,'Cardinal'),
               (2,'crypt','Abaddon','abaddon','',  'Salubri',8,7,NULL),
               (3,'library','Villein','villein','','',NULL,NULL,NULL);
             INSERT INTO card_disciplines VALUES (1,'dom',1),(1,'for',0),(2,'aus',1);",
        )
        .unwrap();
    }

    #[test]
    fn filters_to_crypt_only_and_sorts_by_capacity() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_crypt(&conn, &CryptSearchParams::default()).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Aaradhya", "Abaddon"]
        );
    }

    #[test]
    fn text_search_matches_name_or_card_text() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            text: "tyrant".into(),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
    }

    #[test]
    fn clan_filter_narrows_results() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            clan: Some("Salubri".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Abaddon");
    }

    #[test]
    fn disciplines_are_sorted_superior_first() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_crypt(&conn, &CryptSearchParams::default()).unwrap();
        let aaradhya = results.iter().find(|c| c.name == "Aaradhya").unwrap();
        assert_eq!(aaradhya.disciplines[0].code, "dom");
        assert!(aaradhya.disciplines[0].superior);
        assert_eq!(aaradhya.disciplines[1].code, "for");
        assert!(!aaradhya.disciplines[1].superior);
    }
}
