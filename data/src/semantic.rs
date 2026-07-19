//! Pinned model acquisition and deterministic V5 card embedding generation.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{Error as IoError, ErrorKind, Read};
use std::path::{Component, Path, PathBuf};

use fastembed::{
    InitOptionsUserDefined, Pooling, QuantizationMode, TextEmbedding, TokenizerFiles,
    UserDefinedEmbeddingModel,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const DEFAULT_MANIFEST: &str = "models/semantic.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ModelManifest {
    pub model_id: String,
    pub base_model: String,
    pub source_repository: String,
    pub revision: String,
    pub license: String,
    pub dimensions: usize,
    pub max_length: usize,
    pub pooling: String,
    pub normalized: bool,
    pub inference_batch_size: usize,
    pub document_version: u32,
    pub model_file: String,
    pub files: Vec<ModelFile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ModelFile {
    pub path: String,
    pub size: usize,
    pub sha256: String,
}

#[derive(Clone, Debug)]
pub struct PreparedModel {
    pub manifest: ModelManifest,
    pub root: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CardDocument {
    card_id: i64,
    text: String,
}

/// Downloads only the exact revision in the checked-in manifest, verifies every
/// byte, and emits a browser-ready local model directory under the build output.
pub fn prepare_model(
    cache_dir: &Path,
    out_dir: &Path,
) -> Result<PreparedModel, Box<dyn std::error::Error>> {
    let manifest_path = PathBuf::from(
        std::env::var("SCHRECKNET_SEMANTIC_MANIFEST")
            .unwrap_or_else(|_| DEFAULT_MANIFEST.to_owned()),
    );
    let manifest_bytes = std::fs::read(&manifest_path)?;
    let manifest: ModelManifest = serde_json::from_slice(&manifest_bytes)?;
    validate_manifest(&manifest)?;

    let cache_root = cache_dir.join("semantic").join(&manifest.model_id);
    let output_root = out_dir
        .join("models")
        .join("semantic")
        .join(&manifest.model_id);
    for file in &manifest.files {
        let relative = safe_relative_path(&file.path)?;
        let cached = cache_root.join(&relative);
        let bytes = match std::fs::read(&cached) {
            Ok(bytes) if verify_file(file, &bytes).is_ok() => bytes,
            _ => {
                let url = format!(
                    "https://huggingface.co/{}/resolve/{}/{}",
                    manifest.source_repository, manifest.revision, file.path
                );
                eprintln!("semantic model: fetching {}", file.path);
                let mut response = ureq::get(&url).call()?.into_reader();
                let mut bytes = Vec::with_capacity(file.size);
                response.read_to_end(&mut bytes)?;
                verify_file(file, &bytes)?;
                if let Some(parent) = cached.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&cached, &bytes)?;
                bytes
            }
        };

        let emitted = output_root.join(relative);
        if let Some(parent) = emitted.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(emitted, bytes)?;
    }

    let public_manifest = out_dir
        .join("models")
        .join("semantic")
        .join("manifest.json");
    if let Some(parent) = public_manifest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(public_manifest, manifest_bytes)?;

    Ok(PreparedModel {
        manifest,
        root: output_root,
    })
}

/// Generates and stores one query-compatible embedding per V5 card.
pub fn embed_cards(
    conn: &Connection,
    prepared: &PreparedModel,
) -> Result<usize, Box<dyn std::error::Error>> {
    let documents = card_documents(conn)?;
    if documents.is_empty() {
        return Err(IoError::new(ErrorKind::InvalidData, "no cards to embed").into());
    }

    let manifest = &prepared.manifest;
    let model_bytes = read_model_file(prepared, &manifest.model_file)?;
    let tokenizer_files = TokenizerFiles {
        tokenizer_file: read_model_file(prepared, "tokenizer.json")?,
        config_file: read_model_file(prepared, "config.json")?,
        special_tokens_map_file: read_model_file(prepared, "special_tokens_map.json")?,
        tokenizer_config_file: read_model_file(prepared, "tokenizer_config.json")?,
    };
    let user_model = UserDefinedEmbeddingModel::new(model_bytes, tokenizer_files)
        .with_pooling(Pooling::Mean)
        .with_quantization(QuantizationMode::Dynamic);
    let mut model = TextEmbedding::try_new_from_user_defined(
        user_model,
        InitOptionsUserDefined::new().with_max_length(manifest.max_length),
    )?;

    conn.execute("DELETE FROM card_embeddings", [])?;
    let transaction = conn.unchecked_transaction()?;
    for (index, document) in documents.iter().enumerate() {
        // The pinned INT8 graph uses dynamic activation quantization. Running one
        // document per inference keeps corpus vectors compatible with the single
        // query inference performed by browser and server adapters.
        let embeddings = model.embed([document.text.as_str()], None)?;
        let embedding = embeddings.first().ok_or_else(|| {
            IoError::new(ErrorKind::InvalidData, "model returned no card embedding")
        })?;
        if embedding.len() != manifest.dimensions {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!(
                    "card {} embedding has {} dimensions; expected {}",
                    document.card_id,
                    embedding.len(),
                    manifest.dimensions
                ),
            )
            .into());
        }
        let norm = embedding
            .iter()
            .map(|value| f64::from(*value) * f64::from(*value))
            .sum::<f64>()
            .sqrt();
        if (norm - 1.0).abs() > 0.001 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("card {} embedding norm is {norm}", document.card_id),
            )
            .into());
        }
        let bytes = schrecknet_core::semantic::encode_f32_le(embedding)?;
        transaction.execute(
            "INSERT INTO card_embeddings
             (card_id, model_id, dimensions, embedding)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                document.card_id,
                manifest.model_id,
                manifest.dimensions as i64,
                bytes
            ],
        )?;
        if (index + 1) % 100 == 0 || index + 1 == documents.len() {
            eprintln!(
                "semantic model: embedded {}/{} cards",
                index + 1,
                documents.len()
            );
        }
    }
    transaction.commit()?;

    let count: usize = conn.query_row(
        "SELECT COUNT(*) FROM card_embeddings WHERE model_id = ?1",
        [&manifest.model_id],
        |row| row.get(0),
    )?;
    if count != documents.len() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("stored {count} embeddings for {} cards", documents.len()),
        )
        .into());
    }
    Ok(count)
}

