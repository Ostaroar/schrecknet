//! Encrypted deck/inventory sync (docs/adr/0019, docs/accounts-plan.md
//! milestone A3). The payload is the ADR 0016 backup envelope, AES-GCM
//! encrypted **in the browser** before it ever reaches this module — the
//! server stores `ciphertext`/`nonce` bytes and never has the key, so this
//! file never touches plaintext deck data. It cannot even decide *whose*
//! deck is bigger; it only moves opaque blobs with an optimistic-concurrency
//! version number.

use rusqlite::{Connection, OptionalExtension};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Rejected outright rather than silently truncated — this is deliberately
/// generous for a JSON-plus-base64 SQLite export of a hobbyist card
/// collection, which is normally low hundreds of KB.
const MAX_CIPHERTEXT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug)]
pub enum SyncError {
    Sqlite(rusqlite::Error),
    NotFound,
    /// Carries the caller's stale version so the client can report *which*
    /// version it thought it had, alongside the current one from `SyncBlob`.
    Conflict { current: SyncBlob },
    TooLarge,
}

impl From<rusqlite::Error> for SyncError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl std::fmt::Display for SyncError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(error) => error.fmt(formatter),
            Self::NotFound => formatter.write_str("no synced data yet"),
            Self::Conflict { .. } => {
                formatter.write_str("another device has a newer version — resolve the conflict first")
            }
            Self::TooLarge => formatter.write_str("encrypted payload is too large"),
        }
    }
}

impl std::error::Error for SyncError {}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct SyncBlob {
    pub version: i64,
    pub updated_at: String,
    pub device_label: Option<String>,
    /// Base64 (standard, padded) — this is opaque ciphertext, so plain base64
    /// is fine; no need for URL-safety here.
    pub ciphertext: String,
    pub nonce: String,
    pub byte_size: i64,
}

pub fn get_blob(conn: &Connection, user_id: i64) -> Result<SyncBlob, SyncError> {
    conn.query_row(
        "SELECT version, updated_at, device_label, ciphertext, nonce, byte_size
         FROM user_sync_blobs WHERE user_id = ?1",
        [user_id],
        row_to_blob,
    )
    .optional()?
    .ok_or(SyncError::NotFound)
}

/// `ciphertext`/`nonce` are stored as the raw UTF-8 bytes of the base64
/// strings the client sends (base64 is always valid ASCII, so this round-trips
/// exactly); read back as bytes and re-wrapped as a String here.
fn row_to_blob(row: &rusqlite::Row) -> rusqlite::Result<SyncBlob> {
    let ciphertext: Vec<u8> = row.get(3)?;
    let nonce: Vec<u8> = row.get(4)?;
    Ok(SyncBlob {
        version: row.get(0)?,
        updated_at: row.get(1)?,
        device_label: row.get(2)?,
        ciphertext: String::from_utf8_lossy(&ciphertext).into_owned(),
        nonce: String::from_utf8_lossy(&nonce).into_owned(),
        byte_size: row.get(5)?,
    })
}

#[derive(Debug, Clone, Deserialize, JsonSchema, utoipa::ToSchema)]
pub struct PutSyncBlobParams {
    /// The version this device last saw, or `None` for a first-ever push.
    /// Must match the current stored version exactly, or the push is refused
    /// as a conflict — this is the whole concurrency-control mechanism.
    #[serde(default)]
    pub expected_version: Option<i64>,
    #[serde(default)]
    pub device_label: Option<String>,
    pub ciphertext: String,
    pub nonce: String,
}

