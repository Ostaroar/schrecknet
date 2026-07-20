//! Deterministic opening-hand draws shared by native and WASM callers.

use std::fmt;

pub const CRYPT_HAND_SIZE: usize = 4;
pub const LIBRARY_HAND_SIZE: usize = 7;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeckSection {
    Crypt,
    Library,
}

impl DeckSection {
    pub const fn opening_hand_size(self) -> usize {
        match self {
            Self::Crypt => CRYPT_HAND_SIZE,
            Self::Library => LIBRARY_HAND_SIZE,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DrawError {
    MismatchedLengths,
    CardCountOverflow,
}

impl fmt::Display for DrawError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MismatchedLengths => formatter.write_str("mismatched card id/quantity lengths"),
            Self::CardCountOverflow => {
                formatter.write_str("expanded deck size exceeds platform limits")
            }
        }
    }
}

impl std::error::Error for DrawError {}

/// Draws an opening hand without replacement, respecting each card quantity.
///
/// The seed makes browser, REST, and MCP results reproducible. The order and
/// PRNG are part of the public contract; change either only with a fixture
/// migration.
pub fn opening_hand(
    card_ids: &[u32],
    quantities: &[u16],
    section: DeckSection,
    seed: u64,
) -> Result<Vec<u32>, DrawError> {
    if card_ids.len() != quantities.len() {
        return Err(DrawError::MismatchedLengths);
    }

    let capacity = quantities.iter().try_fold(0usize, |total, &quantity| {
        total.checked_add(usize::from(quantity))
    });
    let mut pool = Vec::with_capacity(capacity.ok_or(DrawError::CardCountOverflow)?);
    for (&card_id, &quantity) in card_ids.iter().zip(quantities) {
        pool.extend(std::iter::repeat_n(card_id, usize::from(quantity)));
    }

    let mut random = SplitMix64::new(seed);
    for index in (1..pool.len()).rev() {
        let swap_with = random.bounded(index + 1);
        pool.swap(index, swap_with);
    }
    pool.truncate(section.opening_hand_size());
    Ok(pool)
}

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    fn bounded(&mut self, upper: usize) -> usize {
        let upper = upper as u64;
        let threshold = upper.wrapping_neg() % upper;
        loop {
            let value = self.next();
            if value >= threshold {
                return (value % upper) as usize;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn deterministic_draw_respects_quantities_and_section_size() {
        let ids = [10, 20, 30];
        let quantities = [2, 3, 5];
        let first = opening_hand(&ids, &quantities, DeckSection::Library, 42).unwrap();
        let second = opening_hand(&ids, &quantities, DeckSection::Library, 42).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.len(), LIBRARY_HAND_SIZE);

        let counts = first.into_iter().fold(HashMap::new(), |mut counts, id| {
            *counts.entry(id).or_insert(0) += 1;
            counts
        });
        assert!(counts.get(&10).copied().unwrap_or_default() <= 2);
        assert!(counts.get(&20).copied().unwrap_or_default() <= 3);
        assert!(counts.get(&30).copied().unwrap_or_default() <= 5);
    }

    #[test]
    fn different_seeds_change_a_nontrivial_draw() {
        let ids = [1, 2, 3, 4, 5, 6, 7, 8];
        let quantities = [1; 8];
        assert_ne!(
            opening_hand(&ids, &quantities, DeckSection::Crypt, 1).unwrap(),
            opening_hand(&ids, &quantities, DeckSection::Crypt, 2).unwrap()
        );
    }

    #[test]
    fn seeded_draw_order_is_a_cross_runtime_golden_contract() {
        assert_eq!(
            opening_hand(
                &[100_001, 100_002, 100_003],
                &[2, 3, 2],
                DeckSection::Crypt,
                42,
            )
            .unwrap(),
            vec![100_002, 100_002, 100_003, 100_001]
        );
    }

    #[test]
    fn short_and_empty_decks_return_every_available_card() {
        assert_eq!(
            opening_hand(&[7], &[2], DeckSection::Crypt, 9).unwrap(),
            vec![7, 7]
        );
        assert!(opening_hand(&[], &[], DeckSection::Library, 9)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn rejects_mismatched_arrays() {
        assert_eq!(
            opening_hand(&[1, 2], &[1], DeckSection::Crypt, 0),
            Err(DrawError::MismatchedLengths)
        );
    }
}
