//! SchreckNet data pipeline.
//!
//! `build` fetches KRCG's card export, filters to the V5 pool (see
//! `v5pool.rs` — the single source of truth for "is this card V5-legal"),
//! and emits `cards.sqlite` (schema per docs/data.md) + `cards.meta.json`.

mod ingest;
mod krcg;
mod v5pool;

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
  requirement_sect TEXT,
  image_url TEXT
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

    let cache_dir =
        PathBuf::from(std::env::var("SCHRECKNET_DATA_CACHE").unwrap_or_else(|_| ".cache".into()));
    let all_cards = krcg::fetch_cards(&cache_dir)?;
    eprintln!("krcg: {} total cards fetched", all_cards.len());

    let conn = rusqlite::Connection::open(&db_path)?;
    conn.execute_batch(SCHEMA)?;

    let stats = ingest::run(&conn, &all_cards)?;

    conn.execute(
        "INSERT INTO cards_fts(rowid, name, aka, card_text) SELECT id, name, aka, card_text FROM cards",
        [],
    )?;

    let total = stats.crypt + stats.library;
    conn.execute(
        "INSERT INTO meta(key, value) VALUES
         ('schema_version', '1'), ('data_version', '2'), ('scope', 'v5'),
         ('crypt_count', ?1), ('library_count', ?2)",
        rusqlite::params![stats.crypt.to_string(), stats.library.to_string()],
    )?;
    conn.execute_batch("VACUUM")?;

    let meta = serde_json::json!({
        "schema_version": 1,
        "data_version": 2,
        "scope": "v5",
        "cards": total,
        "crypt": stats.crypt,
        "library": stats.library,
        "source": "https://static.krcg.org/data/vtes.json",
        "v5_sets": v5pool::V5_SET_NAMES,
    });
    std::fs::write(
        out_dir.join("cards.meta.json"),
        serde_json::to_string_pretty(&meta)?,
    )?;

    println!(
        "built {} — {total} V5-pool cards ({} crypt, {} library)",
        db_path.display(),
        stats.crypt,
        stats.library
    );
    Ok(())
}
