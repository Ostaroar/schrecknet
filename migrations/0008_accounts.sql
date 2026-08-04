BEGIN;

-- Optional passkey accounts (docs/adr/0019-passkey-only-accounts-no-email.md,
-- docs/accounts-plan.md). Passkeys only: no password column, and deliberately
-- no email column anywhere — recovery is the Argon2id-hashed one-time code on
-- `users`, not a reset mail. Adding an email column here requires superseding
-- ADR 0019.
--
-- Server-only data (lives in app.sqlite). The browser's local user.sqlite gets
-- these tables too via the shared migration set, exactly like the game_groups
-- tables from migration 0004, and never uses them — the same deliberate,
-- accepted bit of waste rather than a second migration mechanism.

-- `display_name` doubles as the login identifier, since there is no email.
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  recovery_code_hash TEXT NOT NULL
);

-- One row per passkey; several per user is the normal case, and is the primary
-- multi-device and device-loss story. `passkey_json` is webauthn-rs's own
-- serialized `Passkey` (it is Serialize/Deserialize) rather than hand-unpacked
-- public-key/sign-count columns: the credential internals are opaque by design
-- and reaching into them needs the crate's `danger-credential-internals`
-- feature. `credential_id` is stored separately only because it is the lookup
-- key WebAuthn hands back on authentication.
CREATE TABLE IF NOT EXISTS user_credentials(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id BLOB NOT NULL UNIQUE,
  passkey_json TEXT NOT NULL,
  nickname TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS user_credentials_user_idx ON user_credentials(user_id);

-- Browser sessions. The token itself is never stored, only its SHA-256, so a
-- read of this table cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS user_sessions(
  token_hash BLOB PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);

-- Bearer tokens for MCP/REST clients, which have neither cookies nor an
-- authenticator. Deliberately less privileged than a session: a token can read
-- and write the (encrypted) sync blob and nothing else, so a leaked token
-- cannot escalate into account takeover. Populated in milestone A5.
CREATE TABLE IF NOT EXISTS user_api_tokens(
  token_hash BLOB PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT
);

-- The synced payload: the ADR 0016 backup envelope, AES-GCM-encrypted in the
-- browser before upload, so this is opaque to the server by construction.
-- Populated in milestone A3.
CREATE TABLE IF NOT EXISTS user_sync_blobs(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  device_label TEXT,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  byte_size INTEGER NOT NULL
);

PRAGMA user_version = 8;
COMMIT;
