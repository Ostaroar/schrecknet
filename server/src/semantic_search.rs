//! Filter-first semantic card search shared by MCP and REST adapters.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use rusqlite::Connection;
use schemars::JsonSchema;
use schrecknet_core::semantic::{self, Candidate};
use schrecknet_core::semantic_native::{LocalEmbedder, ModelBundle};
use serde::{Deserialize, Serialize};

use crate::cards_db::{self, CryptSearchParams, LibrarySearchParams};

const DEFAULT_LIMIT: usize = 20;
const MAX_LIMIT: usize = 50;
const MAX_QUERY_CHARS: usize = 512;

#[derive(Clone, Copy, Debug, Default, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SemanticKind {
    #[default]
    All,
    Crypt,
    Library,
}

#[derive(Clone, Debug, Deserialize, JsonSchema)]
pub struct SemanticSearchParams {
    /// English concept query, e.g. "wake and block" or "gain pool".
    #[schemars(length(min = 1, max = 512))]
    pub query: String,
    /// Search both card kinds (default), crypt only, or library only.
    #[serde(default)]
    pub kind: SemanticKind,
    /// Structured crypt filters. Its optional lexical `text` filter may be
    /// used as an additional prefilter; it is not the semantic query.
    #[serde(default)]
    pub crypt: CryptSearchParams,
    /// Structured library filters. Its optional lexical `text` filter may be
    /// used as an additional prefilter; it is not the semantic query.
    #[serde(default)]
    pub library: LibrarySearchParams,
    /// Maximum number of hits, from 1 through 50 (default 20).
    #[serde(default = "default_limit")]
    #[schemars(range(min = 1, max = 50))]
    pub limit: usize,
    /// Optional minimum cosine score, from -1 through 1.
    #[serde(default)]
    #[schemars(range(min = -1.0, max = 1.0))]
    pub min_score: Option<f32>,
}

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct SemanticHit {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub score: f32,
    pub model_id: String,
}

#[derive(Debug)]
pub enum SemanticError {
    InvalidRequest(String),
    ModelUnavailable(String),
    Data(String),
}

impl fmt::Display for SemanticError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidRequest(message) => {
                write!(formatter, "invalid semantic search: {message}")
            }
            Self::ModelUnavailable(message) => {
                write!(formatter, "semantic model unavailable: {message}")
            }
            Self::Data(message) => write!(formatter, "semantic search data error: {message}"),
        }
    }
}

impl std::error::Error for SemanticError {}

pub struct SemanticSearchService {
    model_dir: PathBuf,
    embedder: OnceLock<Result<Mutex<LocalEmbedder>, String>>,
}

impl SemanticSearchService {
    pub fn new(model_dir: impl Into<PathBuf>) -> Self {
        Self {
            model_dir: model_dir.into(),
            embedder: OnceLock::new(),
        }
    }

    pub fn search(
        &self,
        conn: &Connection,
        params: &SemanticSearchParams,
    ) -> Result<Vec<SemanticHit>, SemanticError> {
        validate_params(params)?;
        let (model_id, dimensions, query_embedding) = self.embed_query(params.query.trim())?;
        let candidate_ids = filtered_card_ids(conn, params)?;
        if candidate_ids.is_empty() {
            return Ok(Vec::new());
        }
        let candidates = load_candidates(conn, &candidate_ids, &model_id, dimensions)?;
        if candidates.len() != candidate_ids.len() {
            return Err(SemanticError::Data(format!(
                "{} filtered cards but {} matching embeddings for model {model_id}",
                candidate_ids.len(),
                candidates.len()
            )));
        }
        rank_candidates(
            &query_embedding,
            candidates,
            params.limit,
            params.min_score,
            &model_id,
        )
    }

