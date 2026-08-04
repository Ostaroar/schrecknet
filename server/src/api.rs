//! REST mirror of the MCP tools (AGENTS.md hard rule #2). Same `cards_db`
//! calls as `mcp.rs::search_crypt` — this is the thin HTTP adapter.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{Html, IntoResponse, Json};

use crate::accounts::{
    self, AccountError, AddPasskeyFinishParams, CreateApiTokenParams, LoginFinishParams,
    LoginStartParams, RecoverStartParams, RegisterFinishParams, RegisterStartParams,
};
use crate::card_detail::{self, GetCardByNameParams, GetCardParams};
use crate::cards_db::{self, CryptSearchParams, LibrarySearchParams, PreconCardCountsParams};
use crate::deck_tools::{
    self, DiffDecksParams, ExportDeckParams, ImportDeckParams, ValidateDeckParams,
};
use crate::draw_hand::{self, DrawHandError, DrawHandParams};
use crate::game_groups::{
    self, CreateGroupParams, DeleteGameParams, GameGroupError, GroupCodeParams, LogGameParams,
    PlayerResultInput, UpdateGameParams,
};
use crate::semantic_search::{SemanticError, SemanticSearchParams};
use crate::sync::{self, PutSyncBlobParams, SyncError};
use crate::twda_db::{self, TwdaDeckParams, TwdaSearchParams};
use crate::AppState;

#[utoipa::path(get, path = "/api/v1/crypt/search", params(CryptSearchParams),
    responses((status = 200, description = "Matching crypt cards", body = Vec<cards_db::CryptCard>)),
    tag = "cards")]
pub async fn search_crypt(
    State(state): State<AppState>,
    Query(params): Query<CryptSearchParams>,
) -> impl IntoResponse {
    run(state, move |conn| cards_db::search_crypt(conn, &params)).await
}

#[utoipa::path(get, path = "/api/v1/library/search", params(LibrarySearchParams),
    responses((status = 200, description = "Matching library cards", body = Vec<cards_db::LibraryCard>)),
    tag = "cards")]
pub async fn search_library(
    State(state): State<AppState>,
    Query(params): Query<LibrarySearchParams>,
) -> impl IntoResponse {
    run(state, move |conn| cards_db::search_library(conn, &params)).await
}

#[utoipa::path(get, path = "/api/v1/precons",
    responses((status = 200, description = "All modern BCP/V5 precons grouped by set", body = Vec<cards_db::PreconSummary>)),
    tag = "cards")]
pub async fn list_precons(State(state): State<AppState>) -> impl IntoResponse {
    run(state, cards_db::list_precons).await
}

#[utoipa::path(get, path = "/api/v1/precons/cards", params(PreconCardCountsParams),
    responses((status = 200, description = "Real per-card quantities for one precon", body = Vec<cards_db::PreconCardCount>)),
    tag = "cards")]
pub async fn get_precon_card_counts(
    State(state): State<AppState>,
    Query(params): Query<PreconCardCountsParams>,
) -> impl IntoResponse {
    run(state, move |conn| {
        cards_db::precon_card_counts(conn, &params)
    })
    .await
}

#[utoipa::path(post, path = "/api/v1/decks/draw-hand", request_body = DrawHandParams,
    responses(
        (status = 200, description = "Drawn card ids and the seed that produced them", body = draw_hand::DrawHandResult),
        (status = 400, description = "Invalid seed or draw error", body = String),
    ),
    tag = "decks")]
pub async fn draw_hand(Json(params): Json<DrawHandParams>) -> impl IntoResponse {
    match draw_hand::draw_hand(&params) {
        Ok(result) => Json(result).into_response(),
        Err(DrawHandError::InvalidSeed) => (
            StatusCode::BAD_REQUEST,
            "seed must be an unsigned 64-bit decimal string",
        )
            .into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, error.to_string()).into_response(),
    }
}

#[utoipa::path(post, path = "/api/v1/decks/validate", request_body = ValidateDeckParams,
    responses((status = 200, description = "Legality report", body = deck_tools::ValidateDeckResult)),
    tag = "decks")]
pub async fn validate_deck(
    State(state): State<AppState>,
    Json(params): Json<ValidateDeckParams>,
) -> impl IntoResponse {
    run(state, move |conn| deck_tools::validate_deck(conn, &params)).await
}

#[utoipa::path(post, path = "/api/v1/decks/diff", request_body = DiffDecksParams,
    responses((status = 200, description = "Card-by-card diff, crypt and library separately", body = deck_tools::DiffDecksResult)),
    tag = "decks")]
pub async fn diff_decks(Json(params): Json<DiffDecksParams>) -> impl IntoResponse {
    Json(deck_tools::diff_decks(&params)).into_response()
}

