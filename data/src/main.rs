//! SchreckNet data pipeline.
//!
//! Phase 0: `build` emits an empty-but-real `cards.sqlite` (schema from
//! docs/data.md) plus `cards.meta.json`. KRCG/VEKN ingestion with V5-pool
//! filtering lands in Phase 1 (docs/roadmap.md).

use std::path::PathBuf;

const SCHEMA: &str = "
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE sets(id INTEGER PRIMARY KEY, abbrev TEXT, name TEXT, release_date TEXT);
CREATE TABLE artists(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE cards(
  id INTEGER PRIMARY KEY,
  kind TEXT CHECK(kind IN ('crypt','library')),
  name TEXT, name_ascii TEXT, aka TEXT,
  card_text TEXT,
  clan TEXT, sect TEXT, capacity INT, grp INT, title TEXT, votes INT,
  adv INT, banned TEXT,
  types TEXT,
  blood_cost TEXT, pool_cost TEXT, burn_option INT,
  requirement_clan TEXT, requirement_capacity TEXT, requirement_title TEXT,
  requirement_sect TEXT
);
CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
CREATE TABLE card_traits(card_id INT, trait TEXT);
CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT);
CREATE TABLE card_artists(card_id INT, artist_id INT);
CREATE TABLE rulings(card_id INT, text TEXT, refs TEXT);
CREATE TABLE translations(card_id INT, lang TEXT, name TEXT, card_text TEXT);
CREATE VIRTUAL TABLE cards_fts USING fts5(name, aka, card_text, content=cards, content_rowid=id);
CREATE TABLE twd_decks(id TEXT PRIMARY KEY, event TEXT, year INT, players INT,
  country TEXT, city TEXT, winner TEXT, date TEXT, score TEXT);
CREATE TABLE twd_deck_cards(deck_id TEXT, card_id INT, qty INT);
CREATE TABLE twd_tags(deck_id TEXT, tag TEXT);
";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("build") => build(parse_out(&args)),
        _ => {
            eprintln!("usage: schrecknet-data build [--out <dir>]");
            std::process::exit(2);
        }
    }
}

fn parse_out(args: &[String]) -> PathBuf {
    args.iter()
        .position(|a| a == "--out")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("dist"))
}

fn build(out_dir: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(&out_dir)?;
    let db_path = out_dir.join("cards.sqlite");
    if db_path.exists() {
        std::fs::remove_file(&db_path)?;
    }

    let conn = rusqlite::Connection::open(&db_path)?;
    conn.execute_batch(SCHEMA)?;
    conn.execute(
        "INSERT INTO meta(key, value) VALUES ('schema_version', '1'), ('data_version', '0'), ('scope', 'v5')",
        [],
    )?;
    conn.execute_batch("VACUUM")?;

    let meta = serde_json::json!({
        "schema_version": 1,
        "data_version": 0,
        "scope": "v5",
        "cards": 0,
        "note": "Phase 0 placeholder database - KRCG/VEKN ingestion lands in Phase 1",
    });
    std::fs::write(
        out_dir.join("cards.meta.json"),
        serde_json::to_string_pretty(&meta)?,
    )?;

    println!("built {} (schema v1, empty V5 pool)", db_path.display());
    Ok(())
}
