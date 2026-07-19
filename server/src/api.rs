//! REST mirror of the MCP tools (AGENTS.md hard rule #2). Same `cards_db`
//! calls as `mcp.rs::search_crypt` — this is the thin HTTP adapter.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};

use crate::card_detail::{self, GetCardByNameParams, GetCardParams};
use crate::cards_db::{self, CryptSearchParams, LibrarySearchParams};
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
