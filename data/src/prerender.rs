//! Build-time static HTML prerendering for card pages (docs/seo-geo-aeo-plan.md
//! § 4.3, S3). Card data is fully in `cards.sqlite` by the time `build` calls
//! this; the frontend's built `index.html` (hashed script/CSS tags) is the
//! template so the SPA still boots on top for interactivity — this only
//! customizes the `<head>` (title/description/canonical/OG/JSON-LD) and fills
//! `<div id="root">` with real, crawlable markup instead of leaving it empty.
//!
//! No HTML-parsing dependency: `index.html` is our own controlled template, so
//! plain string find/replace on its two known anchors (`<title>...</title>`
//! and `<div id="root"></div>`) is enough. Card-derived text is untrusted game
//! data from an external feed, though, so it's always HTML-escaped before
//! interpolation — this is static output serving real visitors, not a
//! sandboxed report.

use rusqlite::Connection;
use std::error::Error;
use std::path::Path;

struct CardRow {
    id: i64,
    kind: String,
    name: String,
    card_text: Option<String>,
    clan: Option<String>,
    capacity: Option<i64>,
    group: Option<i64>,
    title: Option<String>,
    types: Option<Vec<String>>,
    blood_cost: Option<String>,
    pool_cost: Option<String>,
    disciplines: Vec<(String, bool)>,
    printings: Vec<(String, Option<String>)>,
    artists: Vec<String>,
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn escape_script(json: &str) -> String {
    // Prevents a literal "</script>" inside JSON-LD content from prematurely
    // closing the surrounding <script> tag.
    json.replace("</", "<\\/")
}

fn fetch_cards(conn: &Connection) -> rusqlite::Result<Vec<CardRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, name, card_text, clan, capacity, grp, title, types, blood_cost, pool_cost
         FROM cards ORDER BY id",
    )?;
    let rows = stmt.query_map([], |row| {
        let types_json: Option<String> = row.get(8)?;
        Ok(CardRow {
            id: row.get(0)?,
            kind: row.get(1)?,
            name: row.get(2)?,
            card_text: row.get(3)?,
            clan: row.get::<_, Option<String>>(4)?.filter(|c| !c.is_empty()),
            capacity: row.get(5)?,
            group: row.get(6)?,
            title: row.get(7)?,
            types: types_json.map(|t| serde_json::from_str(&t).unwrap_or_default()),
            blood_cost: row.get(9)?,
            pool_cost: row.get(10)?,
            disciplines: Vec::new(),
            printings: Vec::new(),
            artists: Vec::new(),
        })
    })?;
    let mut cards = rows.collect::<rusqlite::Result<Vec<_>>>()?;

    for card in &mut cards {
        let mut d_stmt = conn.prepare(
            "SELECT discipline, superior FROM card_disciplines WHERE card_id = ?1 ORDER BY superior DESC, discipline",
        )?;
        card.disciplines = d_stmt
            .query_map([card.id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut p_stmt = conn.prepare(
            "SELECT s.name, p.precon FROM printings p JOIN sets s ON s.id = p.set_id
             WHERE p.card_id = ?1 ORDER BY s.release_date",
        )?;
        card.printings = p_stmt
            .query_map([card.id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut a_stmt = conn.prepare(
            "SELECT a.name FROM card_artists ca JOIN artists a ON a.id = ca.artist_id WHERE ca.card_id = ?1",
        )?;
        card.artists = a_stmt
            .query_map([card.id], |row| row.get(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
    }
    Ok(cards)
}

fn kind_summary(card: &CardRow) -> String {
    if card.kind == "crypt" {
        let clan = card.clan.as_deref().unwrap_or("");
        let mut summary = match card.group {
            Some(g) => format!("{clan} group {g} vampire"),
            None => format!("{clan} vampire"),
        };
        if let Some(capacity) = card.capacity {
            summary.push_str(&format!(", capacity {capacity}"));
        }
        if let Some(title) = &card.title {
            summary.push_str(&format!(" ({title})"));
        }
        summary
    } else {
        let mut summary = card.types.as_deref().unwrap_or(&[]).join("/") + " card";
        if let Some(clan) = &card.clan {
            summary.push_str(&format!(", requires {clan}"));
        }
        if let Some(blood) = &card.blood_cost {
            summary.push_str(&format!(", {blood} blood"));
        }
        if let Some(pool) = &card.pool_cost {
            summary.push_str(&format!(", {pool} pool"));
        }
        summary
    }
}

fn description_for(card: &CardRow) -> String {
    let kind = kind_summary(card);
    let text = card
        .card_text
        .as_deref()
        .unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let snippet: String = if text.chars().count() > 160 {
        let truncated: String = text.chars().take(157).collect();
        format!("{truncated}\u{2026}")
    } else {
        text
    };
    if snippet.is_empty() {
        format!("{} \u{2014} VTES V5 {kind}.", card.name)
    } else {
        format!("{} \u{2014} VTES V5 {kind}. {snippet}", card.name)
    }
}

fn json_ld(card: &CardRow, canonical: Option<&str>) -> String {
    let mut value = serde_json::json!({
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "name": card.name,
        "description": description_for(card),
        "genre": "Vampire: The Eternal Struggle V5 card",
    });
    if let Some(url) = canonical {
        value["url"] = serde_json::Value::String(url.to_owned());
    }
    escape_script(&serde_json::to_string(&value).unwrap_or_default())
}

fn body_html(card: &CardRow) -> String {
    let mut html = String::new();
    html.push_str("<article>");
    html.push_str(&format!("<h1>{}</h1>", escape_html(&card.name)));
    html.push_str(&format!("<p>{}</p>", escape_html(&kind_summary(card))));

    if !card.disciplines.is_empty() {
        html.push_str("<p>Disciplines: ");
        let parts: Vec<String> = card
            .disciplines
            .iter()
            .map(|(code, superior)| {
                if *superior {
                    escape_html(&code.to_uppercase())
                } else {
                    escape_html(code)
                }
            })
            .collect();
        html.push_str(&parts.join(", "));
        html.push_str("</p>");
    }

    if let Some(text) = &card.card_text {
        if !text.is_empty() {
            html.push_str(&format!("<p>{}</p>", escape_html(text)));
        }
    }

    if !card.printings.is_empty() {
        html.push_str("<h2>Printings</h2><ul>");
        for (set, precon) in &card.printings {
            let line = match precon {
                Some(p) if !p.is_empty() => format!("{set} \u{2014} {p}"),
                _ => set.clone(),
            };
            html.push_str(&format!("<li>{}</li>", escape_html(&line)));
        }
        html.push_str("</ul>");
    }

    if !card.artists.is_empty() {
        html.push_str(&format!(
            "<p>Artist{}: {}</p>",
            if card.artists.len() > 1 { "s" } else { "" },
            escape_html(&card.artists.join(", "))
        ));
    }

    html.push_str(
        "<p><small>Portions of the materials are the copyrights and trademarks of \
         Paradox Interactive AB, and are used with permission. SchreckNet is unofficial \
         fan content and is not endorsed by or affiliated with Paradox Interactive.</small></p>",
    );
    html.push_str("</article>");
    html
}

/// Stamps title/description/OG/Twitter/canonical/JSON-LD into the frontend's
/// own built `index.html` (its hashed `<script>`/`<link>` tags carry over
/// untouched) and fills `<div id="root">` with real semantic HTML. Shared by
/// every prerendered page — card detail pages and the precons index alike.
fn render_shell(
    template: &str,
    title: &str,
    description: &str,
    og_type: &str,
    canonical: Option<&str>,
    json_ld_script: Option<&str>,
    body_html: &str,
) -> String {
    let mut head_extra = format!(
        "<meta name=\"description\" content=\"{d}\">\n\
         <meta property=\"og:title\" content=\"{t}\">\n\
         <meta property=\"og:description\" content=\"{d}\">\n\
         <meta property=\"og:type\" content=\"{og_type}\">\n\
         <meta name=\"twitter:card\" content=\"summary\">\n\
         <meta name=\"twitter:title\" content=\"{t}\">\n\
         <meta name=\"twitter:description\" content=\"{d}\">\n",
        t = escape_html(title),
        d = escape_html(description),
    );
    if let Some(url) = canonical {
        head_extra.push_str(&format!(
            "<link rel=\"canonical\" href=\"{}\">\n",
            escape_html(url)
        ));
    }
    if let Some(json) = json_ld_script {
        head_extra.push_str(&format!(
            "<script type=\"application/ld+json\">{json}</script>\n"
        ));
    }

    let with_title = replace_between(template, "<title>", "</title>", &escape_html(title));
    let with_head = with_title.replacen("</head>", &format!("{head_extra}</head>"), 1);
    with_head.replacen(
        "<div id=\"root\"></div>",
        &format!("<div id=\"root\">{body_html}</div>"),
        1,
    )
}

fn render_page(template: &str, card: &CardRow, base_url: Option<&str>) -> String {
    let title = format!("{} \u{2014} SchreckNet", card.name);
    let description = description_for(card);
    let canonical =
        base_url.map(|base| format!("{}/cards/{}", base.trim_end_matches('/'), card.id));
    let json_ld_script = json_ld(card, canonical.as_deref());
    render_shell(
        template,
        &title,
        &description,
        "article",
        canonical.as_deref(),
        Some(&json_ld_script),
        &body_html(card),
    )
}

fn replace_between(haystack: &str, open: &str, close: &str, replacement: &str) -> String {
    let Some(start) = haystack.find(open) else {
        return haystack.to_owned();
    };
    let content_start = start + open.len();
    let Some(end_rel) = haystack[content_start..].find(close) else {
        return haystack.to_owned();
    };
    let end = content_start + end_rel;
    format!(
        "{}{}{}{}",
        &haystack[..content_start],
        replacement,
        close,
        &haystack[end + close.len()..]
    )
}

/// Writes one static HTML file per card to `out_dir/cards/{id}.html`. Returns
/// the number of pages written.
pub fn write_card_pages(
    conn: &Connection,
    template: &str,
    out_dir: &Path,
    base_url: Option<&str>,
) -> Result<usize, Box<dyn Error>> {
    let cards = fetch_cards(conn)?;
    let cards_dir = out_dir.join("cards");
    std::fs::create_dir_all(&cards_dir)?;
    for card in &cards {
        let page = render_page(template, card, base_url);
        std::fs::write(cards_dir.join(format!("{}.html", card.id)), page)?;
    }
    Ok(cards.len())
}

struct PreconGroup {
    set: String,
    precons: Vec<(String, i64)>,
}

fn fetch_precons(conn: &Connection) -> rusqlite::Result<Vec<PreconGroup>> {
    let mut stmt = conn.prepare(
        "SELECT s.name, p.precon, COUNT(DISTINCT p.card_id) AS card_count
         FROM printings p JOIN sets s ON s.id = p.set_id
         WHERE p.precon IS NOT NULL
         GROUP BY s.name, p.precon
         ORDER BY s.name, p.precon",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut groups: Vec<PreconGroup> = Vec::new();
    for (set, precon, card_count) in rows {
        match groups.last_mut() {
            Some(group) if group.set == set => group.precons.push((precon, card_count)),
            _ => groups.push(PreconGroup {
                set,
                precons: vec![(precon, card_count)],
            }),
        }
    }
    Ok(groups)
}

fn precons_body_html(groups: &[PreconGroup]) -> String {
    let mut html = String::from("<article><h1>VTES V5 Precons</h1>");
    html.push_str(
        "<p>Every official Vampire: The Eternal Struggle Fifth Edition preconstructed \
         starter deck, grouped by set.</p>",
    );
    for group in groups {
        html.push_str(&format!("<h2>{}</h2><ul>", escape_html(&group.set)));
        for (precon, card_count) in &group.precons {
            html.push_str(&format!(
                "<li>{} \u{2014} {} distinct cards</li>",
                escape_html(precon),
                card_count
            ));
        }
        html.push_str("</ul>");
    }
    html.push_str("</article>");
    html
}

/// Writes a single static index page at `out_dir/precons.html` listing every
/// official V5 precon by set — real, crawlable content, zero maintenance risk
/// since it's entirely data-driven (no hand-authored copy to fall out of sync
/// with the TS side, unlike help/about/changelog — deferred, see
/// docs/seo-geo-aeo-plan.md S4).
pub fn write_precons_page(
    conn: &Connection,
    template: &str,
    out_dir: &Path,
    base_url: Option<&str>,
) -> Result<(), Box<dyn Error>> {
    let groups = fetch_precons(conn)?;
    let title = "Precons \u{2014} SchreckNet".to_owned();
    let description =
        "Every official Vampire: The Eternal Struggle V5 preconstructed starter deck, \
         grouped by set."
            .to_owned();
    let canonical = base_url.map(|base| format!("{}/precons", base.trim_end_matches('/')));
    let page = render_shell(
        template,
        &title,
        &description,
        "website",
        canonical.as_deref(),
        None,
        &precons_body_html(&groups),
    );
    std::fs::write(out_dir.join("precons.html"), page)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE cards(id INT PRIMARY KEY, kind TEXT, name TEXT, card_text TEXT,
               clan TEXT, capacity INT, grp INT, title TEXT, types TEXT, blood_cost TEXT, pool_cost TEXT);
             CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
             CREATE TABLE sets(id INTEGER PRIMARY KEY, name TEXT, release_date TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT);
             CREATE TABLE artists(id INTEGER PRIMARY KEY, name TEXT);
             CREATE TABLE card_artists(card_id INT, artist_id INT);

             INSERT INTO cards VALUES
               (1,'crypt','Aaradhya, The Callous Tyrant','Sabbat cardinal: +1 bleed. <XYZ> & \"quotes\"','Ventrue',10,6,'Cardinal',NULL,NULL,NULL),
               (2,'library','Villein','A blood bond in a card.',NULL,NULL,NULL,NULL,'[\"Master\"]',NULL,'2');
             INSERT INTO card_disciplines VALUES (1,'dom',1),(1,'for',0);
             INSERT INTO sets VALUES (1,'Sabbat V5','2025-10-26');
             INSERT INTO printings VALUES (1,1,'Path of Power');
             INSERT INTO artists VALUES (1,'Some Artist');
             INSERT INTO card_artists VALUES (1,1);",
        )
        .unwrap();
    }

    const TEMPLATE: &str = "<!doctype html><html><head><title>SchreckNet</title>\
        <script type=\"module\" src=\"/assets/main-XYZ.js\"></script></head>\
        <body><div id=\"root\"></div></body></html>";

    #[test]
    fn writes_one_file_per_card_with_escaped_untrusted_text() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let dir =
            std::env::temp_dir().join(format!("schrecknet-prerender-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let written =
            write_card_pages(&conn, TEMPLATE, &dir, Some("https://example.test")).unwrap();
        assert_eq!(written, 2);

        let page = std::fs::read_to_string(dir.join("cards/1.html")).unwrap();
        assert!(page.contains("<title>Aaradhya, The Callous Tyrant \u{2014} SchreckNet</title>"));
        assert!(page.contains("<link rel=\"canonical\" href=\"https://example.test/cards/1\">"));
        // Untrusted card text is escaped in the HTML body, not injected as raw
        // markup (it may still appear unescaped inside the JSON-LD <script>
        // block below, where "<" needs no escaping to stay valid JSON).
        assert!(
            page.contains("<p>Sabbat cardinal: +1 bleed. &lt;XYZ&gt; &amp; &quot;quotes&quot;</p>")
        );
        // The SPA's own hashed script tag survives untouched.
        assert!(page.contains("/assets/main-XYZ.js"));
        assert!(page.contains("Ventrue group 6 vampire"));
        assert!(page.contains("Path of Power"));
        assert!(page.contains("application/ld+json"));

        let library_page = std::fs::read_to_string(dir.join("cards/2.html")).unwrap();
        assert!(library_page.contains("Master card"));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn omits_canonical_and_json_ld_url_when_no_base_url_given() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let dir = std::env::temp_dir().join(format!(
            "schrecknet-prerender-test-nourl-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        write_card_pages(&conn, TEMPLATE, &dir, None).unwrap();
        let page = std::fs::read_to_string(dir.join("cards/1.html")).unwrap();
        assert!(!page.contains("rel=\"canonical\""));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn writes_a_precons_index_grouped_by_set() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // A second precon in the same set, and one in a different set, to
        // exercise the grouping.
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (3,'crypt','Baron','','Brujah',6,6,NULL,NULL,NULL,NULL);
             INSERT INTO sets VALUES (2,'Fifth Edition','2023-03-17');
             INSERT INTO printings VALUES (3,1,'Path of Death'), (2,2,'Tremere');",
        )
        .unwrap();

        let dir = std::env::temp_dir().join(format!(
            "schrecknet-prerender-test-precons-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        write_precons_page(&conn, TEMPLATE, &dir, Some("https://example.test/")).unwrap();
        let page = std::fs::read_to_string(dir.join("precons.html")).unwrap();

        assert!(page.contains("<title>Precons \u{2014} SchreckNet</title>"));
        assert!(page.contains("<link rel=\"canonical\" href=\"https://example.test/precons\">"));
        assert!(page.contains("<h2>Sabbat V5</h2>"));
        assert!(page.contains("Path of Power \u{2014} 1 distinct cards"));
        assert!(page.contains("Path of Death \u{2014} 1 distinct cards"));
        assert!(page.contains("<h2>Fifth Edition</h2>"));
        assert!(page.contains("Tremere \u{2014} 1 distinct cards"));
        assert!(page.contains("/assets/main-XYZ.js"));

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
