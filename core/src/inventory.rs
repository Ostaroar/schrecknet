//! Deck-usage → missing-copy math for the local inventory feature.
//!
//! Ported 1:1 from vdb's own algorithm (verified by reading `smeea/vdb`'s
//! `frontend/src/utils/getMissing.js` + `commons.js`'s `getHardTotal`/
//! `getSoftMax` and `hooks/useDeckMissing.js` on 2026-07-22 — see
//! `docs/inventory-plan.md` for the citation and the ✎ this resolved): a
//! **fixed** ("hard") claim reserves its quantity exclusively, so fixed
//! claims across decks *sum*; a **flexible** ("soft") claim shares a pool
//! with other flexible claims, so flexible claims across decks take the
//! *max*. Missing = fixed total + flexible max − owned, floored at zero.
//! Excluded decks never produce a claim at all (filtered out by the caller
//! before this module sees them).

/// One deck's claim on a card: how many copies it uses, and whether that
/// claim is exclusive (`Fixed`) or shared with other flexible claims
/// (`Flexible`).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClaimMode {
    Fixed,
    Flexible,
}

pub type Claim = (u16, ClaimMode);

/// Total copies missing for one card given every deck's claim on it and how
/// many copies are owned.
pub fn missing_for_card(claims: &[Claim], owned: u16) -> u16 {
    let fixed_total: u32 = claims
        .iter()
        .filter(|(_, mode)| *mode == ClaimMode::Fixed)
        .map(|&(qty, _)| u32::from(qty))
        .fold(0u32, |acc, qty| acc.saturating_add(qty));

    let flexible_max: u32 = claims
        .iter()
        .filter(|(_, mode)| *mode == ClaimMode::Flexible)
        .map(|&(qty, _)| u32::from(qty))
        .max()
        .unwrap_or(0);

    let needed = fixed_total.saturating_add(flexible_max);
    needed
        .saturating_sub(u32::from(owned))
        .min(u32::from(u16::MAX)) as u16
}

#[cfg(test)]
mod tests {
    use super::*;
    use ClaimMode::{Fixed, Flexible};

    #[test]
    fn flexible_claims_take_the_max_not_the_sum() {
        // Two decks each want 3 copies flexibly — they share the pool, so
        // only 3 are needed in total, not 6.
        let claims = [(3, Flexible), (3, Flexible)];
        assert_eq!(missing_for_card(&claims, 0), 3);
        assert_eq!(missing_for_card(&claims, 3), 0);
    }

    #[test]
    fn fixed_claims_sum_across_decks() {
        // Two decks each fix 2 copies exclusively —8 total copies needed
        // together is wrong; 4 is right, since fixed claims stack.
        let claims = [(2, Fixed), (2, Fixed)];
        assert_eq!(missing_for_card(&claims, 0), 4);
        assert_eq!(missing_for_card(&claims, 3), 1);
    }

    #[test]
    fn fixed_and_flexible_combine_additively() {
        // One deck fixes 1 copy, two others flexibly want 2 and 4 (max 4):
        // needed = 1 (fixed) + 4 (flexible max) = 5.
        let claims = [(1, Fixed), (2, Flexible), (4, Flexible)];
        assert_eq!(missing_for_card(&claims, 0), 5);
        assert_eq!(missing_for_card(&claims, 5), 0);
        assert_eq!(missing_for_card(&claims, 10), 0);
    }

    #[test]
    fn owning_enough_needs_nothing() {
        let claims = [(2, Fixed), (3, Flexible)];
        assert_eq!(missing_for_card(&claims, 5), 0);
        assert_eq!(missing_for_card(&claims, 100), 0);
    }

    #[test]
    fn no_claims_means_nothing_missing() {
        assert_eq!(missing_for_card(&[], 0), 0);
        assert_eq!(missing_for_card(&[], 5), 0);
    }
}
