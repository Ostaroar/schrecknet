//! SchreckNet domain core.
//!
//! All deck/card domain logic lives here (see AGENTS.md hard rule #1). The crate
//! compiles natively for the server and to `wasm32-unknown-unknown` for the
//! browser; WASM bindings are kept in `wasm.rs` and only expose functions from
//! the plain-Rust modules.

pub mod capacity;
pub mod crypt_metadata;
pub mod diff;
pub mod draw;
pub mod dtext;
pub mod legality;
pub mod requirements;
pub mod semantic;
#[cfg(not(target_arch = "wasm32"))]
pub mod semantic_native;
pub mod share;
pub mod stats;
#[cfg(not(target_arch = "wasm32"))]
pub mod traits;

#[cfg(target_arch = "wasm32")]
mod wasm;