fn validate_manifest(manifest: &ModelManifest) -> Result<(), IoError> {
    if manifest.model_id.trim().is_empty()
        || manifest.source_repository.trim().is_empty()
        || manifest.revision.len() != 40
        || !manifest
            .revision
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || manifest.dimensions == 0
        || manifest.max_length == 0
        || manifest.pooling != "mean"
        || !manifest.normalized
        || manifest.inference_batch_size != 1
        || manifest.files.is_empty()
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "semantic model manifest violates the ADR 0006 contract",
        ));
    }
    let model_id_path = safe_relative_path(&manifest.model_id)?;
    if model_id_path.components().count() != 1 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "semantic model id must be one safe path segment",
        ));
    }
    safe_relative_path(&manifest.model_file)?;
    if !manifest
        .files
        .iter()
        .any(|file| file.path == manifest.model_file)
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "semantic model file is absent from the manifest file list",
        ));
    }
    let mut paths = BTreeSet::new();
    for file in &manifest.files {
        safe_relative_path(&file.path)?;
        if !paths.insert(file.path.as_str())
            || file.size == 0
            || file.sha256.len() != 64
            || !file.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("invalid semantic model file entry: {}", file.path),
            ));
        }
    }
    for required in [
        "config.json",
        "special_tokens_map.json",
        "tokenizer.json",
        "tokenizer_config.json",
    ] {
        if !paths.contains(required) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("semantic model manifest is missing {required}"),
            ));
        }
    }
    Ok(())
}

fn safe_relative_path(value: &str) -> Result<PathBuf, IoError> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || !path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("unsafe semantic model path: {value}"),
        ));
    }
    Ok(path.to_owned())
}

fn verify_file(file: &ModelFile, bytes: &[u8]) -> Result<(), IoError> {
    let digest = format!("{:x}", Sha256::digest(bytes));
    if bytes.len() != file.size || digest != file.sha256 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "semantic model checksum mismatch for {} ({} bytes, sha256 {digest})",
                file.path,
                bytes.len()
            ),
        ));
    }
    Ok(())
}

fn read_model_file(
    prepared: &PreparedModel,
    relative: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let path = prepared.root.join(safe_relative_path(relative)?);
    Ok(std::fs::read(path)?)
}