#[utoipa::path(post, path = "/api/v1/decks/import", request_body = ImportDeckParams,
    responses((status = 200, description = "Resolved card ids, split crypt/library, plus unresolved names", body = deck_tools::ImportDeckResult)),
    tag = "decks")]
pub async fn import_deck(
    State(state): State<AppState>,
    Json(params): Json<ImportDeckParams>,
) -> impl IntoResponse {
    run(state, move |conn| deck_tools::import_deck(conn, &params)).await
}

#[utoipa::path(post, path = "/api/v1/decks/export", request_body = ExportDeckParams,
    responses((status = 200, description = "Plain-text deck list", body = deck_tools::ExportDeckResult)),
    tag = "decks")]
pub async fn export_deck(
    State(state): State<AppState>,
    Json(params): Json<ExportDeckParams>,
) -> impl IntoResponse {
    run(state, move |conn| deck_tools::export_deck(conn, &params)).await
}

#[utoipa::path(get, path = "/api/v1/twda/search", params(TwdaSearchParams),
    responses((status = 200, description = "Confirmed-V5 tournament-winning decks matching the filters", body = Vec<twda_db::TwdaDeckSummary>)),
    tag = "twda")]
pub async fn search_twda_decks(
    State(state): State<AppState>,
    Query(params): Query<TwdaSearchParams>,
) -> impl IntoResponse {
    run(state, move |conn| twda_db::search_decks(conn, &params)).await
}

#[utoipa::path(get, path = "/api/v1/twda/{id}",
    params(("id" = String, Path, description = "The deck's TWDA id, as returned by search_twda_decks")),
    responses(
        (status = 200, description = "Full crypt/library breakdown", body = twda_db::TwdaDeckDetail),
        (status = 404, description = "No confirmed-V5 deck with that id", body = String),
    ),
    tag = "twda")]
