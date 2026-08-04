//! Passkey (WebAuthn) accounts — docs/adr/0019-passkey-only-accounts-no-email.md,
//! docs/accounts-plan.md milestone A1.
//!
//! Passkeys only. No password column, and no email column anywhere — recovery
//! is the one-time Argon2id-hashed code on `users`, reusing the exact
//! hash pattern from `game_groups.rs`. Randomness comes from SQLite's
//! `randomblob`, the same "no new `rand` crate" choice game groups already made.
//!
//! **No MCP mirror, deliberately.** A WebAuthn ceremony needs a browser-resident
//! authenticator, so there is nothing an MCP client could do with
//! register/login. That is a transport limitation, not a capability shipped on
//! one surface only: the authenticated *data* capabilities land on both surfaces
//! in milestone A5 via bearer tokens. See docs/accounts-plan.md § 5.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use webauthn_rs::prelude::*;

/// How long a started ceremony stays valid. Long enough for a user to find
/// their phone, short enough that abandoned challenges don't accumulate.
const CEREMONY_TTL: Duration = Duration::from_secs(300);
/// Session lifetime. Sliding — `last_seen_at` is refreshed on use.
const SESSION_DAYS: i64 = 30;
const MAX_DISPLAY_NAME_CHARS: usize = 64;

#[derive(Debug)]
pub enum AccountError {
    Sqlite(rusqlite::Error),
    DisplayNameInvalid,
    DisplayNameTaken,
    UnknownCeremony,
    UnknownUser,
    NoCredentials,
    CredentialRejected,
    NotAuthenticated,
    PasswordHash,
    Serialization,
}

impl From<rusqlite::Error> for AccountError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl std::fmt::Display for AccountError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(error) => error.fmt(formatter),
            Self::DisplayNameInvalid => formatter.write_str("display name must be 1-64 characters"),
            Self::DisplayNameTaken => formatter.write_str("that display name is already taken"),
            Self::UnknownCeremony => {
                formatter.write_str("this sign-in attempt expired or was already used, start again")
            }
            Self::UnknownUser => formatter.write_str("no account with that display name"),
            Self::NoCredentials => formatter.write_str("that account has no passkeys registered"),
            Self::CredentialRejected => formatter.write_str("passkey verification failed"),
            Self::NotAuthenticated => formatter.write_str("not signed in"),
            Self::PasswordHash => formatter.write_str("could not secure the recovery code"),
            Self::Serialization => formatter.write_str("could not store the passkey"),
        }
    }
}

impl std::error::Error for AccountError {}

// ---------------------------------------------------------------------------
// Ceremony state
// ---------------------------------------------------------------------------

/// In-memory, because webauthn-rs deliberately makes these states
/// non-`Serialize` (serialising them to the client enables challenge replay,
/// bypassing essentially every WebAuthn guarantee — the crate gates that behind
/// a `danger-allow-state-serialisation` feature we do not enable). A
/// server-side map keyed by an opaque id is the shape the crate documents as
/// safe.
///
/// `ponytail: in-memory ceremony state, correct only while the deployment is
/// single-replica (k8s/deployment.yaml, Recreate, one RWO volume) — move to a
/// table if it ever scales out.`
enum Ceremony {
    Register {
        display_name: String,
        state: PasskeyRegistration,
    },
    Login {
        user_id: i64,
        state: PasskeyAuthentication,
    },
}

pub struct AccountsService {
    webauthn: Webauthn,
    pending: Mutex<HashMap<String, (Ceremony, Instant)>>,
}

/// Single-use *and* time-bounded lookup: the entry is removed whether or not it
/// was still fresh, so a challenge can never be retried. Split out as a free
/// generic function purely so the expiry/single-use rules are unit-testable
/// without constructing a real WebAuthn ceremony.
fn take_if_fresh<T>(map: &mut HashMap<String, (T, Instant)>, id: &str, now: Instant) -> Option<T> {
    let (value, expires_at) = map.remove(id)?;
    if now >= expires_at {
        return None;
    }
    Some(value)
}

