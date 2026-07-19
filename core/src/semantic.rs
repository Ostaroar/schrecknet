//! Deterministic semantic-search ranking shared by native and WASM consumers.
//!
//! Model inference is platform-specific. This module owns the cross-platform
//! contract after inference: SQLite BLOB decoding, vector validation, cosine
//! scoring, filtering, and stable top-k ordering.

use std::fmt;

#[derive(Clone, Copy, Debug)]
pub struct Candidate<'a> {
    pub card_id: u32,
    pub name: &'a str,
    pub embedding: &'a [f32],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScoredCard {
    pub card_id: u32,
    pub score: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RankError {
    EmptyVector,
    ByteLength {
        expected: usize,
        actual: usize,
    },
    Dimension {
        card_id: u32,
        expected: usize,
        actual: usize,
    },
    NonFiniteQuery {
        index: usize,
    },
    NonFiniteBlob {
        index: usize,
    },
    NonFiniteCandidate {
        card_id: u32,
        index: usize,
    },
    ZeroNormQuery,
    ZeroNormCandidate {
        card_id: u32,
    },
    InvalidMinimumScore,
}

impl fmt::Display for RankError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyVector => formatter.write_str("semantic vectors must not be empty"),
            Self::ByteLength { expected, actual } => write!(
                formatter,
                "embedding BLOB has {actual} bytes; expected {expected}"
            ),
            Self::Dimension {
                card_id,
                expected,
                actual,
            } => write!(
                formatter,
                "card {card_id} embedding has {actual} dimensions; expected {expected}"
            ),
            Self::NonFiniteQuery { index } => {
                write!(formatter, "query embedding value {index} is not finite")
            }
            Self::NonFiniteBlob { index } => {
                write!(formatter, "embedding BLOB value {index} is not finite")
            }
            Self::NonFiniteCandidate { card_id, index } => write!(
                formatter,
                "card {card_id} embedding value {index} is not finite"
            ),
            Self::ZeroNormQuery => formatter.write_str("query embedding has zero norm"),
            Self::ZeroNormCandidate { card_id } => {
                write!(formatter, "card {card_id} embedding has zero norm")
            }
            Self::InvalidMinimumScore => {
                formatter.write_str("minimum semantic score must be finite and between -1 and 1")
            }
        }
    }
}

impl std::error::Error for RankError {}

/// Encodes a validated vector for the little-endian float32 SQLite contract.
pub fn encode_f32_le(values: &[f32]) -> Result<Vec<u8>, RankError> {
    if values.is_empty() {
        return Err(RankError::EmptyVector);
    }
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(values));
    for (index, value) in values.iter().enumerate() {
        if !value.is_finite() {
            return Err(RankError::NonFiniteBlob { index });
        }
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    Ok(bytes)
}

/// Decodes the little-endian float32 representation stored in `cards.sqlite`.
pub fn decode_f32_le(bytes: &[u8], dimensions: usize) -> Result<Vec<f32>, RankError> {
    if dimensions == 0 {
        return Err(RankError::EmptyVector);
    }
    let expected =
        dimensions
            .checked_mul(std::mem::size_of::<f32>())
            .ok_or(RankError::ByteLength {
                expected: usize::MAX,
                actual: bytes.len(),
            })?;
    if bytes.len() != expected {
        return Err(RankError::ByteLength {
            expected,
            actual: bytes.len(),
        });
    }

    bytes
        .chunks_exact(4)
        .enumerate()
        .map(|(index, chunk)| {
            let value = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            if value.is_finite() {
                Ok(value)
            } else {
                Err(RankError::NonFiniteBlob { index })
            }
        })
        .collect()
}