    fn embed_query(&self, query: &str) -> Result<(String, usize, Vec<f32>), SemanticError> {
        let initialized = self.embedder.get_or_init(|| {
            ModelBundle::load(&self.model_dir)
                .and_then(LocalEmbedder::load)
                .map(Mutex::new)
                .map_err(|error| error.to_string())
        });
        let embedder = initialized
            .as_ref()
            .map_err(|message| SemanticError::ModelUnavailable(message.clone()))?;
        let mut embedder = embedder
            .lock()
            .map_err(|_| SemanticError::ModelUnavailable("model lock is poisoned".to_owned()))?;
        let model_id = embedder.manifest().model_id.clone();
        let dimensions = embedder.manifest().dimensions;
        let embedding = embedder
            .embed_one(query)
            .map_err(|error| SemanticError::ModelUnavailable(error.to_string()))?;
        Ok((model_id, dimensions, embedding))
    }
}

fn validate_params(params: &SemanticSearchParams) -> Result<(), SemanticError> {
    let query = params.query.trim();
    if query.is_empty() {
        return Err(SemanticError::InvalidRequest(
            "query must not be empty".to_owned(),
        ));
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(SemanticError::InvalidRequest(format!(
            "query must be at most {MAX_QUERY_CHARS} characters"
        )));
    }
    if !(1..=MAX_LIMIT).contains(&params.limit) {
        return Err(SemanticError::InvalidRequest(format!(
            "limit must be between 1 and {MAX_LIMIT}"
        )));
    }
    if params
        .min_score
        .is_some_and(|score| !score.is_finite() || !(-1.0..=1.0).contains(&score))
    {
        return Err(SemanticError::InvalidRequest(
            "min_score must be finite and between -1 and 1".to_owned(),
        ));
    }
    Ok(())
}

fn filtered_card_ids(
    conn: &Connection,
    params: &SemanticSearchParams,
) -> Result<HashSet<i64>, SemanticError> {
    let mut ids = HashSet::new();
    if params.kind != SemanticKind::Library {
        ids.extend(
            cards_db::filter_crypt(conn, &params.crypt)
                .map_err(|error| SemanticError::Data(error.to_string()))?
                .into_iter()
                .map(|card| card.id),
        );
    }
    if params.kind != SemanticKind::Crypt {
        ids.extend(
            cards_db::filter_library(conn, &params.library)
                .map_err(|error| SemanticError::Data(error.to_string()))?
                .into_iter()
                .map(|card| card.id),
        );
    }
    Ok(ids)
}

struct OwnedCandidate {
    card_id: i64,
    name: String,
    kind: String,
    embedding: Vec<f32>,
}

fn load_candidates(
    conn: &Connection,
    candidate_ids: &HashSet<i64>,
    model_id: &str,
    dimensions: usize,
) -> Result<Vec<OwnedCandidate>, SemanticError> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.kind, e.dimensions, e.embedding
             FROM card_embeddings e
             JOIN cards c ON c.id = e.card_id
             WHERE e.model_id = ?1
             ORDER BY c.id",
        )
        .map_err(|error| SemanticError::Data(error.to_string()))?;
    let rows = stmt
        .query_map([model_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, usize>(3)?,
                row.get::<_, Vec<u8>>(4)?,
            ))
        })
        .map_err(|error| SemanticError::Data(error.to_string()))?;

    let mut candidates = Vec::with_capacity(candidate_ids.len());
    for row in rows {
        let (card_id, name, kind, stored_dimensions, bytes) =
            row.map_err(|error| SemanticError::Data(error.to_string()))?;
        if !candidate_ids.contains(&card_id) {
            continue;
        }
        if stored_dimensions != dimensions {
            return Err(SemanticError::Data(format!(
                "card {card_id} has {stored_dimensions} dimensions; model expects {dimensions}"
            )));
        }
        let embedding = semantic::decode_f32_le(&bytes, dimensions)
            .map_err(|error| SemanticError::Data(error.to_string()))?;
        candidates.push(OwnedCandidate {
            card_id,
            name,
            kind,
            embedding,
        });
    }
    Ok(candidates)
}

