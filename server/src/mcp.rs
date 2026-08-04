//! MCP server: the primary machine API (docs/api.md, ADR 0003). Tools call
//! the exact same `cards_db` functions the REST mirror uses in `api.rs` —
//! AGENTS.md hard rule #2, both or neither.

use std::sync::Arc;

use rmcp::handler::server::tool::Extension;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    ListResourceTemplatesResult, ListResourcesResult, PaginatedRequestParams,
    ReadResourceRequestParams, ReadResourceResult, Resource, ResourceContents, ResourceTemplate,
    ServerCapabilities, ServerInfo,
};
use rmcp::service::RequestContext;
use rmcp::{tool, tool_handler, tool_router, RoleServer, ServerHandler};

use crate::accounts::{self, AccountError, RevokeApiTokenParams};
use crate::card_detail::{self, GetCardByNameParams, GetCardParams};
use crate::cards_db::{self, CryptSearchParams, LibrarySearchParams};
use crate::deck_tools::{
    self, DiffDecksParams, ExportDeckParams, ImportDeckParams, ValidateDeckParams,
};
use crate::draw_hand::{self, DrawHandError, DrawHandParams};
use crate::game_groups::{
    self, CreateGroupParams, DeleteGameParams, GameGroupError, GroupCodeParams, LogGameParams,
    UpdateGameParams,
};
use crate::semantic_search::{SemanticError, SemanticSearchParams, SemanticSearchService};
use crate::sync::{self, PutSyncBlobParams};
use crate::twda_db::{self, TwdaDeckParams, TwdaSearchParams};

#[derive(Clone)]
pub struct SchreckNetMcp {
    data_dir: Arc<String>,
    app_db: Arc<String>,
    semantic: Arc<SemanticSearchService>,
    // Read by the #[tool_handler]-generated ServerHandler::call_tool/list_tools
    // impl below, which rustc's dead_code pass doesn't trace through the macro.
    #[allow(dead_code)]
    tool_router: rmcp::handler::server::router::tool::ToolRouter<Self>,
}

#[tool_router]
impl SchreckNetMcp {
    pub fn new(data_dir: String, app_db: String, semantic: Arc<SemanticSearchService>) -> Self {
        Self {
            data_dir: Arc::new(data_dir),
            app_db: Arc::new(app_db),
            semantic,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Search VTES V5 crypt (vampire) cards by text, clan, sects, title, vote \
        threshold, traits, groups, capacity, independently leveled discipline requirements, \
        VDB-style OR-discipline rows, V5 set/printing history, and exact multi-precon selection \
        with Any/Only/First/Reprint modes. Supports explicit VDB-compatible \
        capacity_desc, capacity_asc, clan, group, name, and sect sort modes; results include the \
        primary card image URL when available."
    )]
    async fn search_crypt(
        &self,
        Parameters(params): Parameters<CryptSearchParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(cards_db::search_crypt(&conn, &params))
    }