pub async fn get_twda_deck(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let data_dir = state.data_dir.clone();
    let result = tokio::task::spawn_blocking(move || -> rusqlite::Result<_> {
        let conn = cards_db::open(&data_dir)?;
        twda_db::get_deck(&conn, &TwdaDeckParams { id })
    })
    .await;

    match result {
        Ok(Ok(Some(deck))) => Json(deck).into_response(),
        Ok(Ok(None)) => (StatusCode::NOT_FOUND, "deck not found").into_response(),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[utoipa::path(post, path = "/api/v1/cards/semantic", request_body = SemanticSearchParams,
    responses((status = 200, description = "Ranked semantic search hits", body = Vec<crate::semantic_search::SemanticHit>)),
    tag = "cards")]
pub async fn semantic_search(
    State(state): State<AppState>,
    Json(params): Json<SemanticSearchParams>,
) -> impl IntoResponse {
    let data_dir = state.data_dir.clone();
    let semantic = state.semantic;
    let result = tokio::task::spawn_blocking(move || {
        let conn =
            cards_db::open(&data_dir).map_err(|error| SemanticError::Data(error.to_string()))?;
        semantic.search(&conn, &params)
    })
    .await;

    match result {
        Ok(Ok(hits)) => Json(hits).into_response(),
        Ok(Err(SemanticError::InvalidRequest(message))) => {
            (StatusCode::BAD_REQUEST, message).into_response()
        }
        Ok(Err(SemanticError::ModelUnavailable(message))) => {
            (StatusCode::SERVICE_UNAVAILABLE, message).into_response()
        }
        Ok(Err(error)) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

#[utoipa::path(get, path = "/api/v1/cards/{id}",
    params(("id" = i64, Path, description = "Card id, as returned by search_crypt/search_library")),
    responses(
        (status = 200, description = "Full card detail", body = card_detail::CardDetail),
        (status = 404, description = "No card with that id", body = String),
    ),
    tag = "cards")]
pub async fn get_card(State(state): State<AppState>, Path(id): Path<i64>) -> impl IntoResponse {
    let data_dir = state.data_dir.clone();
    let result = tokio::task::spawn_blocking(move || -> rusqlite::Result<_> {
        let conn = cards_db::open(&data_dir)?;
        card_detail::get_card(&conn, &GetCardParams { id })
    })
    .await;

    match result {
        Ok(Ok(Some(card))) => Json(card).into_response(),
        Ok(Ok(None)) => (StatusCode::NOT_FOUND, "card not found").into_response(),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn serve_prerendered(state: &AppState, relative_path: &str) -> axum::response::Response {
    let path = format!("{}/{relative_path}", state.static_dir);
    if let Ok(html) = tokio::fs::read_to_string(&path).await {
        return Html(html).into_response();
    }
    let index_path = format!("{}/index.html", state.static_dir);
    match tokio::fs::read_to_string(&index_path).await {
        Ok(html) => Html(html).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

/// Serves the build-time-prerendered static HTML for one card id at the same
/// real path the SPA itself navigates to (docs/seo-geo-aeo-plan.md § 4.3).
/// Falls back to the SPA shell for an id with no prerendered file — same
/// "not found" UX as before, just resolved client-side instead of a bare 404.
pub async fn get_prerendered_card(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    serve_prerendered(&state, &format!("cards/{id}.html")).await
}

/// Serves the build-time-prerendered precons index (docs/seo-geo-aeo-plan.md
/// S4) — falls back to the SPA shell if the build didn't produce one yet.
pub async fn get_prerendered_precons(State(state): State<AppState>) -> impl IntoResponse {
    serve_prerendered(&state, "precons.html").await
}

pub async fn get_prerendered_rules(State(state): State<AppState>) -> impl IntoResponse {
    serve_prerendered(&state, "rules.html").await
}

pub async fn get_prerendered_help(State(state): State<AppState>) -> impl IntoResponse {
    serve_prerendered(&state, "help.html").await
}

pub async fn get_prerendered_about(State(state): State<AppState>) -> impl IntoResponse {
    serve_prerendered(&state, "about.html").await
}

pub async fn get_prerendered_changelog(State(state): State<AppState>) -> impl IntoResponse {
    serve_prerendered(&state, "changelog.html").await
}

#[utoipa::path(get, path = "/api/v1/cards/lookup", params(GetCardByNameParams),
    responses(
        (status = 200, description = "Full card detail", body = card_detail::CardDetail),
        (status = 404, description = "No card with that name", body = String),
    ),
    tag = "cards")]
pub async fn get_card_by_name(
    State(state): State<AppState>,
    Query(params): Query<GetCardByNameParams>,
) -> impl IntoResponse {
    let data_dir = state.data_dir.clone();
    let result = tokio::task::spawn_blocking(move || -> rusqlite::Result<_> {
        let conn = cards_db::open(&data_dir)?;
        card_detail::get_card_by_name(&conn, &params)
    })
    .await;

    match result {
        Ok(Ok(Some(card))) => Json(card).into_response(),
        Ok(Ok(None)) => (StatusCode::NOT_FOUND, "card not found").into_response(),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn run<T, F>(state: AppState, f: F) -> axum::response::Response
where
    T: serde::Serialize + Send + 'static,
    F: FnOnce(&rusqlite::Connection) -> rusqlite::Result<T> + Send + 'static,
{
    let data_dir = state.data_dir.clone();
    let result = tokio::task::spawn_blocking(move || -> rusqlite::Result<T> {
        let conn = cards_db::open(&data_dir)?;
        f(&conn)
    })
    .await;

    match result {
        Ok(Ok(value)) => Json(value).into_response(),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// Body for POST .../games — `code` comes from the path, not the body.
#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct LogGameBody {
    #[serde(default)]
    pub write_passphrase: Option<String>,
    pub played_at: String,
    #[serde(default)]
    pub notes: Option<String>,
    pub results: Vec<PlayerResultInput>,
}

#[utoipa::path(post, path = "/api/v1/groups", request_body = CreateGroupParams,
    responses((status = 200, description = "The new group's code, name, and protection status", body = game_groups::GroupInfo)),
    tag = "game-groups")]
pub async fn create_game_group(
    State(state): State<AppState>,
    Json(params): Json<CreateGroupParams>,
) -> impl IntoResponse {
    run_app(state, move |conn| game_groups::create_group(conn, &params)).await
}

#[utoipa::path(get, path = "/api/v1/groups/{code}",
    params(("code" = String, Path, description = "The group's shareable code")),
    responses(
        (status = 200, description = "Group info", body = game_groups::GroupInfo),
        (status = 404, description = "No group with that code", body = String),
    ),
    tag = "game-groups")]
pub async fn get_game_group(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        Ok(game_groups::get_group(conn, &GroupCodeParams { code })?)
    })
    .await
}

#[utoipa::path(post, path = "/api/v1/groups/{code}/games",
    params(("code" = String, Path, description = "The group's shareable code")),
    request_body = LogGameBody,
    responses(
        (status = 200, description = "The logged game", body = game_groups::GameRecord),
        (status = 404, description = "No group with that code", body = String),
    ),
    tag = "game-groups")]
pub async fn log_group_game(
    State(state): State<AppState>,
    Path(code): Path<String>,
    Json(body): Json<LogGameBody>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        game_groups::log_game(
            conn,
            &LogGameParams {
                code,
                write_passphrase: body.write_passphrase,
                played_at: body.played_at,
                notes: body.notes,
                results: body.results,
            },
        )
    })
    .await
}

#[utoipa::path(get, path = "/api/v1/groups/{code}/games",
    params(("code" = String, Path, description = "The group's shareable code")),
    responses(
        (status = 200, description = "Every logged game, newest first", body = Vec<game_groups::GameRecord>),
        (status = 404, description = "No group with that code", body = String),
    ),
    tag = "game-groups")]
