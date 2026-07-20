use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::path::Path;

pub const VERSION: &str = "1";
pub const DEFAULT_SOURCE: &str = "docs/gameloop/vtes-v5-gameloop.dot";
pub const DEFAULT_OUTPUT: &str = "frontend/public/gameloop.json";

type Attributes = BTreeMap<String, String>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLoop {
    pub version: String,
    pub source: String,
    pub meta: GameLoopMeta,
    pub regions: Vec<Region>,
    pub states: Vec<State>,
    pub transitions: Vec<Transition>,
    pub hooks: Vec<Hook>,
    pub impulse_orders: Vec<ImpulseOrder>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLoopMeta {
    pub title: String,
    pub players: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    pub id: String,
    pub label: String,
    pub level: Level,
    pub orthogonal: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub kind: StateKind,
    pub level: Level,
    pub parent: Option<String>,
    pub hooks: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StateKind {
    State,
    Decision,
    Window,
    Note,
    Hook,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    Basic,
    Advanced,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    pub from: String,
    pub to: String,
    pub label: Option<String>,
    pub guard: Option<String>,
    pub kind: TransitionKind,
    pub level: Level,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransitionKind {
    Flow,
    Conditional,
    Annotation,
    Bridge,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hook {
    pub id: String,
    pub label: String,
    pub window: String,
    pub anchor: String,
    pub card_types: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpulseOrder {
    pub id: String,
    pub state: String,
    pub contexts: Vec<String>,
    pub acting_first: bool,
    pub after_acting: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DistillError(String);

impl fmt::Display for DistillError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for DistillError {}

pub fn write(source: &Path, output: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let dot = std::fs::read_to_string(source)?;
    let source_label = source.to_string_lossy().replace('\\', "/");
    let model = distill(&dot, &source_label)?;
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        output,
        format!("{}\n", serde_json::to_string_pretty(&model)?),
    )?;
    println!(
        "distilled {} states, {} transitions, and {} hooks from {} -> {}",
        model.states.len(),
        model.transitions.len(),
        model.hooks.len(),
        source.display(),
        output.display()
    );
    Ok(())
}

pub fn distill(dot: &str, source: &str) -> Result<GameLoop, DistillError> {
    let tokens = Lexer::new(dot).tokenize()?;
    let parsed = Parser::new(tokens).parse()?;
    parsed.into_model(source)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Identifier(String),
    Text(String),
    Arrow,
    LeftBrace,
    RightBrace,
    LeftBracket,
    RightBracket,
    Equals,
    Comma,
    Semicolon,
}

struct Lexer<'a> {
    chars: Vec<char>,
    cursor: usize,
    line: usize,
    _source: &'a str,
}

impl<'a> Lexer<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            chars: source.chars().collect(),
            cursor: 0,
            line: 1,
            _source: source,
        }
    }

    fn tokenize(mut self) -> Result<Vec<Token>, DistillError> {
        let mut tokens = Vec::new();
        while let Some(token) = self.next_token()? {
            tokens.push(token);
        }
        Ok(tokens)
    }

    fn next_token(&mut self) -> Result<Option<Token>, DistillError> {
        self.skip_ignored();
        let Some(character) = self.peek() else {
            return Ok(None);
        };
        let token = match character {
            '{' => self.single(Token::LeftBrace),
            '}' => self.single(Token::RightBrace),
            '[' => self.single(Token::LeftBracket),
            ']' => self.single(Token::RightBracket),
            '=' => self.single(Token::Equals),
            ',' => self.single(Token::Comma),
            ';' => self.single(Token::Semicolon),
            '"' => Token::Text(self.read_text()?),
            '-' if self.peek_at(1) == Some('>') => {
                self.cursor += 2;
                Token::Arrow
            }
            _ => Token::Identifier(self.read_identifier()?),
        };
        Ok(Some(token))
    }

    fn skip_ignored(&mut self) {
        loop {
            while matches!(self.peek(), Some(character) if character.is_whitespace()) {
                if self.peek() == Some('\n') {
                    self.line += 1;
                }
                self.cursor += 1;
            }
            if self.peek() == Some('/') && self.peek_at(1) == Some('/') {
                while let Some(character) = self.peek() {
                    self.cursor += 1;
                    if character == '\n' {
                        self.line += 1;
                        break;
                    }
                }
                continue;
            }
            break;
        }
    }

    fn single(&mut self, token: Token) -> Token {
        self.cursor += 1;
        token
    }

    fn read_text(&mut self) -> Result<String, DistillError> {
        self.cursor += 1;
        let mut value = String::new();
        while let Some(character) = self.peek() {
            self.cursor += 1;
            match character {
                '"' => return Ok(value),
                '\\' => {
                    let Some(escaped) = self.peek() else {
                        return Err(self.error("unterminated escape sequence"));
                    };
                    self.cursor += 1;
                    value.push(match escaped {
                        'n' => '\n',
                        'r' => '\r',
                        't' => '\t',
                        '"' => '"',
                        '\\' => '\\',
                        other => other,
                    });
                }
                '\n' => {
                    self.line += 1;
                    value.push('\n');
                }
                other => value.push(other),
            }
        }
        Err(self.error("unterminated quoted string"))
    }

    fn read_identifier(&mut self) -> Result<String, DistillError> {
        let start = self.cursor;
        while let Some(character) = self.peek() {
            let delimiter = character.is_whitespace()
                || matches!(character, '{' | '}' | '[' | ']' | '=' | ',' | ';' | '"')
                || (character == '-' && self.peek_at(1) == Some('>'));
            if delimiter {
                break;
            }
            self.cursor += 1;
        }
        if start == self.cursor {
            return Err(self.error("unexpected character"));
        }
        Ok(self.chars[start..self.cursor].iter().collect())
    }

    fn peek(&self) -> Option<char> {
        self.peek_at(0)
    }

    fn peek_at(&self, offset: usize) -> Option<char> {
        self.chars.get(self.cursor + offset).copied()
    }

    fn error(&self, message: &str) -> DistillError {
        DistillError(format!("DOT line {}: {message}", self.line))
    }
}

#[derive(Debug)]
struct RegionDraft {
    id: String,
    attributes: Attributes,
}

#[derive(Debug)]
struct StateDraft {
    id: String,
    parent: Option<String>,
    attributes: Attributes,
}

#[derive(Debug)]
struct TransitionDraft {
    from: String,
    to: String,
    attributes: Attributes,
}

#[derive(Debug, Default)]
struct ParsedDot {
    graph_attributes: Attributes,
    regions: Vec<RegionDraft>,
    states: Vec<StateDraft>,
    transitions: Vec<TransitionDraft>,
}

struct Parser {
    tokens: Vec<Token>,
    cursor: usize,
    parsed: ParsedDot,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self {
            tokens,
            cursor: 0,
            parsed: ParsedDot::default(),
        }
    }

    fn parse(mut self) -> Result<ParsedDot, DistillError> {
        self.expect_identifier("digraph")?;
        if matches!(self.peek(), Some(Token::Identifier(_))) {
            self.cursor += 1;
        }
        self.expect(Token::LeftBrace)?;
        self.parse_scope(None)?;
        if self.peek().is_some() {
            return Err(self.error("unexpected tokens after graph"));
        }
        Ok(self.parsed)
    }

    fn parse_scope(&mut self, region: Option<String>) -> Result<(), DistillError> {
        loop {
            self.consume_semicolons();
            match self.peek() {
                Some(Token::RightBrace) => {
                    self.cursor += 1;
                    return Ok(());
                }
                Some(Token::Identifier(value)) if value == "subgraph" => {
                    self.parse_subgraph()?;
                }
                Some(Token::Identifier(_)) => self.parse_statement(region.clone())?,
                Some(token) => {
                    return Err(self.error(&format!("unexpected token in graph: {token:?}")));
                }
                None => return Err(self.error("unterminated graph scope")),
            }
        }
    }

    fn parse_subgraph(&mut self) -> Result<(), DistillError> {
        self.expect_identifier("subgraph")?;
        let raw_id = self.take_identifier()?;
        let id = raw_id
            .strip_prefix("cluster_")
            .unwrap_or(&raw_id)
            .to_owned();
        self.expect(Token::LeftBrace)?;
        self.parsed.regions.push(RegionDraft {
            id: id.clone(),
            attributes: Attributes::new(),
        });
        self.parse_scope(Some(id))?;
        self.consume(Token::Semicolon);
        Ok(())
    }

    fn parse_statement(&mut self, region: Option<String>) -> Result<(), DistillError> {
        let first = self.take_identifier()?;
        match self.peek() {
            Some(Token::Equals) => {
                self.cursor += 1;
                let value = self.take_value()?;
                if let Some(region_id) = region {
                    let draft = self
                        .parsed
                        .regions
                        .iter_mut()
                        .rev()
                        .find(|candidate| candidate.id == region_id)
                        .ok_or_else(|| DistillError(format!("unknown region {region_id}")))?;
                    draft.attributes.insert(first, value);
                } else {
                    self.parsed.graph_attributes.insert(first, value);
                }
            }
            Some(Token::LeftBracket) if matches!(first.as_str(), "graph" | "node" | "edge") => {
                let attributes = self.parse_attributes()?;
                if first == "graph" && region.is_none() {
                    self.parsed.graph_attributes.extend(attributes);
                }
            }
            Some(Token::LeftBracket) => {
                let attributes = self.parse_attributes()?;
                if self.parsed.states.iter().any(|state| state.id == first) {
                    return Err(self.error(&format!("duplicate state definition: {first}")));
                }
                self.parsed.states.push(StateDraft {
                    id: first,
                    parent: region,
                    attributes,
                });
            }
            Some(Token::Arrow) => self.parse_edges(first)?,
            Some(Token::Semicolon) | Some(Token::RightBrace) => {}
            other => {
                return Err(self.error(&format!("unsupported statement after {first}: {other:?}")));
            }
        }
        self.consume(Token::Semicolon);
        Ok(())
    }

    fn parse_edges(&mut self, first: String) -> Result<(), DistillError> {
        let mut nodes = vec![first];
        while self.consume(Token::Arrow) {
            nodes.push(self.take_identifier()?);
        }
        let attributes = if self.peek() == Some(&Token::LeftBracket) {
            self.parse_attributes()?
        } else {
            Attributes::new()
        };
        for pair in nodes.windows(2) {
            self.parsed.transitions.push(TransitionDraft {
                from: pair[0].clone(),
                to: pair[1].clone(),
                attributes: attributes.clone(),
            });
        }
        Ok(())
    }

    fn parse_attributes(&mut self) -> Result<Attributes, DistillError> {
        self.expect(Token::LeftBracket)?;
        let mut attributes = Attributes::new();
        loop {
            while self.consume(Token::Comma) || self.consume(Token::Semicolon) {}
            if self.consume(Token::RightBracket) {
                return Ok(attributes);
            }
            let key = self.take_identifier()?;
            self.expect(Token::Equals)?;
            attributes.insert(key, self.take_value()?);
        }
    }

    fn take_value(&mut self) -> Result<String, DistillError> {
        match self.tokens.get(self.cursor) {
            Some(Token::Identifier(value)) | Some(Token::Text(value)) => {
                self.cursor += 1;
                Ok(value.clone())
            }
            other => Err(self.error(&format!("expected attribute value, found {other:?}"))),
        }
    }

    fn take_identifier(&mut self) -> Result<String, DistillError> {
        match self.tokens.get(self.cursor) {
            Some(Token::Identifier(value)) => {
                self.cursor += 1;
                Ok(value.clone())
            }
            other => Err(self.error(&format!("expected identifier, found {other:?}"))),
        }
    }

    fn expect_identifier(&mut self, expected: &str) -> Result<(), DistillError> {
        let actual = self.take_identifier()?;
        if actual == expected {
            Ok(())
        } else {
            Err(self.error(&format!("expected {expected}, found {actual}")))
        }
    }

    fn expect(&mut self, expected: Token) -> Result<(), DistillError> {
        if self.consume(expected.clone()) {
            Ok(())
        } else {
            Err(self.error(&format!("expected {expected:?}, found {:?}", self.peek())))
        }
    }

    fn consume(&mut self, expected: Token) -> bool {
        if self.peek() == Some(&expected) {
            self.cursor += 1;
            true
        } else {
            false
        }
    }

    fn consume_semicolons(&mut self) {
        while self.consume(Token::Semicolon) {}
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.cursor)
    }

    fn error(&self, message: &str) -> DistillError {
        DistillError(format!("DOT token {}: {message}", self.cursor + 1))
    }
}