    #[tool(
        description = "Search VTES V5 library cards by text, type, discipline requirements \
        (all/any/none/only, including no requirement), clan, sect, title, traits, \
        vampire-capacity requirements, costs, V5 set/printing history, and exact multi-precon \
        selection with Any/Only/First/Reprint modes. Supports explicit \
        VDB-compatible requirement, cost_desc, cost_asc, name, and type sort modes; results \
        include the primary card image URL when available."
    )]
    async fn search_library(
        &self,
        Parameters(params): Parameters<LibrarySearchParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(cards_db::search_library(&conn, &params))
    }

    #[tool(
        description = "Semantically search canonical English VTES V5 card documents by concept, \
        optionally restricted to crypt/library and the same structured filters as exact search. \
        Runs locally with the pinned offline model and returns cosine-ranked card summaries."
    )]
    async fn semantic_search(
        &self,
        Parameters(params): Parameters<SemanticSearchParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let data_dir = Arc::clone(&self.data_dir);
        let semantic = Arc::clone(&self.semantic);
        let result = tokio::task::spawn_blocking(move || {
            let conn = cards_db::open(&data_dir)
                .map_err(|error| SemanticError::Data(error.to_string()))?;
            semantic.search(&conn, &params)
        })
        .await
        .map_err(|error| rmcp::ErrorData::internal_error(error.to_string(), None))?;
        match result {
            Ok(hits) => json_value(&hits),
            Err(SemanticError::InvalidRequest(message)) => {
                Err(rmcp::ErrorData::invalid_params(message, None))
            }
            Err(error) => Err(rmcp::ErrorData::internal_error(error.to_string(), None)),
        }
    }

    #[tool(
        description = "Get full detail for one VTES V5 card by id (as returned by search_crypt/ \
        search_library): text, disciplines, printings, artists, rulings, and translations."
    )]
    async fn get_card(
        &self,
        Parameters(params): Parameters<GetCardParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(card_detail::get_card(&conn, &params))
    }

    #[tool(
        description = "Get full detail for one VTES V5 card by exact name (case-insensitive; \
        accepts canonical or ASCII-folded spelling). Returns null when no V5 card matches."
    )]
    async fn get_card_by_name(
        &self,
        Parameters(params): Parameters<GetCardByNameParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(card_detail::get_card_by_name(&conn, &params))
    }

    #[tool(
        description = "List every official V5 precon (starter deck), grouped by set, with the \
        count of distinct cards known to belong to it. Use search_crypt/search_library with \
        matching `set`+`precon` to browse a precon's actual cards, or get_precon_card_counts for \
        real per-card copy counts within one physical copy of it."
    )]
    async fn list_precons(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(cards_db::list_precons(&conn))
    }

    #[tool(
        description = "Get real per-card copy counts for one physical copy of a precon (set + \
        precon exact, as returned by list_precons) — how many of each card the actual product \
        contains, not just which cards it contains. Some V5 precon crypts do ship a vampire \
        twice."
    )]
    async fn get_precon_card_counts(
        &self,
        Parameters(params): Parameters<cards_db::PreconCardCountsParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(cards_db::precon_card_counts(&conn, &params))
    }

    #[tool(
        description = "Draw a reproducible VTES opening hand from card ids and quantities: four \
        cards for crypt or seven for library. Supply the returned decimal seed to replay a draw."
    )]
    async fn draw_hand(
        &self,
        Parameters(params): Parameters<DrawHandParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        match draw_hand::draw_hand(&params) {
            Ok(result) => json_value(&result),
            Err(DrawHandError::InvalidSeed) => Err(rmcp::ErrorData::invalid_params(
                "seed must be an unsigned 64-bit decimal string",
                None,
            )),
            Err(error) => Err(rmcp::ErrorData::invalid_params(error.to_string(), None)),
        }
    }

    #[tool(
        description = "Validate a deck's V5 construction legality: crypt/library size bounds and \
        the group rule (crypt vampires must span at most 2 consecutive groups). Card-pool legality \
        is not checked here — only counts and groups."
    )]
    async fn validate_deck(
        &self,
        Parameters(params): Parameters<ValidateDeckParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(deck_tools::validate_deck(&conn, &params))
    }

    #[tool(
        description = "Compare two decks card-by-card (crypt and library separately) and classify \
        each card id as only-in-A, only-in-B, changed quantity, or unchanged."
    )]
    async fn diff_decks(
        &self,
        Parameters(params): Parameters<DiffDecksParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        json_value(&deck_tools::diff_decks(&params))
    }

    #[tool(
        description = "Parse a Lackey/JOL-style plain-text deck list (\"<qty>x <name>\" per line) \
        into resolved card ids, split into crypt/library. Names that don't match any card are \
        returned separately as `unresolved` rather than dropped."
    )]
    async fn import_deck(
        &self,
        Parameters(params): Parameters<ImportDeckParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(deck_tools::import_deck(&conn, &params))
    }

    #[tool(
        description = "Format a deck's card ids and quantities as a Lackey/JOL-style plain-text \
        deck list with Crypt/Library section headers."
    )]
    async fn export_deck(
        &self,
        Parameters(params): Parameters<ExportDeckParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(deck_tools::export_deck(&conn, &params))
    }

    #[tool(
        description = "Search confirmed-V5 tournament-winning decks (TWDA, docs/adr/0018) by \
        player name, a card it contains, and/or a date range. Every returned deck has 100% of \
        its cards confirmed in the V5 pool — no partial or guessed matches. Results are newest \
        first, capped at `limit` (default 50, max 200)."
    )]
    async fn search_twda_decks(
        &self,
        Parameters(params): Parameters<TwdaSearchParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(twda_db::search_decks(&conn, &params))
    }

    #[tool(
        description = "Get one confirmed-V5 tournament-winning deck's full crypt/library \
        breakdown by its TWDA id (as returned by search_twda_decks). Returns null if the id \
        doesn't match any confirmed-V5 deck."
    )]
    async fn get_twda_deck(
        &self,
        Parameters(params): Parameters<TwdaDeckParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(twda_db::get_deck(&conn, &params))
    }

    /// Bearer-token auth for MCP — there is no cookie jar on this transport, so
    /// only API tokens work here, never sessions (docs/accounts-plan.md § 3).
    /// `Extension<Parts>` is rmcp's documented way to reach the incoming HTTP
    /// request from inside a tool handler.
    fn authenticated_user(&self, parts: &http::request::Parts) -> Result<i64, rmcp::ErrorData> {
        let token = parts
            .headers
            .get(http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or_else(|| rmcp::ErrorData::invalid_params("missing bearer token", None))?;
        let conn = self.open_app()?;
        accounts::api_token_user(&conn, token)
            .map_err(account_error)?
            .ok_or_else(|| rmcp::ErrorData::invalid_params("invalid or revoked token", None))
    }

    #[tool(
        description = "Get the signed-in account's display name, creation date, and passkey \
        count. Authenticate with an API token (Authorization: Bearer <token>), created at \
        /account in the browser — there is no MCP registration/login, since that needs a \
        browser-resident passkey authenticator."
    )]
    async fn get_account(
        &self,
        Extension(parts): Extension<http::request::Parts>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let user_id = self.authenticated_user(&parts)?;
        let conn = self.open_app()?;
        account_result(accounts::account_info(&conn, user_id), account_error)
    }

    #[tool(
        description = "Get the signed-in account's encrypted sync blob (docs/adr/0019). The \
        server cannot decrypt this — it is AES-GCM ciphertext encrypted in the browser. Returns \
        an error if nothing has been synced yet."
    )]
    async fn get_sync_blob(
        &self,
        Extension(parts): Extension<http::request::Parts>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let user_id = self.authenticated_user(&parts)?;
        let conn = self.open_app()?;
        account_result(sync::get_blob(&conn, user_id), sync_error)
    }

    #[tool(
        description = "Push an encrypted sync blob for the signed-in account. `expected_version` \
        must match the server's current version (omit only for the very first push), or this is \
        refused as a conflict — optimistic concurrency, so two devices can never silently \
        overwrite each other."
    )]
    async fn put_sync_blob(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(params): Parameters<PutSyncBlobParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let user_id = self.authenticated_user(&parts)?;
        let conn = self.open_app()?;
        account_result(sync::put_blob(&conn, user_id, &params), sync_error)
    }

    #[tool(
        description = "Revoke one of the signed-in account's own API tokens by id (as returned \
        by the account's token list in the browser). A token can revoke other tokens but not \
        itself-only actions like creating tokens, managing passkeys, or deleting the account — \
        those stay session-only (docs/accounts-plan.md § 3)."
    )]
    async fn revoke_api_token(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(params): Parameters<RevokeApiTokenParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let user_id = self.authenticated_user(&parts)?;
        let conn = self.open_app()?;
        account_result(accounts::revoke_api_token(&conn, user_id, params.id), account_error)
    }

    #[tool(
        description = "Create a private game group for tracking casual play with a group of \
        friends — no accounts, just a random shareable code and optional write passphrase. \
        Returns the group's code, name, creation time, and protection status. The code grants \
        read access; protected groups require `write_passphrase` for mutations."
    )]
    async fn create_game_group(
        &self,
        Parameters(params): Parameters<CreateGroupParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open_app()?;
        json_value(&game_groups::create_group(&conn, &params).map_err(game_group_error)?)
    }

    #[tool(
        description = "Look up a game group by its shareable code. Returns null if no group \
        has that code."
    )]
    async fn get_game_group(
        &self,
        Parameters(params): Parameters<GroupCodeParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open_app()?;
        json_value(&game_groups::get_group(&conn, &params).map_err(|e| game_group_error(e.into()))?)
    }

    #[tool(
        description = "Log a finished VTES game for a private game group: the date played, \
        optional notes, and one result per player (name, optional deck name, VP, and whether \
        they won). Protected groups require `write_passphrase`. Returns null if the group code \
        doesn't exist."
    )]
    async fn log_group_game(
        &self,
        Parameters(params): Parameters<LogGameParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open_app()?;
        json_value(&game_groups::log_game(&conn, &params).map_err(game_group_error)?)
    }

    #[tool(
        description = "Delete one logged game from a private game group by its id (as returned \
        by log_group_game/list_group_games). The game must belong to the group identified by \
        `code` — an id from a different group is refused. Returns true if deleted, false if the \
        code or game id didn't match anything. Protected groups require `write_passphrase`. \
        This cannot be undone."
    )]
    async fn delete_group_game(
        &self,
        Parameters(params): Parameters<DeleteGameParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open_app()?;
        json_value(&game_groups::delete_game(&conn, &params).map_err(game_group_error)?)
    }

    #[tool(
        description = "Replace one logged game's date, notes, ordered seating/results, deck names, \
        archetypes, VP, and game-win markers. The game must belong to the private group identified \
        by `code`. Protected groups require `write_passphrase`. Returns null if the code or game \
        id does not match."
    )]
    async fn update_group_game(
        &self,
        Parameters(params): Parameters<UpdateGameParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open_app()?;
        json_value(&game_groups::update_game(&conn, &params).map_err(game_group_error)?)
    }

    #[tool(
        description = "List every game logged for a private game group, newest first, with full \
        per-player results. Returns null if the group code doesn't exist."
    )]
    async fn list_group_games(
        &self,
        Parameters(params): Parameters<GroupCodeParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open_app()?;
        json_value(
            &game_groups::list_games(&conn, &params).map_err(|e| game_group_error(e.into()))?,
        )
    }

    #[tool(
        description = "Get the standing leaderboard for a private game group: games played, \
        total and average VP, wins, and win rate per player, ranked by wins then VP. Returns \
        null if the group code doesn't exist."
    )]
    async fn get_group_leaderboard(
        &self,
        Parameters(params): Parameters<GroupCodeParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open_app()?;
        json_value(
            &game_groups::leaderboard(&conn, &params).map_err(|e| game_group_error(e.into()))?,
        )
    }

    fn open(&self) -> Result<rusqlite::Connection, rmcp::ErrorData> {
        cards_db::open(&self.data_dir)
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))
    }

    fn open_app(&self) -> Result<rusqlite::Connection, rmcp::ErrorData> {
        game_groups::open(&self.app_db)
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))
    }
}

