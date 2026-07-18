//! MCP server: the primary machine API (docs/api.md, ADR 0003). Tools call
//! the exact same `cards_db` functions the REST mirror uses in `api.rs` —
//! AGENTS.md hard rule #2, both or neither.

use std::sync::Arc;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{ServerCapabilities, ServerInfo};
use rmcp::{tool, tool_handler, tool_router, ServerHandler};

use crate::card_detail::{self, GetCardParams};
use crate::cards_db::{self, CryptSearchParams, LibrarySearchParams};

#[derive(Clone)]
pub struct SchreckNetMcp {
    data_dir: Arc<String>,
    // Read by the #[tool_handler]-generated ServerHandler::call_tool/list_tools
    // impl below, which rustc's dead_code pass doesn't trace through the macro.
    #[allow(dead_code)]
    tool_router: rmcp::handler::server::router::tool::ToolRouter<Self>,
}

#[tool_router]
impl SchreckNetMcp {
    pub fn new(data_dir: String) -> Self {
        Self {
            data_dir: Arc::new(data_dir),
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Search VTES V5 crypt (vampire) cards by name/text, clan, and group. \
        Returns cards sorted by capacity descending, with discipline levels (superior/inferior)."
    )]
    async fn search_crypt(
        &self,
        Parameters(params): Parameters<CryptSearchParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(cards_db::search_crypt(&conn, &params))
    }

    #[tool(
        description = "Search VTES V5 library cards by name/text, card type (e.g. Master, \
        Action, Combat), and clan/path requirement. Returns cards sorted by name."
    )]
    async fn search_library(
        &self,
        Parameters(params): Parameters<LibrarySearchParams>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let conn = self.open()?;
        json_result(cards_db::search_library(&conn, &params))
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

    fn open(&self) -> Result<rusqlite::Connection, rmcp::ErrorData> {
        cards_db::open(&self.data_dir)
            .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))
    }
}

fn json_result<T: serde::Serialize>(
    result: rusqlite::Result<T>,
) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
    let value = result.map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
    let json = serde_json::to_string(&value)
        .map_err(|e| rmcp::ErrorData::internal_error(e.to_string(), None))?;
    Ok(rmcp::model::CallToolResult::success(vec![
        rmcp::model::ContentBlock::text(json),
    ]))
}

#[tool_handler]
impl ServerHandler for SchreckNetMcp {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.server_info =
            rmcp::model::Implementation::new("schrecknet", env!("CARGO_PKG_VERSION"))
                .with_title("SchreckNet — VTES V5 card search & deck building");
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info.instructions = Some(
            "SchreckNet hosts the V5 format of VTES exclusively. search_crypt searches \
             the V5-legal crypt pool only — there is no classic-era card data here."
                .into(),
        );
        info
    }
}
