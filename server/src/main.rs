//! SchreckNet server: static frontend + card-data hosting + REST + MCP.
//! REST (/api/v1) and MCP (/mcp) call the same `cards_db` service functions
//! (AGENTS.md hard rule #2) — neither surface ships a capability alone.

mod api;
mod card_detail;
mod cards_db;
mod deck_tools;
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
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

/// One line per request (method, path, status, latency) to stderr — never
/// stdout, which `--mcp-stdio` mode uses for the JSON-RPC transport (docs/adr/
/// 0011-tracing-for-http-access-logs.md). `RUST_LOG` overrides the default
/// `info` level without a rebuild.
fn init_access_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_writer(std::io::stderr)
        .init();
}

/// Safe only where a filename changes whenever its content does, so a cached
/// copy can never be wrong.
const IMMUTABLE_CACHE_CONTROL: &str = "public, max-age=31536000, immutable";

/// Not "don't cache" — "revalidate before use", so an unchanged file still
/// costs only a 304.
const REVALIDATE_CACHE_CONTROL: &str = "no-cache";

/// The `Cache-Control` for a static mount. The distinction that matters is
/// whether the mount's *filenames* carry their version:
///
/// * `/assets` — Vite content-hashes every filename.
/// * `/models/semantic` — the path carries the pinned model hash
///   (e.g. `all-minilm-l6-v2-int8-751bff37`).
/// * `/data` — **stable** names (`cards.sqlite`, `cards.meta.json`) whose bytes
///   change on every data build, so `immutable` is simply untrue for them.
///
/// `/data` was briefly marked immutable and it caused a nasty bug: the browser
/// kept serving year-old `cards.sqlite` bytes from its HTTP cache while the
/// client had already read the *new* version number out of `cards.meta.json`,
/// stamped that new version onto the old data, and then reused it forever. The
/// only escape was clearing site data — which also destroys the user's decks
/// and inventory, since those live in OPFS. See docs/adr/0015.
fn cache_control_for_mount(mount: &str) -> &'static str {
    match mount {
        "/assets" | "/models/semantic" => IMMUTABLE_CACHE_CONTROL,
        _ => REVALIDATE_CACHE_CONTROL,
    }
}

fn cache_layer(mount: &str) -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::overriding(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control_for_mount(mount)),
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
    init_access_logging();

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
        .route("/api/v1/decks/validate", post(api::validate_deck))
        .route("/api/v1/decks/diff", post(api::diff_decks))
        .route("/api/v1/decks/import", post(api::import_deck))
        .route("/api/v1/decks/export", post(api::export_deck))
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
        // cache_control_for_mount's doc comment).
        .nest_service(
            "/assets",
            ServiceBuilder::new()
                .layer(cache_layer("/assets"))
                .service(ServeDir::new(format!("{static_dir}/assets"))),
        )
        // cards.sqlite + cards.meta.json for the browser's SQLite loader
        // (docs/adr/0004). Stable filenames, changing content — must
        // revalidate, never `immutable` (see cache_control_for_mount).
        .nest_service(
            "/data",
            ServiceBuilder::new()
                .layer(cache_layer("/data"))
                .service(ServeDir::new(&data_dir)),
        )
        .nest_service("/mcp", mcp_service)
        .fallback_service(ServeDir::new(&static_dir).fallback(ServeFile::new(index)))
        // Everything that has NOT opted into a policy above — the SPA shell,
        // the prerendered HTML routes, API JSON — must revalidate. Without
        // this those responses carried no `Cache-Control` at all, which does
        // not mean "don't cache": it lets browsers and intermediaries apply
        // *heuristic* freshness. index.html is the file that names every
        // hashed asset, so a heuristically cached copy pins a returning
        // visitor to a previous deploy's entire module graph — observed live,
        // where a browser kept booting the previous build's bundle for hours
        // after a deploy. Same failure class as the `/data` incident in
        // `cache_control_for_mount`'s doc comment (docs/adr/0015).
        //
        // `if_not_present`, so the deliberate policies above still win:
        // /assets and /models/semantic stay `immutable`, /data stays no-cache.
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            HeaderValue::from_static(REVALIDATE_CACHE_CONTROL),
        ))
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
                .layer(cache_layer("/models/semantic"))
                .service(ServeDir::new(&model_dir)),
        )
        // One line per request (method/path/status/latency) to stderr; see
        // init_access_logging's doc comment for why stderr, not stdout.
        // TraceLayer's own defaults log at DEBUG, below our "info" default
        // filter, so the span/response levels are bumped to INFO explicitly
        // — otherwise this silently logs nothing out of the box.
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard for the incident in `cache_control_for_mount`'s doc
    /// comment: `/data` serves stable filenames whose bytes change on every
    /// data build, so marking it `immutable` strands clients on stale card
    /// data with no escape short of clearing site data (which destroys the
    /// user's decks and inventory).
    #[test]
    fn data_mount_is_never_immutable() {
        assert_eq!(cache_control_for_mount("/data"), REVALIDATE_CACHE_CONTROL);
        assert!(!cache_control_for_mount("/data").contains("immutable"));
    }

    #[test]
    fn content_addressed_mounts_are_immutable() {
        for mount in ["/assets", "/models/semantic"] {
            assert_eq!(
                cache_control_for_mount(mount),
                IMMUTABLE_CACHE_CONTROL,
                "{mount} filenames carry their version, so it should cache forever"
            );
        }
    }

    /// Anything not explicitly known to be content-addressed must fall back to
    /// revalidation — the safe default. A new mount added without thinking
    /// about caching should be merely slower, never wrong.
    #[test]
    fn unknown_mounts_default_to_revalidating() {
        assert_eq!(
            cache_control_for_mount("/something-new"),
            REVALIDATE_CACHE_CONTROL
        );
    }

    #[test]
    fn cache_control_values_are_valid_header_values() {
        // from_static panics on an invalid header value; cache_layer would
        // then panic at startup rather than at test time.
        for mount in ["/assets", "/data", "/models/semantic"] {
            let _ = cache_layer(mount);
        }
    }
}