fn game_group_error(error: GameGroupError) -> rmcp::ErrorData {
    match error {
        GameGroupError::EmptyResults
        | GameGroupError::PassphraseTooShort
        | GameGroupError::WriteAccessDenied => {
            rmcp::ErrorData::invalid_params(error.to_string(), None)
        }
        GameGroupError::CodeGenerationFailed
        | GameGroupError::PasswordHash
        | GameGroupError::Sqlite(_) => rmcp::ErrorData::internal_error(error.to_string(), None),
    }
}

fn account_error(error: AccountError) -> rmcp::ErrorData {
    match error {
        AccountError::DisplayNameInvalid
        | AccountError::UnknownCeremony
        | AccountError::NoCredentials
        | AccountError::LastPasskey
        | AccountError::UnknownUser
        | AccountError::UnknownCredential
        | AccountError::CredentialRejected
        | AccountError::NotAuthenticated
        | AccountError::RecoveryCodeRejected
        | AccountError::TooManyAttempts
        | AccountError::DisplayNameTaken => rmcp::ErrorData::invalid_params(error.to_string(), None),
        AccountError::Sqlite(_) | AccountError::PasswordHash | AccountError::Serialization => {
            rmcp::ErrorData::internal_error(error.to_string(), None)
        }
    }
}

