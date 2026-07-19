//! Fetch and decode official VEKN library requirement metadata.

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::{Duration, SystemTime};

use serde::Deserialize;

pub const SOURCE_URL: &str = "https://www.vekn.net/images/stories/downloads/vtescsv_utf8.zip";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const ARCHIVE_MEMBER: &str = "vteslibmeta.csv";

pub type LibraryRequirements = HashMap<i64, String>;

#[derive(Debug, Deserialize)]
struct RequirementRow {
    #[serde(rename = "Id")]
    id: i64,
    #[serde(rename = "Requirement")]
    requirement: String,
}

pub fn fetch_library_requirements(
    cache_dir: &Path,
) -> Result<LibraryRequirements, Box<dyn std::error::Error>> {
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

    parse_library_requirements(&archive)
}

fn parse_library_requirements(
    archive: &[u8],
) -> Result<LibraryRequirements, Box<dyn std::error::Error>> {
    let mut zip = zip::ZipArchive::new(Cursor::new(archive))?;
    let member = zip.by_name(ARCHIVE_MEMBER)?;
    parse_csv(member)
}

fn parse_csv(reader: impl Read) -> Result<LibraryRequirements, Box<dyn std::error::Error>> {
    let mut requirements = LibraryRequirements::new();
    for row in csv::Reader::from_reader(reader).deserialize::<RequirementRow>() {
        let row = row?;
        if !row.requirement.trim().is_empty() {
            requirements.insert(row.id, row.requirement);
        }
    }
    Ok(requirements)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quoted_commas_and_skips_empty_requirements() {
        let csv = b"Id,Name,Requirement\n100084,Archon,\"prince,justicar\"\n100001,.44 Magnum,\n";
        let requirements = parse_csv(csv.as_slice()).unwrap();
        assert_eq!(
            requirements.get(&100084).map(String::as_str),
            Some("prince,justicar")
        );
        assert!(!requirements.contains_key(&100001));
    }
}
