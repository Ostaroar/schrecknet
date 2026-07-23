//! SchreckNet data pipeline.
//!
//! `build` fetches KRCG's card export plus VEKN's official card metadata,
//! filters to the V5 pool (see `v5pool.rs` — the single source of
//! truth for "is this card V5-legal"), and emits `cards.sqlite` (schema per
//! docs/data.md) + `cards.meta.json`.

mod gameloop;
mod ingest;
mod krcg;
mod prerender;
mod semantic;
mod v5pool;
mod vekn;

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
  clan TEXT, sect TEXT, path TEXT, capacity INT, grp INT, title TEXT, votes INT,
  adv INT, banned TEXT,
  types TEXT,
  blood_cost TEXT, pool_cost TEXT, burn_option INT,
  requirement_clan TEXT, requirement_title TEXT, requirement_sect TEXT,
  image_url TEXT
);
CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
CREATE TABLE card_capacity_requirements(
  card_id INT PRIMARY KEY,
  min_capacity INT,
  max_capacity INT
);
CREATE TABLE card_requirements(
  card_id INT,
  requirement TEXT,
  kind TEXT CHECK(kind IN ('sect','title','other')),
  PRIMARY KEY(card_id, requirement)
) WITHOUT ROWID;
CREATE TABLE card_traits(card_id INT, trait TEXT);
CREATE INDEX card_traits_card_trait_idx ON card_traits(card_id, trait);
CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT, precon_copies INT);
CREATE TABLE card_artists(card_id INT, artist_id INT);
CREATE TABLE rulings(card_id INT, text TEXT, refs TEXT);
CREATE TABLE translations(card_id INT, lang TEXT, name TEXT, card_text TEXT);
CREATE TABLE card_embeddings(
  card_id INT NOT NULL REFERENCES cards(id),
  model_id TEXT NOT NULL,
  dimensions INT NOT NULL,
  embedding BLOB NOT NULL,
  PRIMARY KEY(card_id, model_id)
) WITHOUT ROWID;
CREATE VIRTUAL TABLE cards_fts USING fts5(name, aka, card_text, content=cards, content_rowid=id);
";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("build") => build(parse_out(&args)),
        Some("gameloop") => gameloop::write(
            &parse_path(&args, "--source", gameloop::DEFAULT_SOURCE),
            &parse_path(&args, "--out", gameloop::DEFAULT_OUTPUT),
        ),
        Some("prerender") => prerender_cards(&args),
        _ => {
            eprintln!(
                "usage:\n  schrecknet-data build [--out <dir>]\n  \
                 schrecknet-data gameloop [--source <dot>] [--out <json>]\n  \
                 schrecknet-data prerender --db <cards.sqlite> --template <index.html> \
                 --out <dir> [--base-url <url>]"
            );
            std::process::exit(2);
        }
    }
}

fn prerender_cards(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = parse_path(args, "--db", "dist/cards.sqlite");
    let template_path = parse_path(args, "--template", "frontend/dist/index.html");
    let out_dir = parse_path(args, "--out", "frontend/dist");
    let base_url = args
        .iter()
        .position(|a| a == "--base-url")
        .and_then(|i| args.get(i + 1))
        .cloned();

    let conn = rusqlite::Connection::open(&db_path)?;
    let template = std::fs::read_to_string(&template_path)?;
    let written = prerender::write_card_pages(&conn, &template, &out_dir, base_url.as_deref())?;
    println!(
        "prerendered {written} card pages into {}/cards/",
        out_dir.display()
    );
    prerender::write_precons_page(&conn, &template, &out_dir, base_url.as_deref())?;
    println!("prerendered {}/precons.html", out_dir.display());
    prerender::write_static_pages(&template, &out_dir, base_url.as_deref())?;
    println!("prerendered rules/help/about/changelog pages");
    if prerender::write_sitemap(&conn, &out_dir, base_url.as_deref())? {
        println!("generated {}/sitemap.xml", out_dir.display());
    } else {
        println!("skipped sitemap.xml (set --base-url to generate absolute URLs)");
    }
    Ok(())
}

