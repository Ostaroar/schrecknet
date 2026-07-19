//! WASM bindings — thin wrappers only; logic stays in the plain modules.

use wasm_bindgen::prelude::{wasm_bindgen, JsError};

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

/// Encodes a deck into a compact, URL-safe share token. `crypt_ids`/
/// `crypt_qtys` and `library_ids`/`library_qtys` must be parallel arrays.
#[wasm_bindgen]
pub fn encode_deck_share(
    crypt_ids: Vec<u32>,
    crypt_qtys: Vec<u16>,
    library_ids: Vec<u32>,
    library_qtys: Vec<u16>,
) -> Result<String, JsError> {
    if crypt_ids.len() != crypt_qtys.len() || library_ids.len() != library_qtys.len() {
        return Err(JsError::new("mismatched id/qty array lengths"));
    }
    let crypt: crate::share::CardQtys = crypt_ids.into_iter().zip(crypt_qtys).collect();
    let library: crate::share::CardQtys = library_ids.into_iter().zip(library_qtys).collect();
    Ok(crate::share::encode(&crypt, &library))
}

/// Decodes a share token back to the plain `"id:qty,...|id:qty,..."` form
/// (crypt then library) — deliberately not JSON, so neither side needs a
/// JSON dependency for this small a payload.
#[wasm_bindgen]
pub fn decode_deck_share(token: &str) -> Result<String, JsError> {
    crate::share::decode_to_plain(token).map_err(|e| JsError::new(&e))
}

/// Parses a plain-text deck list (Lackey/JOL-style: `"<qty>x <name>"` per
/// line) into `"qty\tname"` lines — name-to-card resolution happens in the
/// frontend, which has `cards.sqlite`.
#[wasm_bindgen]
pub fn parse_deck_text(text: &str) -> String {
    crate::dtext::parse(text)
        .iter()
        .map(|c| format!("{}\t{}", c.qty, c.name.replace(['\t', '\n'], " ")))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Formats resolved crypt/library (name, qty) pairs as a plain-text deck
/// list. `crypt_names`/`crypt_qtys` and `library_names`/`library_qtys` must
/// be parallel arrays.
#[wasm_bindgen]
pub fn format_deck_text(
    crypt_names: Vec<String>,
    crypt_qtys: Vec<u16>,
    library_names: Vec<String>,
    library_qtys: Vec<u16>,
) -> Result<String, JsError> {
    if crypt_names.len() != crypt_qtys.len() || library_names.len() != library_qtys.len() {
        return Err(JsError::new("mismatched name/qty array lengths"));
    }
    let to_named = |names: Vec<String>, qtys: Vec<u16>| -> Vec<crate::dtext::NamedQty> {
        names
            .into_iter()
            .zip(qtys)
            .map(|(name, qty)| crate::dtext::NamedQty { name, qty })
            .collect()
    };
    Ok(crate::dtext::format(
        &to_named(crypt_names, crypt_qtys),
        &to_named(library_names, library_qtys),
    ))
}
