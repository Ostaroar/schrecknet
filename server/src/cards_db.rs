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
    /// Where `text` must match: card name, card text, or either (default).
    #[serde(default)]
    pub text_mode: TextMode,
    /// Exact-ish clan filter (substring match, e.g. "Ventrue").
    #[serde(default)]
    pub clan: Option<String>,
    /// Exact title match (e.g. "Prince"); options come from the V5 pool.
    #[serde(default)]
    pub title: Option<String>,
    /// Crypt group (V5 pool is limited to groups 5-7).
    #[serde(default)]
    pub group: Option<i64>,
    /// Minimum capacity (inclusive).
    #[serde(default)]
    pub capacity_min: Option<i64>,
    /// Maximum capacity (inclusive).
    #[serde(default)]
    pub capacity_max: Option<i64>,
    /// Lowercase discipline codes (e.g. ["dom","for"]); a card must have ALL
    /// of them, at either level. REST accepts a comma-separated string.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub disciplines: Vec<String>,
    /// If true, every discipline in `disciplines` must be at superior level.
    #[serde(default)]
    pub disciplines_superior: bool,
    /// Exact set name match (e.g. "Fifth Edition"); a card matches if any of
    /// its printings belong to this set.
    #[serde(default)]
    pub set: Option<String>,
    /// Substring match against printing `precon` (e.g. "Anarch"); printings
    /// with no precon (NULL) never match.
    #[serde(default)]
    pub precon: Option<String>,
    /// Substring match against artist name; a card matches if any credited
    /// artist matches.
    #[serde(default)]
    pub artist: Option<String>,
}

/// Scope of the `text` filter on crypt search.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TextMode {
    /// Match card name or card text (default).
    #[default]
    Any,
    /// Match card name only.
    Name,
    /// Match card text only.
    Text,
}

/// Numeric comparison used by library blood/pool cost filters.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CostMode {
    /// Cost must be less than or equal to the supplied value (default).
    #[default]
    AtMost,
    /// Cost must equal the supplied value.
    Exact,
    /// Cost must be greater than or equal to the supplied value.
    AtLeast,
}

impl CostMode {
    fn as_sql_value(self) -> &'static str {
        match self {
            Self::AtMost => "at_most",
            Self::Exact => "exact",
            Self::AtLeast => "at_least",
        }
    }
}

/// Accepts either a JSON array (MCP) or a comma-separated string (REST query
/// strings can't express arrays with axum's default Query extractor).
fn deserialize_disciplines<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ListOrCsv {
        List(Vec<String>),
        Csv(String),
    }
    Ok(match ListOrCsv::deserialize(deserializer)? {
        ListOrCsv::List(list) => list,
        ListOrCsv::Csv(csv) => csv
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect(),
    })
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

#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct LibrarySearchParams {
    /// Substring match against card name or card text.
    #[serde(default)]
    pub text: String,
    /// Where `text` must match: card name, card text, or either (default).
    #[serde(default)]
    pub text_mode: TextMode,
    /// Exact card type, e.g. "Master", "Action", "Combat" (matches cards with
    /// this type among possibly several — see `types` on the result).
    #[serde(default)]
    pub card_type: Option<String>,
    /// Clan/path requirement (substring match, e.g. "Tremere"). Most library
    /// cards have no clan requirement.
    #[serde(default)]
    pub clan: Option<String>,
    /// Lowercase discipline codes (e.g. ["dom","for"]); a card must require ALL
    /// of them, at either level. REST accepts a comma-separated string.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub disciplines: Vec<String>,
    /// If true, every discipline in `disciplines` must be at superior level.
    #[serde(default)]
    pub disciplines_superior: bool,
    /// Maximum blood cost (inclusive); backwards-compatible alias for
    /// `blood_cost` with `blood_cost_mode=at_most`.
    #[serde(default)]
    pub blood_cost_max: Option<i64>,
    /// Maximum pool cost (inclusive); backwards-compatible alias for
    /// `pool_cost` with `pool_cost_mode=at_most`.
    #[serde(default)]
    pub pool_cost_max: Option<i64>,
    /// Blood cost value to compare; cards with no numeric cost never match.
    #[serde(default)]
    pub blood_cost: Option<i64>,
    /// Comparison applied to `blood_cost` (at_most, exact, or at_least).
    #[serde(default)]
    pub blood_cost_mode: CostMode,
    /// Pool cost value to compare; cards with no numeric cost never match.
    #[serde(default)]
    pub pool_cost: Option<i64>,
    /// Comparison applied to `pool_cost` (at_most, exact, or at_least).
    #[serde(default)]
    pub pool_cost_mode: CostMode,
    /// Exact set name match (e.g. "Fifth Edition"); a card matches if any of
    /// its printings belong to this set.
    #[serde(default)]
    pub set: Option<String>,
    /// Substring match against printing `precon` (e.g. "Anarch"); printings
    /// with no precon (NULL) never match.
    #[serde(default)]
    pub precon: Option<String>,
    /// Substring match against artist name; a card matches if any credited
    /// artist matches.
    #[serde(default)]
    pub artist: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryCard {
    pub id: i64,
    pub name: String,
    pub types: Vec<String>,
    pub clan: Option<String>,
    pub blood_cost: Option<String>,
    pub pool_cost: Option<String>,
    pub disciplines: Vec<String>,
}

