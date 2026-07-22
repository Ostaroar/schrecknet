//! Canonical deck-editor ordering and library grouping.
//!
//! These rules are presentation-independent deck behavior: the same saved
//! deck must be organized identically in the browser and future native/server
//! views. Platform adapters only map the returned card ids back to records.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CryptSort {
    Capacity,
    Clan,
    Group,
    Name,
    Quantity,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct CryptCard {
    pub id: u32,
    pub name: String,
    pub clan: Option<String>,
    pub capacity: Option<i64>,
    pub group: Option<i64>,
    pub qty: u16,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct LibraryCard {
    pub id: u32,
    pub types: Vec<String>,
    pub qty: u16,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DeckCards {
    pub crypt: Vec<CryptCard>,
    pub library: Vec<LibraryCard>,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
pub struct LibraryGroup {
    pub card_type: String,
    pub card_ids: Vec<u32>,
    pub quantity: u32,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
pub struct Organization {
    pub crypt_ids: Vec<u32>,
    pub library_groups: Vec<LibraryGroup>,
}

const LIBRARY_TYPE_ORDER: &[&str] = &[
    "Master",
    "Action",
    "Action/Combat",
    "Political Action",
    "Ally",
    "Equipment",
    "Retainer",
    "Action Modifier",
    "Action Modifier/Combat",
    "Action Modifier/Reaction",
    "Reaction",
    "Combat",
];

fn compare_text(left: &str, right: &str) -> Ordering {
    left.bytes()
        .map(|byte| byte.to_ascii_lowercase())
        .cmp(right.bytes().map(|byte| byte.to_ascii_lowercase()))
}

fn compare_name(left: &CryptCard, right: &CryptCard) -> Ordering {
    compare_text(&left.name, &right.name).then_with(|| left.id.cmp(&right.id))
}

fn compare_crypt(left: &CryptCard, right: &CryptCard, sort: CryptSort) -> Ordering {
    let capacity = || {
        right
            .capacity
            .unwrap_or(-1)
            .cmp(&left.capacity.unwrap_or(-1))
    };
    let name = || compare_name(left, right);
    match sort {
        CryptSort::Capacity => capacity().then_with(name),
        CryptSort::Clan => left
            .clan
            .as_deref()
            .unwrap_or_default()
            .cmp(right.clan.as_deref().unwrap_or_default())
            .then_with(capacity)
            .then_with(name),
        CryptSort::Group => left
            .group
            .unwrap_or(i64::MAX)
            .cmp(&right.group.unwrap_or(i64::MAX))
            .then_with(capacity)
            .then_with(name),
        CryptSort::Name => name(),
        CryptSort::Quantity => right.qty.cmp(&left.qty).then_with(capacity).then_with(name),
    }
}

fn library_type(card: &LibraryCard) -> String {
    if card.types.is_empty() {
        "Other".to_owned()
    } else {
        card.types.join("/")
    }
}

fn library_type_rank(card_type: &str) -> usize {
    LIBRARY_TYPE_ORDER
        .iter()
        .position(|candidate| *candidate == card_type)
        .unwrap_or(usize::MAX)
}

pub fn organize(cards: &DeckCards, crypt_sort: CryptSort) -> Organization {
    let mut crypt = cards.crypt.iter().collect::<Vec<_>>();
    crypt.sort_by(|left, right| compare_crypt(left, right, crypt_sort));

    let mut groups = Vec::<LibraryGroup>::new();
    for card in &cards.library {
        let card_type = library_type(card);
        if let Some(group) = groups.iter_mut().find(|group| group.card_type == card_type) {
            group.card_ids.push(card.id);
            group.quantity = group.quantity.saturating_add(u32::from(card.qty));
        } else {
            groups.push(LibraryGroup {
                card_type,
                card_ids: vec![card.id],
                quantity: u32::from(card.qty),
            });
        }
    }
    groups.sort_by(|left, right| {
        let left_rank = library_type_rank(&left.card_type);
        let right_rank = library_type_rank(&right.card_type);
        left_rank.cmp(&right_rank).then_with(|| {
            if left_rank == usize::MAX {
                compare_text(&left.card_type, &right.card_type)
            } else {
                Ordering::Equal
            }
        })
    });

    Organization {
        crypt_ids: crypt.into_iter().map(|card| card.id).collect(),
        library_groups: groups,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn crypt(id: u32, name: &str, clan: &str, capacity: i64, group: i64, qty: u16) -> CryptCard {
        CryptCard {
            id,
            name: name.to_owned(),
            clan: Some(clan.to_owned()),
            capacity: Some(capacity),
            group: Some(group),
            qty,
        }
    }

    #[test]
    fn crypt_modes_preserve_editor_order_and_stable_ties() {
        let cards = DeckCards {
            crypt: vec![
                crypt(3, "Zulu", "Ventrue", 5, 7, 4),
                crypt(2, "alpha", "Banu Haqim", 5, 6, 1),
                crypt(1, "Alpha", "Ventrue", 6, 6, 2),
            ],
            library: vec![],
        };
        assert_eq!(
            organize(&cards, CryptSort::Capacity).crypt_ids,
            vec![1, 2, 3]
        );
        assert_eq!(organize(&cards, CryptSort::Clan).crypt_ids, vec![2, 1, 3]);
        assert_eq!(organize(&cards, CryptSort::Group).crypt_ids, vec![1, 2, 3]);
        assert_eq!(organize(&cards, CryptSort::Name).crypt_ids, vec![1, 2, 3]);
        assert_eq!(
            organize(&cards, CryptSort::Quantity).crypt_ids,
            vec![3, 1, 2]
        );
    }

    #[test]
    fn absent_crypt_values_match_the_previous_editor_fallbacks() {
        let cards = DeckCards {
            crypt: vec![
                CryptCard {
                    id: 1,
                    name: "Unknown".to_owned(),
                    clan: None,
                    capacity: None,
                    group: None,
                    qty: 1,
                },
                crypt(2, "Known", "Ventrue", 1, 7, 1),
            ],
            library: vec![],
        };
        assert_eq!(organize(&cards, CryptSort::Capacity).crypt_ids, vec![2, 1]);
        assert_eq!(organize(&cards, CryptSort::Group).crypt_ids, vec![2, 1]);
        assert_eq!(organize(&cards, CryptSort::Clan).crypt_ids, vec![1, 2]);
    }

    #[test]
    fn library_groups_use_canonical_order_and_quantity_totals() {
        let cards = DeckCards {
            crypt: vec![],
            library: vec![
                LibraryCard {
                    id: 10,
                    types: vec!["Combat".to_owned()],
                    qty: 3,
                },
                LibraryCard {
                    id: 11,
                    types: vec!["Master".to_owned()],
                    qty: 2,
                },
                LibraryCard {
                    id: 12,
                    types: vec!["Combat".to_owned()],
                    qty: 4,
                },
                LibraryCard {
                    id: 13,
                    types: vec![],
                    qty: 1,
                },
            ],
        };
        assert_eq!(
            organize(&cards, CryptSort::Capacity).library_groups,
            vec![
                LibraryGroup {
                    card_type: "Master".to_owned(),
                    card_ids: vec![11],
                    quantity: 2
                },
                LibraryGroup {
                    card_type: "Combat".to_owned(),
                    card_ids: vec![10, 12],
                    quantity: 7
                },
                LibraryGroup {
                    card_type: "Other".to_owned(),
                    card_ids: vec![13],
                    quantity: 1
                },
            ]
        );
    }

    #[test]
    fn unknown_library_groups_sort_after_known_groups_by_name() {
        let cards = DeckCards {
            crypt: vec![],
            library: vec![
                LibraryCard {
                    id: 1,
                    types: vec!["Zulu".to_owned()],
                    qty: 1,
                },
                LibraryCard {
                    id: 2,
                    types: vec!["Ally".to_owned()],
                    qty: 1,
                },
                LibraryCard {
                    id: 3,
                    types: vec!["alpha".to_owned()],
                    qty: 1,
                },
            ],
        };
        let types = organize(&cards, CryptSort::Capacity)
            .library_groups
            .into_iter()
            .map(|group| group.card_type)
            .collect::<Vec<_>>();
        assert_eq!(types, vec!["Ally", "alpha", "Zulu"]);
    }
}
