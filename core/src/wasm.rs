//! WASM bindings — thin wrappers only; logic stays in the plain modules.

use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn crypt_groups_legal(groups: &[u8]) -> bool {
    crate::legality::crypt_groups_legal(groups)
}
