//! SchreckNet server: static frontend + card-data hosting + REST + MCP.
//! REST (/api/v1) and MCP (/mcp) call the same `cards_db` service functions
//! (AGENTS.md hard rule #2) — neither surface ships a capability alone.

mod api;
mod card_detail;
mod cards_db;
mod draw_hand;
mod game_groups;
mod mcp;
mod semantic_search;
mod user_db;

use std::sync::Arc;

use axum::{routing::delete, routing::get, routing::post, Json, Router};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::StreamableHttpService;
use rmcp::ServiceExt;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone)]
pub struct AppState {
    pub data_dir: String,
    pub app_db: String,
    pub static_dir: String,
    pub semantic: Arc<semantic_search::SemanticSearchService>,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}

#[tokio::main]
async fn main() {
    let static_dir = env_or("SCHRECKNET_STATIC_DIR", "frontend/dist");
    let data_dir = env_or("SCHRECKNET_DATA_DIR", "dist");
    let model_dir = env_or(
        "SCHRECKNET_MODEL_DIR",
        &format!("{data_dir}/models/semantic"),
    );
    let app_db = env_or("SCHRECKNET_APP_DB", "dist/app.sqlite");
    let bind = env_or("SCHRECKNET_BIND", "0.0.0.0:8000");
    let index = format!("{static_dir}/index.html");

    let semantic = Arc::new(semantic_search::SemanticSearchService::new(
        model_dir.clone(),
    ));

    user_db::migrate(&app_db).expect("migrate app database");

    if std::env::args().any(|arg| arg == "--mcp-stdio") {
        mcp::SchreckNetMcp::new(data_dir, app_db, semantic)
            .serve(rmcp::transport::stdio())
            .await
            .expect("start MCP stdio transport")
            .waiting()
            .await
            .expect("run MCP stdio transport");
        return;
    }

    let state = AppState {
        data_dir: data_dir.clone(),
        app_db: app_db.clone(),
        static_dir: static_dir.clone(),
        semantic: Arc::clone(&semantic),
    };

    let mcp_data_dir = data_dir.clone();
    let mcp_app_db = app_db.clone();
    let mcp_semantic = Arc::clone(&semantic);
    let mcp_service = StreamableHttpService::new(
        move || {
            Ok(mcp::SchreckNetMcp::new(
                mcp_data_dir.clone(),
                mcp_app_db.clone(),
                Arc::clone(&mcp_semantic),
            ))
        },
        LocalSessionManager::default().into(),
        Default::default(),
    );

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/api/v1/meta", get(meta))
        .route("/api/v1/crypt/search", get(api::search_crypt))
        .route("/api/v1/library/search", get(api::search_library))
        .route("/api/v1/cards/semantic", post(api::semantic_search))
        .route("/api/v1/cards/lookup", get(api::get_card_by_name))
        .route("/api/v1/cards/{id}", get(api::get_card))
        .route("/api/v1/precons", get(api::list_precons))
        .route("/api/v1/decks/draw-hand", post(api::draw_hand))
        .route("/api/v1/groups", post(api::create_game_group))
        .route("/api/v1/groups/{code}", get(api::get_game_group))
        .route(
            "/api/v1/groups/{code}/games",
            get(api::list_group_games).post(api::log_group_game),
        )
        .route(
            "/api/v1/groups/{code}/leaderboard",
            get(api::get_group_leaderboard),
        )
        .route(
            "/api/v1/groups/{code}/games/{game_id}",
            delete(api::delete_group_game).put(api::update_group_game),
        )
        // Build-time-prerendered static card page (docs/seo-geo-aeo-plan.md
        // § 4.3, S3) — falls back to the SPA shell for an id with no
        // prerendered file (unknown id; the SPA's own "card not found" UI
        // takes it from there).
        .route("/cards/{id}", get(api::get_prerendered_card))
        .with_state(state)
        // cards.sqlite + cards.meta.json for the browser's sql.js loader
        // (docs/adr/0004); long cache since the DB is content-versioned.
        .nest_service("/data", ServeDir::new(&data_dir))
        .nest_service("/models/semantic", ServeDir::new(&model_dir))
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