pub async fn list_group_games(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        Ok(game_groups::list_games(conn, &GroupCodeParams { code })?)
    })
    .await
}

#[utoipa::path(get, path = "/api/v1/groups/{code}/leaderboard",
    params(("code" = String, Path, description = "The group's shareable code")),
    responses(
        (status = 200, description = "Standing leaderboard, ranked by wins then VP", body = Vec<game_groups::LeaderboardEntry>),
        (status = 404, description = "No group with that code", body = String),
    ),
    tag = "game-groups")]
pub async fn get_group_leaderboard(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        Ok(game_groups::leaderboard(conn, &GroupCodeParams { code })?)
    })
    .await
}

#[utoipa::path(delete, path = "/api/v1/groups/{code}/games/{game_id}",
    params(
        ("code" = String, Path, description = "The group's shareable code"),
        ("game_id" = i64, Path, description = "The logged game's id"),
    ),
    request_body(content = DeleteGameBody, description = "Required only for protected groups"),
    responses(
        (status = 204, description = "Deleted"),
        (status = 404, description = "No matching group/game"),
    ),
    tag = "game-groups")]
pub async fn delete_group_game(
    State(state): State<AppState>,
    Path((code, game_id)): Path<(String, i64)>,
    body: Option<Json<DeleteGameBody>>,
) -> impl IntoResponse {
    let write_passphrase = body.and_then(|Json(body)| body.write_passphrase);
    let app_db = state.app_db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<bool, GameGroupError> {
        let conn = game_groups::open(&app_db)?;
        game_groups::delete_game(
            &conn,
            &DeleteGameParams {
                code,
                write_passphrase,
                game_id,
            },
        )
    })
    .await;

    match result {
        Ok(Ok(true)) => StatusCode::NO_CONTENT.into_response(),
        Ok(Ok(false)) => (StatusCode::NOT_FOUND, "game not found").into_response(),
        Ok(Err(error)) => game_group_error_response(error),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

#[utoipa::path(put, path = "/api/v1/groups/{code}/games/{game_id}",
    params(
        ("code" = String, Path, description = "The group's shareable code"),
        ("game_id" = i64, Path, description = "The logged game's id"),
    ),
    request_body = LogGameBody,
    responses(
        (status = 200, description = "The updated game", body = game_groups::GameRecord),
        (status = 404, description = "No matching group/game"),
    ),
    tag = "game-groups")]
pub async fn update_group_game(
    State(state): State<AppState>,
    Path((code, game_id)): Path<(String, i64)>,
    Json(body): Json<LogGameBody>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        game_groups::update_game(
            conn,
            &UpdateGameParams {
                code,
                write_passphrase: body.write_passphrase,
                game_id,
                played_at: body.played_at,
                notes: body.notes,
                results: body.results,
            },
        )
    })
    .await
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct DeleteGameBody {
    #[serde(default)]
    pub write_passphrase: Option<String>,
}

fn game_group_error_response(error: GameGroupError) -> axum::response::Response {
    match error {
        GameGroupError::EmptyResults | GameGroupError::PassphraseTooShort => {
            (StatusCode::BAD_REQUEST, error.to_string()).into_response()
        }
        GameGroupError::WriteAccessDenied => {
            (StatusCode::FORBIDDEN, error.to_string()).into_response()
        }
        GameGroupError::CodeGenerationFailed
        | GameGroupError::PasswordHash
        | GameGroupError::Sqlite(_) => {
            (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response()
        }
    }
}

async fn run_app<T, F>(state: AppState, f: F) -> axum::response::Response
where
    T: serde::Serialize + Send + 'static,
    F: FnOnce(&rusqlite::Connection) -> Result<T, GameGroupError> + Send + 'static,
{
    let app_db = state.app_db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<T, GameGroupError> {
        let conn = game_groups::open(&app_db)?;
        f(&conn)
    })
    .await;

    match result {
        Ok(Ok(value)) => Json(value).into_response(),
        Ok(Err(error)) => game_group_error_response(error),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

async fn run_app_optional<T, F>(state: AppState, f: F) -> axum::response::Response
where
    T: serde::Serialize + Send + 'static,
    F: FnOnce(&rusqlite::Connection) -> Result<Option<T>, GameGroupError> + Send + 'static,
{
    let app_db = state.app_db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<Option<T>, GameGroupError> {
        let conn = game_groups::open(&app_db)?;
        f(&conn)
    })
    .await;

    match result {
        Ok(Ok(Some(value))) => Json(value).into_response(),
        Ok(Ok(None)) => (StatusCode::NOT_FOUND, "group not found").into_response(),
        Ok(Err(error)) => game_group_error_response(error),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

// ---------------------------------------------------------------------------
// Passkey accounts (docs/adr/0019, docs/accounts-plan.md milestone A1)
//
// Browser-only by design: a WebAuthn ceremony needs a browser-resident
// authenticator, so these have no MCP mirror. The authenticated *data*
// capabilities arrive on both surfaces in A5 via bearer tokens.
// ---------------------------------------------------------------------------

/// `__Host-` requires Secure + Path=/ + no Domain, which pins the cookie to
/// exactly this origin — the strongest cookie scoping available. Strictly
/// necessary for a login the user asked for, so no consent banner (ADR 0019 § 6).
const SESSION_COOKIE: &str = "__Host-schrecknet_session";
const SESSION_MAX_AGE_SECONDS: i64 = 30 * 24 * 60 * 60;

fn session_cookie(token: &str) -> String {
    format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={SESSION_MAX_AGE_SECONDS}"
    )
}

fn cleared_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")
}

fn session_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find(|(name, _)| *name == SESSION_COOKIE)
        .map(|(_, value)| value.to_owned())
}

