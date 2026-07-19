//! Card-by-card deck comparison. The frontend supplies card ids and
//! quantities; presentation data stays outside the domain core.

use std::collections::BTreeMap;

pub type CardQtys = Vec<(u32, u16)>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Change {
    OnlyA,
    OnlyB,
    Changed,
    Same,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Entry {
    pub card_id: u32,
    pub qty_a: u16,
    pub qty_b: u16,
    pub change: Change,
}

/// Compares two card collections by id. Duplicate ids are summed so imported
/// input cannot produce duplicate result rows; overflow saturates safely.
pub fn compare(a: &CardQtys, b: &CardQtys) -> Vec<Entry> {
    fn quantities(cards: &CardQtys) -> BTreeMap<u32, u16> {
        let mut result = BTreeMap::new();
        for &(id, qty) in cards {
            if qty == 0 {
                continue;
            }
            result
                .entry(id)
                .and_modify(|total: &mut u16| *total = total.saturating_add(qty))
                .or_insert(qty);
        }
        result
    }

    let a = quantities(a);
    let b = quantities(b);
    let mut ids: Vec<u32> = a.keys().chain(b.keys()).copied().collect();
    ids.sort_unstable();
    ids.dedup();

    ids.into_iter()
        .map(|card_id| {
            let qty_a = a.get(&card_id).copied().unwrap_or(0);
            let qty_b = b.get(&card_id).copied().unwrap_or(0);
            let change = match (qty_a, qty_b) {
                (0, _) => Change::OnlyB,
                (_, 0) => Change::OnlyA,
                (left, right) if left == right => Change::Same,
                _ => Change::Changed,
            };
            Entry {
                card_id,
                qty_a,
                qty_b,
                change,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_all_change_kinds_in_card_id_order() {
        let result = compare(&vec![(3, 2), (1, 1), (4, 4)], &vec![(2, 1), (3, 3), (4, 4)]);
        assert_eq!(
            result,
            vec![
                Entry {
                    card_id: 1,
                    qty_a: 1,
                    qty_b: 0,
                    change: Change::OnlyA
                },
                Entry {
                    card_id: 2,
                    qty_a: 0,
                    qty_b: 1,
                    change: Change::OnlyB
                },
                Entry {
                    card_id: 3,
                    qty_a: 2,
                    qty_b: 3,
                    change: Change::Changed
                },
                Entry {
                    card_id: 4,
                    qty_a: 4,
                    qty_b: 4,
                    change: Change::Same
                },
            ]
        );
    }

    #[test]
    fn sums_duplicate_ids_and_saturates() {
        let result = compare(&vec![(7, u16::MAX), (7, 1)], &vec![(7, u16::MAX)]);
        assert_eq!(result[0].change, Change::Same);
        assert_eq!(result[0].qty_a, u16::MAX);
    }

    #[test]
    fn empty_decks_have_no_diff_rows() {
        assert!(compare(&vec![], &vec![]).is_empty());
        assert!(compare(&vec![(1, 0)], &vec![(1, 0)]).is_empty());
    }
}