pub fn open(data_dir: &str) -> rusqlite::Result<Connection> {
    Connection::open(format!("{data_dir}/cards.sqlite"))
}

pub fn search_crypt(
    conn: &Connection,
    params: &CryptSearchParams,
) -> rusqlite::Result<Vec<CryptCard>> {
    // The per-discipline EXISTS clauses are built dynamically (the count
    // varies) but every value is bound — no string interpolation of input.
    // set + precon are ANDed inside ONE EXISTS on the same printing row, not
    // two separate EXISTS clauses — a card can have printing A in set X with
    // no precon and printing B in set Y with a precon, and two independent
    // clauses would wrongly match set=X + precon=<B's precon> even though no
    // single printing has both (found live via the precon browser, which
    // was the first caller to combine the two).
    let mut sql = String::from(
        "SELECT c.id, c.name, c.clan, c.capacity, c.grp, c.title,
                GROUP_CONCAT(cd.discipline || ':' || cd.superior) AS disc
         FROM cards c
         LEFT JOIN card_disciplines cd ON cd.card_id = c.id
         WHERE c.kind = 'crypt'
           AND (?1 = ''
                OR (?2 AND c.name_ascii LIKE '%' || ?1 || '%')
                OR (?3 AND c.card_text LIKE '%' || ?1 || '%'))
           AND (?4 IS NULL OR c.clan LIKE '%' || ?4 || '%')
           AND (?5 IS NULL OR c.grp = ?5)
           AND (?6 IS NULL OR c.capacity >= ?6)
           AND (?7 IS NULL OR c.capacity <= ?7)
           AND (?8 IS NULL OR c.title = ?8)
           AND ((?9 IS NULL AND ?10 IS NULL) OR EXISTS (
                SELECT 1 FROM printings p LEFT JOIN sets s ON s.id = p.set_id
                WHERE p.card_id = c.id
                  AND (?9 IS NULL OR s.name = ?9)
                  AND (?10 IS NULL OR p.precon LIKE '%' || ?10 || '%')))
           AND (?11 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
                WHERE ca.card_id = c.id AND a.name LIKE '%' || ?11 || '%'))",
    );
    let mut bound: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(params.text.trim().to_owned()),
        Box::new(params.text_mode != TextMode::Text),
        Box::new(params.text_mode != TextMode::Name),
        Box::new(params.clan.clone()),
        Box::new(params.group),
        Box::new(params.capacity_min),
        Box::new(params.capacity_max),
        Box::new(params.title.clone()),
        Box::new(params.set.clone()),
        Box::new(params.precon.clone()),
        Box::new(params.artist.clone()),
    ];
    for code in &params.disciplines {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM card_disciplines cdx
                WHERE cdx.card_id = c.id AND cdx.discipline = ?{n} AND cdx.superior >= ?{m})",
            n = bound.len() + 1,
            m = bound.len() + 2,
        ));
        bound.push(Box::new(code.to_lowercase()));
        bound.push(Box::new(params.disciplines_superior as i64));
    }
    sql.push_str(
        " GROUP BY c.id
          ORDER BY c.capacity DESC, c.name ASC
          LIMIT 200",
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(bound.iter().map(|b| b.as_ref())),
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

pub fn search_library(
    conn: &Connection,
    params: &LibrarySearchParams,
) -> rusqlite::Result<Vec<LibraryCard>> {
    let type_pattern = params.card_type.as_ref().map(|t| format!("%\"{t}\"%"));
    let blood_cost = params.blood_cost.or(params.blood_cost_max);
    let blood_cost_mode = if params.blood_cost.is_some() {
        params.blood_cost_mode
    } else {
        CostMode::AtMost
    };
    let pool_cost = params.pool_cost.or(params.pool_cost_max);
    let pool_cost_mode = if params.pool_cost.is_some() {
        params.pool_cost_mode
    } else {
        CostMode::AtMost
    };
    // Costs are stored as TEXT (e.g. "2"); CAST for numeric comparison. A
    // NULL cost never matches a cost filter, and neither does the variable
    // cost "X" (CAST('X') is 0, which would otherwise match every max —
    // vdb.im treats X as a distinct value, not zero; e.g. Hidden Strength,
    // Monkey Wrench). Per-discipline EXISTS clauses are built dynamically
    // like search_crypt — every value is bound, never interpolated.
    let mut sql = String::from(
        "SELECT c.id, c.name, c.types, c.clan, c.blood_cost, c.pool_cost,
                GROUP_CONCAT(cd.discipline) AS disc
         FROM cards c
         LEFT JOIN card_disciplines cd ON cd.card_id = c.id
         WHERE c.kind = 'library'
           AND (?1 = ''
                OR (?2 AND c.name_ascii LIKE '%' || ?1 || '%')
                OR (?3 AND c.card_text LIKE '%' || ?1 || '%'))
           AND (?4 IS NULL OR c.types LIKE ?4)
           AND (?5 IS NULL OR c.clan LIKE '%' || ?5 || '%')
           AND (?6 IS NULL OR (c.blood_cost IS NOT NULL AND c.blood_cost != 'X' AND
                ((?7 = 'at_most' AND CAST(c.blood_cost AS INTEGER) <= ?6) OR
                 (?7 = 'exact' AND CAST(c.blood_cost AS INTEGER) = ?6) OR
                 (?7 = 'at_least' AND CAST(c.blood_cost AS INTEGER) >= ?6))))
           AND (?8 IS NULL OR (c.pool_cost IS NOT NULL AND c.pool_cost != 'X' AND
                ((?9 = 'at_most' AND CAST(c.pool_cost AS INTEGER) <= ?8) OR
                 (?9 = 'exact' AND CAST(c.pool_cost AS INTEGER) = ?8) OR
                 (?9 = 'at_least' AND CAST(c.pool_cost AS INTEGER) >= ?8))))
           AND ((?10 IS NULL AND ?11 IS NULL) OR EXISTS (
                SELECT 1 FROM printings p LEFT JOIN sets s ON s.id = p.set_id
                WHERE p.card_id = c.id
                  AND (?10 IS NULL OR s.name = ?10)
                  AND (?11 IS NULL OR p.precon LIKE '%' || ?11 || '%')))
           AND (?12 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
                WHERE ca.card_id = c.id AND a.name LIKE '%' || ?12 || '%'))",
    );
    let mut bound: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(params.text.trim().to_owned()),
        Box::new(params.text_mode != TextMode::Text),
        Box::new(params.text_mode != TextMode::Name),
        Box::new(type_pattern),
        Box::new(params.clan.clone()),
        Box::new(blood_cost),
        Box::new(blood_cost_mode.as_sql_value()),
        Box::new(pool_cost),
        Box::new(pool_cost_mode.as_sql_value()),
        Box::new(params.set.clone()),
        Box::new(params.precon.clone()),
        Box::new(params.artist.clone()),
    ];
    for code in &params.disciplines {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM card_disciplines cdx
                WHERE cdx.card_id = c.id AND cdx.discipline = ?{n} AND cdx.superior >= ?{m})",
            n = bound.len() + 1,
            m = bound.len() + 2,
        ));
        bound.push(Box::new(code.to_lowercase()));
        bound.push(Box::new(params.disciplines_superior as i64));
    }
    sql.push_str(
        " GROUP BY c.id
          ORDER BY c.name ASC
          LIMIT 200",
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(bound.iter().map(|b| b.as_ref())),
        |row| {
            let types_json: String = row.get(2)?;
            let disc: Option<String> = row.get(6)?;
            let clan: Option<String> = row.get(3)?;
            Ok(LibraryCard {
                id: row.get(0)?,
                name: row.get(1)?,
                types: serde_json::from_str(&types_json).unwrap_or_default(),
                clan: clan.filter(|c| !c.is_empty()),
                blood_cost: row.get(4)?,
                pool_cost: row.get(5)?,
                disciplines: disc
                    .map(|d| d.split(',').map(str::to_string).collect())
                    .unwrap_or_default(),
            })
        },
    )?;

    rows.collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PreconSummary {
    pub set: String,
    pub precon: String,
    pub card_count: i64,
}