/// Upserts the blob, enforcing optimistic concurrency: `expected_version` must
/// equal whatever is currently stored (or be absent/0 if nothing is stored
/// yet). A mismatch means another device pushed in between — refused with the
/// current blob attached so the client can show a real conflict UI rather
/// than a bare error.
pub fn put_blob(
    conn: &Connection,
    user_id: i64,
    params: &PutSyncBlobParams,
) -> Result<SyncBlob, SyncError> {
    if params.ciphertext.len() > MAX_CIPHERTEXT_BYTES {
        return Err(SyncError::TooLarge);
    }

    let current_version: Option<i64> = conn
        .query_row(
            "SELECT version FROM user_sync_blobs WHERE user_id = ?1",
            [user_id],
            |row| row.get(0),
        )
        .optional()?;

    let expected = params.expected_version.unwrap_or(0);
    if expected != current_version.unwrap_or(0) {
        return Err(SyncError::Conflict {
            current: get_blob(conn, user_id)?,
        });
    }

    let next_version = current_version.unwrap_or(0) + 1;
    conn.execute(
        "INSERT INTO user_sync_blobs(user_id, version, updated_at, device_label, ciphertext, nonce, byte_size)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?3, ?4, ?5, ?6)
         ON CONFLICT(user_id) DO UPDATE SET
           version = excluded.version,
           updated_at = excluded.updated_at,
           device_label = excluded.device_label,
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           byte_size = excluded.byte_size",
        rusqlite::params![
            user_id,
            next_version,
            params.device_label,
            params.ciphertext.as_bytes(),
            params.nonce.as_bytes(),
            params.ciphertext.len() as i64,
        ],
    )?;

    get_blob(conn, user_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::user_db::migrate_connection(&conn).unwrap();
        conn.execute(
            "INSERT INTO users(display_name, created_at, recovery_code_hash)
             VALUES ('Tester', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'x')",
            [],
        )
        .unwrap();
        conn
    }

    fn push(conn: &Connection, user_id: i64, expected: Option<i64>) -> Result<SyncBlob, SyncError> {
        put_blob(
            conn,
            user_id,
            &PutSyncBlobParams {
                expected_version: expected,
                device_label: Some("test device".into()),
                ciphertext: "cipher".into(),
                nonce: "nonce".into(),
            },
        )
    }

    #[test]
    fn first_push_needs_no_expected_version_and_starts_at_one() {
        let conn = open();
        let blob = push(&conn, 1, None).unwrap();
        assert_eq!(blob.version, 1);
    }

    #[test]
    fn a_matching_expected_version_advances_it_by_one() {
        let conn = open();
        push(&conn, 1, None).unwrap();
        let blob = push(&conn, 1, Some(1)).unwrap();
        assert_eq!(blob.version, 2);
    }

    #[test]
    fn a_stale_expected_version_is_a_conflict_carrying_the_current_blob() {
        let conn = open();
        push(&conn, 1, None).unwrap();
        push(&conn, 1, Some(1)).unwrap(); // now at version 2

        match push(&conn, 1, Some(1)) {
            Err(SyncError::Conflict { current }) => assert_eq!(current.version, 2),
            other => panic!("expected a conflict, got {other:?}"),
        }
    }

    #[test]
    fn pushing_as_first_when_a_blob_already_exists_is_also_a_conflict() {
        let conn = open();
        push(&conn, 1, None).unwrap();
        assert!(matches!(push(&conn, 1, None), Err(SyncError::Conflict { .. })));
    }

    #[test]
    fn get_before_any_push_is_not_found() {
        let conn = open();
        assert!(matches!(get_blob(&conn, 1), Err(SyncError::NotFound)));
    }

    #[test]
    fn an_oversized_ciphertext_is_refused() {
        let conn = open();
        let result = put_blob(
            &conn,
            1,
            &PutSyncBlobParams {
                expected_version: None,
                device_label: None,
                ciphertext: "x".repeat(MAX_CIPHERTEXT_BYTES + 1),
                nonce: "nonce".into(),
            },
        );
        assert!(matches!(result, Err(SyncError::TooLarge)));
    }

    #[test]
    fn two_users_blobs_are_completely_independent() {
        let conn = open();
        conn.execute(
            "INSERT INTO users(display_name, created_at, recovery_code_hash)
             VALUES ('Other', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'y')",
            [],
        )
        .unwrap();
        push(&conn, 1, None).unwrap();
        push(&conn, 2, None).unwrap();
        assert!(matches!(push(&conn, 2, Some(1)), Ok(blob) if blob.version == 2));
        assert_eq!(get_blob(&conn, 1).unwrap().version, 1);
    }
}