impl ParsedDot {
    fn into_model(self, source: &str) -> Result<GameLoop, DistillError> {
        let title = self
            .graph_attributes
            .get("label")
            .cloned()
            .ok_or_else(|| DistillError("graph is missing its title label".to_owned()))?;
        let players = parse_player_count(&title)
            .ok_or_else(|| DistillError("graph title is missing its player count".to_owned()))?;

        let regions = self
            .regions
            .iter()
            .map(|draft| {
                let label = draft
                    .attributes
                    .get("label")
                    .cloned()
                    .unwrap_or_else(|| draft.id.clone());
                Region {
                    level: region_level(&label),
                    orthogonal: draft.id == "HAND",
                    id: draft.id.clone(),
                    label,
                }
            })
            .collect::<Vec<_>>();
        let region_levels = regions
            .iter()
            .map(|region| (region.id.as_str(), region.level))
            .collect::<BTreeMap<_, _>>();

        let known_ids = self
            .states
            .iter()
            .map(|state| state.id.as_str())
            .collect::<BTreeSet<_>>();
        for transition in &self.transitions {
            if !known_ids.contains(transition.from.as_str()) {
                return Err(DistillError(format!(
                    "transition references undefined state {}",
                    transition.from
                )));
            }
            if !known_ids.contains(transition.to.as_str()) {
                return Err(DistillError(format!(
                    "transition references undefined state {}",
                    transition.to
                )));
            }
        }

        let state_levels = self
            .states
            .iter()
            .map(|draft| {
                let label = required_label(draft)?;
                let parent_level = draft
                    .parent
                    .as_deref()
                    .and_then(|parent| region_levels.get(parent).copied())
                    .unwrap_or(Level::Basic);
                Ok((draft.id.as_str(), state_level(label, parent_level)))
            })
            .collect::<Result<BTreeMap<_, _>, DistillError>>()?;

        let states = self
            .states
            .iter()
            .map(|draft| {
                let raw_label = required_label(draft)?;
                let (label, detail) = split_label(raw_label);
                let hooks = self
                    .transitions
                    .iter()
                    .filter(|transition| {
                        transition.from == draft.id
                            && transition.to.starts_with("HK_")
                            && transition.attributes.get("style").map(String::as_str)
                                == Some("dashed")
                    })
                    .map(|transition| transition.to.clone())
                    .collect();
                Ok(State {
                    id: draft.id.clone(),
                    label,
                    detail,
                    kind: state_kind(draft),
                    level: state_levels[&draft.id.as_str()],
                    parent: draft.parent.clone(),
                    hooks,
                })
            })
            .collect::<Result<Vec<_>, DistillError>>()?;

        let transitions = self
            .transitions
            .iter()
            .map(|draft| {
                let label = draft.attributes.get("label").cloned();
                let style = draft.attributes.get("style").map(String::as_str);
                let kind = match style {
                    Some("dashed") => TransitionKind::Conditional,
                    Some("dotted")
                        if draft.from.starts_with("HK_") || draft.to.starts_with("HK_") =>
                    {
                        TransitionKind::Bridge
                    }
                    Some("dotted") => TransitionKind::Annotation,
                    _ => TransitionKind::Flow,
                };
                Transition {
                    from: draft.from.clone(),
                    to: draft.to.clone(),
                    guard: (kind == TransitionKind::Conditional)
                        .then(|| label.clone())
                        .flatten(),
                    label,
                    kind,
                    level: if state_levels[&draft.from.as_str()] == Level::Advanced
                        || state_levels[&draft.to.as_str()] == Level::Advanced
                    {
                        Level::Advanced
                    } else {
                        Level::Basic
                    },
                }
            })
            .collect::<Vec<_>>();

        let hooks = self
            .states
            .iter()
            .filter(|state| state.id.starts_with("HK_"))
            .map(|state| {
                let label = required_label(state)?;
                let window = self
                    .transitions
                    .iter()
                    .find(|transition| {
                        transition.from == state.id
                            && transition.attributes.get("style").map(String::as_str)
                                == Some("dotted")
                    })
                    .map(|transition| transition.to.clone())
                    .ok_or_else(|| DistillError(format!("hook {} has no window", state.id)))?;
                let anchor = self
                    .transitions
                    .iter()
                    .find(|transition| {
                        transition.to == state.id
                            && transition.attributes.get("style").map(String::as_str)
                                == Some("dashed")
                    })
                    .map(|transition| transition.from.clone())
                    .ok_or_else(|| DistillError(format!("hook {} has no anchor", state.id)))?;
                Ok(Hook {
                    id: state.id.clone(),
                    label: label
                        .lines()
                        .next()
                        .unwrap_or(label)
                        .trim_start_matches("HOOK: ")
                        .to_owned(),
                    window,
                    anchor,
                    card_types: Vec::new(),
                })
            })
            .collect::<Result<Vec<_>, DistillError>>()?;

        let impulse_orders = self
            .states
            .iter()
            .filter(|state| state.attributes.contains_key("impulse_id"))
            .map(|state| {
                Ok(ImpulseOrder {
                    id: required_attribute(state, "impulse_id")?.to_owned(),
                    state: state.id.clone(),
                    contexts: csv_attribute(state, "impulse_contexts")?,
                    acting_first: true,
                    after_acting: csv_attribute(state, "impulse_order")?,
                })
            })
            .collect::<Result<Vec<_>, DistillError>>()?;

        Ok(GameLoop {
            version: VERSION.to_owned(),
            source: source.to_owned(),
            meta: GameLoopMeta { title, players },
            regions,
            states,
            transitions,
            hooks,
            impulse_orders,
        })
    }
}