/// Attaches `Set-Cookie` to an already-built JSON response.
fn with_cookie(mut response: axum::response::Response, cookie: &str) -> axum::response::Response {
    match HeaderValue::from_str(cookie) {
        Ok(value) => {
            response.headers_mut().insert(header::SET_COOKIE, value);
            response
        }
        // Unreachable: every byte we put in a cookie is hex or fixed ASCII.
        // Failing closed beats emitting a session the browser never stores.
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "could not issue session").into_response(),
    }
}

/// Note on `UnknownUser`: this distinguishes "no such display name" from other
/// failures, i.e. display names are enumerable. Accepted — a display name here
/// is a username, not an email address, and WebAuthn's non-discoverable flow has
/// to name the credentials it is offering anyway.
fn account_error_response(error: AccountError) -> axum::response::Response {
    let status = match error {
        AccountError::DisplayNameInvalid
        | AccountError::UnknownCeremony
        | AccountError::NoCredentials
        | AccountError::LastPasskey => StatusCode::BAD_REQUEST,
        AccountError::DisplayNameTaken => StatusCode::CONFLICT,
        AccountError::UnknownUser | AccountError::UnknownCredential => StatusCode::NOT_FOUND,
        AccountError::CredentialRejected
        | AccountError::NotAuthenticated
        | AccountError::RecoveryCodeRejected => StatusCode::UNAUTHORIZED,
        AccountError::TooManyAttempts => StatusCode::TOO_MANY_REQUESTS,
        AccountError::Sqlite(_) | AccountError::PasswordHash | AccountError::Serialization => {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    };
    (status, error.to_string()).into_response()
}

/// Runs `f` against `app.sqlite` on the blocking pool with the accounts service
/// in hand — the account equivalent of `run_app`.
async fn run_account<T, F>(state: AppState, f: F) -> Result<T, axum::response::Response>
where
    T: Send + 'static,
    F: FnOnce(&rusqlite::Connection, &accounts::AccountsService) -> Result<T, AccountError>
        + Send
        + 'static,
{
    let app_db = state.app_db.clone();
    let service = Arc::clone(&state.accounts);
    let joined = tokio::task::spawn_blocking(move || -> Result<T, AccountError> {
        let conn = game_groups::open(&app_db)?;
        f(&conn, &service)
    })
    .await;

    match joined {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(error)) => Err(account_error_response(error)),
        Err(error) => Err((StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response()),
    }
}

#[utoipa::path(post, path = "/api/v1/account/register/start", request_body = RegisterStartParams,
    responses(
        (status = 200, description = "WebAuthn creation challenge", body = accounts::CeremonyChallenge),
        (status = 409, description = "Display name already taken", body = String),
    ),
    tag = "account")]
pub async fn account_register_start(
    State(state): State<AppState>,
    Json(params): Json<RegisterStartParams>,
) -> impl IntoResponse {
    match run_account(state, move |conn, service| {
        accounts::register_start(conn, service, &params)
    })
    .await
    {
        Ok(challenge) => Json(challenge).into_response(),
        Err(response) => response,
    }
}

#[utoipa::path(post, path = "/api/v1/account/register/finish", request_body = RegisterFinishParams,
    responses(
        (status = 200, description = "Account created; recovery code returned once", body = accounts::RegisterFinishResult),
        (status = 401, description = "Passkey verification failed", body = String),
    ),
    tag = "account")]
pub async fn account_register_finish(
    State(state): State<AppState>,
    Json(params): Json<RegisterFinishParams>,
) -> impl IntoResponse {
    match run_account(state, move |conn, service| {
        accounts::register_finish(conn, service, &params)
    })
    .await
    {
        Ok(result) => {
            let cookie = session_cookie(&result.session_token);
            with_cookie(Json(result).into_response(), &cookie)
        }
        Err(response) => response,
    }
}

