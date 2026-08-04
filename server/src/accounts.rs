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
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
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
/// Recovery attempts allowed per display name per [`RECOVERY_WINDOW`].
const RECOVERY_ATTEMPT_LIMIT: u32 = 10;
const RECOVERY_WINDOW: Duration = Duration::from_secs(600);

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
    RecoveryCodeRejected,
    TooManyAttempts,
    LastPasskey,
    UnknownCredential,
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
            Self::RecoveryCodeRejected => formatter.write_str("that recovery code is not valid"),
            Self::TooManyAttempts => {
                formatter.write_str("too many attempts, wait a few minutes and try again")
            }
            Self::LastPasskey => formatter
                .write_str("this is your only passkey — add another one before removing it"),
            Self::UnknownCredential => formatter.write_str("no such passkey on this account"),
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
    /// Adding a passkey to an account that already exists — reached either by
    /// redeeming a recovery code (locked out) or from a live session (adding a
    /// second device). `rotate_recovery_code` is set only for the former, so a
    /// redeemed code is never valid twice.
    AddPasskey {
        user_id: i64,
        rotate_recovery_code: bool,
        state: PasskeyRegistration,
    },
}

pub struct AccountsService {
    webauthn: Webauthn,
    pending: Mutex<HashMap<String, (Ceremony, Instant)>>,
    /// Recovery attempts per display name, for the throttle below.
    recovery_attempts: Mutex<HashMap<String, (u32, Instant)>>,
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
            recovery_attempts: Mutex::new(HashMap::new()),
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

