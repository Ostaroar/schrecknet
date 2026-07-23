//! Private friend-group casual play log + leaderboard (docs/game-groups-plan.md).
//! Server-only shared state in `app.sqlite` — no accounts: a group is identified
//! by a random shareable code (SQLite `randomblob`, no new `rand` crate); whoever
//! has the code can log games or read the board. This is the first capability
//! that reads/writes `app.sqlite` (previously migrated at startup only). MCP and
//! REST both call these exact functions — AGENTS.md hard rule #2.

use rusqlite::{Connection, OptionalExtension};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub fn open(path: &str) -> rusqlite::Result<Connection> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "foreign_keys", true)?;
    Ok(connection)
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct CreateGroupParams {
    /// Display name for the group, e.g. "Thursday Night Coterie".
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GroupInfo {
    pub code: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct GroupCodeParams {
    /// The group's shareable code, as returned by create_game_group.
    pub code: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct PlayerResultInput {
    pub player_name: String,
    #[serde(default)]
    pub deck_name: Option<String>,
    /// Victory points earned (0–5 in halves, per standard VTES scoring).
    pub vp: f64,
    /// Whether this player achieved the game-win condition (tiebreak marker).
    #[serde(default)]
    pub game_win: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct LogGameParams {
    pub code: String,
    /// ISO date the game was played, e.g. "2026-07-23".
    pub played_at: String,
    #[serde(default)]
    pub notes: Option<String>,
    /// One entry per player at the table, in seating/display order.
    pub results: Vec<PlayerResultInput>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlayerResultRecord {
    pub player_name: String,
    pub deck_name: Option<String>,
    pub vp: f64,
    pub game_win: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameRecord {
    pub id: i64,
    pub played_at: String,
    pub notes: Option<String>,
    pub results: Vec<PlayerResultRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LeaderboardEntry {
    pub player_name: String,
    pub games_played: i64,
    pub total_vp: f64,
    pub average_vp: f64,
    pub wins: i64,
    pub win_rate: f64,
}

#[derive(Debug)]
pub enum GameGroupError {
    Sqlite(rusqlite::Error),
    EmptyResults,
    CodeGenerationFailed,
}

impl From<rusqlite::Error> for GameGroupError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl std::fmt::Display for GameGroupError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(error) => error.fmt(formatter),
            Self::EmptyResults => {
                formatter.write_str("a logged game needs at least one player result")
            }
            Self::CodeGenerationFailed => {
                formatter.write_str("could not generate a unique group code, try again")
            }
        }
    }
}

impl std::error::Error for GameGroupError {}

const CODE_GENERATION_ATTEMPTS: u32 = 5;

pub fn create_group(
    conn: &Connection,
    params: &CreateGroupParams,
) -> Result<GroupInfo, GameGroupError> {
    for _ in 0..CODE_GENERATION_ATTEMPTS {
        let result = conn.query_row(
            "INSERT INTO game_groups (code, name, created_at)
             VALUES (upper(hex(randomblob(4))), ?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             RETURNING code, name, created_at",
            [&params.name],
            |row| {
                Ok(GroupInfo {
                    code: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            },
        );
        match result {
            Ok(info) => return Ok(info),
            Err(rusqlite::Error::SqliteFailure(error, _))
                if error.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                continue
            }
            Err(error) => return Err(error.into()),
        }
    }
    Err(GameGroupError::CodeGenerationFailed)
}

pub fn get_group(
    conn: &Connection,
    params: &GroupCodeParams,
) -> rusqlite::Result<Option<GroupInfo>> {
    conn.query_row(
        "SELECT code, name, created_at FROM game_groups WHERE code = ?1",
        [&params.code],
        |row| {
            Ok(GroupInfo {
                code: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        },
    )
    .optional()
}

fn group_id(conn: &Connection, code: &str) -> rusqlite::Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM game_groups WHERE code = ?1",
        [code],
        |row| row.get(0),
    )
    .optional()
}

fn results_for_game(conn: &Connection, game_id: i64) -> rusqlite::Result<Vec<PlayerResultRecord>> {
    let mut statement = conn.prepare(
        "SELECT player_name, deck_name, vp, game_win FROM group_game_results
         WHERE game_id = ?1 ORDER BY position",
    )?;
    let results = statement
        .query_map([game_id], |row| {
            Ok(PlayerResultRecord {
                player_name: row.get(0)?,
                deck_name: row.get(1)?,
                vp: row.get(2)?,
                game_win: row.get::<_, i64>(3)? != 0,
            })
        })?
        .collect();
    results
}

pub fn log_game(
    conn: &Connection,
    params: &LogGameParams,
) -> Result<Option<GameRecord>, GameGroupError> {
    if params.results.is_empty() {
        return Err(GameGroupError::EmptyResults);
    }
    let Some(gid) = group_id(conn, &params.code)? else {
        return Ok(None);
    };

    conn.execute(
        "INSERT INTO group_games (group_id, played_at, notes, created_at)
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        rusqlite::params![gid, params.played_at, params.notes],
    )?;
    let game_id = conn.last_insert_rowid();

    for (position, result) in params.results.iter().enumerate() {
        conn.execute(
            "INSERT INTO group_game_results (game_id, position, player_name, deck_name, vp, game_win)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                game_id,
                position as i64,
                result.player_name,
                result.deck_name,
                result.vp,
                result.game_win,
            ],
        )?;
    }

    Ok(Some(GameRecord {
        id: game_id,
        played_at: params.played_at.clone(),
        notes: params.notes.clone(),
        results: results_for_game(conn, game_id)?,
    }))
}

pub fn list_games(
    conn: &Connection,
    params: &GroupCodeParams,
) -> rusqlite::Result<Option<Vec<GameRecord>>> {
    let Some(gid) = group_id(conn, &params.code)? else {
        return Ok(None);
    };

    let mut statement = conn.prepare(
        "SELECT id, played_at, notes FROM group_games
         WHERE group_id = ?1 ORDER BY played_at DESC, id DESC",
    )?;
    let games = statement
        .query_map([gid], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut result = Vec::with_capacity(games.len());
    for (id, played_at, notes) in games {
        result.push(GameRecord {
            id,
            played_at,
            notes,
            results: results_for_game(conn, id)?,
        });
    }
    Ok(Some(result))
}

pub fn leaderboard(
    conn: &Connection,
    params: &GroupCodeParams,
) -> rusqlite::Result<Option<Vec<LeaderboardEntry>>> {
    let Some(gid) = group_id(conn, &params.code)? else {
        return Ok(None);
    };

    let mut statement = conn.prepare(
        "SELECT r.player_name, COUNT(*), SUM(r.vp), SUM(r.game_win)
         FROM group_game_results r
         JOIN group_games g ON g.id = r.game_id
         WHERE g.group_id = ?1
         GROUP BY r.player_name
         ORDER BY SUM(r.game_win) DESC, SUM(r.vp) DESC, r.player_name ASC",
    )?;
    let entries = statement
        .query_map([gid], |row| {
            let games_played: i64 = row.get(1)?;
            let total_vp: f64 = row.get(2)?;
            let wins: i64 = row.get(3)?;
            Ok(LeaderboardEntry {
                player_name: row.get(0)?,
                games_played,
                total_vp,
                average_vp: if games_played > 0 {
                    total_vp / games_played as f64
                } else {
                    0.0
                },
                wins,
                win_rate: if games_played > 0 {
                    wins as f64 / games_played as f64
                } else {
                    0.0
                },
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Some(entries))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::user_db;

    fn seed() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", true)
            .unwrap();
        user_db::migrate_connection(&connection).unwrap();
        connection
    }

    #[test]
    fn creates_groups_with_unique_codes() {
        let conn = seed();
        let a = create_group(&conn, &CreateGroupParams { name: "A".into() }).unwrap();
        let b = create_group(&conn, &CreateGroupParams { name: "B".into() }).unwrap();
        assert_ne!(a.code, b.code);
        assert_eq!(a.code.len(), 8);
        assert!(a
            .code
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase()));
    }

    #[test]
    fn unknown_code_returns_none_everywhere() {
        let conn = seed();
        let missing = GroupCodeParams {
            code: "NOPE0000".into(),
        };
        assert!(get_group(&conn, &missing).unwrap().is_none());
        assert!(list_games(&conn, &missing).unwrap().is_none());
        assert!(leaderboard(&conn, &missing).unwrap().is_none());
        let log = LogGameParams {
            code: "NOPE0000".into(),
            played_at: "2026-07-23".into(),
            notes: None,
            results: vec![PlayerResultInput {
                player_name: "Alex".into(),
                deck_name: None,
                vp: 1.0,
                game_win: false,
            }],
        };
        assert!(log_game(&conn, &log).unwrap().is_none());
    }

    #[test]
    fn rejects_a_game_with_no_players() {
        let conn = seed();
        let group = create_group(&conn, &CreateGroupParams { name: "G".into() }).unwrap();
        let log = LogGameParams {
            code: group.code,
            played_at: "2026-07-23".into(),
            notes: None,
            results: vec![],
        };
        assert!(matches!(
            log_game(&conn, &log),
            Err(GameGroupError::EmptyResults)
        ));
    }

    #[test]
    fn leaderboard_aggregates_vp_and_wins_across_games() {
        let conn = seed();
        let group = create_group(&conn, &CreateGroupParams { name: "G".into() }).unwrap();

        // Game 1: Alex wins with 2 VP, Sam gets 1, Jo gets 1, Kai gets 0.
        log_game(
            &conn,
            &LogGameParams {
                code: group.code.clone(),
                played_at: "2026-07-20".into(),
                notes: None,
                results: vec![
                    player("Alex", 2.0, true),
                    player("Sam", 1.0, false),
                    player("Jo", 1.0, false),
                    player("Kai", 0.0, false),
                ],
            },
        )
        .unwrap();

        // Game 2: Sam wins with 3 VP, Alex gets 1, Jo gets 0.
        log_game(
            &conn,
            &LogGameParams {
                code: group.code.clone(),
                played_at: "2026-07-22".into(),
                notes: Some("rematch".into()),
                results: vec![
                    player("Sam", 3.0, true),
                    player("Alex", 1.0, false),
                    player("Jo", 0.0, false),
                ],
            },
        )
        .unwrap();

        let board = leaderboard(
            &conn,
            &GroupCodeParams {
                code: group.code.clone(),
            },
        )
        .unwrap()
        .unwrap();
        let by_name = |name: &str| board.iter().find(|e| e.player_name == name).unwrap();

        let alex = by_name("Alex");
        assert_eq!(alex.games_played, 2);
        assert_eq!(alex.total_vp, 3.0);
        assert_eq!(alex.average_vp, 1.5);
        assert_eq!(alex.wins, 1);
        assert_eq!(alex.win_rate, 0.5);

        let sam = by_name("Sam");
        assert_eq!(sam.games_played, 2);
        assert_eq!(sam.total_vp, 4.0);
        assert_eq!(sam.wins, 1);

        let kai = by_name("Kai");
        assert_eq!(kai.games_played, 1);
        assert_eq!(kai.total_vp, 0.0);
        assert_eq!(kai.wins, 0);
        assert_eq!(kai.win_rate, 0.0);

        // Wins first, then total VP, breaks the Alex/Sam tie on 1 win each.
        assert_eq!(board[0].player_name, "Sam");
        assert_eq!(board[1].player_name, "Alex");

        let games = list_games(&conn, &GroupCodeParams { code: group.code })
            .unwrap()
            .unwrap();
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].played_at, "2026-07-22"); // newest first
        assert_eq!(games[0].notes.as_deref(), Some("rematch"));
        assert_eq!(games[0].results.len(), 3);
    }

    #[test]
    fn deleting_a_group_cascades_to_its_games_and_results() {
        let conn = seed();
        let group = create_group(&conn, &CreateGroupParams { name: "G".into() }).unwrap();
        log_game(
            &conn,
            &LogGameParams {
                code: group.code.clone(),
                played_at: "2026-07-23".into(),
                notes: None,
                results: vec![player("Alex", 1.0, true)],
            },
        )
        .unwrap();

        conn.execute("DELETE FROM game_groups WHERE code = ?1", [&group.code])
            .unwrap();

        let remaining_games: i64 = conn
            .query_row("SELECT COUNT(*) FROM group_games", [], |row| row.get(0))
            .unwrap();
        let remaining_results: i64 = conn
            .query_row("SELECT COUNT(*) FROM group_game_results", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(remaining_games, 0);
        assert_eq!(remaining_results, 0);
    }

    fn player(name: &str, vp: f64, game_win: bool) -> PlayerResultInput {
        PlayerResultInput {
            player_name: name.into(),
            deck_name: None,
            vp,
            game_win,
        }
    }
}