#[utoipa::path(post, path = "/api/v1/account/login/start", request_body = LoginStartParams,
    responses(
        (status = 200, description = "WebAuthn request challenge", body = accounts::CeremonyChallenge),
        (status = 404, description = "No account with that display name", body = String),
    ),
    tag = "account")]
pub async fn account_login_start(
    State(state): State<AppState>,
    Json(params): Json<LoginStartParams>,
) -> impl IntoResponse {
    match run_account(state, move |conn, service| {
        accounts::login_start(conn, service, &params)
    })
    .await
    {
        Ok(challenge) => Json(challenge).into_response(),
        Err(response) => response,
    }
}

#[utoipa::path(post, path = "/api/v1/account/login/finish", request_body = LoginFinishParams,
    responses(
        (status = 200, description = "Signed in; session cookie set", body = accounts::AccountInfo),
        (status = 401, description = "Passkey verification failed", body = String),
    ),
    tag = "account")]
pub async fn account_login_finish(
    State(state): State<AppState>,
    Json(params): Json<LoginFinishParams>,
) -> impl IntoResponse {
    match run_account(state, move |conn, service| {
        let token = accounts::login_finish(conn, service, &params)?;
        let user_id =
            accounts::session_user(conn, &token)?.ok_or(AccountError::NotAuthenticated)?;
        Ok((accounts::account_info(conn, user_id)?, token))
    })
    .await
    {
        Ok((info, token)) => {
            let cookie = session_cookie(&token);
            with_cookie(Json(info).into_response(), &cookie)
        }
        Err(response) => response,
    }
}

#[utoipa::path(post, path = "/api/v1/account/logout",
    responses((status = 204, description = "Signed out; session cookie cleared")),
    tag = "account")]
pub async fn account_logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    // Clearing the cookie is unconditional: a caller with no (or an unknown)
    // session still ends up signed out, which is the only outcome they wanted.
    if let Some(token) = session_token(&headers) {
        if let Err(response) =
            run_account(state, move |conn, _| accounts::logout(conn, &token)).await
        {
            return response;
        }
    }
    with_cookie(
        StatusCode::NO_CONTENT.into_response(),
        &cleared_session_cookie(),
    )
}

#[utoipa::path(get, path = "/api/v1/account",
    responses(
        (status = 200, description = "The signed-in account", body = accounts::AccountInfo),
        (status = 401, description = "Not signed in", body = String),
    ),
    tag = "account")]
pub async fn get_account(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let Some(token) = session_token(&headers) else {
        return account_error_response(AccountError::NotAuthenticated);
    };
    match run_account(state, move |conn, _| {
        let user_id =
            accounts::session_user(conn, &token)?.ok_or(AccountError::NotAuthenticated)?;
        accounts::account_info(conn, user_id)
    })
    .await
    {
        Ok(info) => Json(info).into_response(),
        Err(response) => response,
    }
}

/// Resolves the session cookie to a user id inside the blocking closure, so
/// callers get `user_id` without each one repeating the lookup.
async fn with_session<T, F>(
    state: AppState,
    headers: &HeaderMap,
    f: F,
) -> Result<T, axum::response::Response>
where
    T: Send + 'static,
    F: FnOnce(&rusqlite::Connection, &accounts::AccountsService, i64) -> Result<T, AccountError>
        + Send
        + 'static,
{
    let Some(token) = session_token(headers) else {
        return Err(account_error_response(AccountError::NotAuthenticated));
    };
    run_account(state, move |conn, service| {
        let user_id =
            accounts::session_user(conn, &token)?.ok_or(AccountError::NotAuthenticated)?;
        f(conn, service, user_id)
    })
    .await
}

#[utoipa::path(post, path = "/api/v1/account/recover/start", request_body = RecoverStartParams,
    responses(
        (status = 200, description = "Recovery code accepted; register a replacement passkey", body = accounts::CeremonyChallenge),
        (status = 401, description = "Recovery code rejected", body = String),
        (status = 429, description = "Too many attempts", body = String),
    ),
    tag = "account")]
pub async fn account_recover_start(
    State(state): State<AppState>,
    Json(params): Json<RecoverStartParams>,
) -> impl IntoResponse {
    match run_account(state, move |conn, service| {
        accounts::recover_start(conn, service, &params)
    })
    .await
    {
        Ok(challenge) => Json(challenge).into_response(),
        Err(response) => response,
    }
}

#[utoipa::path(post, path = "/api/v1/account/passkeys/start",
    responses(
        (status = 200, description = "Register an additional passkey for the signed-in account", body = accounts::CeremonyChallenge),
        (status = 401, description = "Not signed in", body = String),
    ),
    tag = "account")]
