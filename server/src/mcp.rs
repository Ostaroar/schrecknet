//! MCP server: the primary machine API (docs/api.md, ADR 0003). Tools call
//! the exact same `cards_db` functions the REST mirror uses in `api.rs` —
//! AGENTS.md hard rule #2, both or neither.

use std::sync::Arc;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    ListResourceTemplatesResult, ListResourcesResult, PaginatedRequestParams,
    ReadResourceRequestParams, ReadResourceResult, Resource, ResourceContents, ResourceTemplate,
    ServerCapabilities, ServerInfo,
};
use rmcp::service::RequestContext;
use rmcp::{tool, tool_handler, tool_router, RoleServer, ServerHandler};

use crate::card_detail::{self, GetCardByNameParams, GetCardParams};
use crate::cards_db::{self, CryptSearchParams, LibrarySearchParams};
use crate::semantic_search::{SemanticError, SemanticSearchParams, SemanticSearchService};

#[derive(Clone)]
pub struct SchreckNetMcp {
    data_dir: Arc<String>,
    semantic: Arc<SemanticSearchService>,
    // Read by the #[tool_handler]-generated ServerHandler::call_tool/list_tools
    // impl below, which rustc's dead_code pass doesn't trace through the macro.
    #[allow(dead_code)]
    tool_router: rmcp::handler::server::router::tool::ToolRouter<Self>,
}

#[tool_router]
impl SchreckNetMcp {
    pub fn new(data_dir: String, semantic: Arc<SemanticSearchService>) -> Self {
        Self {
            data_dir: Arc::new(data_dir),
            semantic,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Search VTES V5 crypt (vampire) cards by text, clan, sects, title, vote \
        threshold, groups, capacity, independently leveled discipline requirements, VDB-style \
        OR-discipline rows, and V5 set/printing history. Returns cards sorted by capacity \
        descending."
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
        (all/any/none/only, including no requirement), clan, sect, title, and \
        vampire-capacity requirements, costs, and V5 set/printing history. Returns cards \
        sorted by name."
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
        count of distinct cards known to belong to it. Card quantities per precon aren't \
        tracked — use search_crypt/search_library with matching `set`+`precon` to browse a \
        precon's actual cards."
    )]
    async fn list_precons(&self) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(cards_db::list_precons(&conn))
    }

    fn open(&self) -> Result<rusqlite::Connection, rmcp::ErrorData> {
        cards_db::open(&self.data_dir)
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))
    }
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
    use super::card_id_from_uri;

    #[test]
    fn parses_only_strict_card_resource_uris() {
        assert_eq!(card_id_from_uri("card://201733"), Some(201733));
        assert_eq!(card_id_from_uri("card://"), None);
        assert_eq!(card_id_from_uri("card://12/extra"), None);
        assert_eq!(card_id_from_uri("https://example.com/12"), None);
    }
}