fn sync_error(error: crate::sync::SyncError) -> rmcp::ErrorData {
    match error {
        crate::sync::SyncError::NotFound => {
            rmcp::ErrorData::resource_not_found(error.to_string(), None)
        }
        crate::sync::SyncError::TooLarge | crate::sync::SyncError::Conflict { .. } => {
            rmcp::ErrorData::invalid_params(error.to_string(), None)
        }
        crate::sync::SyncError::Sqlite(_) => rmcp::ErrorData::internal_error(error.to_string(), None),
    }
}

/// Like `json_result`, for the account/sync service functions whose error
/// type is domain-specific rather than a bare `rusqlite::Error`.
fn account_result<T: serde::Serialize, E>(
    result: Result<T, E>,
    to_error: impl FnOnce(E) -> rmcp::ErrorData,
) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
    json_value(&result.map_err(to_error)?)
}

fn json_result<T: serde::Serialize>(
    result: rusqlite::Result<T>,
) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
    let value = result.map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
    json_value(&value)
}

fn json_value<T: serde::Serialize>(
    value: &T,
) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
    let json = serde_json::to_string(value)
        .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
    Ok(rmcp::model::CallToolResult::success(vec![
        rmcp::model::ContentBlock::text(json),
    ]))
}

fn card_id_from_uri(uri: &str) -> Option<i64> {
    let id = uri.strip_prefix("card://")?;
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    id.parse().ok()
}