/// Ranks candidates by exact cosine similarity.
///
/// Ties are resolved by canonical card name and then card id, making native and
/// browser results stable even when several float scores are exactly equal.
pub fn rank(
    query: &[f32],
    candidates: &[Candidate<'_>],
    limit: usize,
    min_score: Option<f32>,
) -> Result<Vec<ScoredCard>, RankError> {
    if query.is_empty() {
        return Err(RankError::EmptyVector);
    }
    let minimum = min_score.unwrap_or(-1.0);
    if !minimum.is_finite() || !(-1.0..=1.0).contains(&minimum) {
        return Err(RankError::InvalidMinimumScore);
    }

    let query_norm = norm(query, |index| RankError::NonFiniteQuery { index })?;
    if query_norm == 0.0 {
        return Err(RankError::ZeroNormQuery);
    }

    let mut scored = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        if candidate.embedding.len() != query.len() {
            return Err(RankError::Dimension {
                card_id: candidate.card_id,
                expected: query.len(),
                actual: candidate.embedding.len(),
            });
        }
        let candidate_norm = norm(candidate.embedding, |index| RankError::NonFiniteCandidate {
            card_id: candidate.card_id,
            index,
        })?;
        if candidate_norm == 0.0 {
            return Err(RankError::ZeroNormCandidate {
                card_id: candidate.card_id,
            });
        }
        let dot = query
            .iter()
            .zip(candidate.embedding)
            .map(|(left, right)| f64::from(*left) * f64::from(*right))
            .sum::<f64>();
        let score = (dot / (query_norm * candidate_norm)).clamp(-1.0, 1.0) as f32;
        if score >= minimum {
            scored.push((candidate.card_id, candidate.name, score));
        }
    }

    scored.sort_by(|left, right| {
        right
            .2
            .total_cmp(&left.2)
            .then_with(|| left.1.cmp(right.1))
            .then_with(|| left.0.cmp(&right.0))
    });
    scored.truncate(limit);
    Ok(scored
        .into_iter()
        .map(|(card_id, _, score)| ScoredCard { card_id, score })
        .collect())
}

fn norm(values: &[f32], error: impl Fn(usize) -> RankError) -> Result<f64, RankError> {
    let mut squared = 0.0_f64;
    for (index, value) in values.iter().enumerate() {
        if !value.is_finite() {
            return Err(error(index));
        }
        squared += f64::from(*value) * f64::from(*value);
    }
    Ok(squared.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_score(actual: f32, expected: f32) {
        assert!(
            (actual - expected).abs() < 0.000_001,
            "{actual} != {expected}"
        );
    }

    #[test]
    fn ranks_exact_cosine_and_applies_limit_and_minimum() {
        let candidates = [
            Candidate {
                card_id: 1,
                name: "Direct",
                embedding: &[1.0, 0.0],
            },
            Candidate {
                card_id: 2,
                name: "Near",
                embedding: &[0.8, 0.6],
            },
            Candidate {
                card_id: 3,
                name: "Opposite",
                embedding: &[-1.0, 0.0],
            },
        ];

        let result = rank(&[2.0, 0.0], &candidates, 2, Some(0.5)).unwrap();
        assert_eq!(
            result.iter().map(|hit| hit.card_id).collect::<Vec<_>>(),
            [1, 2]
        );
        assert_score(result[0].score, 1.0);
        assert_score(result[1].score, 0.8);
    }

    #[test]
    fn resolves_equal_scores_by_name_then_card_id() {
        let candidates = [
            Candidate {
                card_id: 9,
                name: "Zulu",
                embedding: &[1.0],
            },
            Candidate {
                card_id: 3,
                name: "Alpha",
                embedding: &[1.0],
            },
            Candidate {
                card_id: 2,
                name: "Alpha",
                embedding: &[1.0],
            },
        ];

        let result = rank(&[1.0], &candidates, 10, None).unwrap();
        assert_eq!(
            result.iter().map(|hit| hit.card_id).collect::<Vec<_>>(),
            [2, 3, 9]
        );
    }

    #[test]
    fn rejects_invalid_vectors_and_thresholds() {
        let valid = Candidate {
            card_id: 7,
            name: "Valid",
            embedding: &[1.0, 0.0],
        };
        assert_eq!(rank(&[], &[valid], 1, None), Err(RankError::EmptyVector));
        assert_eq!(
            rank(&[0.0, 0.0], &[valid], 1, None),
            Err(RankError::ZeroNormQuery)
        );
        assert_eq!(
            rank(&[1.0], &[valid], 1, None),
            Err(RankError::Dimension {
                card_id: 7,
                expected: 1,
                actual: 2,
            })
        );
        assert_eq!(
            rank(&[1.0, f32::NAN], &[valid], 1, None),
            Err(RankError::NonFiniteQuery { index: 1 })
        );
        assert_eq!(
            rank(&[1.0, 0.0], &[valid], 1, Some(1.1)),
            Err(RankError::InvalidMinimumScore)
        );
    }

    #[test]
    fn decodes_little_endian_f32_blobs() {
        let bytes = [1.25_f32.to_le_bytes(), (-0.5_f32).to_le_bytes()].concat();
        assert_eq!(decode_f32_le(&bytes, 2).unwrap(), vec![1.25, -0.5]);
        assert_eq!(encode_f32_le(&[1.25, -0.5]).unwrap(), bytes);
        assert_eq!(
            decode_f32_le(&bytes[..4], 2),
            Err(RankError::ByteLength {
                expected: 8,
                actual: 4,
            })
        );
    }
}