fn card_documents(conn: &Connection) -> rusqlite::Result<Vec<CardDocument>> {
    let mut disciplines = BTreeMap::<i64, Vec<String>>::new();
    let mut discipline_stmt = conn.prepare(
        "SELECT card_id, discipline, superior
         FROM card_disciplines
         ORDER BY card_id, discipline, superior DESC",
    )?;
    let rows = discipline_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, bool>(2)?,
        ))
    })?;
    for row in rows {
        let (card_id, code, superior) = row?;
        let level = if superior { "superior" } else { "inferior" };
        disciplines.entry(card_id).or_default().push(format!(
            "{} ({}) {level}",
            discipline_name(&code),
            code.to_uppercase()
        ));
    }

    let mut stmt = conn.prepare(
        "SELECT id, kind, name, card_text, clan, capacity, grp, title, types,
                blood_cost, pool_cost
         FROM cards
         ORDER BY id",
    )?;
    let rows = stmt.query_map([], |row| {
        let card_id = row.get::<_, i64>(0)?;
        let kind = row.get::<_, String>(1)?;
        let name = row.get::<_, String>(2)?;
        let card_text = row.get::<_, Option<String>>(3)?;
        let clan = row.get::<_, Option<String>>(4)?;
        let capacity = row.get::<_, Option<i64>>(5)?;
        let group = row.get::<_, Option<i64>>(6)?;
        let title = row.get::<_, Option<String>>(7)?;
        let types_json = row.get::<_, Option<String>>(8)?;
        let blood_cost = row.get::<_, Option<String>>(9)?;
        let pool_cost = row.get::<_, Option<String>>(10)?;

        let mut fields = Vec::new();
        push_field(&mut fields, "Name", Some(name.as_str()));
        push_field(
            &mut fields,
            "Kind",
            Some(if kind == "crypt" {
                "Crypt card"
            } else {
                "Library card"
            }),
        );
        push_field(&mut fields, "Clan or path", clan.as_deref());
        if let Some(types) = types_json
            .as_deref()
            .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
        {
            push_field(&mut fields, "Types", Some(&types.join(", ")));
        }
        if let Some(card_disciplines) = disciplines.get(&card_id) {
            push_field(
                &mut fields,
                "Disciplines",
                Some(&card_disciplines.join(", ")),
            );
        }
        let capacity_text = capacity.map(|value| value.to_string());
        let group_text = group.map(|value| value.to_string());
        push_field(&mut fields, "Capacity", capacity_text.as_deref());
        push_field(&mut fields, "Group", group_text.as_deref());
        push_field(&mut fields, "Title", title.as_deref());
        push_field(&mut fields, "Blood cost", blood_cost.as_deref());
        push_field(&mut fields, "Pool cost", pool_cost.as_deref());
        push_field(&mut fields, "Rules text", card_text.as_deref());

        Ok(CardDocument {
            card_id,
            text: fields.join("\n"),
        })
    })?;
    let documents = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(documents)
}

fn push_field(fields: &mut Vec<String>, label: &str, value: Option<&str>) {
    let Some(value) = value else { return };
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if !normalized.is_empty() {
        fields.push(format!("{label}: {normalized}"));
    }
}

fn discipline_name(code: &str) -> &str {
    match code.to_ascii_lowercase().as_str() {
        "ani" => "Animalism",
        "aus" => "Auspex",
        "cel" => "Celerity",
        "chi" => "Chimerstry",
        "dai" => "Daimoinon",
        "dem" => "Dementation",
        "dom" => "Dominate",
        "for" => "Fortitude",
        "mel" => "Melpominee",
        "myt" => "Mytherceria",
        "nec" => "Necromancy",
        "obe" => "Obeah",
        "obf" => "Obfuscate",
        "obt" => "Obtenebration",
        "pot" => "Potence",
        "pre" => "Presence",
        "pro" => "Protean",
        "qui" => "Quietus",
        "san" => "Sanguinus",
        "ser" => "Serpentis",
        "spi" => "Spiritus",
        "tem" => "Temporis",
        "tha" => "Thaumaturgy",
        "val" => "Valeren",
        "vic" => "Vicissitude",
        _ => code,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_document_includes_expanded_disciplines() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cards(
               id INT, kind TEXT, name TEXT, card_text TEXT, clan TEXT,
               capacity INT, grp INT, title TEXT, types TEXT,
               blood_cost TEXT, pool_cost TEXT
             );
             CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
             INSERT INTO cards VALUES
               (2, 'crypt', 'Example', '  Gain  one blood.\nUnlock. ', 'Ventrue',
                7, 6, 'Prince', '[\"Vampire\"]', NULL, NULL);
             INSERT INTO card_disciplines VALUES (2, 'dom', 1), (2, 'for', 0);",
        )
        .unwrap();

        let documents = card_documents(&conn).unwrap();
        assert_eq!(
            documents,
            vec![CardDocument {
                card_id: 2,
                text: "Name: Example\nKind: Crypt card\nClan or path: Ventrue\nTypes: Vampire\nDisciplines: Dominate (DOM) superior, Fortitude (FOR) inferior\nCapacity: 7\nGroup: 6\nTitle: Prince\nRules text: Gain one blood. Unlock.".into(),
            }]
        );
    }

    #[test]
    fn rejects_model_path_traversal() {
        assert!(safe_relative_path("onnx/model.onnx").is_ok());
        assert!(safe_relative_path("../model.onnx").is_err());
        assert!(safe_relative_path("/model.onnx").is_err());
    }

    #[test]
    fn verifies_size_and_sha256() {
        let file = ModelFile {
            path: "test".into(),
            size: 3,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".into(),
        };
        assert!(verify_file(&file, b"abc").is_ok());
        assert!(verify_file(&file, b"abd").is_err());
    }

    #[test]
    fn checked_in_manifest_satisfies_the_runtime_contract() {
        let manifest: ModelManifest =
            serde_json::from_str(include_str!("../../models/semantic.json")).unwrap();
        validate_manifest(&manifest).unwrap();
    }
}
