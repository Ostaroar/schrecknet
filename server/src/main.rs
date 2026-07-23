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

use axum::http::{header, HeaderValue};
use axum::{routing::delete, routing::get, routing::post, Json, Router};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::StreamableHttpService;
use rmcp::ServiceExt;
use tower::ServiceBuilder;
use tower_http::compression::CompressionLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

/// Vite's build output under `/assets` is content-hashed (a filename never
/// changes meaning), so it's safe to tell browsers/CDNs to cache it forever —
/// a repeat visit re-fetches nothing until the next deploy changes the hash.
/// `/data` and `/models/semantic` are versioned the same way (ADR 0004; see
/// docs/data.md) but that comment predates any header actually enforcing it.
fn immutable_cache_layer() -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::overriding(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    )
}

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
        .route("/api/v1/precons/cards", get(api::get_precon_card_counts))
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
        // Build-time-prerendered precons index (§ 4.4/S4) — same fallback story.
        .route("/precons", get(api::get_prerendered_precons))
        .route("/rules", get(api::get_prerendered_rules))
        .route("/help", get(api::get_prerendered_help))
        .route("/about", get(api::get_prerendered_about))
        .route("/changelog", get(api::get_prerendered_changelog))
        .with_state(state)
        // Vite's hashed build output — safe to cache forever (see
        // immutable_cache_layer's doc comment).
        .nest_service(
            "/assets",
            ServiceBuilder::new()
                .layer(immutable_cache_layer())
                .service(ServeDir::new(format!("{static_dir}/assets"))),
        )
        // cards.sqlite + cards.meta.json for the browser's sql.js loader
        // (docs/adr/0004); long cache since the DB is content-versioned.
        .nest_service(
            "/data",
            ServiceBuilder::new()
                .layer(immutable_cache_layer())
                .service(ServeDir::new(&data_dir)),
        )
        .nest_service("/mcp", mcp_service)
        .fallback_service(ServeDir::new(&static_dir).fallback(ServeFile::new(index)))
        // gzip/br/deflate negotiated per Accept-Encoding, applied to every
        // response added above (API JSON, HTML, JS/CSS/wasm alike) — the live
        // site was serving everything uncompressed until this landed.
        .layer(CompressionLayer::new())
        // /models/semantic is added AFTER the compression layer specifically
        // to exclude it: transformers.js reads the *uncompressed*
        // Content-Length response header to report "downloading N%" for the
        // ~46 MB semantic model, and a compressed response switches to
        // chunked transfer-encoding with no Content-Length at all, silently
        // breaking that progress readout. ONNX binaries barely compress
        // anyway, so nothing is actually lost by excluding them.
        .nest_service(
            "/models/semantic",
            ServiceBuilder::new()
                .layer(immutable_cache_layer())
                .service(ServeDir::new(&model_dir)),
        );

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
