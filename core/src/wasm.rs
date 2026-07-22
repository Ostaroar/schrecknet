//! WASM bindings — thin wrappers only; logic stays in the plain modules.

use wasm_bindgen::prelude::{wasm_bindgen, JsError};

fn json<T: serde::Serialize>(value: &T) -> Result<String, JsError> {
    serde_json::to_string(value).map_err(|error| JsError::new(&error.to_string()))
}

/// Parses VTES bracket-token card text into canonical symbol segments.
#[wasm_bindgen]
pub fn parse_card_text(input: &str) -> Result<String, JsError> {
    json(&crate::card_text::parse(input))
}

/// Returns canonical discipline-symbol metadata, or JSON `null` if unknown.
#[wasm_bindgen]
pub fn discipline_symbol(code: &str, superior: bool) -> Result<String, JsError> {
    json(&crate::card_text::discipline_symbol(code, superior))
}

/// Returns canonical card-type-symbol metadata, or JSON `null` if unknown.
#[wasm_bindgen]
pub fn card_type_symbol(card_type: &str) -> Result<String, JsError> {
    json(&crate::card_text::card_type_symbol(card_type))
}

/// Builds the shared bound-parameter crypt query plan from a JSON filter
/// object and returns `{ sql, params }` as JSON for the browser SQLite adapter.
#[wasm_bindgen]
pub fn plan_crypt_search(input_json: &str) -> Result<String, JsError> {
    let input =
        serde_json::from_str(input_json).map_err(|error| JsError::new(&error.to_string()))?;
    json(&crate::search_plan::crypt_plan(&input))
}

/// Builds the shared bound-parameter library query plan for the browser.
#[wasm_bindgen]
pub fn plan_library_search(input_json: &str) -> Result<String, JsError> {
    let input =
        serde_json::from_str(input_json).map_err(|error| JsError::new(&error.to_string()))?;
    json(&crate::search_plan::library_plan(&input))
}

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

