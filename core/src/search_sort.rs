//! Stable VDB-compatible card ordering shared by exact and semantic search.

use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptSort {
    CapacityDesc,
    CapacityAsc,
    Clan,
    Group,
    Name,
    Sect,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CryptSortRecord {
    pub id: u32,
    pub name_ascii: String,
    pub clan: String,
    pub capacity: i64,
    pub group: i64,
    pub sect: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibrarySort {
    Requirement,
    CostDesc,
    CostAsc,
    Name,
    Type,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LibrarySortRecord {
    pub id: u32,
    pub name_ascii: String,
    pub types: Vec<String>,
    pub clan: String,
    pub disciplines: Vec<String>,
    pub blood_cost: Option<String>,
    pub pool_cost: Option<String>,
}

fn compare_text(left: &str, right: &str) -> Ordering {
    left.bytes()
        .map(|byte| byte.to_ascii_lowercase())
        .cmp(right.bytes().map(|byte| byte.to_ascii_lowercase()))
}

fn compare_name(left_id: u32, left: &str, right_id: u32, right: &str) -> Ordering {
    compare_text(left, right).then_with(|| left_id.cmp(&right_id))
}

pub fn compare_crypt(left: &CryptSortRecord, right: &CryptSortRecord, sort: CryptSort) -> Ordering {
    let name = || compare_name(left.id, &left.name_ascii, right.id, &right.name_ascii);
    match sort {
        CryptSort::CapacityDesc => right.capacity.cmp(&left.capacity).then_with(name),
        CryptSort::CapacityAsc => left.capacity.cmp(&right.capacity).then_with(name),
        CryptSort::Clan => compare_text(&left.clan, &right.clan)
            .then_with(|| right.capacity.cmp(&left.capacity))
            .then_with(name),
        CryptSort::Group => left
            .group
            .cmp(&right.group)
            .then_with(|| right.capacity.cmp(&left.capacity))
            .then_with(name),
        CryptSort::Name => name(),
        CryptSort::Sect => compare_text(&left.sect, &right.sect)
            .then_with(|| right.capacity.cmp(&left.capacity))
            .then_with(name),
    }
}

fn sorted_join(values: &[String], separator: &str) -> String {
    let mut values = values.to_vec();
    values.sort_by(|left, right| compare_text(left, right));
    values.join(separator)
}

fn compare_optional_requirement(left: &str, right: &str) -> Ordering {
    left.is_empty()
        .cmp(&right.is_empty())
        .then_with(|| compare_text(left, right))
}

fn numeric_cost(value: &Option<String>) -> Option<u64> {
    value
        .as_deref()
        .filter(|value| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()))
        .and_then(|value| value.parse().ok())
}

fn compare_cost(left: &Option<String>, right: &Option<String>, descending: bool) -> Ordering {
    match (numeric_cost(left), numeric_cost(right)) {
        (Some(left), Some(right)) if descending => right.cmp(&left),
        (Some(left), Some(right)) => left.cmp(&right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

fn compare_library_type(left: &LibrarySortRecord, right: &LibrarySortRecord) -> Ordering {
    let left_types = left.types.join("/");
    let right_types = right.types.join("/");
    let left_disciplines = sorted_join(&left.disciplines, ",");
    let right_disciplines = sorted_join(&right.disciplines, ",");
    compare_text(&left_types, &right_types)
        .then_with(|| compare_optional_requirement(&left.clan, &right.clan))
        .then_with(|| compare_optional_requirement(&left_disciplines, &right_disciplines))
        .then_with(|| compare_name(left.id, &left.name_ascii, right.id, &right.name_ascii))
}

fn compare_library_requirement(left: &LibrarySortRecord, right: &LibrarySortRecord) -> Ordering {
    let left_disciplines = sorted_join(&left.disciplines, ",");
    let right_disciplines = sorted_join(&right.disciplines, ",");
    compare_optional_requirement(&left.clan, &right.clan)
        .then_with(|| compare_optional_requirement(&left_disciplines, &right_disciplines))
        .then_with(|| compare_library_type(left, right))
}

pub fn compare_library(
    left: &LibrarySortRecord,
    right: &LibrarySortRecord,
    sort: LibrarySort,
) -> Ordering {
    match sort {
        LibrarySort::Requirement => compare_library_requirement(left, right),
        LibrarySort::CostDesc => compare_cost(&left.blood_cost, &right.blood_cost, true)
            .then_with(|| compare_cost(&left.pool_cost, &right.pool_cost, true))
            .then_with(|| compare_library_type(left, right)),
        LibrarySort::CostAsc => compare_cost(&left.blood_cost, &right.blood_cost, false)
            .then_with(|| compare_cost(&left.pool_cost, &right.pool_cost, false))
            .then_with(|| compare_library_type(left, right)),
        LibrarySort::Name => compare_name(left.id, &left.name_ascii, right.id, &right.name_ascii),
        LibrarySort::Type => compare_library_type(left, right),
    }
}

pub fn crypt_order(records: &[CryptSortRecord], sort: CryptSort) -> Vec<u32> {
    let mut records = records.iter().collect::<Vec<_>>();
    records.sort_by(|left, right| compare_crypt(left, right, sort));
    records.into_iter().map(|record| record.id).collect()
}

pub fn library_order(records: &[LibrarySortRecord], sort: LibrarySort) -> Vec<u32> {
    let mut records = records.iter().collect::<Vec<_>>();
    records.sort_by(|left, right| compare_library(left, right, sort));
    records.into_iter().map(|record| record.id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn crypt(
        id: u32,
        name: &str,
        clan: &str,
        capacity: i64,
        group: i64,
        sect: &str,
    ) -> CryptSortRecord {
        CryptSortRecord {
            id,
            name_ascii: name.to_owned(),
            clan: clan.to_owned(),
            capacity,
            group,
            sect: sect.to_owned(),
        }
    }

    fn library(
        id: u32,
        name: &str,
        card_type: &str,
        clan: &str,
        disciplines: &[&str],
        blood: Option<&str>,
        pool: Option<&str>,
    ) -> LibrarySortRecord {
        LibrarySortRecord {
            id,
            name_ascii: name.to_owned(),
            types: vec![card_type.to_owned()],
            clan: clan.to_owned(),
            disciplines: disciplines
                .iter()
                .map(|value| (*value).to_owned())
                .collect(),
            blood_cost: blood.map(str::to_owned),
            pool_cost: pool.map(str::to_owned),
        }
    }

    #[test]
    fn crypt_modes_have_stable_tie_breaks() {
        let cards = vec![
            crypt(3, "Zulu", "Ventrue", 5, 7, "Camarilla"),
            crypt(2, "alpha", "Banu Haqim", 5, 6, "Camarilla"),
            crypt(1, "Alpha", "Ventrue", 6, 6, "Anarch"),
        ];
        assert_eq!(crypt_order(&cards, CryptSort::CapacityDesc), vec![1, 2, 3]);
        assert_eq!(crypt_order(&cards, CryptSort::Clan), vec![2, 1, 3]);
        assert_eq!(crypt_order(&cards, CryptSort::Group), vec![1, 2, 3]);
        assert_eq!(crypt_order(&cards, CryptSort::Sect), vec![1, 2, 3]);
    }

    #[test]
    fn library_requirements_sort_present_values_before_empty() {
        let cards = vec![
            library(1, "None", "Action", "", &[], None, None),
            library(2, "Clan", "Action", "Ventrue", &[], None, None),
            library(3, "Discipline", "Action", "", &["dom"], None, None),
        ];
        assert_eq!(
            library_order(&cards, LibrarySort::Requirement),
            vec![2, 3, 1]
        );
        assert_eq!(library_order(&cards, LibrarySort::Type), vec![2, 3, 1]);
    }

    #[test]
    fn numeric_costs_precede_variable_and_absent_costs() {
        let cards = vec![
            library(1, "X", "Combat", "", &[], Some("X"), None),
            library(2, "Two", "Combat", "", &[], Some("2"), None),
            library(3, "One", "Combat", "", &[], Some("1"), None),
            library(4, "None", "Combat", "", &[], None, None),
        ];
        assert_eq!(
            library_order(&cards, LibrarySort::CostAsc),
            vec![3, 2, 4, 1]
        );
        assert_eq!(
            library_order(&cards, LibrarySort::CostDesc),
            vec![2, 3, 4, 1]
        );
    }
}