    /// Throttles recovery attempts. Not because the code is guessable — 128
    /// random bits are not — but because *verifying* one costs a full Argon2id
    /// hash, which makes an unthrottled endpoint a cheap CPU-exhaustion lever.
    fn allow_recovery_attempt(&self, display_name: &str) -> bool {
        let mut attempts = self
            .recovery_attempts
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        attempts.retain(|_, (_, started)| now.duration_since(*started) < RECOVERY_WINDOW);
        let entry = attempts.entry(display_name.to_owned()).or_insert((0, now));
        entry.0 += 1;
        entry.0 <= RECOVERY_ATTEMPT_LIMIT
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

// ---------------------------------------------------------------------------
// Recovery + passkey management (milestone A2)
//
// Together these are the answer to "what if I lose the device with my passkey":
// register several passkeys while you can, and keep the recovery code for when
// you did not. Neither protects the *data* — that is the ADR 0016 backup, and
// it is unaffected by either, since decks live in the browser.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct RecoverStartParams {
    pub display_name: String,
    pub recovery_code: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct AddPasskeyFinishParams {
    pub ceremony_id: String,
    #[schema(value_type = Object)]
    pub credential: RegisterPublicKeyCredential,
    /// Optional label, e.g. "iPhone" or "work laptop".
    #[serde(default)]
    pub nickname: Option<String>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct AddPasskeyResult {
    pub passkey_count: i64,
    /// Present only when a recovery code was redeemed: the old one is spent, so
    /// a fresh one is issued and shown once. `None` when adding a passkey from
    /// a live session, where the existing code stays valid.
    pub new_recovery_code: Option<String>,
    #[serde(skip)]
    pub session_token: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct CredentialSummary {
    pub id: i64,
    pub nickname: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

fn user_id_for(conn: &Connection, display_name: &str) -> Result<i64, AccountError> {
    conn.query_row(
        "SELECT id FROM users WHERE display_name = ?1 COLLATE NOCASE",
        [display_name],
        |row| row.get(0),
    )
    .optional()?
    .ok_or(AccountError::UnknownUser)
}

/// Starts registering an additional passkey after proving ownership with the
/// recovery code. This is the locked-out path: no session is required.
pub fn recover_start(
    conn: &Connection,
    service: &AccountsService,
    params: &RecoverStartParams,
) -> Result<CeremonyChallenge, AccountError> {
    let display_name = normalized_display_name(&params.display_name)?;
    if !service.allow_recovery_attempt(&display_name) {
        return Err(AccountError::TooManyAttempts);
    }
    let user_id = user_id_for(conn, &display_name)?;

    let stored_hash: String = conn.query_row(
        "SELECT recovery_code_hash FROM users WHERE id = ?1",
        [user_id],
        |row| row.get(0),
    )?;
    let parsed = PasswordHash::new(&stored_hash).map_err(|_| AccountError::PasswordHash)?;
    if Argon2::default()
        .verify_password(params.recovery_code.trim().as_bytes(), &parsed)
        .is_err()
    {
        return Err(AccountError::RecoveryCodeRejected);
    }

    start_add_passkey(conn, service, user_id, &display_name, true)
}

/// Starts registering an additional passkey from an already-signed-in session —
/// the "second device" path, and the one users should reach for *before* they
/// need the recovery code.
pub fn add_passkey_start(
    conn: &Connection,
    service: &AccountsService,
    user_id: i64,
) -> Result<CeremonyChallenge, AccountError> {
    let display_name: String = conn.query_row(
        "SELECT display_name FROM users WHERE id = ?1",
        [user_id],
        |row| row.get(0),
    )?;
    start_add_passkey(conn, service, user_id, &display_name, false)
}

fn start_add_passkey(
    conn: &Connection,
    service: &AccountsService,
    user_id: i64,
    display_name: &str,
    rotate_recovery_code: bool,
) -> Result<CeremonyChallenge, AccountError> {
    // Excluding the credentials already on file stops an authenticator from
    // silently creating a second passkey for the same account on a device that
    // already has one.
    let existing: Vec<CredentialID> = load_passkeys(conn, user_id)?
        .iter()
        .map(|(_, passkey)| passkey.cred_id().clone())
        .collect();
    let handle_bytes: Vec<u8> = conn.query_row("SELECT randomblob(16)", [], |row| row.get(0))?;
    let user_handle = Uuid::from_slice(&handle_bytes).map_err(|_| AccountError::Serialization)?;

    let (challenge, state) = service
        .webauthn
        .start_passkey_registration(user_handle, display_name, display_name, Some(existing))
        .map_err(|_| AccountError::CredentialRejected)?;

    let ceremony_id = random_token(conn, 16)?;
    service.remember(
        ceremony_id.clone(),
        Ceremony::AddPasskey {
            user_id,
            rotate_recovery_code,
            state,
        },
    );
    Ok(CeremonyChallenge {
        ceremony_id,
        challenge: serde_json::to_value(&challenge).map_err(|_| AccountError::Serialization)?,
    })
}

/// Completes either add-passkey path. Issues a session, because both paths end
/// with the user holding a working credential.
pub fn add_passkey_finish(
    conn: &Connection,
    service: &AccountsService,
    params: &AddPasskeyFinishParams,
) -> Result<AddPasskeyResult, AccountError> {
    let Some(Ceremony::AddPasskey {
        user_id,
        rotate_recovery_code,
        state,
    }) = service.take(&params.ceremony_id)
    else {
        return Err(AccountError::UnknownCeremony);
    };

    let passkey = service
        .webauthn
        .finish_passkey_registration(&params.credential, &state)
        .map_err(|_| AccountError::CredentialRejected)?;

    insert_credential(conn, user_id, &passkey)?;
    if let Some(nickname) = params
        .nickname
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        conn.execute(
            "UPDATE user_credentials SET nickname = ?1 WHERE user_id = ?2 AND credential_id = ?3",
            rusqlite::params![nickname, user_id, passkey.cred_id().to_vec()],
        )?;
    }

    let new_recovery_code = if rotate_recovery_code {
        let code = random_token(conn, 16)?;
        let hash = hash_secret(conn, &code)?;
        conn.execute(
            "UPDATE users SET recovery_code_hash = ?1 WHERE id = ?2",
            rusqlite::params![hash, user_id],
        )?;
        Some(code)
    } else {
        None
    };

    Ok(AddPasskeyResult {
        passkey_count: passkey_count(conn, user_id)?,
        new_recovery_code,
        session_token: create_session(conn, user_id)?,
    })
}

fn passkey_count(conn: &Connection, user_id: i64) -> Result<i64, AccountError> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM user_credentials WHERE user_id = ?1",
        [user_id],
        |row| row.get(0),
    )?)
}

pub fn list_credentials(
    conn: &Connection,
    user_id: i64,
) -> Result<Vec<CredentialSummary>, AccountError> {
    let mut stmt = conn.prepare(
        "SELECT id, nickname, created_at, last_used_at
         FROM user_credentials WHERE user_id = ?1 ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map([user_id], |row| {
        Ok(CredentialSummary {
            id: row.get(0)?,
            nickname: row.get(1)?,
            created_at: row.get(2)?,
            last_used_at: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn rename_credential(
    conn: &Connection,
    user_id: i64,
    credential_row_id: i64,
    nickname: Option<&str>,
) -> Result<(), AccountError> {
    let nickname = nickname.map(str::trim).filter(|value| !value.is_empty());
    let changed = conn.execute(
        "UPDATE user_credentials SET nickname = ?1 WHERE id = ?2 AND user_id = ?3",
        rusqlite::params![nickname, credential_row_id, user_id],
    )?;
    if changed == 0 {
        return Err(AccountError::UnknownCredential);
    }
    Ok(())
}

/// Refuses to remove the last passkey. The recovery code would still get the
/// user back in, but leaving an account with no working credential is a
/// footgun, not a feature — and the message tells them what to do instead.
pub fn remove_credential(
    conn: &Connection,
    user_id: i64,
    credential_row_id: i64,
) -> Result<(), AccountError> {
    if passkey_count(conn, user_id)? <= 1 {
        return Err(AccountError::LastPasskey);
    }
    let removed = conn.execute(
        "DELETE FROM user_credentials WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![credential_row_id, user_id],
    )?;
    if removed == 0 {
        return Err(AccountError::UnknownCredential);
    }
    Ok(())
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

    /// Passkey rows carry an opaque `passkey_json`; these tests only exercise
    /// the surrounding bookkeeping, so a placeholder blob is enough.
    fn insert_fake_credential(conn: &Connection, user_id: i64, credential_id: &[u8]) -> i64 {
        conn.execute(
            "INSERT INTO user_credentials(user_id, credential_id, passkey_json, created_at)
             VALUES (?1, ?2, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            rusqlite::params![user_id, credential_id],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn a_recovery_code_verifies_against_its_stored_hash() {
        let conn = open();
        let (_, code) = insert_user(&conn, "Lasombra");
        let stored: String = conn
            .query_row("SELECT recovery_code_hash FROM users", [], |row| row.get(0))
            .unwrap();
        let parsed = PasswordHash::new(&stored).unwrap();

        assert!(Argon2::default()
            .verify_password(code.as_bytes(), &parsed)
            .is_ok());
        assert!(Argon2::default()
            .verify_password(b"not-the-code", &parsed)
            .is_err());
    }

    #[test]
    fn recovery_attempts_are_throttled_per_display_name() {
        let service = AccountsService::new("localhost", "http://localhost:8000").unwrap();
        for _ in 0..RECOVERY_ATTEMPT_LIMIT {
            assert!(service.allow_recovery_attempt("Banu"));
        }
        assert!(!service.allow_recovery_attempt("Banu"));
        // The throttle is per account, so one user cannot lock out another.
        assert!(service.allow_recovery_attempt("Ravnos"));
    }

    #[test]
    fn the_last_passkey_cannot_be_removed() {
        let conn = open();
        let (user_id, _) = insert_user(&conn, "Salubri");
        let only = insert_fake_credential(&conn, user_id, b"cred-a");

        assert!(matches!(
            remove_credential(&conn, user_id, only),
            Err(AccountError::LastPasskey)
        ));

        let second = insert_fake_credential(&conn, user_id, b"cred-b");
        remove_credential(&conn, user_id, second).unwrap();
        assert_eq!(passkey_count(&conn, user_id).unwrap(), 1);
    }

    #[test]
    fn credentials_of_other_accounts_are_untouchable() {
        let conn = open();
        let (mine, _) = insert_user(&conn, "Tzimisce");
        let (theirs, _) = insert_user(&conn, "Giovanni");
        insert_fake_credential(&conn, mine, b"mine-1");
        insert_fake_credential(&conn, mine, b"mine-2");
        let their_credential = insert_fake_credential(&conn, theirs, b"theirs-1");

        // Row ids are global, so passing someone else's must fail on ownership
        // rather than quietly succeeding.
        assert!(matches!(
            remove_credential(&conn, mine, their_credential),
            Err(AccountError::UnknownCredential)
        ));
        assert!(matches!(
            rename_credential(&conn, mine, their_credential, Some("nice try")),
            Err(AccountError::UnknownCredential)
        ));
        assert_eq!(passkey_count(&conn, theirs).unwrap(), 1);
    }

    #[test]
    fn renaming_stores_a_label_and_blank_clears_it() {
        let conn = open();
        let (user_id, _) = insert_user(&conn, "Hecata");
        let credential = insert_fake_credential(&conn, user_id, b"cred");

        rename_credential(&conn, user_id, credential, Some("  iPhone  ")).unwrap();
        assert_eq!(
            list_credentials(&conn, user_id).unwrap()[0]
                .nickname
                .as_deref(),
            Some("iPhone")
        );

        rename_credential(&conn, user_id, credential, Some("   ")).unwrap();
        assert_eq!(list_credentials(&conn, user_id).unwrap()[0].nickname, None);
    }

    #[test]
    fn deleting_a_user_cascades_to_credentials_and_sessions() {
        let conn = open();
        let (user_id, _) = insert_user(&conn, "Ministry");
        insert_fake_credential(&conn, user_id, b"cred");
        create_session(&conn, user_id).unwrap();

        conn.execute("DELETE FROM users WHERE id = ?1", [user_id])
            .unwrap();

        for table in ["user_credentials", "user_sessions"] {
            let remaining: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(
                remaining, 0,
                "{table} still had rows after the user was deleted"
            );
        }
    }

    #[test]
    fn rejects_an_invalid_relying_party_origin() {
        assert!(AccountsService::new("localhost", "not a url").is_err());
        assert!(AccountsService::new("localhost", "http://localhost:8000").is_ok());
    }
}