/// Compares two decks and returns tab-separated card rows for the JS adapter.
#[wasm_bindgen]
pub fn compare_decks(
    ids_a: Vec<u32>,
    qtys_a: Vec<u16>,
    ids_b: Vec<u32>,
    qtys_b: Vec<u16>,
) -> Result<String, JsError> {
    if ids_a.len() != qtys_a.len() || ids_b.len() != qtys_b.len() {
        return Err(JsError::new("mismatched id/qty array lengths"));
    }
    let a = ids_a.into_iter().zip(qtys_a).collect();
    let b = ids_b.into_iter().zip(qtys_b).collect();
    Ok(crate::diff::compare(&a, &b)
        .iter()
        .map(|entry| {
            let change = match entry.change {
                crate::diff::Change::OnlyA => "only_a",
                crate::diff::Change::OnlyB => "only_b",
                crate::diff::Change::Changed => "changed",
                crate::diff::Change::Same => "same",
            };
            format!(
                "{}\t{}\t{}\t{change}",
                entry.card_id, entry.qty_a, entry.qty_b
            )
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Draws a deterministic opening hand and returns the selected card ids.
#[wasm_bindgen]
pub fn draw_opening_hand(
    card_ids: Vec<u32>,
    quantities: Vec<u16>,
    section: &str,
    seed_high: u32,
    seed_low: u32,
) -> Result<Vec<u32>, JsError> {
    let section = match section {
        "crypt" => crate::draw::DeckSection::Crypt,
        "library" => crate::draw::DeckSection::Library,
        _ => return Err(JsError::new("section must be crypt or library")),
    };
    let seed = (u64::from(seed_high) << 32) | u64::from(seed_low);
    crate::draw::opening_hand(&card_ids, &quantities, section, seed)
        .map_err(|error| JsError::new(&error.to_string()))
}

fn crypt_sort_mode(value: &str) -> Result<crate::search_sort::CryptSort, JsError> {
    match value {
        "capacity_desc" => Ok(crate::search_sort::CryptSort::CapacityDesc),
        "capacity_asc" => Ok(crate::search_sort::CryptSort::CapacityAsc),
        "clan" => Ok(crate::search_sort::CryptSort::Clan),
        "group" => Ok(crate::search_sort::CryptSort::Group),
        "name" => Ok(crate::search_sort::CryptSort::Name),
        "sect" => Ok(crate::search_sort::CryptSort::Sect),
        _ => Err(JsError::new("unknown crypt sort mode")),
    }
}

/// Returns card ids in shared VDB-compatible crypt order.
#[wasm_bindgen]
pub fn sort_crypt_cards(
    card_ids: Vec<u32>,
    names_ascii: Vec<String>,
    clans: Vec<String>,
    capacities: Vec<i32>,
    groups: Vec<i32>,
    sects: Vec<String>,
    mode: &str,
) -> Result<Vec<u32>, JsError> {
    let length = card_ids.len();
    if [
        names_ascii.len(),
        clans.len(),
        capacities.len(),
        groups.len(),
        sects.len(),
    ]
    .iter()
    .any(|&candidate| candidate != length)
    {
        return Err(JsError::new("mismatched crypt sort array lengths"));
    }
    let records = card_ids
        .into_iter()
        .zip(names_ascii)
        .zip(clans)
        .zip(capacities)
        .zip(groups)
        .zip(sects)
        .map(|(((((id, name_ascii), clan), capacity), group), sect)| {
            crate::search_sort::CryptSortRecord {
                id,
                name_ascii,
                clan,
                capacity: i64::from(capacity),
                group: i64::from(group),
                sect,
            }
        })
        .collect::<Vec<_>>();
    Ok(crate::search_sort::crypt_order(
        &records,
        crypt_sort_mode(mode)?,
    ))
}

fn library_sort_mode(value: &str) -> Result<crate::search_sort::LibrarySort, JsError> {
    match value {
        "requirement" => Ok(crate::search_sort::LibrarySort::Requirement),
        "cost_desc" => Ok(crate::search_sort::LibrarySort::CostDesc),
        "cost_asc" => Ok(crate::search_sort::LibrarySort::CostAsc),
        "name" => Ok(crate::search_sort::LibrarySort::Name),
        "type" => Ok(crate::search_sort::LibrarySort::Type),
        _ => Err(JsError::new("unknown library sort mode")),
    }
}

fn split_sort_values(value: String) -> Vec<String> {
    if value.is_empty() {
        Vec::new()
    } else {
        value.split('\u{1f}').map(str::to_owned).collect()
    }
}

/// Returns card ids in shared VDB-compatible library order.
#[wasm_bindgen]
pub fn sort_library_cards(
    card_ids: Vec<u32>,
    names_ascii: Vec<String>,
    types: Vec<String>,
    clans: Vec<String>,
    disciplines: Vec<String>,
    blood_costs: Vec<String>,
    pool_costs: Vec<String>,
    mode: &str,
) -> Result<Vec<u32>, JsError> {
    let length = card_ids.len();
    if [
        names_ascii.len(),
        types.len(),
        clans.len(),
        disciplines.len(),
        blood_costs.len(),
        pool_costs.len(),
    ]
    .iter()
    .any(|&candidate| candidate != length)
    {
        return Err(JsError::new("mismatched library sort array lengths"));
    }
    let records = card_ids
        .into_iter()
        .zip(names_ascii)
        .zip(types)
        .zip(clans)
        .zip(disciplines)
        .zip(blood_costs)
        .zip(pool_costs)
        .map(
            |((((((id, name_ascii), types), clan), disciplines), blood_cost), pool_cost)| {
                crate::search_sort::LibrarySortRecord {
                    id,
                    name_ascii,
                    types: split_sort_values(types),
                    clan,
                    disciplines: split_sort_values(disciplines),
                    blood_cost: (!blood_cost.is_empty()).then_some(blood_cost),
                    pool_cost: (!pool_cost.is_empty()).then_some(pool_cost),
                }
            },
        )
        .collect::<Vec<_>>();
    Ok(crate::search_sort::library_order(
        &records,
        library_sort_mode(mode)?,
    ))
}

/// Quantity-weighted crypt capacity stats as `count\tmin\tmax\taverage`.
#[wasm_bindgen]
pub fn capacity_stats(capacities: Vec<u8>, qtys: Vec<u16>) -> Result<String, JsError> {
    if capacities.len() != qtys.len() {
        return Err(JsError::new("mismatched capacity/qty array lengths"));
    }
    let values = capacities.into_iter().zip(qtys).collect::<Vec<_>>();
    Ok(crate::stats::capacity(&values)
        .map(|stats| {
            format!(
                "{}\t{}\t{}\t{}",
                stats.count, stats.min, stats.max, stats.average_hundredths
            )
        })
        .unwrap_or_default())
}

/// Quantity-weighted category counts as `label\tcount` lines.
#[wasm_bindgen]
pub fn category_distribution(labels: Vec<String>, qtys: Vec<u16>) -> Result<String, JsError> {
    if labels.len() != qtys.len() {
        return Err(JsError::new("mismatched label/qty array lengths"));
    }
    let entries = labels.into_iter().zip(qtys).collect::<Vec<_>>();
    Ok(crate::stats::distribution(&entries)
        .iter()
        .map(|(label, count)| format!("{}\t{count}", label.replace(['\t', '\n'], " ")))
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Missing copies for a single card: `fixed_qtys` sum (exclusive claims),
/// `flexible_qtys` take the max (shared pool), then subtract `owned`,
/// floored at zero. See `core/src/inventory.rs` for the ported algorithm.
#[wasm_bindgen]
pub fn inventory_missing(fixed_qtys: Vec<u16>, flexible_qtys: Vec<u16>, owned: u16) -> u16 {
    let claims: Vec<crate::inventory::Claim> = fixed_qtys
        .into_iter()
        .map(|qty| (qty, crate::inventory::ClaimMode::Fixed))
        .chain(
            flexible_qtys
                .into_iter()
                .map(|qty| (qty, crate::inventory::ClaimMode::Flexible)),
        )
        .collect();
    crate::inventory::missing_for_card(&claims, owned)
}

/// Exact semantic ranking over row-major candidate embeddings.
///
/// Returns `card_id\tscore` rows. Query inference and SQLite reads stay in the
/// browser adapter; validation, cosine scoring, and stable ordering stay here.
#[wasm_bindgen]
pub fn rank_semantic_cards(
    query: Vec<f32>,
    embedding_bytes: Vec<u8>,
    card_ids: Vec<u32>,
    names: Vec<String>,
    limit: usize,
    min_score: f32,
) -> Result<String, JsError> {
    if query.is_empty() {
        return Err(JsError::new("semantic query vector must not be empty"));
    }
    if card_ids.len() != names.len() {
        return Err(JsError::new(
            "mismatched semantic card id/name array lengths",
        ));
    }
    let expected_values = card_ids
        .len()
        .checked_mul(query.len())
        .ok_or_else(|| JsError::new("semantic embedding array length overflow"))?;
    let embeddings = crate::semantic::decode_f32_le(&embedding_bytes, expected_values)
        .map_err(|error| JsError::new(&error.to_string()))?;

    let candidates = card_ids
        .iter()
        .zip(&names)
        .zip(embeddings.chunks_exact(query.len()))
        .map(|((&card_id, name), embedding)| crate::semantic::Candidate {
            card_id,
            name,
            embedding,
        })
        .collect::<Vec<_>>();
    crate::semantic::rank(&query, &candidates, limit, Some(min_score))
        .map(|hits| {
            hits.iter()
                .map(|hit| format!("{}\t{}", hit.card_id, hit.score))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|error| JsError::new(&error.to_string()))
}