fn parse_path(args: &[String], flag: &str, default: &str) -> PathBuf {
    args.iter()
        .position(|argument| argument == flag)
        .and_then(|index| args.get(index + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(default))
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
    let vekn_metadata = vekn::fetch_metadata(&cache_dir)?;
    eprintln!(
        "vekn: {} library card rows, {} library requirement rows, and {} crypt metadata rows fetched",
        vekn_metadata.library.len(),
        vekn_metadata.library_requirements.len(),
        vekn_metadata.crypt.len()
    );

    let conn = rusqlite::Connection::open(&db_path)?;
    conn.execute_batch(SCHEMA)?;

    let stats = ingest::run(&conn, &all_cards, &vekn_metadata)?;
    let (requirement_cards, requirement_tokens): (i64, i64) = conn.query_row(
        "SELECT COUNT(DISTINCT card_id), COUNT(*) FROM card_requirements",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if requirement_cards == 0 {
        return Err(std::io::Error::other(
            "VEKN metadata produced no requirements for the V5 library pool",
        )
        .into());
    }
    let crypt_metadata_cards: i64 = conn.query_row(
        "SELECT COUNT(*) FROM cards
         WHERE kind='crypt' AND sect IS NOT NULL AND votes IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    if crypt_metadata_cards != i64::from(stats.crypt) {
        return Err(std::io::Error::other(format!(
            "VEKN metadata covered {crypt_metadata_cards} of {} V5 crypt cards",
            stats.crypt
        ))
        .into());
    }
    let library_metadata_cards: i64 = conn.query_row(
        "SELECT COUNT(*) FROM cards WHERE kind='library' AND burn_option IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    if library_metadata_cards != i64::from(stats.library) {
        return Err(std::io::Error::other(format!(
            "VEKN metadata covered {library_metadata_cards} of {} V5 library cards",
            stats.library
        ))
        .into());
    }
    let (trait_cards, trait_rows): (i64, i64) = conn.query_row(
        "SELECT COUNT(DISTINCT card_id), COUNT(*) FROM card_traits",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if trait_rows == 0 {
        return Err(std::io::Error::other("VDB trait classification produced no rows").into());
    }
    let languages = available_languages(&conn)?;
    let semantic_model = semantic::prepare_model(&cache_dir, &out_dir)?;
    let embedding_count = semantic::embed_cards(&conn, &semantic_model)?;

    conn.execute(
        "INSERT INTO cards_fts(rowid, name, aka, card_text) SELECT id, name, aka, card_text FROM cards",
        [],
    )?;

    let total = stats.crypt + stats.library;
    conn.execute(
        "INSERT INTO meta(key, value) VALUES
         ('schema_version', '8'), ('data_version', '11'), ('scope', 'v5'),
         ('crypt_count', ?1), ('library_count', ?2),
         ('semantic_model_id', ?3), ('semantic_dimensions', ?4),
         ('semantic_document_version', ?5)",
        rusqlite::params![
            stats.crypt.to_string(),
            stats.library.to_string(),
            semantic_model.manifest.model_id,
            semantic_model.manifest.dimensions.to_string(),
            semantic_model.manifest.document_version.to_string()
        ],
    )?;
    conn.execute_batch("VACUUM")?;

    let meta = serde_json::json!({
        // schema_version bumps when the table/column layout changes (v2:
        // image_url added to cards; v3: dropped the never-populated twd_*
        // tables; v4: added card_embeddings for local semantic search; v5:
        // normalized derived library capacity requirements into their own table;
        // v6: added normalized official VEKN requirement tokens; v7: added
        // printings.precon_copies; v8: added the KRCG crypt path).
        // data_version changes whenever emitted content changes (v11 preserves
        // KRCG's new Sabbat path field; v10 adds
        // omitted modern BCP precons and separates anniversary bonus cards
        // from their real 100-card decks; v9 fills printings.precon_copies
        // from KRCG's per-printing "copies" field; v8 fills card_traits plus
        // official library Burn Option/Banned; v7 filled crypt sect/title/vote/
        // advancement/banned columns).
        "schema_version": 8,
        "data_version": 11,
        "scope": "v5",
        "cards": total,
        "crypt": stats.crypt,
        "library": stats.library,
        "languages": languages,
        "semantic": {
            "model_id": semantic_model.manifest.model_id,
            "base_model": semantic_model.manifest.base_model,
            "source_repository": semantic_model.manifest.source_repository,
            "revision": semantic_model.manifest.revision,
            "license": semantic_model.manifest.license,
            "dimensions": semantic_model.manifest.dimensions,
            "max_length": semantic_model.manifest.max_length,
            "pooling": semantic_model.manifest.pooling,
            "normalized": semantic_model.manifest.normalized,
            "inference_batch_size": semantic_model.manifest.inference_batch_size,
            "document_version": semantic_model.manifest.document_version,
            "embeddings": embedding_count,
            "path": format!("/models/semantic/{}/", semantic_model.manifest.model_id),
        },
        "source": "https://static.krcg.org/data/vtes.json",
        "requirement_source": vekn::SOURCE_URL,
        "vekn_source": vekn::SOURCE_URL,
        "crypt_metadata": {
            "cards": crypt_metadata_cards,
        },
        "library_metadata": {
            "cards": library_metadata_cards,
        },
        "traits": {
            "cards": trait_cards,
            "rows": trait_rows,
        },
        "requirements": {
            "cards": requirement_cards,
            "tokens": requirement_tokens,
        },
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

fn available_languages(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<String>> {
    let mut languages = vec!["en".to_owned()];
    let mut stmt = conn.prepare(
        "SELECT DISTINCT lower(trim(lang))
         FROM translations
         WHERE trim(lang) <> '' AND lower(trim(lang)) <> 'en'
         ORDER BY lower(trim(lang))",
    )?;
    let translated = stmt.query_map([], |row| row.get::<_, String>(0))?;
    languages.extend(translated.collect::<Result<Vec<_>, _>>()?);
    Ok(languages)
}

#[cfg(test)]
mod tests {
    use super::available_languages;
    use rusqlite::Connection;

    #[test]
    fn language_metadata_is_pool_derived_and_always_includes_english() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE translations(card_id INT, lang TEXT, name TEXT, card_text TEXT);
             INSERT INTO translations VALUES
               (1, 'fr', 'Un', 'texte'),
               (2, 'ES', 'Dos', 'texto'),
               (3, 'fr', 'Trois', 'texte'),
               (4, '  ', NULL, NULL);",
        )
        .unwrap();

        assert_eq!(available_languages(&conn).unwrap(), vec!["en", "es", "fr"]);
    }
}