/// Lists every (set, precon) pair with at least one printing, plus the
/// number of distinct cards known to belong to it. Card *quantities* per
/// precon deck are not tracked — KRCG's export records which printings
/// existed, not each deck's exact copy counts (see docs/feature-parity.md's
/// precon-browser note, same NULL-honesty policy as sect/votes/banned).
/// To browse a precon's actual cards, call search_crypt/search_library with
/// this pair's `set` + `precon` (both exact for this purpose — the two
/// filters together are precise enough that reusing the search path avoids
/// a second copy of the same query logic).
pub fn list_precons(conn: &Connection) -> rusqlite::Result<Vec<PreconSummary>> {
    let mut stmt = conn.prepare(
        "SELECT s.name, p.precon, COUNT(DISTINCT p.card_id) AS card_count
         FROM printings p JOIN sets s ON s.id = p.set_id
         WHERE p.precon IS NOT NULL
         GROUP BY s.name, p.precon
         ORDER BY s.name, p.precon",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PreconSummary {
            set: row.get(0)?,
            precon: row.get(1)?,
            card_count: row.get(2)?,
        })
    })?;
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
               clan TEXT, capacity INT, grp INT, title TEXT,
               types TEXT, blood_cost TEXT, pool_cost TEXT);
             CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
             CREATE TABLE sets(id INT, name TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT);
             CREATE TABLE artists(id INT, name TEXT);
             CREATE TABLE card_artists(card_id INT, artist_id INT);
             INSERT INTO cards VALUES
               (1,'crypt','Aaradhya','aaradhya','tyrant text','Ventrue',10,6,'Cardinal',NULL,NULL,NULL),
               (2,'crypt','Abaddon','abaddon','',  'Salubri',8,7,NULL,NULL,NULL,NULL),
               (3,'library','Villein','villein','blood bound text','',NULL,NULL,NULL,'[\"Master\"]',NULL,'2'),
               (4,'library','Absolute Tyranny','absolute tyranny','vote text','',NULL,NULL,NULL,'[\"Action Modifier\",\"Reaction\"]','1',NULL),
               (5,'library','Arcane Library','arcane library','','Tremere',NULL,NULL,NULL,'[\"Master\"]',NULL,'2');
             INSERT INTO card_disciplines VALUES (1,'dom',1),(1,'for',0),(2,'aus',1),(4,'pot',0),(4,'pre',0);
             INSERT INTO sets VALUES (1,'Fifth Edition'),(2,'Anarch Revolt');
             INSERT INTO printings VALUES
               (1,1,NULL,'C',1),
               (2,2,'Anarch Precon','U',1),
               (3,1,NULL,'C',1);
             INSERT INTO artists VALUES (1,'Vagelis Adam'),(2,'Mike Chaney');
             INSERT INTO card_artists VALUES (1,1),(3,2);",
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

    #[test]
    fn capacity_range_filter() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            capacity_min: Some(9),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya"); // cap 10; Abaddon (8) excluded
        let params = CryptSearchParams {
            capacity_max: Some(8),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Abaddon");
    }

    #[test]
    fn discipline_filter_requires_all_listed() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya has dom(sup)+for(inf); Abaddon has aus(sup) only.
        let params = CryptSearchParams {
            disciplines: vec!["dom".into(), "for".into()],
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
    }

    #[test]
    fn superior_flag_excludes_inferior_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya's `for` is inferior — requiring superior must exclude her.
        let params = CryptSearchParams {
            disciplines: vec!["for".into()],
            disciplines_superior: true,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
        // …but plain `for` (any level) matches.
        let params = CryptSearchParams {
            disciplines: vec!["for".into()],
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 1);
    }

    #[test]
    fn discipline_csv_deserializes_from_query_string() {
        let params: CryptSearchParams =
            serde_urlencoded::from_str("disciplines=DOM,%20for").unwrap();
        assert_eq!(params.disciplines, vec!["dom", "for"]);
        let params: CryptSearchParams = serde_json::from_str(r#"{"disciplines":["dom"]}"#).unwrap();
        assert_eq!(params.disciplines, vec!["dom"]);
    }

    #[test]
    fn title_filter_matches_exactly() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            title: Some("Cardinal".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
        // Exact match, not substring — "Card" must not match "Cardinal".
        let params = CryptSearchParams {
            title: Some("Card".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn text_mode_name_matches_name_only() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // "tyrant" is in Aaradhya's card_text, not her name.
        let params = CryptSearchParams {
            text: "tyrant".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
        let params = CryptSearchParams {
            text: "aaradhya".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 1);
    }

    #[test]
    fn text_mode_text_matches_card_text_only() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            text: "aaradhya".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
        let params = CryptSearchParams {
            text: "tyrant".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 1);
    }

    #[test]
    fn text_mode_deserializes_lowercase_and_defaults_to_any() {
        let params: CryptSearchParams = serde_urlencoded::from_str("text_mode=name").unwrap();
        assert_eq!(params.text_mode, TextMode::Name);
        let params: CryptSearchParams = serde_json::from_str(r#"{"text_mode":"text"}"#).unwrap();
        assert_eq!(params.text_mode, TextMode::Text);
        let params: CryptSearchParams = serde_json::from_str("{}").unwrap();
        assert_eq!(params.text_mode, TextMode::Any);
    }

    #[test]
    fn crypt_set_filter_matches_exact_set_name() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya (card 1) has a printing in Fifth Edition; Abaddon has none.
        let params = CryptSearchParams {
            set: Some("Fifth Edition".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
        // A set no crypt card was printed in matches nothing.
        let params = CryptSearchParams {
            set: Some("Unknown Set".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn crypt_precon_filter_substring_matches_and_skips_null() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Only Abaddon (card 2) has a precon printing; Aaradhya's is NULL.
        let params = CryptSearchParams {
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Abaddon");
    }

    #[test]
    fn crypt_set_and_precon_together_require_the_same_printing() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Card 6 has TWO printings: one in "Fifth Edition" with no precon,
        // and one in "Anarch Revolt" with precon "Anarch Precon" — neither
        // single printing satisfies both filters at once, so combining
        // set="Fifth Edition" + precon="Anarch" must match nothing, even
        // though each filter alone would match this card via its other
        // printing (the bug: two independent EXISTS clauses would wrongly
        // match here).
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (6,'crypt','Mixed Printings','mixed printings','','Ventrue',5,6,NULL,NULL,NULL,NULL);
             INSERT INTO printings VALUES (6,1,NULL,'C',1), (6,2,'Anarch Precon','U',0);",
        )
        .unwrap();

        let params = CryptSearchParams {
            set: Some("Fifth Edition".into()),
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());

        // Sanity: each filter alone still matches this card via its own printing.
        let set_only = CryptSearchParams {
            set: Some("Fifth Edition".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &set_only)
            .unwrap()
            .iter()
            .any(|c| c.name == "Mixed Printings"));
        let precon_only = CryptSearchParams {
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &precon_only)
            .unwrap()
            .iter()
            .any(|c| c.name == "Mixed Printings"));

        // A precon that DOES share a printing with the matching set works.
        let matching_pair = CryptSearchParams {
            set: Some("Anarch Revolt".into()),
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &matching_pair)
            .unwrap()
            .iter()
            .any(|c| c.name == "Mixed Printings"));
    }

    #[test]
    fn crypt_artist_filter_substring_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya (card 1) is credited to Vagelis Adam.
        let params = CryptSearchParams {
            artist: Some("Vagelis".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
        // No card matches an unknown artist.
        let params = CryptSearchParams {
            artist: Some("Nobody".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_search_filters_to_library_only_and_sorts_by_name() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_library(&conn, &LibrarySearchParams::default()).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Absolute Tyranny", "Arcane Library", "Villein"]
        );
    }

    #[test]
    fn library_text_modes_limit_the_search_scope() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let name_only = LibrarySearchParams {
            text: "villein".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &name_only).unwrap()[0].name,
            "Villein"
        );

        let excluded_from_name = LibrarySearchParams {
            text: "bound".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert!(search_library(&conn, &excluded_from_name)
            .unwrap()
            .is_empty());

        let text_only = LibrarySearchParams {
            text: "bound".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &text_only).unwrap()[0].name,
            "Villein"
        );

        let excluded_from_text = LibrarySearchParams {
            text: "villein".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert!(search_library(&conn, &excluded_from_text)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn library_text_mode_deserializes_for_rest_and_mcp() {
        let rest: LibrarySearchParams = serde_urlencoded::from_str("text_mode=name").unwrap();
        assert_eq!(rest.text_mode, TextMode::Name);
        let mcp: LibrarySearchParams = serde_json::from_str(r#"{"text_mode":"text"}"#).unwrap();
        assert_eq!(mcp.text_mode, TextMode::Text);
    }

    #[test]
    fn library_type_filter_matches_exact_type_not_substring() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // "Master" must not spuriously match a type array that doesn't contain it.
        let params = LibrarySearchParams {
            card_type: Some("Master".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Arcane Library", "Villein"]
        );
    }

    #[test]
    fn library_clan_requirement_filter() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = LibrarySearchParams {
            clan: Some("Tremere".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Arcane Library");
    }

    #[test]
    fn library_cards_with_no_clan_requirement_report_none() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_library(&conn, &LibrarySearchParams::default()).unwrap();
        let villein = results.iter().find(|c| c.name == "Villein").unwrap();
        assert_eq!(villein.clan, None);
        assert_eq!(villein.types, vec!["Master"]);
        assert_eq!(villein.pool_cost, Some("2".to_string()));
    }

    /// Extra library rows for the discipline/cost filter tests (kept separate
    /// from `seed` so the shared fixture stays stable for other tests).
    fn seed_library_filter_extras(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (6,'library','Deflection','deflection','bounce text','',NULL,NULL,NULL,'[\"Reaction\"]',NULL,NULL),
               (7,'library','Theft of Vitae','theft of vitae','steal blood','',NULL,NULL,NULL,'[\"Combat\"]','1',NULL),
               (8,'library','Hidden Strength','hidden strength','variable cost','',NULL,NULL,NULL,'[\"Combat\"]','X',NULL),
               (9,'library','Expensive Action','expensive action','cost fixture','',NULL,NULL,NULL,'[\"Action\"]','3',NULL);
             INSERT INTO card_disciplines VALUES (6,'dom',1),(7,'tha',0),(8,'for',0);",
        )
        .unwrap();
    }

    #[test]
    fn library_discipline_filter_requires_all_listed() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        // Absolute Tyranny requires pot+pre; requiring both matches only it.
        let params = LibrarySearchParams {
            disciplines: vec!["pot".into(), "pre".into()],
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Absolute Tyranny");
        // A single discipline narrows to cards carrying it.
        let params = LibrarySearchParams {
            disciplines: vec!["dom".into()],
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Deflection");
    }

    #[test]
    fn library_superior_flag_excludes_inferior_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        // Absolute Tyranny's pot is inferior — requiring superior excludes it.
        let params = LibrarySearchParams {
            disciplines: vec!["pot".into()],
            disciplines_superior: true,
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
        // Deflection's dom is superior — it survives the superior requirement.
        let params = LibrarySearchParams {
            disciplines: vec!["dom".into()],
            disciplines_superior: true,
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Deflection");
    }

    #[test]
    fn library_cost_filters_cast_text_and_skip_null_costs() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        // blood_cost_max: only cards WITH a blood cost <= max match; NULL
        // blood cost (Villein, Arcane Library, Deflection) never matches.
        let params = LibrarySearchParams {
            blood_cost_max: Some(1),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Absolute Tyranny", "Theft of Vitae"]
        );
        // pool_cost_max works the same way over pool_cost.
        let params = LibrarySearchParams {
            pool_cost_max: Some(2),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Arcane Library", "Villein"]
        );
        // A max below every stored cost matches nothing.
        let params = LibrarySearchParams {
            pool_cost_max: Some(1),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_variable_x_cost_never_matches_a_max_filter() {
        // CAST('X' AS INTEGER) is 0 in SQLite, so without an explicit guard
        // Hidden Strength (blood cost X) would match every blood_cost_max —
        // including 0. vdb.im treats X as a distinct value, not zero.
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        for max in [0, 1, 9] {
            let params = LibrarySearchParams {
                blood_cost_max: Some(max),
                ..Default::default()
            };
            let results = search_library(&conn, &params).unwrap();
            assert!(
                results.iter().all(|c| c.name != "Hidden Strength"),
                "X-cost card leaked through blood_cost_max={max}"
            );
        }
        // …but it still appears when no cost filter is set.
        let results = search_library(&conn, &LibrarySearchParams::default()).unwrap();
        assert!(results.iter().any(|c| c.name == "Hidden Strength"));
    }

    #[test]
    fn library_cost_filter_supports_all_comparison_modes() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);

        let exact = LibrarySearchParams {
            blood_cost: Some(1),
            blood_cost_mode: CostMode::Exact,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &exact)
                .unwrap()
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Absolute Tyranny", "Theft of Vitae"]
        );

        let at_least = LibrarySearchParams {
            blood_cost: Some(2),
            blood_cost_mode: CostMode::AtLeast,
            ..Default::default()
        };
        let results = search_library(&conn, &at_least).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Expensive Action");

        let at_most = LibrarySearchParams {
            blood_cost: Some(1),
            blood_cost_mode: CostMode::AtMost,
            ..Default::default()
        };
        assert_eq!(search_library(&conn, &at_most).unwrap().len(), 2);
    }

    #[test]
    fn library_cost_modes_deserialize_for_rest_and_mcp() {
        let rest: LibrarySearchParams =
            serde_urlencoded::from_str("blood_cost=2&blood_cost_mode=at_least").unwrap();
        assert_eq!(rest.blood_cost, Some(2));
        assert_eq!(rest.blood_cost_mode, CostMode::AtLeast);

        let mcp: LibrarySearchParams =
            serde_json::from_str(r#"{"pool_cost":1,"pool_cost_mode":"exact"}"#).unwrap();
        assert_eq!(mcp.pool_cost, Some(1));
        assert_eq!(mcp.pool_cost_mode, CostMode::Exact);
    }

    #[test]
    fn library_disciplines_csv_deserializes_from_query_string() {
        let params: LibrarySearchParams =
            serde_urlencoded::from_str("disciplines=POT,%20pre&blood_cost_max=1").unwrap();
        assert_eq!(params.disciplines, vec!["pot", "pre"]);
        assert_eq!(params.blood_cost_max, Some(1));
        let params: LibrarySearchParams =
            serde_json::from_str(r#"{"disciplines":["dom"],"disciplines_superior":true}"#).unwrap();
        assert_eq!(params.disciplines, vec!["dom"]);
        assert!(params.disciplines_superior);
    }

    #[test]
    fn library_set_filter_matches_exact_set_name() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Villein (card 3) has a printing in Fifth Edition; other library
        // cards (4, 5) have none.
        let params = LibrarySearchParams {
            set: Some("Fifth Edition".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Villein");
        let params = LibrarySearchParams {
            set: Some("Anarch Revolt".into()),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_precon_filter_substring_matches_and_skips_null() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Villein's printing has a NULL precon, so it never matches.
        let params = LibrarySearchParams {
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_artist_filter_substring_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Villein (card 3) is credited to Mike Chaney.
        let params = LibrarySearchParams {
            artist: Some("Chaney".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Villein");
        let params = LibrarySearchParams {
            artist: Some("Nobody".into()),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn list_precons_groups_by_set_and_precon_and_counts_distinct_cards() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // seed() has one precon printing: (Anarch Revolt, "Anarch Precon", card 2).
        // Add a second card to the same precon, and one in a different set.
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (6,'crypt','Baron','baron','','Brujah',6,6,NULL,NULL,NULL,NULL);
             INSERT INTO sets VALUES (3,'Camarilla Edition');
             INSERT INTO printings VALUES
               (6,2,'Anarch Precon','U',1),
               (5,3,'Tremere','C',1);",
        )
        .unwrap();

        let precons = list_precons(&conn).unwrap();
        assert_eq!(
            precons,
            vec![
                PreconSummary {
                    set: "Anarch Revolt".into(),
                    precon: "Anarch Precon".into(),
                    card_count: 2,
                },
                PreconSummary {
                    set: "Camarilla Edition".into(),
                    precon: "Tremere".into(),
                    card_count: 1,
                },
            ]
        );
    }

    #[test]
    fn list_precons_ignores_printings_with_no_precon() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Only card 2's printing has a precon set; cards 1 and 3 don't.
        let precons = list_precons(&conn).unwrap();
        assert_eq!(precons.len(), 1);
        assert_eq!(precons[0].precon, "Anarch Precon");
    }
}
