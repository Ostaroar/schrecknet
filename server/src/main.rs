//! SchreckNet server: static frontend + card-data hosting + REST + MCP.
//! REST (/api/v1) and MCP (/mcp) call the same `cards_db` service functions
//! (AGENTS.md hard rule #2) — neither surface ships a capability alone.

mod api;
mod card_detail;
mod cards_db;
mod mcp;

use axum::{routing::get, Json, Router};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::StreamableHttpService;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone)]
pub struct AppState {
    pub data_dir: String,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}

#[tokio::main]
async fn main() {
    let static_dir = env_or("SCHRECKNET_STATIC_DIR", "frontend/dist");
    let data_dir = env_or("SCHRECKNET_DATA_DIR", "dist");
    let bind = env_or("SCHRECKNET_BIND", "0.0.0.0:8000");
    let index = format!("{static_dir}/index.html");

    let state = AppState {
        data_dir: data_dir.clone(),
    };

    let mcp_data_dir = data_dir.clone();
    let mcp_service = StreamableHttpService::new(
        move || Ok(mcp::SchreckNetMcp::new(mcp_data_dir.clone())),
        LocalSessionManager::default().into(),
        Default::default(),
    );

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/api/v1/meta", get(meta))
        .route("/api/v1/crypt/search", get(api::search_crypt))
        .route("/api/v1/library/search", get(api::search_library))
        .route("/api/v1/cards/{id}", get(api::get_card))
        .with_state(state)
        // cards.sqlite + cards.meta.json for the browser's sql.js loader
        // (docs/adr/0004); long cache since the DB is content-versioned.
        .nest_service("/data", ServeDir::new(&data_dir))
        .nest_service("/mcp", mcp_service)
        .fallback_service(ServeDir::new(&static_dir).fallback(ServeFile::new(index)));

    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .expect("bind SCHRECKNET_BIND address");
    println!("schrecknet-server listening on http://{bind} (MCP at /mcp, REST at /api/v1)");
    axum::serve(listener, app).await.expect("server run");
}

async fn meta() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": "schrecknet",
        "version": env!("CARGO_PKG_VERSION"),
        "scope": "v5",
    }))
}
