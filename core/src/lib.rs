//! SchreckNet domain core.
//!
//! All deck/card domain logic lives here (see AGENTS.md hard rule #1). The crate
//! compiles natively for the server and to `wasm32-unknown-unknown` for the
//! browser; WASM bindings are kept in `wasm.rs` and only expose functions from
//! the plain-Rust modules.

pub mod dtext;
pub mod legality;
pub mod share;

#[cfg(target_arch = "wasm32")]
mod wasm;
