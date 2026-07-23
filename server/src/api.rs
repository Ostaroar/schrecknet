//! REST mirror of the MCP tools (AGENTS.md hard rule #2). Same `cards_db`
//! calls as `mcp.rs::search_crypt` — this is the thin HTTP adapter.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Json};

use crate::card_detail::{self, GetCardByNameParams, GetCardParams};
use crate::cards_db::{self, CryptSearchParams, LibrarySearchParams};
use crate::draw_hand::{self, DrawHandError, DrawHandParams};
use crate::game_groups::{
    self, CreateGroupParams, GameGroupError, GroupCodeParams, LogGameParams, PlayerResultInput,
};
use crate::semantic_search::{SemanticError, SemanticSearchParams};
use crate::AppState;

pub async fn search_crypt(
    State(state): State<AppState>,
    Query(params): Query<CryptSearchParams>,
) -> impl IntoResponse {
    run(state, move |conn| cards_db::search_crypt(conn, &params)).await
}

pub async fn search_library(
    State(state): State<AppState>,
    Query(params): Query<LibrarySearchParams>,
) -> impl IntoResponse {
    run(state, move |conn| cards_db::search_library(conn, &params)).await
}

pub async fn list_precons(State(state): State<AppState>) -> impl IntoResponse {
    run(state, cards_db::list_precons).await
}

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

/// Serves the build-time-prerendered static HTML for one card id at the same
/// real path the SPA itself navigates to (docs/seo-geo-aeo-plan.md § 4.3).
/// Falls back to the SPA shell for an id with no prerendered file — same
/// "not found" UX as before, just resolved client-side instead of a bare 404.
pub async fn get_prerendered_card(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let card_path = format!("{}/cards/{id}.html", state.static_dir);
    if let Ok(html) = tokio::fs::read_to_string(&card_path).await {
        return Html(html).into_response();
    }
    let index_path = format!("{}/index.html", state.static_dir);
    match tokio::fs::read_to_string(&index_path).await {
        Ok(html) => Html(html).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

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
#[derive(serde::Deserialize)]
pub struct LogGameBody {
    pub played_at: String,
    #[serde(default)]
    pub notes: Option<String>,
    pub results: Vec<PlayerResultInput>,
}

pub async fn create_game_group(
    State(state): State<AppState>,
    Json(params): Json<CreateGroupParams>,
) -> impl IntoResponse {
    run_app(state, move |conn| game_groups::create_group(conn, &params)).await
}

pub async fn get_game_group(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        Ok(game_groups::get_group(conn, &GroupCodeParams { code })?)
    })
    .await
}

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
                played_at: body.played_at,
                notes: body.notes,
                results: body.results,
            },
        )
    })
    .await
}

pub async fn list_group_games(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        Ok(game_groups::list_games(conn, &GroupCodeParams { code })?)
    })
    .await
}

pub async fn get_group_leaderboard(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    run_app_optional(state, move |conn| {
        Ok(game_groups::leaderboard(conn, &GroupCodeParams { code })?)
    })
    .await
}

fn game_group_error_response(error: GameGroupError) -> axum::response::Response {
    match error {
        GameGroupError::EmptyResults => {
            (StatusCode::BAD_REQUEST, error.to_string()).into_response()
        }
        GameGroupError::CodeGenerationFailed | GameGroupError::Sqlite(_) => {
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
