//! WASM bindings — thin wrappers only; logic stays in the plain modules.

use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn crypt_groups_legal(groups: &[u8]) -> bool {
    crate::legality::crypt_groups_legal(groups)
}

/// Deck-construction violations as human-readable strings (empty = legal).
#[wasm_bindgen]
pub fn validate_deck(groups: &[u8], crypt_count: u32, library_count: u32) -> Vec<String> {
    crate::legality::validate_counts(groups, crypt_count, library_count)
        .iter()
        .map(crate::legality::describe)
        .collect()
}
