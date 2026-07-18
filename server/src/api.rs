//! REST mirror of the MCP tools (AGENTS.md hard rule #2). Same `cards_db`
//! calls as `mcp.rs::search_crypt` — this is the thin HTTP adapter.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};

use crate::cards_db::{self, CryptSearchParams};
use crate::AppState;

pub async fn search_crypt(
    State(state): State<AppState>,
    Query(params): Query<CryptSearchParams>,
) -> impl IntoResponse {
    let data_dir = state.data_dir.clone();
    let result = tokio::task::spawn_blocking(move || -> rusqlite::Result<_> {
        let conn = cards_db::open(&data_dir)?;
        cards_db::search_crypt(&conn, &params)
    })
    .await;

    match result {
        Ok(Ok(cards)) => Json(cards).into_response(),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
