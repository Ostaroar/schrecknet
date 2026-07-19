//! Deck-in-URL sharing: encodes a deck (crypt + library card id -> quantity)
//! into a compact, URL-safe token, and back — no account needed to share a
//! deck (docs/architecture.md's "Anonymous deck sharing"). Domain
//! serialization logic, so it lives here rather than the frontend
//! (AGENTS.md hard rule #1); the wasm bindings in `wasm.rs` are thin.

use std::fmt::Write as _;

/// One section's cards as (card_id, qty) pairs, in caller-provided order.
pub type CardQtys = Vec<(u32, u16)>;

/// Plain-text form before base64url: `"id:qty,id:qty|id:qty,id:qty"` (crypt
/// then library). Kept human-debuggable — this only needs to be short enough
/// for a URL, not maximally dense.
fn to_plain(crypt: &CardQtys, library: &CardQtys) -> String {
    let mut s = String::new();
    write_section(&mut s, crypt);
    s.push('|');
    write_section(&mut s, library);
    s
}

fn write_section(s: &mut String, cards: &CardQtys) {
    for (i, (id, qty)) in cards.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        let _ = write!(s, "{id}:{qty}");
    }
}

fn from_plain(s: &str) -> Result<(CardQtys, CardQtys), String> {
    let (crypt_part, library_part) = s.split_once('|').ok_or("missing section separator")?;
    Ok((parse_section(crypt_part)?, parse_section(library_part)?))
}

fn parse_section(s: &str) -> Result<CardQtys, String> {
    if s.is_empty() {
        return Ok(Vec::new());
    }
    s.split(',')
        .map(|entry| {
            let (id, qty) = entry
                .split_once(':')
                .ok_or_else(|| format!("bad entry: {entry}"))?;
            let id: u32 = id.parse().map_err(|_| format!("bad card id: {id}"))?;
            let qty: u16 = qty.parse().map_err(|_| format!("bad qty: {qty}"))?;
            Ok((id, qty))
        })
        .collect()
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn base64url_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        out.push(B64[(b0 >> 2) as usize] as char);
        out.push(B64[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(B64[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        }
        if chunk.len() > 2 {
            out.push(B64[(b2 & 0x3f) as usize] as char);
        }
    }
    out
}

fn base64url_decode(s: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'-' => Ok(62),
            b'_' => Ok(63),
            _ => Err(format!("invalid base64url character: {:?}", c as char)),
        }
    }
    let bytes = s.as_bytes();
    if bytes.contains(&b'=') {
        return Err("padded base64 not accepted (use base64url without padding)".into());
    }
    let mut out = Vec::with_capacity(bytes.len() / 4 * 3);
    for chunk in bytes.chunks(4) {
        let v: Vec<u8> = chunk.iter().map(|&c| val(c)).collect::<Result<_, _>>()?;
        out.push((v[0] << 2) | (v.get(1).copied().unwrap_or(0) >> 4));
        if v.len() > 2 {
            out.push((v[1] << 4) | (v[2] >> 2));
        }
        if v.len() > 3 {
            out.push((v[2] << 6) | v[3]);
        }
    }
    Ok(out)
}

/// Encodes a deck's crypt+library card lists into a compact, URL-safe token.
pub fn encode(crypt: &CardQtys, library: &CardQtys) -> String {
    base64url_encode(to_plain(crypt, library).as_bytes())
}

/// Decodes a token produced by `encode` back into (crypt, library) card lists.
pub fn decode(token: &str) -> Result<(CardQtys, CardQtys), String> {
    let bytes = base64url_decode(token)?;
    let plain = String::from_utf8(bytes)
        .map_err(|_| "token is not valid UTF-8 once decoded".to_string())?;
    from_plain(&plain)
}

/// Decodes a token and re-renders it as the plain `"id:qty,...|id:qty,..."`
/// form — the shape the wasm boundary hands back to JS callers, who parse it
/// without needing a JSON dependency on either side.
pub fn decode_to_plain(token: &str) -> Result<String, String> {
    let (crypt, library) = decode(token)?;
    Ok(to_plain(&crypt, &library))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_typical_deck() {
        let crypt: CardQtys = vec![(201733, 1), (201741, 2)];
        let library: CardQtys = vec![(100015, 4), (100081, 12)];
        let token = encode(&crypt, &library);
        let (crypt2, library2) = decode(&token).unwrap();
        assert_eq!(crypt, crypt2);
        assert_eq!(library, library2);
    }

    #[test]
    fn round_trips_an_empty_deck() {
        let token = encode(&vec![], &vec![]);
        let (crypt, library) = decode(&token).unwrap();
        assert!(crypt.is_empty());
        assert!(library.is_empty());
    }

    #[test]
    fn round_trips_crypt_only_and_library_only() {
        let (c, l) = decode(&encode(&vec![(1, 1)], &vec![])).unwrap();
        assert_eq!(c, vec![(1, 1)]);
        assert!(l.is_empty());

        let (c, l) = decode(&encode(&vec![], &vec![(2, 3)])).unwrap();
        assert!(c.is_empty());
        assert_eq!(l, vec![(2, 3)]);
    }

    #[test]
    fn token_is_url_safe() {
        let token = encode(&vec![(999999, 65535)], &vec![(1, 1)]);
        assert!(token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn rejects_garbage_tokens() {
        assert!(decode("not valid base64url!!!").is_err());
        assert!(decode("====").is_err());
    }

    #[test]
    fn decode_to_plain_matches_the_pre_encoding_shape() {
        let plain = decode_to_plain(&encode(&vec![(5, 2)], &vec![(6, 1)])).unwrap();
        assert_eq!(plain, "5:2|6:1");
    }
}
