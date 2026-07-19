//! Weighted deck statistics shared by native and WASM consumers.

use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CapacityStats {
    pub count: u32,
    pub min: u8,
    pub max: u8,
    pub average_hundredths: u32,
}

pub fn capacity(values: &[(u8, u16)]) -> Option<CapacityStats> {
    let mut count = 0_u32;
    let mut sum = 0_u64;
    let mut min = u8::MAX;
    let mut max = u8::MIN;
    for &(value, qty) in values {
        if qty == 0 {
            continue;
        }
        count = count.saturating_add(u32::from(qty));
        sum = sum.saturating_add(u64::from(value) * u64::from(qty));
        min = min.min(value);
        max = max.max(value);
    }
    if count == 0 {
        return None;
    }
    Some(CapacityStats {
        count,
        min,
        max,
        average_hundredths: ((sum.saturating_mul(100) + u64::from(count / 2)) / u64::from(count))
            .min(u64::from(u32::MAX)) as u32,
    })
}

/// Sums quantities for repeated category labels, sorted by count descending
/// and then label ascending for stable UI output.
pub fn distribution(entries: &[(String, u16)]) -> Vec<(String, u32)> {
    let mut counts = BTreeMap::<String, u32>::new();
    for (label, qty) in entries {
        let label = label.trim();
        if label.is_empty() || *qty == 0 {
            continue;
        }
        counts
            .entry(label.to_owned())
            .and_modify(|count| *count = count.saturating_add(u32::from(*qty)))
            .or_insert(u32::from(*qty));
    }
    let mut result: Vec<_> = counts.into_iter().collect();
    result.sort_by(|(label_a, count_a), (label_b, count_b)| {
        count_b.cmp(count_a).then_with(|| label_a.cmp(label_b))
    });
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capacity_is_quantity_weighted() {
        let stats = capacity(&[(4, 1), (8, 3)]).unwrap();
        assert_eq!(stats.count, 4);
        assert_eq!(stats.min, 4);
        assert_eq!(stats.max, 8);
        assert_eq!(stats.average_hundredths, 700);
    }

    #[test]
    fn capacity_ignores_zero_quantity_and_handles_empty() {
        assert!(capacity(&[]).is_none());
        assert!(capacity(&[(10, 0)]).is_none());
    }

    #[test]
    fn distribution_sums_and_sorts_stably() {
        let result = distribution(&[
            ("Combat".into(), 2),
            ("Action".into(), 1),
            ("Combat".into(), 3),
            ("Master".into(), 1),
            ("".into(), 9),
        ]);
        assert_eq!(
            result,
            vec![
                ("Combat".into(), 5),
                ("Action".into(), 1),
                ("Master".into(), 1)
            ]
        );
    }
}
