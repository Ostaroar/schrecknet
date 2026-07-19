//! Native ONNX model contract shared by the data builder and server.
//!
//! This module is not compiled into browser WASM. The browser uses the same
//! checked-in manifest and model files through Transformers.js; vector ranking
//! remains in `semantic` on both targets.

use std::collections::BTreeSet;
use std::io::{Error as IoError, ErrorKind};
use std::path::{Component, Path, PathBuf};

use fastembed::{
    InitOptionsUserDefined, Pooling, QuantizationMode, TextEmbedding, TokenizerFiles,
    UserDefinedEmbeddingModel,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub type NativeResult<T> = Result<T, Box<dyn std::error::Error>>;

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
pub struct ModelBundle {
    pub manifest: ModelManifest,
    pub root: PathBuf,
}

impl ModelBundle {
    pub fn new(manifest: ModelManifest, root: PathBuf) -> NativeResult<Self> {
        validate_manifest(&manifest)?;
        for file in &manifest.files {
            let bytes = std::fs::read(root.join(safe_relative_path(&file.path)?))?;
            verify_file(file, &bytes)?;
        }
        Ok(Self { manifest, root })
    }

    /// Loads `<directory>/manifest.json` and the model-id subdirectory it names.
    pub fn load(directory: &Path) -> NativeResult<Self> {
        let manifest = load_manifest(&directory.join("manifest.json"))?;
        let root = directory.join(&manifest.model_id);
        Self::new(manifest, root)
    }

    fn read(&self, relative: &str) -> NativeResult<Vec<u8>> {
        Ok(std::fs::read(
            self.root.join(safe_relative_path(relative)?),
        )?)
    }
}

pub struct LocalEmbedder {
    manifest: ModelManifest,
    model: TextEmbedding,
}

impl LocalEmbedder {
    pub fn load(bundle: ModelBundle) -> NativeResult<Self> {
        let model_bytes = bundle.read(&bundle.manifest.model_file)?;
        let tokenizer_files = TokenizerFiles {
            tokenizer_file: bundle.read("tokenizer.json")?,
            config_file: bundle.read("config.json")?,
            special_tokens_map_file: bundle.read("special_tokens_map.json")?,
            tokenizer_config_file: bundle.read("tokenizer_config.json")?,
        };
        let user_model = UserDefinedEmbeddingModel::new(model_bytes, tokenizer_files)
            .with_pooling(Pooling::Mean)
            .with_quantization(QuantizationMode::Dynamic);
        let model = TextEmbedding::try_new_from_user_defined(
            user_model,
            InitOptionsUserDefined::new().with_max_length(bundle.manifest.max_length),
        )?;
        Ok(Self {
            manifest: bundle.manifest,
            model,
        })
    }

    pub fn manifest(&self) -> &ModelManifest {
        &self.manifest
    }

    /// Embeds one text at a time as required by the pinned dynamically
    /// quantized graph, then validates its cross-platform storage contract.
    pub fn embed_one(&mut self, text: &str) -> NativeResult<Vec<f32>> {
        let embeddings = self.model.embed([text], None)?;
        let embedding = embeddings
            .into_iter()
            .next()
            .ok_or_else(|| invalid_data("model returned no embedding"))?;
        if embedding.len() != self.manifest.dimensions {
            return Err(invalid_data(format!(
                "model returned {} dimensions; expected {}",
                embedding.len(),
                self.manifest.dimensions
            ))
            .into());
        }
        let norm = embedding
            .iter()
            .map(|value| f64::from(*value) * f64::from(*value))
            .sum::<f64>()
            .sqrt();
        if !norm.is_finite() || (norm - 1.0).abs() > 0.001 {
            return Err(invalid_data(format!("embedding norm is {norm}")).into());
        }
        crate::semantic::encode_f32_le(&embedding)?;
        Ok(embedding)
    }
}

pub fn load_manifest(path: &Path) -> NativeResult<ModelManifest> {
    let manifest: ModelManifest = serde_json::from_slice(&std::fs::read(path)?)?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

pub fn validate_manifest(manifest: &ModelManifest) -> NativeResult<()> {
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
        return Err(invalid_data("semantic model manifest violates ADR 0006").into());
    }
    let model_id_path = safe_relative_path(&manifest.model_id)?;
    if model_id_path.components().count() != 1 {
        return Err(invalid_data("semantic model id must be one safe path segment").into());
    }
    safe_relative_path(&manifest.model_file)?;
    if !manifest
        .files
        .iter()
        .any(|file| file.path == manifest.model_file)
    {
        return Err(invalid_data("model file is absent from the manifest file list").into());
    }

    let mut paths = BTreeSet::new();
    for file in &manifest.files {
        safe_relative_path(&file.path)?;
        if !paths.insert(file.path.as_str())
            || file.size == 0
            || file.sha256.len() != 64
            || !file.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(invalid_data(format!("invalid model file entry: {}", file.path)).into());
        }
    }
    for required in [
        "config.json",
        "special_tokens_map.json",
        "tokenizer.json",
        "tokenizer_config.json",
    ] {
        if !paths.contains(required) {
            return Err(invalid_data(format!("model manifest is missing {required}")).into());
        }
    }
    Ok(())
}

pub fn safe_relative_path(value: &str) -> NativeResult<PathBuf> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || !path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(invalid_data(format!("unsafe semantic model path: {value}")).into());
    }
    Ok(path.to_owned())
}

pub fn verify_file(file: &ModelFile, bytes: &[u8]) -> NativeResult<()> {
    let digest = format!("{:x}", Sha256::digest(bytes));
    if bytes.len() != file.size || digest != file.sha256 {
        return Err(invalid_data(format!(
            "model checksum mismatch for {} ({} bytes, sha256 {digest})",
            file.path,
            bytes.len()
        ))
        .into());
    }
    Ok(())
}

fn invalid_data(message: impl Into<String>) -> IoError {
    IoError::new(ErrorKind::InvalidData, message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_in_manifest_satisfies_the_native_contract() {
        let manifest: ModelManifest =
            serde_json::from_str(include_str!("../../models/semantic.json")).unwrap();
        validate_manifest(&manifest).unwrap();
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
}