pub async fn account_add_passkey_start(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    match with_session(state, &headers, |conn, service, user_id| {
        accounts::add_passkey_start(conn, service, user_id)
    })
    .await
    {
        Ok(challenge) => Json(challenge).into_response(),
        Err(response) => response,
    }
}

/// Completes **either** add-passkey path — recovery or signed-in. No session is
/// required and none is checked here: the ceremony stored server-side already
/// records which account it belongs to and how it was authorised, so trusting a
/// client-supplied hint would be strictly weaker.
#[utoipa::path(post, path = "/api/v1/account/passkeys/finish", request_body = AddPasskeyFinishParams,
    responses(
        (status = 200, description = "Passkey added; a rotated recovery code is returned if one was redeemed", body = accounts::AddPasskeyResult),
        (status = 401, description = "Passkey verification failed", body = String),
    ),
    tag = "account")]
pub async fn account_add_passkey_finish(
    State(state): State<AppState>,
    Json(params): Json<AddPasskeyFinishParams>,
) -> impl IntoResponse {
    match run_account(state, move |conn, service| {
        accounts::add_passkey_finish(conn, service, &params)
    })
    .await
    {
        Ok(result) => {
            let cookie = session_cookie(&result.session_token);
            with_cookie(Json(result).into_response(), &cookie)
        }
        Err(response) => response,
    }
}

#[utoipa::path(get, path = "/api/v1/account/passkeys",
    responses(
        (status = 200, description = "Passkeys registered on this account", body = Vec<accounts::CredentialSummary>),
        (status = 401, description = "Not signed in", body = String),
    ),
    tag = "account")]
pub async fn account_list_passkeys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    match with_session(state, &headers, |conn, _, user_id| {
        accounts::list_credentials(conn, user_id)
    })
    .await
    {
        Ok(credentials) => Json(credentials).into_response(),
        Err(response) => response,
    }
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct RenamePasskeyBody {
    #[serde(default)]
    pub nickname: Option<String>,
}

#[utoipa::path(put, path = "/api/v1/account/passkeys/{id}",
    params(("id" = i64, Path, description = "Passkey row id, as returned by the list endpoint")),
    request_body = RenamePasskeyBody,
    responses(
        (status = 204, description = "Renamed"),
        (status = 404, description = "No such passkey on this account", body = String),
    ),
    tag = "account")]
pub async fn account_rename_passkey(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(body): Json<RenamePasskeyBody>,
) -> impl IntoResponse {
    match with_session(state, &headers, move |conn, _, user_id| {
        accounts::rename_credential(conn, user_id, id, body.nickname.as_deref())
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(response) => response,
    }
}

#[utoipa::path(delete, path = "/api/v1/account/passkeys/{id}",
    params(("id" = i64, Path, description = "Passkey row id, as returned by the list endpoint")),
    responses(
        (status = 204, description = "Removed"),
        (status = 400, description = "Refused: this is the account's only passkey", body = String),
        (status = 404, description = "No such passkey on this account", body = String),
    ),
    tag = "account")]
pub async fn account_remove_passkey(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match with_session(state, &headers, move |conn, _, user_id| {
        accounts::remove_credential(conn, user_id, id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(response) => response,
    }
}

// ---------------------------------------------------------------------------
// Sync (docs/adr/0019, docs/accounts-plan.md milestone A3)
//
// Both a session cookie and a bearer token are accepted here — the one place
// both credential types work, per docs/accounts-plan.md § 3. Everything else
// account-management stays session-only via `with_session`.
// ---------------------------------------------------------------------------

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::to_owned)
}

fn sync_error_response(error: SyncError) -> axum::response::Response {
    match error {
        SyncError::NotFound => (StatusCode::NOT_FOUND, "no synced data yet").into_response(),
        SyncError::TooLarge => (StatusCode::PAYLOAD_TOO_LARGE, error.to_string()).into_response(),
        SyncError::Conflict { current } => (StatusCode::CONFLICT, Json(current)).into_response(),
        SyncError::Sqlite(_) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

/// Resolves the caller from either credential type, then runs `f` on the
/// blocking pool. Sync-specific because it's the one place both are accepted;
/// account-management handlers use `with_session` instead.
enum CallerOrSyncError {
    Unauthenticated,
    Sync(SyncError),
}

impl From<rusqlite::Error> for CallerOrSyncError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sync(SyncError::from(error))
    }
}