impl AccountsService {
    pub fn new(rp_id: &str, rp_origin: &str) -> Result<Self, String> {
        let origin = Url::parse(rp_origin)
            .map_err(|error| format!("SCHRECKNET_RP_ORIGIN is not a valid URL: {error}"))?;
        let webauthn = WebauthnBuilder::new(rp_id, &origin)
            .map_err(|error| format!("invalid WebAuthn configuration: {error}"))?
            .rp_name("SchreckNet")
            .build()
            .map_err(|error| format!("invalid WebAuthn configuration: {error}"))?;
        Ok(Self {
            webauthn,
            pending: Mutex::new(HashMap::new()),
        })
    }

    fn remember(&self, id: String, ceremony: Ceremony) {
        let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        // Opportunistic sweep — abandoned ceremonies would otherwise leak.
        pending.retain(|_, (_, expires_at)| now < *expires_at);
        pending.insert(id, (ceremony, now + CEREMONY_TTL));
    }

    fn take(&self, id: &str) -> Option<Ceremony> {
        let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        take_if_fresh(&mut pending, id, Instant::now())
    }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct RegisterStartParams {
    /// Doubles as the login identifier, since there is no email address.
    pub display_name: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct CeremonyChallenge {
    /// Opaque handle for this attempt; send it back with the credential.
    pub ceremony_id: String,
    /// Passed verbatim to `navigator.credentials.create()`/`.get()`.
    #[schema(value_type = Object)]
    pub challenge: serde_json::Value,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct RegisterFinishParams {
    pub ceremony_id: String,
    /// The browser's `RegisterPublicKeyCredential`, serialized as-is.
    #[schema(value_type = Object)]
    pub credential: RegisterPublicKeyCredential,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct RegisterFinishResult {
    pub display_name: String,
    /// Shown exactly once, never recoverable afterwards. Only its Argon2id
    /// hash is stored (ADR 0019 § 2).
    pub recovery_code: String,
    #[serde(skip)]
    pub session_token: String,
}

fn normalized_display_name(raw: &str) -> Result<String, AccountError> {
    let trimmed = raw.trim();
    let length = trimmed.chars().count();
    if length == 0 || length > MAX_DISPLAY_NAME_CHARS {
        return Err(AccountError::DisplayNameInvalid);
    }
    Ok(trimmed.to_owned())
}

fn display_name_taken(conn: &Connection, display_name: &str) -> Result<bool, AccountError> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM users WHERE display_name = ?1 COLLATE NOCASE",
            [display_name],
            |row| row.get(0),
        )
        .optional()?;
    Ok(existing.is_some())
}

pub fn register_start(
    conn: &Connection,
    service: &AccountsService,
    params: &RegisterStartParams,
) -> Result<CeremonyChallenge, AccountError> {
    let display_name = normalized_display_name(&params.display_name)?;
    if display_name_taken(conn, &display_name)? {
        return Err(AccountError::DisplayNameTaken);
    }

    // WebAuthn wants a stable opaque user handle. Generated here rather than
    // derived from the (not yet assigned) row id.
    let handle_bytes: Vec<u8> = conn.query_row("SELECT randomblob(16)", [], |row| row.get(0))?;
    let user_handle = Uuid::from_slice(&handle_bytes).map_err(|_| AccountError::Serialization)?;

    let (challenge, state) = service
        .webauthn
        .start_passkey_registration(user_handle, &display_name, &display_name, None)
        .map_err(|_| AccountError::CredentialRejected)?;

    let ceremony_id = random_token(conn, 16)?;
    service.remember(
        ceremony_id.clone(),
        Ceremony::Register {
            display_name,
            state,
        },
    );

    Ok(CeremonyChallenge {
        ceremony_id,
        challenge: serde_json::to_value(&challenge).map_err(|_| AccountError::Serialization)?,
    })
}

pub fn register_finish(
    conn: &Connection,
    service: &AccountsService,
    params: &RegisterFinishParams,
) -> Result<RegisterFinishResult, AccountError> {
    let Some(Ceremony::Register {
        display_name,
        state,
    }) = service.take(&params.ceremony_id)
    else {
        return Err(AccountError::UnknownCeremony);
    };

    let passkey = service
        .webauthn
        .finish_passkey_registration(&params.credential, &state)
        .map_err(|_| AccountError::CredentialRejected)?;

    // Re-checked after the ceremony: the name was free when it started, and two
    // concurrent registrations could both have passed that first check. The
    // UNIQUE index is the real guard; this turns it into a clean error.
    if display_name_taken(conn, &display_name)? {
        return Err(AccountError::DisplayNameTaken);
    }

    let recovery_code = random_token(conn, 16)?;
    let recovery_code_hash = hash_secret(conn, &recovery_code)?;

    conn.execute(
        "INSERT INTO users(display_name, created_at, recovery_code_hash)
         VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?2)",
        rusqlite::params![display_name, recovery_code_hash],
    )?;
    let user_id = conn.last_insert_rowid();
    insert_credential(conn, user_id, &passkey)?;
    let session_token = create_session(conn, user_id)?;

    Ok(RegisterFinishResult {
        display_name,
        recovery_code,
        session_token,
    })
}

fn insert_credential(
    conn: &Connection,
    user_id: i64,
    passkey: &Passkey,
) -> Result<(), AccountError> {
    let passkey_json = serde_json::to_string(passkey).map_err(|_| AccountError::Serialization)?;
    conn.execute(
        "INSERT INTO user_credentials(user_id, credential_id, passkey_json, created_at)
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        rusqlite::params![user_id, passkey.cred_id().to_vec(), passkey_json],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct LoginStartParams {
    pub display_name: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct LoginFinishParams {
    pub ceremony_id: String,
    /// The browser's `PublicKeyCredential`, serialized as-is.
    #[schema(value_type = Object)]
    pub credential: PublicKeyCredential,
}

fn load_passkeys(conn: &Connection, user_id: i64) -> Result<Vec<(i64, Passkey)>, AccountError> {
    let mut stmt =
        conn.prepare("SELECT id, passkey_json FROM user_credentials WHERE user_id = ?1")?;
    let rows = stmt.query_map([user_id], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut passkeys = Vec::new();
    for row in rows {
        let (id, json) = row?;
        let passkey: Passkey =
            serde_json::from_str(&json).map_err(|_| AccountError::Serialization)?;
        passkeys.push((id, passkey));
    }
    Ok(passkeys)
}

pub fn login_start(
    conn: &Connection,
    service: &AccountsService,
    params: &LoginStartParams,
) -> Result<CeremonyChallenge, AccountError> {
    let display_name = normalized_display_name(&params.display_name)?;
    let user_id: i64 = conn
        .query_row(
            "SELECT id FROM users WHERE display_name = ?1 COLLATE NOCASE",
            [&display_name],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(AccountError::UnknownUser)?;

    let stored = load_passkeys(conn, user_id)?;
    if stored.is_empty() {
        return Err(AccountError::NoCredentials);
    }
    let passkeys: Vec<Passkey> = stored.into_iter().map(|(_, passkey)| passkey).collect();

    let (challenge, state) = service
        .webauthn
        .start_passkey_authentication(&passkeys)
        .map_err(|_| AccountError::CredentialRejected)?;

    let ceremony_id = random_token(conn, 16)?;
    service.remember(ceremony_id.clone(), Ceremony::Login { user_id, state });

    Ok(CeremonyChallenge {
        ceremony_id,
        challenge: serde_json::to_value(&challenge).map_err(|_| AccountError::Serialization)?,
    })
}

/// Returns the new session token.
pub fn login_finish(
    conn: &Connection,
    service: &AccountsService,
    params: &LoginFinishParams,
) -> Result<String, AccountError> {
    let Some(Ceremony::Login { user_id, state }) = service.take(&params.ceremony_id) else {
        return Err(AccountError::UnknownCeremony);
    };

    let result = service
        .webauthn
        .finish_passkey_authentication(&params.credential, &state)
        .map_err(|_| AccountError::CredentialRejected)?;

    // Signature counter moved (or backup state changed): persist the updated
    // credential, which is also how cloned-authenticator detection stays armed.
    // Authenticators that always report 0 simply never need an update.
    if result.needs_update() {
        for (row_id, mut passkey) in load_passkeys(conn, user_id)? {
            if passkey.cred_id() == result.cred_id() {
                passkey.update_credential(&result);
                let passkey_json =
                    serde_json::to_string(&passkey).map_err(|_| AccountError::Serialization)?;
                conn.execute(
                    "UPDATE user_credentials SET passkey_json = ?1 WHERE id = ?2",
                    rusqlite::params![passkey_json, row_id],
                )?;
                break;
            }
        }
    }

    conn.execute(
        "UPDATE user_credentials
         SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE user_id = ?1 AND credential_id = ?2",
        rusqlite::params![user_id, result.cred_id().to_vec()],
    )?;

    create_session(conn, user_id)
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct AccountInfo {
    pub display_name: String,
    pub created_at: String,
    pub passkey_count: i64,
}

/// Lowercase hex of `bytes` random bytes, from SQLite's CSPRNG.
fn random_token(conn: &Connection, bytes: u32) -> Result<String, AccountError> {
    Ok(
        conn.query_row("SELECT lower(hex(randomblob(?1)))", [bytes], |row| {
            row.get(0)
        })?,
    )
}

fn hash_secret(conn: &Connection, secret: &str) -> Result<String, AccountError> {
    let salt_bytes: Vec<u8> = conn.query_row("SELECT randomblob(16)", [], |row| row.get(0))?;
    let salt = SaltString::encode_b64(&salt_bytes).map_err(|_| AccountError::PasswordHash)?;
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| AccountError::PasswordHash)
}

/// The token is returned to the caller and immediately forgotten here — only
/// its SHA-256 is stored, so a dump of `user_sessions` cannot be replayed as a
/// login. A fast hash is right for a 256-bit random token (unlike the recovery
/// code, there is nothing to brute-force and this runs on every request).
fn create_session(conn: &Connection, user_id: i64) -> Result<String, AccountError> {
    let token = random_token(conn, 32)?;
    conn.execute(
        "INSERT INTO user_sessions(token_hash, user_id, created_at, expires_at, last_seen_at)
         VALUES (?1,
                 ?2,
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?3),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        rusqlite::params![token_hash(&token), user_id, format!("+{SESSION_DAYS} days")],
    )?;
    Ok(token)
}

fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Resolves a session token to its user, refreshing `last_seen_at`. Expired
/// rows are never accepted and are deleted on sight.
pub fn session_user(conn: &Connection, token: &str) -> Result<Option<i64>, AccountError> {
    let hash = token_hash(token);
    conn.execute(
        "DELETE FROM user_sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        [],
    )?;
    let user_id: Option<i64> = conn
        .query_row(
            "SELECT user_id FROM user_sessions WHERE token_hash = ?1",
            [&hash],
            |row| row.get(0),
        )
        .optional()?;
    if user_id.is_some() {
        conn.execute(
            "UPDATE user_sessions
             SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE token_hash = ?1",
            [&hash],
        )?;
    }
    Ok(user_id)
}

pub fn logout(conn: &Connection, token: &str) -> Result<(), AccountError> {
    conn.execute(
        "DELETE FROM user_sessions WHERE token_hash = ?1",
        [token_hash(token)],
    )?;
    Ok(())
}

pub fn account_info(conn: &Connection, user_id: i64) -> Result<AccountInfo, AccountError> {
    let (display_name, created_at) = conn.query_row(
        "SELECT display_name, created_at FROM users WHERE id = ?1",
        [user_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;
    let passkey_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM user_credentials WHERE user_id = ?1",
        [user_id],
        |row| row.get(0),
    )?;
    Ok(AccountInfo {
        display_name,
        created_at,
        passkey_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::user_db::migrate_connection(&conn).unwrap();
        conn
    }

    fn insert_user(conn: &Connection, name: &str) -> (i64, String) {
        let code = random_token(conn, 16).unwrap();
        let hash = hash_secret(conn, &code).unwrap();
        conn.execute(
            "INSERT INTO users(display_name, created_at, recovery_code_hash)
             VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?2)",
            rusqlite::params![name, hash],
        )
        .unwrap();
        (conn.last_insert_rowid(), code)
    }

    #[test]
    fn display_names_are_trimmed_and_bounded() {
        assert_eq!(
            normalized_display_name("  Nosferatu  ").unwrap(),
            "Nosferatu"
        );
        assert!(matches!(
            normalized_display_name("   "),
            Err(AccountError::DisplayNameInvalid)
        ));
        let too_long = "a".repeat(MAX_DISPLAY_NAME_CHARS + 1);
        assert!(matches!(
            normalized_display_name(&too_long),
            Err(AccountError::DisplayNameInvalid)
        ));
    }

    #[test]
    fn display_names_collide_case_insensitively() {
        let conn = open();
        insert_user(&conn, "Nosferatu");
        assert!(display_name_taken(&conn, "nosferatu").unwrap());
        assert!(!display_name_taken(&conn, "Malkavian").unwrap());
    }

    #[test]
    fn the_recovery_code_is_only_ever_stored_as_an_argon2_hash() {
        let conn = open();
        let (_, code) = insert_user(&conn, "Tremere");
        let stored: String = conn
            .query_row("SELECT recovery_code_hash FROM users", [], |row| row.get(0))
            .unwrap();
        assert!(stored.starts_with("$argon2"));
        assert!(!stored.contains(&code));
        // 16 random bytes => 128 bits, i.e. not brute-forceable.
        assert_eq!(code.len(), 32);
    }

    #[test]
    fn a_session_round_trips_and_logout_revokes_it() {
        let conn = open();
        let (user_id, _) = insert_user(&conn, "Ventrue");
        let token = create_session(&conn, user_id).unwrap();

        assert_eq!(session_user(&conn, &token).unwrap(), Some(user_id));
        logout(&conn, &token).unwrap();
        assert_eq!(session_user(&conn, &token).unwrap(), None);
    }

    #[test]
    fn the_raw_session_token_is_never_stored() {
        let conn = open();
        let (user_id, _) = insert_user(&conn, "Toreador");
        let token = create_session(&conn, user_id).unwrap();
        let stored: Vec<u8> = conn
            .query_row("SELECT token_hash FROM user_sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, token_hash(&token));
        assert_ne!(stored, token.as_bytes());
    }

    #[test]
    fn expired_sessions_are_rejected_and_swept() {
        let conn = open();
        let (user_id, _) = insert_user(&conn, "Gangrel");
        conn.execute(
            "INSERT INTO user_sessions(token_hash, user_id, created_at, expires_at, last_seen_at)
             VALUES (?1, ?2, '2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z', NULL)",
            rusqlite::params![token_hash("stale"), user_id],
        )
        .unwrap();

        assert_eq!(session_user(&conn, "stale").unwrap(), None);
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn account_info_counts_passkeys() {
        let conn = open();
        let (user_id, _) = insert_user(&conn, "Malkavian");
        let info = account_info(&conn, user_id).unwrap();
        assert_eq!(info.display_name, "Malkavian");
        assert_eq!(info.passkey_count, 0);
    }

    #[test]
    fn ceremonies_are_single_use_and_time_bounded() {
        let now = Instant::now();
        let mut map: HashMap<String, (u32, Instant)> = HashMap::new();
        map.insert("fresh".into(), (1, now + Duration::from_secs(60)));
        map.insert("stale".into(), (2, now - Duration::from_secs(1)));

        // Expired is refused...
        assert_eq!(take_if_fresh(&mut map, "stale", now), None);
        // ...and consumed anyway, so it cannot be retried.
        assert!(!map.contains_key("stale"));

        assert_eq!(take_if_fresh(&mut map, "fresh", now), Some(1));
        // Replaying the same ceremony id fails.
        assert_eq!(take_if_fresh(&mut map, "fresh", now), None);
        assert_eq!(take_if_fresh(&mut map, "never-existed", now), None);
    }

    #[test]
    fn rejects_an_invalid_relying_party_origin() {
        assert!(AccountsService::new("localhost", "not a url").is_err());
        assert!(AccountsService::new("localhost", "http://localhost:8000").is_ok());
    }
}
