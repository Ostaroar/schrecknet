//! Fetch + disk-cache the KRCG static card data export.

use std::path::Path;
use std::time::{Duration, SystemTime};

const SOURCE_URL: &str = "https://static.krcg.org/data/vtes.json";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

/// Returns the raw KRCG card array, using a local disk cache under
/// `data/.cache/vtes.json` (gitignored) so repeated `build` runs during
/// development don't hammer the network. CI always has network access, so
/// a fresh checkout simply fetches once per run.
pub fn fetch_cards(cache_dir: &Path) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(cache_dir)?;
    let cache_file = cache_dir.join("vtes.json");

    let fresh = std::fs::metadata(&cache_file)
        .and_then(|m| m.modified())
        .map(|modified| {
            SystemTime::now()
                .duration_since(modified)
                .unwrap_or(Duration::MAX)
                < CACHE_TTL
        })
        .unwrap_or(false);

    let body = if fresh {
        eprintln!("krcg: using cached {}", cache_file.display());
        std::fs::read_to_string(&cache_file)?
    } else {
        eprintln!("krcg: fetching {SOURCE_URL}");
        let body = ureq::get(SOURCE_URL).call()?.into_string()?;
        std::fs::write(&cache_file, &body)?;
        body
    };

    Ok(serde_json::from_str(&body)?)
}