fn required_label(state: &StateDraft) -> Result<&str, DistillError> {
    required_attribute(state, "label")
}

fn required_attribute<'a>(state: &'a StateDraft, name: &str) -> Result<&'a str, DistillError> {
    state
        .attributes
        .get(name)
        .map(String::as_str)
        .ok_or_else(|| DistillError(format!("state {} is missing {name}", state.id)))
}

fn csv_attribute(state: &StateDraft, name: &str) -> Result<Vec<String>, DistillError> {
    let values = required_attribute(state, name)?
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if values.is_empty() {
        Err(DistillError(format!(
            "state {} has an empty {name}",
            state.id
        )))
    } else {
        Ok(values)
    }
}

fn split_label(label: &str) -> (String, String) {
    let mut lines = label.lines();
    let title = lines.next().unwrap_or_default().trim().to_owned();
    let detail = lines.collect::<Vec<_>>().join("\n").trim().to_owned();
    (title, detail)
}

fn region_level(label: &str) -> Level {
    let uppercase = label.to_uppercase();
    if uppercase.starts_with("ADVANCED:")
        || uppercase.starts_with("ENGINE ")
        || uppercase.starts_with("RUNTIME:")
    {
        Level::Advanced
    } else {
        Level::Basic
    }
}

fn state_level(label: &str, parent_level: Level) -> Level {
    let first_line = label.lines().next().unwrap_or_default().to_uppercase();
    if parent_level == Level::Advanced
        || first_line.contains("(ADV)")
        || first_line.starts_with("ADV:")
    {
        Level::Advanced
    } else {
        Level::Basic
    }
}