fn rank_candidates(
    query_embedding: &[f32],
    candidates: Vec<OwnedCandidate>,
    limit: usize,
    min_score: Option<f32>,
    model_id: &str,
) -> Result<Vec<SemanticHit>, SemanticError> {
    let mut ranking_input = Vec::with_capacity(candidates.len());
    for candidate in &candidates {
        let card_id = u32::try_from(candidate.card_id).map_err(|_| {
            SemanticError::Data(format!(
                "card id {} is outside the u32 contract",
                candidate.card_id
            ))
        })?;
        ranking_input.push(Candidate {
            card_id,
            name: &candidate.name,
            embedding: &candidate.embedding,
        });
    }
    let ranked = semantic::rank(query_embedding, &ranking_input, limit, min_score)
        .map_err(|error| SemanticError::Data(error.to_string()))?;
    let mut summaries = HashMap::with_capacity(candidates.len());
    for candidate in candidates {
        let card_id = u32::try_from(candidate.card_id).map_err(|_| {
            SemanticError::Data(format!(
                "card id {} is outside the u32 contract",
                candidate.card_id
            ))
        })?;
        summaries.insert(card_id, candidate);
    }
    ranked
        .into_iter()
        .map(|ranked| {
            let candidate = summaries.get(&ranked.card_id).ok_or_else(|| {
                SemanticError::Data(format!("ranked unknown card {}", ranked.card_id))
            })?;
            Ok(SemanticHit {
                id: candidate.card_id,
                name: candidate.name.clone(),
                kind: candidate.kind.clone(),
                score: ranked.score,
                model_id: model_id.to_owned(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(query: &str) -> SemanticSearchParams {
        SemanticSearchParams {
            query: query.to_owned(),
            kind: SemanticKind::All,
            crypt: CryptSearchParams::default(),
            library: LibrarySearchParams::default(),
            limit: DEFAULT_LIMIT,
            min_score: None,
        }
    }

    #[test]
    fn validates_query_limit_and_score() {
        assert!(validate_params(&params("gain pool")).is_ok());
        assert!(validate_params(&params("   ")).is_err());

        let mut invalid_limit = params("wake");
        invalid_limit.limit = 0;
        assert!(validate_params(&invalid_limit).is_err());

        let mut invalid_score = params("wake");
        invalid_score.min_score = Some(f32::NAN);
        assert!(validate_params(&invalid_score).is_err());
    }

    #[test]
    fn minimal_json_request_uses_documented_defaults() {
        let params: SemanticSearchParams =
            serde_json::from_str(r#"{"query":"wake and block"}"#).unwrap();
        assert_eq!(params.query, "wake and block");
        assert_eq!(params.kind, SemanticKind::All);
        assert_eq!(params.limit, DEFAULT_LIMIT);
        assert_eq!(params.min_score, None);
        assert!(params.crypt.text.is_empty());
        assert!(params.crypt.disciplines.is_empty());
        assert!(params.library.text.is_empty());
        assert!(params.library.disciplines.is_empty());
    }

    #[test]
    fn machine_schema_advertises_runtime_bounds() {
        let schema = serde_json::to_value(schemars::schema_for!(SemanticSearchParams)).unwrap();
        assert_eq!(
            schema.pointer("/properties/query/minLength"),
            Some(&1.into())
        );
        assert_eq!(
            schema.pointer("/properties/query/maxLength"),
            Some(&MAX_QUERY_CHARS.into())
        );
        assert_eq!(schema.pointer("/properties/limit/minimum"), Some(&1.into()));
        assert_eq!(
            schema.pointer("/properties/limit/maximum"),
            Some(&MAX_LIMIT.into())
        );
        assert_eq!(
            schema.pointer("/properties/min_score/minimum"),
            Some(&(-1.0).into())
        );
        assert_eq!(
            schema.pointer("/properties/min_score/maximum"),
            Some(&1.0.into())
        );
    }

    #[test]
    fn shared_ranker_shapes_stable_machine_hits() {
        let candidates = vec![
            OwnedCandidate {
                card_id: 20,
                name: "Block".into(),
                kind: "library".into(),
                embedding: vec![1.0, 0.0],
            },
            OwnedCandidate {
                card_id: 10,
                name: "Bleed".into(),
                kind: "library".into(),
                embedding: vec![0.0, 1.0],
            },
        ];
        let hits = rank_candidates(&[1.0, 0.0], candidates, 1, None, "test-model").unwrap();
        assert_eq!(
            hits,
            vec![SemanticHit {
                id: 20,
                name: "Block".into(),
                kind: "library".into(),
                score: 1.0,
                model_id: "test-model".into(),
            }]
        );
    }
}
