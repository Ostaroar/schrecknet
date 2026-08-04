//! REST mirror of the MCP tools (AGENTS.md hard rule #2). Same `cards_db`
//! calls as `mcp.rs::search_crypt` — this is the thin HTTP adapter.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Json};

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
pub async fn get_twda_deck(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
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
