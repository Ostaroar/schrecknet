//! Shared native service for deterministic opening-hand draws.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DrawSection {
    Crypt,
    Library,
}

impl From<DrawSection> for schrecknet_core::draw::DeckSection {
    fn from(value: DrawSection) -> Self {
        match value {
            DrawSection::Crypt => Self::Crypt,
            DrawSection::Library => Self::Library,
        }
    }
}

#[derive(Debug, Clone, Deserialize, JsonSchema, utoipa::ToSchema)]
pub struct DrawCard {
    pub id: u32,
    pub quantity: u16,
}

#[derive(Debug, Clone, Deserialize, JsonSchema, utoipa::ToSchema)]
pub struct DrawHandParams {
    /// Whether to draw the VTES opening crypt hand (4) or library hand (7).
    pub section: DrawSection,
    /// Card ids and quantities in the selected deck section.
    pub cards: Vec<DrawCard>,
    /// Optional unsigned 64-bit decimal seed. Reusing it reproduces the draw.
    #[serde(default)]
    pub seed: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, utoipa::ToSchema)]
pub struct DrawHandResult {
    pub section: &'static str,
    pub card_ids: Vec<u32>,
    pub seed: String,
}

#[derive(Debug)]
pub enum DrawHandError {
    InvalidSeed,
    Draw(schrecknet_core::draw::DrawError),
}

impl std::fmt::Display for DrawHandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidSeed => {
                formatter.write_str("seed must be an unsigned 64-bit decimal string")
            }
            Self::Draw(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for DrawHandError {}

static SEED_COUNTER: AtomicU64 = AtomicU64::new(0);

fn generated_seed() -> u64 {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or_default();
    time ^ SEED_COUNTER.fetch_add(1, Ordering::Relaxed).rotate_left(17)
}

pub fn draw_hand(params: &DrawHandParams) -> Result<DrawHandResult, DrawHandError> {
    let seed = params
        .seed
        .as_deref()
        .map(str::parse::<u64>)
        .transpose()
        .map_err(|_| DrawHandError::InvalidSeed)?
        .unwrap_or_else(generated_seed);
    let card_ids = params.cards.iter().map(|card| card.id).collect::<Vec<_>>();
    let quantities = params
        .cards
        .iter()
        .map(|card| card.quantity)
        .collect::<Vec<_>>();
    let section = params.section.into();
    let drawn = schrecknet_core::draw::opening_hand(&card_ids, &quantities, section, seed)
        .map_err(DrawHandError::Draw)?;

    Ok(DrawHandResult {
        section: match params.section {
            DrawSection::Crypt => "crypt",
            DrawSection::Library => "library",
        },
        card_ids: drawn,
        seed: seed.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(seed: &str) -> DrawHandParams {
        DrawHandParams {
            section: DrawSection::Crypt,
            cards: vec![
                DrawCard { id: 1, quantity: 2 },
                DrawCard { id: 2, quantity: 2 },
                DrawCard { id: 3, quantity: 2 },
            ],
            seed: Some(seed.to_owned()),
        }
    }

    #[test]
    fn explicit_seed_reproduces_the_native_draw() {
        let first = draw_hand(&params("42")).unwrap();
        let second = draw_hand(&params("42")).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.card_ids.len(), schrecknet_core::draw::CRYPT_HAND_SIZE);
        assert_eq!(first.seed, "42");
    }

    #[test]
    fn rejects_non_decimal_or_out_of_range_seeds() {
        assert!(matches!(
            draw_hand(&params("-1")),
            Err(DrawHandError::InvalidSeed)
        ));
        assert!(matches!(
            draw_hand(&params("18446744073709551616")),
            Err(DrawHandError::InvalidSeed)
        ));
    }
}