async fn with_caller<T, F>(
    state: AppState,
    headers: &HeaderMap,
    f: F,
) -> Result<T, axum::response::Response>
where
    T: Send + 'static,
    F: FnOnce(&rusqlite::Connection, i64) -> Result<T, SyncError> + Send + 'static,
{
    let session = session_token(headers);
    let bearer = bearer_token(headers);
    let app_db = state.app_db.clone();
    let joined = tokio::task::spawn_blocking(move || -> Result<T, CallerOrSyncError> {
        let conn = game_groups::open(&app_db)?;
        let caller = accounts::authenticate(&conn, session.as_deref(), bearer.as_deref())
            .map_err(|_| CallerOrSyncError::Unauthenticated)?;
        f(&conn, caller.user_id()).map_err(CallerOrSyncError::Sync)
    })
    .await;

    match joined {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(CallerOrSyncError::Unauthenticated)) => {
            Err(account_error_response(AccountError::NotAuthenticated))
        }
        Ok(Err(CallerOrSyncError::Sync(error))) => Err(sync_error_response(error)),
        Err(error) => Err((StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response()),
    }
}

#[utoipa::path(get, path = "/api/v1/account/sync",
    responses(
        (status = 200, description = "The current encrypted sync blob", body = sync::SyncBlob),
        (status = 401, description = "Not signed in", body = String),
        (status = 404, description = "No synced data yet", body = String),
    ),
    tag = "account")]
pub async fn get_sync_blob(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    match with_caller(state, &headers, |conn, user_id| sync::get_blob(conn, user_id)).await {
        Ok(blob) => Json(blob).into_response(),
        Err(response) => response,
    }
}

#[utoipa::path(put, path = "/api/v1/account/sync", request_body = PutSyncBlobParams,
    responses(
        (status = 200, description = "Stored; the new blob (with its new version)", body = sync::SyncBlob),
        (status = 401, description = "Not signed in", body = String),
        (status = 409, description = "Version conflict — another device pushed first; body is the current blob", body = sync::SyncBlob),
        (status = 413, description = "Ciphertext too large", body = String),
    ),
    tag = "account")]
pub async fn put_sync_blob(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(params): Json<PutSyncBlobParams>,
) -> impl IntoResponse {
    match with_caller(state, &headers, move |conn, user_id| {
        sync::put_blob(conn, user_id, &params)
    })
    .await
    {
        Ok(blob) => Json(blob).into_response(),
        Err(response) => response,
    }
}

// ---------------------------------------------------------------------------
// API tokens (milestone A5) — session-only to create/list/revoke, matching
// docs/accounts-plan.md § 3: a token cannot mint or revoke other tokens.
// ---------------------------------------------------------------------------

#[utoipa::path(post, path = "/api/v1/account/tokens", request_body = CreateApiTokenParams,
    responses(
        (status = 200, description = "The new token — shown once, only its hash is stored", body = accounts::NewApiToken),
        (status = 401, description = "Not signed in", body = String),
    ),
    tag = "account")]
pub async fn account_create_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(params): Json<CreateApiTokenParams>,
) -> impl IntoResponse {
    match with_session(state, &headers, move |conn, _, user_id| {
        accounts::create_api_token(conn, user_id, &params)
    })
    .await
    {
        Ok(token) => Json(token).into_response(),
        Err(response) => response,
    }
}

#[utoipa::path(get, path = "/api/v1/account/tokens",
    responses(
        (status = 200, description = "API tokens on this account (never the token values themselves)", body = Vec<accounts::ApiTokenSummary>),
        (status = 401, description = "Not signed in", body = String),
    ),
    tag = "account")]
pub async fn account_list_tokens(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    match with_session(state, &headers, |conn, _, user_id| {
        accounts::list_api_tokens(conn, user_id)
    })
    .await
    {
        Ok(tokens) => Json(tokens).into_response(),
        Err(response) => response,
    }
}

#[utoipa::path(delete, path = "/api/v1/account/tokens/{id}",
    params(("id" = i64, Path, description = "Token id, as returned by the list endpoint")),
    responses(
        (status = 204, description = "Revoked"),
        (status = 401, description = "Not signed in", body = String),
        (status = 404, description = "No such token on this account", body = String),
    ),
    tag = "account")]
pub async fn account_revoke_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match with_session(state, &headers, move |conn, _, user_id| {
        accounts::revoke_api_token(conn, user_id, id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(response) => response,
    }
}

// ---------------------------------------------------------------------------
// Account deletion (milestone A6) — session-only, no MCP mirror. A hard
// delete a bearer token could trigger would be exactly the kind of
// irreversible action a leaked token must not be able to do.
// ---------------------------------------------------------------------------

#[utoipa::path(delete, path = "/api/v1/account",
    responses(
        (status = 204, description = "Account and all its data (passkeys, sessions, tokens, sync blob) permanently deleted"),
        (status = 401, description = "Not signed in", body = String),
    ),
    tag = "account")]
pub async fn delete_account(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    match with_session(state, &headers, |conn, _, user_id| {
        conn.execute("DELETE FROM users WHERE id = ?1", [user_id])?;
        Ok::<(), AccountError>(())
    })
    .await
    {
        Ok(()) => with_cookie(StatusCode::NO_CONTENT.into_response(), &cleared_session_cookie()),
        Err(response) => response,
    }
}
