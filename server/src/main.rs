//! SchreckNet server. Phase 0: static frontend + health + meta endpoint.
//! REST (/api/v1) and MCP (/mcp) surfaces grow here via server/src/service/
//! adapters (AGENTS.md hard rule #2).

use axum::{routing::get, Json, Router};
use tower_http::services::{ServeDir, ServeFile};

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}

#[tokio::main]
async fn main() {
    let static_dir = env_or("SCHRECKNET_STATIC_DIR", "frontend/dist");
    let bind = env_or("SCHRECKNET_BIND", "0.0.0.0:8000");
    let index = format!("{static_dir}/index.html");

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/api/v1/meta", get(meta))
        .fallback_service(ServeDir::new(&static_dir).fallback(ServeFile::new(index)));

    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .expect("bind SCHRECKNET_BIND address");
    println!("schrecknet-server listening on http://{bind}");
    axum::serve(listener, app).await.expect("server run");
}

async fn meta() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": "schrecknet",
        "version": env!("CARGO_PKG_VERSION"),
        "scope": "v5",
    }))
}
