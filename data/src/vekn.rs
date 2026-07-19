//! Fetch and decode official VEKN crypt and library requirement metadata.

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::{Duration, SystemTime};

use schrecknet_core::crypt_metadata::{normalize_crypt_metadata, CryptMetadata};
use serde::Deserialize;

pub const SOURCE_URL: &str = "https://www.vekn.net/images/stories/downloads/vtescsv_utf8.zip";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const LIBRARY_MEMBER: &str = "vteslibmeta.csv";
const CRYPT_MEMBER: &str = "vtescrypt.csv";

pub type LibraryRequirements = HashMap<i64, String>;
pub type CryptMetadataById = HashMap<i64, CryptMetadata>;

pub struct VeknMetadata {
    pub library_requirements: LibraryRequirements,
    pub crypt: CryptMetadataById,
}

#[derive(Debug, Deserialize)]
struct RequirementRow {
    #[serde(rename = "Id")]
    id: i64,
    #[serde(rename = "Requirement")]
    requirement: String,
}

#[derive(Debug, Deserialize)]
struct CryptRow {
    #[serde(rename = "Id")]
    id: i64,
    #[serde(rename = "Type")]
    card_type: String,
    #[serde(rename = "Adv")]
    advancement: String,
    #[serde(rename = "Card Text")]
    card_text: String,
    #[serde(rename = "Title")]
    title: String,
    #[serde(rename = "Banned")]
    banned: String,
}

pub fn fetch_metadata(cache_dir: &Path) -> Result<VeknMetadata, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(cache_dir)?;
    let cache_file = cache_dir.join("vtescsv_utf8.zip");
    let fresh = std::fs::metadata(&cache_file)
        .and_then(|metadata| metadata.modified())
        .map(|modified| {
            SystemTime::now()
                .duration_since(modified)
                .unwrap_or(Duration::MAX)
                < CACHE_TTL
        })
        .unwrap_or(false);

    let archive = if fresh {
        eprintln!("vekn: using cached {}", cache_file.display());
        std::fs::read(&cache_file)?
    } else {
        eprintln!("vekn: fetching {SOURCE_URL}");
        let mut bytes = Vec::new();
        ureq::get(SOURCE_URL)
            .call()?
            .into_reader()
            .read_to_end(&mut bytes)?;
        std::fs::write(&cache_file, &bytes)?;
        bytes
    };

    parse_metadata(&archive)
}

fn parse_metadata(archive: &[u8]) -> Result<VeknMetadata, Box<dyn std::error::Error>> {
    let mut zip = zip::ZipArchive::new(Cursor::new(archive))?;
    let library_requirements = {
        let member = zip.by_name(LIBRARY_MEMBER)?;
        parse_library_csv(member)?
    };
    let crypt = {
        let member = zip.by_name(CRYPT_MEMBER)?;
        parse_crypt_csv(member)?
    };
    Ok(VeknMetadata {
        library_requirements,
        crypt,
    })
}

fn parse_library_csv(reader: impl Read) -> Result<LibraryRequirements, Box<dyn std::error::Error>> {
    let mut requirements = LibraryRequirements::new();
    for row in csv::Reader::from_reader(reader).deserialize::<RequirementRow>() {
        let row = row?;
        if !row.requirement.trim().is_empty() {
            requirements.insert(row.id, row.requirement);
        }
    }
    Ok(requirements)
}

fn parse_crypt_csv(reader: impl Read) -> Result<CryptMetadataById, Box<dyn std::error::Error>> {
    let mut metadata = CryptMetadataById::new();
    for row in csv::Reader::from_reader(reader).deserialize::<CryptRow>() {
        let row = row?;
        metadata.insert(
            row.id,
            normalize_crypt_metadata(
                &row.card_type,
                &row.card_text,
                &row.title,
                &row.advancement,
                &row.banned,
            ),
        );
    }
    Ok(metadata)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quoted_commas_and_skips_empty_requirements() {
        let csv = b"Id,Name,Requirement\n100084,Archon,\"prince,justicar\"\n100001,.44 Magnum,\n";
        let requirements = parse_library_csv(csv.as_slice()).unwrap();
        assert_eq!(
            requirements.get(&100084).map(String::as_str),
            Some("prince,justicar")
        );
        assert!(!requirements.contains_key(&100001));
    }

    #[test]
    fn parses_and_normalizes_crypt_metadata() {
        let csv = b"Id,Type,Adv,Card Text,Title,Banned\n201733,Vampire,,\"Sabbat cardinal: text, with comma\",cardinal,\n200999,Vampire,Advanced,\"Advanced, Camarilla: text\",prince,Banned\n";
        let metadata = parse_crypt_csv(csv.as_slice()).unwrap();
        assert_eq!(metadata[&201733].sect.as_deref(), Some("Sabbat"));
        assert_eq!(metadata[&201733].title.as_deref(), Some("Cardinal"));
        assert_eq!(metadata[&201733].votes, 3);
        assert!(metadata[&200999].advanced);
        assert_eq!(metadata[&200999].banned.as_deref(), Some("Banned"));
    }
}