fn json_resource<T: serde::Serialize>(
    uri: &str,
    value: &T,
) -> Result<ReadResourceResult, rmcp::ErrorData> {
    let json = serde_json::to_string(value)
        .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
    Ok(ReadResourceResult::new(vec![ResourceContents::text(
        json, uri,
    )
    .with_mime_type("application/json")]))
}

#[tool_handler]
impl ServerHandler for SchreckNetMcp {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.server_info =
            rmcp::model::Implementation::new("schrecknet", env!("CARGO_PKG_VERSION"))
                .with_title("SchreckNet — VTES V5 card search & deck building");
        info.capabilities = ServerCapabilities::builder()
            .enable_tools()
            .enable_resources()
            .build();
        info.instructions = Some(
            "SchreckNet hosts the V5 format of VTES exclusively; there is no classic-era \
             or tournament data. Use search_crypt/search_library for exact or regex \
             retrieval, and semantic_search for local English concept retrieval."
                .into(),
        );
        info
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, rmcp::ErrorData> {
        Ok(ListResourcesResult::with_all_items(vec![Resource::new(
            "db://cards/meta",
            "cards-meta",
        )
        .with_title("SchreckNet V5 card database metadata")
        .with_description("Schema/data versions, V5 card counts, source, and included products")
        .with_mime_type("application/json")]))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, rmcp::ErrorData> {
        Ok(ListResourceTemplatesResult::with_all_items(vec![
            ResourceTemplate::new("card://{id}", "v5-card")
                .with_title("VTES V5 card by id")
                .with_description("Full card text, printings, artists, rulings, and translations")
                .with_mime_type("application/json"),
        ]))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, rmcp::ErrorData> {
        if request.uri == "db://cards/meta" {
            let path = format!("{}/cards.meta.json", self.data_dir);
            let text = std::fs::read_to_string(path)
                .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
            let value: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
            return json_resource(&request.uri, &value);
        }

        let Some(id) = card_id_from_uri(&request.uri) else {
            return Err(rmcp::ErrorData::resource_not_found(
                format!("unknown resource: {}", request.uri),
                None,
            ));
        };
        let conn = self.open()?;
        let card = card_detail::get_card(&conn, &GetCardParams { id })
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?
            .ok_or_else(|| rmcp::ErrorData::resource_not_found("card not found", None))?;
        json_resource(&request.uri, &card)
    }
}

#[cfg(test)]
mod tests {
    use super::{card_id_from_uri, SchreckNetMcp};

    #[test]
    fn parses_only_strict_card_resource_uris() {
        assert_eq!(card_id_from_uri("card://201733"), Some(201733));
        assert_eq!(card_id_from_uri("card://"), None);
        assert_eq!(card_id_from_uri("card://12/extra"), None);
        assert_eq!(card_id_from_uri("https://example.com/12"), None);
    }

    #[test]
    fn advertises_the_shared_draw_hand_tool() {
        let tools = SchreckNetMcp::tool_router().list_all();
        let tool = tools
            .iter()
            .find(|tool| tool.name.as_ref() == "draw_hand")
            .expect("draw_hand tool");
        let schema = serde_json::Value::Object((*tool.input_schema).clone());
        assert!(schema["properties"]["section"].is_object());
        assert!(schema["properties"]["cards"].is_object());
        assert!(schema["properties"]["seed"].is_object());
    }
}