fn state_kind(state: &StateDraft) -> StateKind {
    if state.id.starts_with("HK_") {
        return StateKind::Hook;
    }
    match state.attributes.get("shape").map(String::as_str) {
        Some("diamond") => StateKind::Decision,
        Some("oval") => StateKind::Window,
        Some("note") => StateKind::Note,
        _ => StateKind::State,
    }
}

fn parse_player_count(title: &str) -> Option<u8> {
    let marker = " players";
    let marker_index = title.find(marker)?;
    let prefix = &title[..marker_index];
    let digits_reversed = prefix
        .chars()
        .rev()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>();
    digits_reversed
        .chars()
        .rev()
        .collect::<String>()
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::{distill, Level, StateKind, TransitionKind, DEFAULT_SOURCE};

    const FULL_DOT: &str = include_str!("../../docs/gameloop/vtes-v5-gameloop.dot");

    #[test]
    fn parser_preserves_multiline_labels_and_expands_edge_chains() {
        let dot = r#"
            digraph Example {
              graph [label="Example (5 players)"];
              subgraph cluster_TURN {
                label="Turn";
                A [label="First\nDetail -> stays text"];
                B [shape=diamond, label="Second?"];
                C [label="Third"];
                A -> B -> C [style=dashed, label="if ready"];
              }
            }
        "#;
        let model = distill(dot, "example.dot").unwrap();
        assert_eq!(model.states[0].label, "First");
        assert_eq!(model.states[0].detail, "Detail -> stays text");
        assert_eq!(model.states[1].kind, StateKind::Decision);
        assert_eq!(model.transitions.len(), 2);
        assert_eq!(model.transitions[0].kind, TransitionKind::Conditional);
        assert_eq!(model.transitions[0].guard.as_deref(), Some("if ready"));
    }

    #[test]
    fn full_source_preserves_the_rules_contract() {
        let model = distill(FULL_DOT, DEFAULT_SOURCE).unwrap();
        assert_eq!(model.version, "1");
        assert_eq!(model.meta.players, 5);

        let phases = model
            .states
            .iter()
            .filter(|state| state.parent.as_deref() == Some("TURN") && state.id.starts_with("PH_"))
            .map(|state| state.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            phases,
            [
                "PH_UNLOCK",
                "PH_MASTER",
                "PH_MINION",
                "PH_INFLUENCE",
                "PH_DISCARD"
            ]
        );

        let combat_steps = model
            .states
            .iter()
            .filter(|state| {
                state.parent.as_deref() == Some("COMBAT")
                    && state.id.strip_prefix("COMBAT_S").is_some_and(|suffix| {
                        suffix
                            .chars()
                            .next()
                            .is_some_and(|character| character.is_ascii_digit())
                    })
                    && !state.id.ends_with("PREMATURE")
            })
            .map(|state| state.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            combat_steps,
            [
                "COMBAT_S1_BEFORE_RANGE",
                "COMBAT_S2_DETERMINE_RANGE",
                "COMBAT_S3_BEFORE_STRIKES",
                "COMBAT_S4_STRIKE",
                "COMBAT_S5_DAMAGE_RES",
                "COMBAT_S6_PRESS",
                "COMBAT_S7_END_ROUND",
            ]
        );

        assert_eq!(model.impulse_orders.len(), 3);
        assert_eq!(
            model.impulse_orders[0].contexts,
            ["combat", "directed_single"]
        );
        assert_eq!(
            model.impulse_orders[0].after_acting,
            ["defender", "clockwise_others"]
        );
        assert_eq!(
            model.impulse_orders[1].after_acting,
            ["targeted_clockwise", "clockwise_others"]
        );
        assert_eq!(
            model.impulse_orders[2].after_acting,
            ["prey", "predator", "clockwise_others"]
        );

        assert!(model.transitions.iter().any(|transition| {
            transition.from == "PH_UNLOCK"
                && transition.to == "PH_MASTER"
                && transition.kind == TransitionKind::Flow
        }));
        assert!(model.transitions.iter().any(|transition| {
            transition.from == "COMBAT_S7_END_ROUND" && transition.to == "COMBAT_CONTINUE_Q"
        }));
        assert!(model
            .states
            .iter()
            .any(|state| { state.id == "CONTEST_CHECK" && state.level == Level::Advanced }));
        assert!(model
            .regions
            .iter()
            .any(|region| { region.id == "HAND" && region.orthogonal }));
        assert_eq!(model.hooks.len(), 17);
    }

    #[test]
    fn committed_json_is_an_exact_distillation_of_the_dot() {
        let generated = distill(FULL_DOT, DEFAULT_SOURCE).unwrap();
        let committed =
            serde_json::from_str(include_str!("../../frontend/public/gameloop.json")).unwrap();
        assert_eq!(generated, committed);
    }
}
