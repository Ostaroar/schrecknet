//! Normalization of official VEKN crypt metadata used by VDB-compatible
//! sect, title, vote, advancement, and banned filters.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CryptMetadata {
    pub sect: Option<String>,
    pub title: Option<String>,
    pub votes: i64,
    pub advanced: bool,
    pub banned: Option<String>,
}

/// Reproduces VDB's crypt generator: ordinary vampires begin their canonical
/// text with their sect, advanced cards begin with `Advanced, <sect>`, and
/// Imbued cards belong to the Imbued sect. Vote value is derived from title.
pub fn normalize_crypt_metadata(
    card_type: &str,
    card_text: &str,
    title: &str,
    advancement: &str,
    banned: &str,
) -> CryptMetadata {
    let title = normalize_title(title);
    CryptMetadata {
        sect: extract_sect(card_type, card_text),
        votes: title.as_deref().map(title_votes).unwrap_or(0),
        title,
        advanced: !advancement.trim().is_empty(),
        banned: nonempty(banned),
    }
}

fn extract_sect(card_type: &str, card_text: &str) -> Option<String> {
    if card_type.trim().eq_ignore_ascii_case("imbued") {
        return Some("Imbued".to_owned());
    }

    let words = card_text
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    let sect = if words.first().is_some_and(|word| *word == "Advanced") {
        words.get(1).copied()
    } else {
        words.first().copied()
    };
    sect.and_then(nonempty)
}

fn normalize_title(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let canonical = match value.to_lowercase().as_str() {
        "primogen" => "Primogen",
        "prince" => "Prince",
        "justicar" => "Justicar",
        "imperator" => "Imperator",
        "inner circle" => "Inner Circle",
        "bishop" => "Bishop",
        "archbishop" => "Archbishop",
        "priscus" => "Priscus",
        "cardinal" => "Cardinal",
        "regent" => "Regent",
        "1 vote" => "1 vote",
        "2 votes" => "2 votes",
        "magaji" => "Magaji",
        "kholo" => "Kholo",
        "baron" => "Baron",
        _ => value,
    };
    Some(canonical.to_owned())
}

fn title_votes(title: &str) -> i64 {
    match title.to_lowercase().as_str() {
        "primogen" | "bishop" | "1 vote" => 1,
        "prince" | "archbishop" | "magaji" | "kholo" | "baron" | "2 votes" => 2,
        "justicar" | "imperator" | "priscus" | "cardinal" => 3,
        "inner circle" | "regent" => 4,
        _ => 0,
    }
}

fn nonempty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_ordinary_and_advanced_sects_like_vdb() {
        assert_eq!(
            normalize_crypt_metadata("Vampire", "Sabbat cardinal: text", "cardinal", "", "").sect,
            Some("Sabbat".into())
        );
        assert_eq!(
            normalize_crypt_metadata(
                "Vampire",
                "Advanced, Camarilla: text",
                "prince",
                "Advanced",
                ""
            )
            .sect,
            Some("Camarilla".into())
        );
        assert_eq!(
            normalize_crypt_metadata("Imbued", "Martyr: text", "", "", "").sect,
            Some("Imbued".into())
        );
    }

    #[test]
    fn canonicalizes_titles_and_derives_vote_thresholds() {
        let cardinal = normalize_crypt_metadata("Vampire", "Sabbat: text", "cardinal", "", "");
        assert_eq!(cardinal.title, Some("Cardinal".into()));
        assert_eq!(cardinal.votes, 3);

        let baron = normalize_crypt_metadata("Vampire", "Anarch: text", "baron", "", "");
        assert_eq!(baron.votes, 2);

        let untitled = normalize_crypt_metadata("Vampire", "Independent: text", "", "", "");
        assert_eq!(untitled.title, None);
        assert_eq!(untitled.votes, 0);
    }

    #[test]
    fn preserves_official_advancement_and_banned_signals() {
        let metadata =
            normalize_crypt_metadata("Vampire", "Camarilla: text", "", "Advanced", "Banned");
        assert!(metadata.advanced);
        assert_eq!(metadata.banned, Some("Banned".into()));
    }
}
