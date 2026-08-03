//! Read-only access to `cards.sqlite`, shared by the MCP and REST surfaces
//! (AGENTS.md hard rule #2: both adapters call the same service code).
//!
//! Query shape mirrors the browser search modules — same filters, same result
//! shape — so client and server agree on exact and semantic candidate sets.

use std::sync::Arc;

use regex::Regex;
use rusqlite::functions::FunctionFlags;
use rusqlite::Connection;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, JsonSchema, utoipa::ToSchema)]
#[derive(utoipa::IntoParams)]
pub struct CryptSearchParams {
    /// Substring match against card name or card text (case-sensitive as stored).
    #[serde(default)]
    pub text: String,
    /// Where `text` must match: card name, card text, or either (default).
    #[serde(default)]
    pub text_mode: TextMode,
    /// If true, `text` is a regex pattern (standard syntax: `.`, `*`, `+`,
    /// `?`, `{m,n}`, `[...]`, `(...)`, `|`, anchors) matched against
    /// whichever field(s) `text_mode` selects, instead of a substring.
    #[serde(default)]
    pub text_regex: bool,
    /// Exact-ish clan filter (substring match, e.g. "Ventrue").
    #[serde(default)]
    pub clan: Option<String>,
    /// Exact title match (e.g. "Prince"); options come from the V5 pool.
    /// The special value `non-titled` matches cards with no title.
    #[serde(default)]
    pub title: Option<String>,
    /// Crypt sects to match (e.g. `["Camarilla", "Sabbat"]`). REST accepts
    /// CSV; MCP accepts an array. Combination is controlled by `sect_logic`.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub sects: Vec<String>,
    /// How selected sects combine: all, any, or none (Not).
    #[serde(default)]
    pub sect_logic: RequirementLogic,
    /// VDB-compatible vote filter. `0` means non-titled/no votes; `1` through
    /// `4` mean at least that many votes.
    #[serde(default)]
    pub votes: Option<i64>,
    /// VDB-compatible precomputed trait tokens. Every selected trait must
    /// match. REST accepts CSV; MCP accepts an array.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub traits: Vec<String>,
    /// Crypt group (V5 pool is limited to groups 5-7).
    #[serde(default)]
    pub group: Option<i64>,
    /// Crypt groups to include (OR semantics). When non-empty this supersedes
    /// the backwards-compatible single `group` field. REST accepts CSV.
    #[serde(default, deserialize_with = "deserialize_i64_list")]
    pub groups: Vec<i64>,
    /// Minimum capacity (inclusive).
    #[serde(default)]
    pub capacity_min: Option<i64>,
    /// Maximum capacity (inclusive).
    #[serde(default)]
    pub capacity_max: Option<i64>,
    /// Lowercase discipline codes (e.g. ["dom","for"]); a card must have ALL
    /// of them, at either level. REST accepts a comma-separated string.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub disciplines: Vec<String>,
    /// If true, every discipline in `disciplines` must be at superior level.
    #[serde(default)]
    pub disciplines_superior: bool,
    /// Per-discipline requirements with independent superior levels. All
    /// entries are required. When non-empty this supersedes `disciplines` and
    /// `disciplines_superior`. REST grammar: `dom:superior,for:any`.
    #[serde(default, deserialize_with = "deserialize_discipline_requirements")]
    pub discipline_requirements: Vec<DisciplineRequirement>,
    /// VDB-compatible OR-discipline rows. At least one alternative in every
    /// row must match; rows are ANDed. MCP accepts nested arrays. REST grammar:
    /// `dom:superior|for:any;aus:any|ani:superior`.
    #[serde(default, deserialize_with = "deserialize_discipline_or")]
    pub discipline_or: Vec<Vec<DisciplineRequirement>>,
    /// Selected set name (e.g. "Fifth Edition"); `set_age` and `set_print`
    /// control how the card's V5 print history is compared with it.
    #[serde(default)]
    pub set: Option<String>,
    /// Release-date relation to the selected set. `exact` requires a printing
    /// in that set; the other modes compare against the card's V5 print history.
    #[serde(default)]
    pub set_age: SetAgeMode,
    /// Printing relation to the selected set: any, only V5 set, first V5
    /// printing, or a later V5 reprint.
    #[serde(default)]
    pub set_print: SetPrintMode,
    /// Substring match against printing `precon` (e.g. "Anarch"); printings
    /// with no precon (NULL) never match. Backwards-compatible: prefer
    /// `precons` for exact VDB-compatible selection.
    #[serde(default)]
    pub precon: Option<String>,
    /// Exact VDB precon identities. MCP accepts objects such as
    /// `[{"set":"Fifth Edition","precon":"Ventrue"}]`; REST accepts
    /// comma-separated `set:precon` pairs. Multiple selections use OR
    /// semantics and supersede the legacy substring `precon` field.
    #[serde(default, deserialize_with = "deserialize_precon_selections")]
    pub precons: Vec<PreconSelection>,
    /// Printing-history relation for exact `precons`: any, only printing,
    /// first V5 printing, or a later V5 reprint.
    #[serde(default)]
    pub precon_print: SetPrintMode,
    /// Substring match against artist name; a card matches if any credited
    /// artist matches.
    #[serde(default)]
    pub artist: Option<String>,
    /// Explicit VDB-compatible result ordering. Defaults to capacity_desc.
    #[serde(default)]
    pub sort: CryptSort,
}

/// Scope of the `text` filter on crypt search.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum TextMode {
    /// Match card name or card text (default).
    #[default]
    Any,
    /// Match card name only.
    Name,
    /// Match card text only.
    Text,
}

/// VDB-compatible exact crypt-search ordering.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CryptSort {
    /// Highest capacity first (default), then name.
    #[default]
    CapacityDesc,
    /// Lowest capacity first, then name.
    CapacityAsc,
    /// Clan, then capacity descending, then name.
    Clan,
    /// Group, then capacity descending, then name.
    Group,
    /// Canonical card name.
    Name,
    /// Sect, then capacity descending, then name.
    Sect,
}

impl CryptSort {
    fn as_core(self) -> schrecknet_core::search_sort::CryptSort {
        match self {
            Self::CapacityDesc => schrecknet_core::search_sort::CryptSort::CapacityDesc,
            Self::CapacityAsc => schrecknet_core::search_sort::CryptSort::CapacityAsc,
            Self::Clan => schrecknet_core::search_sort::CryptSort::Clan,
            Self::Group => schrecknet_core::search_sort::CryptSort::Group,
            Self::Name => schrecknet_core::search_sort::CryptSort::Name,
            Self::Sect => schrecknet_core::search_sort::CryptSort::Sect,
        }
    }
}

/// Set logic for library discipline requirements, matching VDB's selector.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DisciplineLogic {
    /// Require every selected discipline (backwards-compatible default).
    #[default]
    All,
    /// Require at least one selected discipline.
    Any,
    /// Exclude cards requiring any selected discipline.
    None,
    /// Require exactly the selected discipline set and no others.
    Only,
}

/// All/Any/Not composition used by VDB's sect/title selectors.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum RequirementLogic {
    /// Require every selected token (default).
    #[default]
    All,
    /// Require at least one selected token.
    Any,
    /// Exclude cards matching any selected token.
    None,
}

/// One discipline requirement used by exact and semantic structured search.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
pub struct DisciplineRequirement {
    /// Lowercase discipline code, e.g. `dom` or `for`.
    pub code: String,
    /// Require superior level when true; either level matches when false.
    #[serde(default)]
    pub superior: bool,
}

/// Numeric comparison used by library blood/pool cost filters.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CostMode {
    /// Cost must be less than or equal to the supplied value (default).
    #[default]
    AtMost,
    /// Cost must equal the supplied value.
    Exact,
    /// Cost must be greater than or equal to the supplied value.
    AtLeast,
}

/// Direction of a library card's vampire-capacity requirement filter.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CapacityRequirementMode {
    /// Requirement allows a vampire at or below the supplied capacity.
    #[default]
    AtMost,
    /// Requirement needs a vampire at or above the supplied capacity.
    AtLeast,
}

/// Release-date relation used by set filters, matching vdb's age qualifiers.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SetAgeMode {
    /// Printed in the selected set (default).
    #[default]
    Exact,
    /// Printed in the selected set or a newer V5 set.
    OrNewer,
    /// Printed in the selected set or an older V5 set.
    OrOlder,
    /// Has no V5 printing newer than the selected set.
    NotNewer,
    /// Has no V5 printing older than the selected set.
    NotOlder,
}

/// Printing-history qualifier used alongside a selected set.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SetPrintMode {
    /// Any matching V5 printing (default).
    #[default]
    Any,
    /// The card appears in only one V5 set.
    Only,
    /// The selected set is the card's earliest V5 printing.
    First,
    /// The selected set is later than the card's earliest V5 printing.
    Reprint,
}

/// One exact preconstructed-deck identity. Precon names repeat across V5 sets,
/// so the set is part of the stable machine value just as it is in VDB.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
pub struct PreconSelection {
    pub set: String,
    pub precon: String,
}

/// MCP uses structured objects; REST uses a compact comma-separated
/// `set:precon` grammar because axum's query extractor does not deserialize
/// arrays of objects from a conventional URL query string.
fn deserialize_precon_selections<'de, D>(deserializer: D) -> Result<Vec<PreconSelection>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StructuredOrCsv {
        Structured(Vec<PreconSelection>),
        Csv(String),
    }

    fn normalized<E: serde::de::Error>(selection: PreconSelection) -> Result<PreconSelection, E> {
        let set = selection.set.trim().to_owned();
        let precon = selection.precon.trim().to_owned();
        if set.is_empty() || precon.is_empty() {
            return Err(E::custom(
                "precon selections require non-empty set and precon names",
            ));
        }
        Ok(PreconSelection { set, precon })
    }

    match StructuredOrCsv::deserialize(deserializer)? {
        StructuredOrCsv::Structured(selections) => {
            selections.into_iter().map(normalized::<D::Error>).collect()
        }
        StructuredOrCsv::Csv(csv) => csv
            .split(',')
            .filter(|value| !value.trim().is_empty())
            .map(|value| {
                let (set, precon) = value.split_once(':').ok_or_else(|| {
                    serde::de::Error::custom(
                        "REST precons must use comma-separated set:precon pairs",
                    )
                })?;
                normalized::<D::Error>(PreconSelection {
                    set: set.to_owned(),
                    precon: precon.to_owned(),
                })
            })
            .collect(),
    }
}

/// Accepts either a JSON array (MCP) or a comma-separated string (REST query
/// strings can't express arrays with axum's default Query extractor).
fn deserialize_disciplines<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ListOrCsv {
        List(Vec<String>),
        Csv(String),
    }
    Ok(match ListOrCsv::deserialize(deserializer)? {
        ListOrCsv::List(list) => list
            .into_iter()
            .map(|value| value.trim().to_lowercase())
            .filter(|value| !value.is_empty())
            .collect(),
        ListOrCsv::Csv(csv) => csv
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect(),
    })
}

/// Accepts either a JSON number array (MCP) or CSV (REST query string).
fn deserialize_i64_list<'de, D>(deserializer: D) -> Result<Vec<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ListOrCsv {
        List(Vec<i64>),
        Csv(String),
    }
    match ListOrCsv::deserialize(deserializer)? {
        ListOrCsv::List(list) => Ok(list),
        ListOrCsv::Csv(csv) => csv
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.parse().map_err(serde::de::Error::custom))
            .collect(),
    }
}

fn parse_discipline_requirement(value: &str) -> Result<DisciplineRequirement, String> {
    let (code, level) = value.split_once(':').unwrap_or((value, "any"));
    let code = code.trim().to_lowercase();
    if code.is_empty() {
        return Err("discipline code cannot be empty".into());
    }
    let superior = match level.trim().to_lowercase().as_str() {
        "any" => false,
        "superior" => true,
        other => {
            return Err(format!(
                "unknown discipline level `{other}`; use any or superior"
            ))
        }
    };
    Ok(DisciplineRequirement { code, superior })
}

/// MCP sends structured objects; REST uses `code:any,code:superior`.
fn deserialize_discipline_requirements<'de, D>(
    deserializer: D,
) -> Result<Vec<DisciplineRequirement>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ListOrEncoded {
        List(Vec<DisciplineRequirement>),
        Encoded(String),
    }
    match ListOrEncoded::deserialize(deserializer)? {
        ListOrEncoded::List(list) => Ok(list),
        ListOrEncoded::Encoded(encoded) => encoded
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(parse_discipline_requirement)
            .collect::<Result<_, _>>()
            .map_err(serde::de::Error::custom),
    }
}

/// MCP sends nested arrays; REST separates alternatives with `|` and rows
/// with `;`, matching VDB's “+OR DIS” rows without JSON in a query string.
fn deserialize_discipline_or<'de, D>(
    deserializer: D,
) -> Result<Vec<Vec<DisciplineRequirement>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ListOrEncoded {
        List(Vec<Vec<DisciplineRequirement>>),
        Encoded(String),
    }
    match ListOrEncoded::deserialize(deserializer)? {
        ListOrEncoded::List(list) => Ok(list),
        ListOrEncoded::Encoded(encoded) => encoded
            .split(';')
            .map(str::trim)
            .filter(|group| !group.is_empty())
            .map(|group| {
                group
                    .split('|')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(parse_discipline_requirement)
                    .collect::<Result<Vec<_>, _>>()
            })
            .collect::<Result<_, _>>()
            .map_err(serde::de::Error::custom),
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Discipline {
    pub code: String,
    pub superior: bool,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CryptCard {
    pub id: i64,
    pub name: String,
    pub clan: String,
    pub capacity: i64,
    pub group: i64,
    pub title: Option<String>,
    pub sect: Option<String>,
    pub path: Option<String>,
    pub votes: i64,
    pub image_url: Option<String>,
    pub disciplines: Vec<Discipline>,
}

#[derive(Debug, Clone, Default, Deserialize, JsonSchema, utoipa::ToSchema)]
#[derive(utoipa::IntoParams)]
pub struct LibrarySearchParams {
    /// Substring match against card name or card text.
    #[serde(default)]
    pub text: String,
    /// Where `text` must match: card name, card text, or either (default).
    #[serde(default)]
    pub text_mode: TextMode,
    /// If true, `text` is a regex pattern matched against whichever
    /// field(s) `text_mode` selects, instead of a substring — see
    /// CryptSearchParams::text_regex.
    #[serde(default)]
    pub text_regex: bool,
    /// Exact card type, e.g. "Master", "Action", "Combat" (matches cards with
    /// this type among possibly several — see `types` on the result).
    #[serde(default)]
    pub card_type: Option<String>,
    /// Clan/path requirement (substring match, e.g. "Tremere"). Most library
    /// cards have no clan requirement.
    #[serde(default)]
    pub clan: Option<String>,
    /// Normalized sect requirement tokens from the official VEKN metadata.
    /// REST accepts a comma-separated string; MCP accepts an array.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub sect_requirements: Vec<String>,
    /// How selected sect requirements combine: all, any, or none (Not).
    #[serde(default)]
    pub sect_requirement_logic: RequirementLogic,
    /// Treat cards with no recognized sect requirement as another selection.
    #[serde(default)]
    pub include_no_sect_requirement: bool,
    /// Normalized title requirement tokens. `titled_specific` is the VDB
    /// synthetic selection matching any specific title requirement.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub title_requirements: Vec<String>,
    /// How selected title requirements combine: all, any, or none (Not).
    #[serde(default)]
    pub title_requirement_logic: RequirementLogic,
    /// Lowercase discipline codes (e.g. ["dom","for"]); combination is
    /// controlled by `discipline_logic`. REST accepts a comma-separated string.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub disciplines: Vec<String>,
    /// Backwards-compatible level flag from the first MVP. VDB library
    /// requirements are level-neutral, so new clients should leave this false.
    #[serde(default)]
    pub disciplines_superior: bool,
    /// How selected library disciplines combine: all, any, none, or only.
    #[serde(default)]
    pub discipline_logic: DisciplineLogic,
    /// Treat “no discipline requirement” as an additional selected option.
    #[serde(default)]
    pub include_no_discipline: bool,
    /// Filter by the numeric boundary in a library card's “Requires ...
    /// capacity ...” clause. Cards without such a requirement never match.
    #[serde(default)]
    pub capacity_requirement: Option<i64>,
    /// Compare capacity requirements as at_most (≤) or at_least (≥).
    #[serde(default)]
    pub capacity_requirement_mode: CapacityRequirementMode,
    /// Maximum blood cost (inclusive); backwards-compatible alias for
    /// `blood_cost` with `blood_cost_mode=at_most`.
    #[serde(default)]
    pub blood_cost_max: Option<i64>,
    /// Maximum pool cost (inclusive); backwards-compatible alias for
    /// `pool_cost` with `pool_cost_mode=at_most`.
    #[serde(default)]
    pub pool_cost_max: Option<i64>,
    /// Blood cost value to compare; cards with no numeric cost never match.
    #[serde(default)]
    pub blood_cost: Option<i64>,
    /// Comparison applied to `blood_cost` (at_most, exact, or at_least).
    #[serde(default)]
    pub blood_cost_mode: CostMode,
    /// Pool cost value to compare; cards with no numeric cost never match.
    #[serde(default)]
    pub pool_cost: Option<i64>,
    /// Comparison applied to `pool_cost` (at_most, exact, or at_least).
    #[serde(default)]
    pub pool_cost_mode: CostMode,
    /// VDB-compatible precomputed trait tokens. Every selected trait must
    /// match. REST accepts CSV; MCP accepts an array.
    #[serde(default, deserialize_with = "deserialize_disciplines")]
    pub traits: Vec<String>,
    /// Selected set name (e.g. "Fifth Edition"); `set_age` and `set_print`
    /// control how the card's V5 print history is compared with it.
    #[serde(default)]
    pub set: Option<String>,
    /// Release-date relation to the selected set; see CryptSearchParams.
    #[serde(default)]
    pub set_age: SetAgeMode,
    /// Printing-history relation to the selected set; see CryptSearchParams.
    #[serde(default)]
    pub set_print: SetPrintMode,
    /// Substring match against printing `precon` (e.g. "Anarch"); printings
    /// with no precon (NULL) never match. Backwards-compatible: prefer
    /// `precons` for exact VDB-compatible selection.
    #[serde(default)]
    pub precon: Option<String>,
    /// Exact set + precon identities, OR-composed. See CryptSearchParams.
    #[serde(default, deserialize_with = "deserialize_precon_selections")]
    pub precons: Vec<PreconSelection>,
    /// Printing-history relation for exact `precons`.
    #[serde(default)]
    pub precon_print: SetPrintMode,
    /// Substring match against artist name; a card matches if any credited
    /// artist matches.
    #[serde(default)]
    pub artist: Option<String>,
    /// Explicit VDB-compatible result ordering. Defaults to name.
    #[serde(default)]
    pub sort: LibrarySort,
}

/// VDB-compatible exact library-search ordering.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum LibrarySort {
    /// Clan/path requirement, discipline requirement, type, then name.
    Requirement,
    /// Numeric blood/pool costs descending; X and absent costs follow.
    CostDesc,
    /// Numeric blood/pool costs ascending; X and absent costs follow.
    CostAsc,
    /// Canonical card name (default).
    #[default]
    Name,
    /// Card type, then clan/discipline requirement, then name.
    Type,
}

impl LibrarySort {
    fn as_core(self) -> schrecknet_core::search_sort::LibrarySort {
        match self {
            Self::Requirement => schrecknet_core::search_sort::LibrarySort::Requirement,
            Self::CostDesc => schrecknet_core::search_sort::LibrarySort::CostDesc,
            Self::CostAsc => schrecknet_core::search_sort::LibrarySort::CostAsc,
            Self::Name => schrecknet_core::search_sort::LibrarySort::Name,
            Self::Type => schrecknet_core::search_sort::LibrarySort::Type,
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct LibraryCard {
    pub id: i64,
    pub name: String,
    pub types: Vec<String>,
    pub clan: Option<String>,
    pub path: Option<String>,
    pub blood_cost: Option<String>,
    pub pool_cost: Option<String>,
    pub image_url: Option<String>,
    pub disciplines: Vec<String>,
}

pub fn open(data_dir: &str) -> rusqlite::Result<Connection> {
    let conn = Connection::open(format!("{data_dir}/cards.sqlite"))?;
    register_regexp(&conn)?;
    Ok(conn)
}

/// Registers `regexp_match(pattern, text) -> bool` as a SQL scalar function
/// (docs/adr/0005-regex-crate-for-search.md). The compiled pattern is cached
/// per-argument-value via rusqlite's `get_or_create_aux`, so a query scanning
/// many rows compiles the regex once, not once per row. Case-insensitive,
/// matching `LIKE`'s existing case-insensitive-ASCII behavior — otherwise
/// switching a search from substring to regex mode would silently start
/// missing matches purely due to letter casing. An invalid pattern surfaces
/// as a normal SQLite error (caught by the caller as a search error), never
/// a panic.
fn register_regexp(conn: &Connection) -> rusqlite::Result<()> {
    conn.create_scalar_function(
        "regexp_match",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let pattern: Arc<Regex> = ctx.get_or_create_aux(0, |value| {
                regex::RegexBuilder::new(value.as_str()?)
                    .case_insensitive(true)
                    .build()
                    .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { Box::new(e) })
            })?;
            let text = ctx.get_raw(1).as_str()?;
            Ok(pattern.is_match(text))
        },
    )
}

pub fn search_crypt(
    conn: &Connection,
    params: &CryptSearchParams,
) -> rusqlite::Result<Vec<CryptCard>> {
    search_crypt_inner(conn, params, true)
}

pub(crate) fn filter_crypt(
    conn: &Connection,
    params: &CryptSearchParams,
) -> rusqlite::Result<Vec<CryptCard>> {
    search_crypt_inner(conn, params, false)
}

fn crypt_plan_input(params: &CryptSearchParams) -> schrecknet_core::search_plan::CryptPlanInput {
    use schrecknet_core::search_plan as plan;

    plan::CryptPlanInput {
        text: params.text.clone(),
        text_mode: match params.text_mode {
            TextMode::Any => plan::TextMode::Any,
            TextMode::Name => plan::TextMode::Name,
            TextMode::Text => plan::TextMode::Text,
        },
        text_regex: params.text_regex,
        clan: params.clan.clone(),
        title: params.title.clone(),
        sects: params.sects.clone(),
        sect_logic: match params.sect_logic {
            RequirementLogic::All => plan::RequirementLogic::All,
            RequirementLogic::Any => plan::RequirementLogic::Any,
            RequirementLogic::None => plan::RequirementLogic::None,
        },
        votes: params.votes,
        traits: params.traits.clone(),
        group: params.group,
        groups: params.groups.clone(),
        capacity_min: params.capacity_min,
        capacity_max: params.capacity_max,
        disciplines: params.disciplines.clone(),
        disciplines_superior: params.disciplines_superior,
        discipline_requirements: params
            .discipline_requirements
            .iter()
            .map(|requirement| plan::DisciplineRequirement {
                code: requirement.code.clone(),
                superior: requirement.superior,
            })
            .collect(),
        discipline_or: params
            .discipline_or
            .iter()
            .map(|group| {
                group
                    .iter()
                    .map(|requirement| plan::DisciplineRequirement {
                        code: requirement.code.clone(),
                        superior: requirement.superior,
                    })
                    .collect()
            })
            .collect(),
        set: params.set.clone(),
        set_age: match params.set_age {
            SetAgeMode::Exact => plan::SetAgeMode::Exact,
            SetAgeMode::OrNewer => plan::SetAgeMode::OrNewer,
            SetAgeMode::OrOlder => plan::SetAgeMode::OrOlder,
            SetAgeMode::NotNewer => plan::SetAgeMode::NotNewer,
            SetAgeMode::NotOlder => plan::SetAgeMode::NotOlder,
        },
        set_print: match params.set_print {
            SetPrintMode::Any => plan::SetPrintMode::Any,
            SetPrintMode::Only => plan::SetPrintMode::Only,
            SetPrintMode::First => plan::SetPrintMode::First,
            SetPrintMode::Reprint => plan::SetPrintMode::Reprint,
        },
        precon: params.precon.clone(),
        precons: params
            .precons
            .iter()
            .map(|selection| plan::PreconSelection {
                set: selection.set.clone(),
                precon: selection.precon.clone(),
            })
            .collect(),
        precon_print: match params.precon_print {
            SetPrintMode::Any => plan::SetPrintMode::Any,
            SetPrintMode::Only => plan::SetPrintMode::Only,
            SetPrintMode::First => plan::SetPrintMode::First,
            SetPrintMode::Reprint => plan::SetPrintMode::Reprint,
        },
        artist: params.artist.clone(),
    }
}

fn sqlite_value(value: schrecknet_core::search_plan::SqlValue) -> rusqlite::types::Value {
    match value {
        schrecknet_core::search_plan::SqlValue::Null => rusqlite::types::Value::Null,
        schrecknet_core::search_plan::SqlValue::Integer(value) => {
            rusqlite::types::Value::Integer(value)
        }
        schrecknet_core::search_plan::SqlValue::Text(value) => rusqlite::types::Value::Text(value),
    }
}

fn search_crypt_inner(
    conn: &Connection,
    params: &CryptSearchParams,
    limited: bool,
) -> rusqlite::Result<Vec<CryptCard>> {
    let plan = schrecknet_core::search_plan::crypt_plan(&crypt_plan_input(params));
    let bound = plan
        .params
        .into_iter()
        .map(sqlite_value)
        .collect::<Vec<_>>();
    let mut stmt = conn.prepare(&plan.sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(bound.iter()), |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let clan: String = row.get(2)?;
        let capacity: i64 = row.get(3)?;
        let group: i64 = row.get(4)?;
        let sect: Option<String> = row.get(6)?;
        let sort_id = u32::try_from(id).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Integer,
                Box::new(error),
            )
        })?;
        let disc: Option<String> = row.get(10)?;
        Ok((
            CryptCard {
                id,
                name,
                clan: clan.clone(),
                capacity,
                group,
                title: row.get(5)?,
                sect: sect.clone(),
                votes: row.get(7)?,
                image_url: row.get(8)?,
                disciplines: parse_disciplines(disc),
                path: row.get(11)?,
            },
            schrecknet_core::search_sort::CryptSortRecord {
                id: sort_id,
                name_ascii: row.get(9)?,
                clan,
                capacity,
                group,
                sect: sect.unwrap_or_default(),
            },
        ))
    })?;
    let mut rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    rows.sort_by(|left, right| {
        schrecknet_core::search_sort::compare_crypt(&left.1, &right.1, params.sort.as_core())
    });
    if limited {
        rows.truncate(200);
    }
    Ok(rows.into_iter().map(|(card, _)| card).collect())
}

pub fn search_library(
    conn: &Connection,
    params: &LibrarySearchParams,
) -> rusqlite::Result<Vec<LibraryCard>> {
    search_library_inner(conn, params, true)
}

fn library_plan_input(
    params: &LibrarySearchParams,
) -> schrecknet_core::search_plan::LibraryPlanInput {
    use schrecknet_core::search_plan as plan;

    let requirement_logic = |logic| match logic {
        RequirementLogic::All => plan::RequirementLogic::All,
        RequirementLogic::Any => plan::RequirementLogic::Any,
        RequirementLogic::None => plan::RequirementLogic::None,
    };
    let cost_mode = |mode| match mode {
        CostMode::AtMost => plan::CostMode::AtMost,
        CostMode::Exact => plan::CostMode::Exact,
        CostMode::AtLeast => plan::CostMode::AtLeast,
    };
    let set_print_mode = |mode| match mode {
        SetPrintMode::Any => plan::SetPrintMode::Any,
        SetPrintMode::Only => plan::SetPrintMode::Only,
        SetPrintMode::First => plan::SetPrintMode::First,
        SetPrintMode::Reprint => plan::SetPrintMode::Reprint,
    };

    plan::LibraryPlanInput {
        text: params.text.clone(),
        text_mode: match params.text_mode {
            TextMode::Any => plan::TextMode::Any,
            TextMode::Name => plan::TextMode::Name,
            TextMode::Text => plan::TextMode::Text,
        },
        text_regex: params.text_regex,
        card_type: params.card_type.clone(),
        clan: params.clan.clone(),
        sect_requirements: params.sect_requirements.clone(),
        sect_requirement_logic: requirement_logic(params.sect_requirement_logic),
        include_no_sect_requirement: params.include_no_sect_requirement,
        title_requirements: params.title_requirements.clone(),
        title_requirement_logic: requirement_logic(params.title_requirement_logic),
        disciplines: params.disciplines.clone(),
        disciplines_superior: params.disciplines_superior,
        discipline_logic: match params.discipline_logic {
            DisciplineLogic::All => plan::DisciplineLogic::All,
            DisciplineLogic::Any => plan::DisciplineLogic::Any,
            DisciplineLogic::None => plan::DisciplineLogic::None,
            DisciplineLogic::Only => plan::DisciplineLogic::Only,
        },
        include_no_discipline: params.include_no_discipline,
        capacity_requirement: params.capacity_requirement,
        capacity_requirement_mode: match params.capacity_requirement_mode {
            CapacityRequirementMode::AtMost => plan::CapacityRequirementMode::AtMost,
            CapacityRequirementMode::AtLeast => plan::CapacityRequirementMode::AtLeast,
        },
        blood_cost_max: params.blood_cost_max,
        pool_cost_max: params.pool_cost_max,
        blood_cost: params.blood_cost,
        blood_cost_mode: cost_mode(params.blood_cost_mode),
        pool_cost: params.pool_cost,
        pool_cost_mode: cost_mode(params.pool_cost_mode),
        traits: params.traits.clone(),
        set: params.set.clone(),
        set_age: match params.set_age {
            SetAgeMode::Exact => plan::SetAgeMode::Exact,
            SetAgeMode::OrNewer => plan::SetAgeMode::OrNewer,
            SetAgeMode::OrOlder => plan::SetAgeMode::OrOlder,
            SetAgeMode::NotNewer => plan::SetAgeMode::NotNewer,
            SetAgeMode::NotOlder => plan::SetAgeMode::NotOlder,
        },
        set_print: set_print_mode(params.set_print),
        precon: params.precon.clone(),
        precons: params
            .precons
            .iter()
            .map(|selection| plan::PreconSelection {
                set: selection.set.clone(),
                precon: selection.precon.clone(),
            })
            .collect(),
        precon_print: set_print_mode(params.precon_print),
        artist: params.artist.clone(),
    }
}

pub(crate) fn filter_library(
    conn: &Connection,
    params: &LibrarySearchParams,
) -> rusqlite::Result<Vec<LibraryCard>> {
    search_library_inner(conn, params, false)
}

fn search_library_inner(
    conn: &Connection,
    params: &LibrarySearchParams,
    limited: bool,
) -> rusqlite::Result<Vec<LibraryCard>> {
    let plan = schrecknet_core::search_plan::library_plan(&library_plan_input(params));
    let bound = plan
        .params
        .into_iter()
        .map(sqlite_value)
        .collect::<Vec<_>>();
    let mut stmt = conn.prepare(&plan.sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(bound.iter()), |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let types_json: String = row.get(2)?;
        let types: Vec<String> = serde_json::from_str(&types_json).unwrap_or_default();
        let disc: Option<String> = row.get(8)?;
        let disciplines = disc
            .map(|value| value.split(',').map(str::to_string).collect::<Vec<_>>())
            .unwrap_or_default();
        let clan: Option<String> = row.get(3)?;
        let clan = clan.filter(|value| !value.is_empty());
        let blood_cost: Option<String> = row.get(4)?;
        let pool_cost: Option<String> = row.get(5)?;
        let sort_id = u32::try_from(id).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Integer,
                Box::new(error),
            )
        })?;
        Ok((
            LibraryCard {
                id,
                name,
                types: types.clone(),
                clan: clan.clone(),
                path: row.get(9)?,
                blood_cost: blood_cost.clone(),
                pool_cost: pool_cost.clone(),
                image_url: row.get(6)?,
                disciplines: disciplines.clone(),
            },
            schrecknet_core::search_sort::LibrarySortRecord {
                id: sort_id,
                name_ascii: row.get(7)?,
                types,
                clan: clan.unwrap_or_default(),
                disciplines,
                blood_cost,
                pool_cost,
            },
        ))
    })?;
    let mut rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    rows.sort_by(|left, right| {
        schrecknet_core::search_sort::compare_library(&left.1, &right.1, params.sort.as_core())
    });
    if limited {
        rows.truncate(200);
    }
    Ok(rows.into_iter().map(|(card, _)| card).collect())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, utoipa::ToSchema)]
pub struct PreconSummary {
    pub set: String,
    pub precon: String,
    pub card_count: i64,
}

/// Lists every (set, precon) pair with at least one printing, plus the
/// number of distinct cards known to belong to it. To browse a precon's
/// actual cards, call search_crypt/search_library with this pair's `set` +
/// `precon` (both exact for this purpose — the two filters together are
/// precise enough that reusing the search path avoids a second copy of the
/// same query logic). For real per-card copy counts within one physical
/// copy of the precon, see `precon_card_counts` below.
pub fn list_precons(conn: &Connection) -> rusqlite::Result<Vec<PreconSummary>> {
    let mut stmt = conn.prepare(
        "SELECT s.name, p.precon, COUNT(DISTINCT p.card_id) AS card_count
         FROM printings p JOIN sets s ON s.id = p.set_id
         WHERE p.precon IS NOT NULL
         GROUP BY s.name, p.precon
         ORDER BY s.name, p.precon",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PreconSummary {
            set: row.get(0)?,
            precon: row.get(1)?,
            card_count: row.get(2)?,
        })
    })?;
    rows.collect()
}

#[derive(Debug, Clone, Deserialize, JsonSchema, utoipa::ToSchema)]
#[derive(utoipa::IntoParams)]
pub struct PreconCardCountsParams {
    /// Exact set name, as returned by list_precons (e.g. "Fifth Edition").
    pub set: String,
    /// Exact precon name within that set, as returned by list_precons.
    pub precon: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, utoipa::ToSchema)]
pub struct PreconCardCount {
    pub card_id: i64,
    /// How many physical copies of this card one copy of the precon itself
    /// contains — some V5 precon crypts do ship a vampire twice. Sourced
    /// from KRCG's own per-printing `copies` field (see docs/data.md);
    /// defaults to 1 for the rare precon entries that omit it.
    pub copies: i64,
}

/// Real per-card copy counts for one physical copy of a precon — the data
/// `list_precons`'s `card_count` deliberately doesn't have (that's a count
/// of *distinct* cards, this is "how many of each"). Used by the inventory
/// page's "I own N copies of this precon" quantity feature.
pub fn precon_card_counts(
    conn: &Connection,
    params: &PreconCardCountsParams,
) -> rusqlite::Result<Vec<PreconCardCount>> {
    let mut stmt = conn.prepare(
        "SELECT p.card_id, SUM(COALESCE(p.precon_copies, 1)) AS copies
         FROM printings p JOIN sets s ON s.id = p.set_id
         WHERE s.name = ?1 AND p.precon = ?2
         GROUP BY p.card_id
         ORDER BY p.card_id",
    )?;
    let rows = stmt.query_map([&params.set, &params.precon], |row| {
        Ok(PreconCardCount {
            card_id: row.get(0)?,
            copies: row.get(1)?,
        })
    })?;
    rows.collect()
}

fn parse_disciplines(disc: Option<String>) -> Vec<Discipline> {
    let Some(disc) = disc else { return Vec::new() };
    let mut list: Vec<Discipline> = disc
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|entry| {
            let (code, superior) = entry.split_once(':')?;
            Some(Discipline {
                code: code.to_string(),
                superior: superior == "1",
            })
        })
        .collect();
    list.sort_by_key(|d| !d.superior);
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(conn: &Connection) {
        // regexp_match is referenced unconditionally in search_crypt/
        // search_library's SQL text (inside a CASE WHEN gated by
        // text_regex) — SQLite resolves function references at prepare()
        // time regardless of which branch runs, so every test connection
        // needs it registered even when a test never uses regex mode.
        register_regexp(conn).unwrap();
        conn.execute_batch(
            "CREATE TABLE cards(id INT, kind TEXT, name TEXT, name_ascii TEXT, card_text TEXT,
               clan TEXT, capacity INT, grp INT, title TEXT,
               types TEXT, blood_cost TEXT, pool_cost TEXT, sect TEXT, votes INT,
               image_url TEXT, path TEXT);
             CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior INT);
             CREATE TABLE card_capacity_requirements(
               card_id INT PRIMARY KEY, min_capacity INT, max_capacity INT);
             CREATE TABLE card_requirements(
               card_id INT, requirement TEXT, kind TEXT,
               PRIMARY KEY(card_id, requirement));
             CREATE TABLE card_traits(card_id INT, trait TEXT);
             CREATE TABLE sets(id INT, name TEXT, release_date TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT, first_print INT);
             CREATE TABLE artists(id INT, name TEXT);
             CREATE TABLE card_artists(card_id INT, artist_id INT);
             INSERT INTO cards VALUES
               (1,'crypt','Aaradhya','aaradhya','tyrant text','Ventrue',10,6,'Cardinal',NULL,NULL,NULL,'Sabbat',3,'https://static.krcg.org/card/1.jpg','Power and the Inner Voice'),
               (2,'crypt','Abaddon','abaddon','',  'Salubri',8,7,NULL,NULL,NULL,NULL,'Independent',0,NULL,NULL),
               (3,'library','Villein','villein','blood bound text','',NULL,NULL,NULL,'[\"Master\"]',NULL,'2',NULL,NULL,'https://static.krcg.org/card/3.jpg',NULL),
               (4,'library','Absolute Tyranny','absolute tyranny','vote text','',NULL,NULL,NULL,'[\"Action Modifier\",\"Reaction\"]','1',NULL,NULL,NULL,NULL,'Power and the Inner Voice'),
               (5,'library','Arcane Library','arcane library','','Tremere',NULL,NULL,NULL,'[\"Master\"]',NULL,'2',NULL,NULL,NULL,NULL);
             INSERT INTO card_disciplines VALUES (1,'dom',1),(1,'for',0),(2,'aus',1),(4,'pot',0),(4,'pre',0);
             INSERT INTO card_traits VALUES
               (1,'1 bleed'),(1,'unlock'),(2,'maneuver'),
               (3,'no-requirements'),(4,'multi-type'),(4,'multi-discipline');
             INSERT INTO sets VALUES
               (1,'Fifth Edition','2020-11-30'),
               (2,'Anarch Revolt','2021-12-01');
             INSERT INTO printings VALUES
               (1,1,NULL,'C',1),
               (2,2,'Anarch Precon','U',1),
               (3,1,NULL,'C',1);
             INSERT INTO artists VALUES (1,'Vagelis Adam'),(2,'Mike Chaney');
             INSERT INTO card_artists VALUES (1,1),(3,2);",
        )
        .unwrap();
    }

    #[test]
    fn filters_to_crypt_only_and_sorts_by_capacity() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_crypt(&conn, &CryptSearchParams::default()).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Aaradhya", "Abaddon"]
        );
    }

    #[test]
    fn crypt_sort_modes_match_vdb_grouping_and_tie_breaks() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let cases = [
            (CryptSort::CapacityDesc, vec!["Aaradhya", "Abaddon"]),
            (CryptSort::CapacityAsc, vec!["Abaddon", "Aaradhya"]),
            (CryptSort::Clan, vec!["Abaddon", "Aaradhya"]),
            (CryptSort::Group, vec!["Aaradhya", "Abaddon"]),
            (CryptSort::Name, vec!["Aaradhya", "Abaddon"]),
            (CryptSort::Sect, vec!["Abaddon", "Aaradhya"]),
        ];

        for (sort, expected) in cases {
            let results = search_crypt(
                &conn,
                &CryptSearchParams {
                    sort,
                    ..Default::default()
                },
            )
            .unwrap();
            assert_eq!(
                results
                    .iter()
                    .map(|card| card.name.as_str())
                    .collect::<Vec<_>>(),
                expected,
                "unexpected order for {sort:?}"
            );
        }
    }

    #[test]
    fn crypt_sort_defaults_and_deserializes_for_rest_and_mcp() {
        assert_eq!(CryptSearchParams::default().sort, CryptSort::CapacityDesc);
        let cases = [
            ("capacity_desc", CryptSort::CapacityDesc),
            ("capacity_asc", CryptSort::CapacityAsc),
            ("clan", CryptSort::Clan),
            ("group", CryptSort::Group),
            ("name", CryptSort::Name),
            ("sect", CryptSort::Sect),
        ];

        for (value, expected) in cases {
            let rest: CryptSearchParams =
                serde_urlencoded::from_str(&format!("sort={value}")).unwrap();
            let mcp: CryptSearchParams =
                serde_json::from_str(&format!(r#"{{"sort":"{value}"}}"#)).unwrap();
            assert_eq!(rest.sort, expected);
            assert_eq!(mcp.sort, expected);
        }
    }

    #[test]
    fn exact_search_image_urls_roundtrip_for_both_card_kinds() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);

        let crypt = search_crypt(&conn, &CryptSearchParams::default()).unwrap();
        assert_eq!(
            crypt
                .iter()
                .find(|card| card.id == 1)
                .unwrap()
                .image_url
                .as_deref(),
            Some("https://static.krcg.org/card/1.jpg")
        );
        assert_eq!(
            crypt.iter().find(|card| card.id == 2).unwrap().image_url,
            None
        );

        let library = search_library(&conn, &LibrarySearchParams::default()).unwrap();
        assert_eq!(
            library
                .iter()
                .find(|card| card.id == 3)
                .unwrap()
                .image_url
                .as_deref(),
            Some("https://static.krcg.org/card/3.jpg")
        );
        assert_eq!(
            library.iter().find(|card| card.id == 4).unwrap().image_url,
            None
        );
    }

    #[test]
    fn text_search_matches_name_or_card_text() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            text: "tyrant".into(),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
    }

    #[test]
    fn clan_filter_narrows_results() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            clan: Some("Salubri".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Abaddon");
    }

    #[test]
    fn disciplines_are_sorted_superior_first() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_crypt(&conn, &CryptSearchParams::default()).unwrap();
        let aaradhya = results.iter().find(|c| c.name == "Aaradhya").unwrap();
        assert_eq!(aaradhya.disciplines[0].code, "dom");
        assert!(aaradhya.disciplines[0].superior);
        assert_eq!(aaradhya.disciplines[1].code, "for");
        assert!(!aaradhya.disciplines[1].superior);
        assert_eq!(aaradhya.path.as_deref(), Some("Power and the Inner Voice"));
    }

    #[test]
    fn capacity_range_filter() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            capacity_min: Some(9),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya"); // cap 10; Abaddon (8) excluded
        let params = CryptSearchParams {
            capacity_max: Some(8),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Abaddon");
    }

    #[test]
    fn discipline_filter_requires_all_listed() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya has dom(sup)+for(inf); Abaddon has aus(sup) only.
        let params = CryptSearchParams {
            disciplines: vec!["dom".into(), "for".into()],
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
    }

    #[test]
    fn superior_flag_excludes_inferior_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya's `for` is inferior — requiring superior must exclude her.
        let params = CryptSearchParams {
            disciplines: vec!["for".into()],
            disciplines_superior: true,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
        // …but plain `for` (any level) matches.
        let params = CryptSearchParams {
            disciplines: vec!["for".into()],
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 1);
    }

    #[test]
    fn crypt_per_discipline_levels_match_vdb_and_override_legacy_fields() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // VDB's ordinary discipline row ANDs entries while preserving each
        // badge's own level. Aaradhya has superior dom + inferior for.
        let params = CryptSearchParams {
            disciplines: vec!["aus".into()],
            disciplines_superior: true,
            discipline_requirements: vec![
                DisciplineRequirement {
                    code: "dom".into(),
                    superior: true,
                },
                DisciplineRequirement {
                    code: "for".into(),
                    superior: false,
                },
            ],
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");

        let params = CryptSearchParams {
            discipline_requirements: vec![
                DisciplineRequirement {
                    code: "dom".into(),
                    superior: false,
                },
                DisciplineRequirement {
                    code: "for".into(),
                    superior: true,
                },
            ],
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn crypt_or_discipline_rows_are_or_within_and_and_between() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            discipline_or: vec![
                vec![
                    DisciplineRequirement {
                        code: "dom".into(),
                        superior: true,
                    },
                    DisciplineRequirement {
                        code: "aus".into(),
                        superior: true,
                    },
                ],
                vec![
                    DisciplineRequirement {
                        code: "for".into(),
                        superior: false,
                    },
                    DisciplineRequirement {
                        code: "pre".into(),
                        superior: false,
                    },
                ],
            ],
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
    }

    #[test]
    fn crypt_multi_group_is_or_and_supersedes_single_group() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            group: Some(5),
            groups: vec![6, 7],
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 2);

        let params = CryptSearchParams {
            groups: vec![7],
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap()[0].name, "Abaddon");
    }

    #[test]
    fn discipline_csv_deserializes_from_query_string() {
        let params: CryptSearchParams =
            serde_urlencoded::from_str("disciplines=DOM,%20for").unwrap();
        assert_eq!(params.disciplines, vec!["dom", "for"]);
        let params: CryptSearchParams = serde_json::from_str(r#"{"disciplines":["dom"]}"#).unwrap();
        assert_eq!(params.disciplines, vec!["dom"]);
    }

    #[test]
    fn advanced_composition_deserializes_for_rest_and_mcp() {
        let rest: CryptSearchParams = serde_urlencoded::from_str(
            "groups=5,7&discipline_requirements=DOM:superior,for:any&discipline_or=aus:superior%7Cani:any%3Bpot:any%7Cpre:superior",
        )
        .unwrap();
        assert_eq!(rest.groups, vec![5, 7]);
        assert_eq!(
            rest.discipline_requirements,
            vec![
                DisciplineRequirement {
                    code: "dom".into(),
                    superior: true,
                },
                DisciplineRequirement {
                    code: "for".into(),
                    superior: false,
                },
            ]
        );
        assert_eq!(rest.discipline_or.len(), 2);
        assert_eq!(rest.discipline_or[0][1].code, "ani");

        let mcp: CryptSearchParams = serde_json::from_str(
            r#"{"groups":[6,7],"discipline_requirements":[{"code":"dom","superior":true}],"discipline_or":[[{"code":"for"},{"code":"aus","superior":true}]]}"#,
        )
        .unwrap();
        assert_eq!(mcp.groups, vec![6, 7]);
        assert!(mcp.discipline_requirements[0].superior);
        assert_eq!(mcp.discipline_or[0].len(), 2);
    }

    #[test]
    fn title_filter_matches_exactly() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            title: Some("Cardinal".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
        // Exact match, not substring — "Card" must not match "Cardinal".
        let params = CryptSearchParams {
            title: Some("Card".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn crypt_non_titled_and_vote_thresholds_match_vdb() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);

        let non_titled = CryptSearchParams {
            title: Some("non-titled".into()),
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &non_titled).unwrap()[0].name, "Abaddon");

        let three_plus = CryptSearchParams {
            votes: Some(3),
            ..Default::default()
        };
        assert_eq!(
            search_crypt(&conn, &three_plus).unwrap()[0].name,
            "Aaradhya"
        );

        let no_votes = CryptSearchParams {
            votes: Some(0),
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &no_votes).unwrap()[0].name, "Abaddon");

        let four_plus = CryptSearchParams {
            votes: Some(4),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &four_plus).unwrap().is_empty());
    }

    #[test]
    fn crypt_sects_support_all_any_and_not_logic() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);

        let any = CryptSearchParams {
            sects: vec!["sabbat".into(), "camarilla".into()],
            sect_logic: RequirementLogic::Any,
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &any).unwrap()[0].name, "Aaradhya");

        let none = CryptSearchParams {
            sects: vec!["Sabbat".into()],
            sect_logic: RequirementLogic::None,
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &none).unwrap()[0].name, "Abaddon");

        let impossible_all = CryptSearchParams {
            sects: vec!["Sabbat".into(), "Independent".into()],
            sect_logic: RequirementLogic::All,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &impossible_all).unwrap().is_empty());
    }

    #[test]
    fn crypt_metadata_filters_deserialize_for_rest_and_mcp() {
        let rest: CryptSearchParams =
            serde_urlencoded::from_str("sects=Sabbat,Anarch&sect_logic=any&votes=2").unwrap();
        assert_eq!(rest.sects, vec!["sabbat", "anarch"]);
        assert_eq!(rest.sect_logic, RequirementLogic::Any);
        assert_eq!(rest.votes, Some(2));

        let mcp: CryptSearchParams = serde_json::from_str(
            r#"{"sects":["Camarilla"],"sect_logic":"none","title":"non-titled","votes":0}"#,
        )
        .unwrap();
        assert_eq!(mcp.sects, vec!["camarilla"]);
        assert_eq!(mcp.sect_logic, RequirementLogic::None);
        assert_eq!(mcp.title.as_deref(), Some("non-titled"));
        assert_eq!(mcp.votes, Some(0));
    }

    #[test]
    fn text_mode_name_matches_name_only() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // "tyrant" is in Aaradhya's card_text, not her name.
        let params = CryptSearchParams {
            text: "tyrant".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
        let params = CryptSearchParams {
            text: "aaradhya".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 1);
    }

    #[test]
    fn text_mode_text_matches_card_text_only() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = CryptSearchParams {
            text: "aaradhya".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
        let params = CryptSearchParams {
            text: "tyrant".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 1);
    }

    #[test]
    fn text_mode_deserializes_lowercase_and_defaults_to_any() {
        let params: CryptSearchParams = serde_urlencoded::from_str("text_mode=name").unwrap();
        assert_eq!(params.text_mode, TextMode::Name);
        let params: CryptSearchParams = serde_json::from_str(r#"{"text_mode":"text"}"#).unwrap();
        assert_eq!(params.text_mode, TextMode::Text);
        let params: CryptSearchParams = serde_json::from_str("{}").unwrap();
        assert_eq!(params.text_mode, TextMode::Any);
    }

    #[test]
    fn crypt_text_regex_matches_alternation_and_anchors() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn); // registers regexp_match too
                     // "^Aa" anchors to the start of the name; only Aaradhya qualifies.
        let params = CryptSearchParams {
            text: "^Aa".into(),
            text_mode: TextMode::Name,
            text_regex: true,
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
        // Alternation matches either card by name.
        let params = CryptSearchParams {
            text: "Aaradhya|Abaddon".into(),
            text_mode: TextMode::Name,
            text_regex: true,
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &params).unwrap().len(), 2);
    }

    #[test]
    fn crypt_text_regex_off_treats_pattern_chars_literally() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn); // registers regexp_match too
                     // With text_regex left at its default (false), "^Aa" is a literal
                     // substring — no card's name literally contains "^Aa" — so this
                     // must NOT be misinterpreted as a regex anchor.
        let params = CryptSearchParams {
            text: "^Aa".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn crypt_text_regex_invalid_pattern_is_a_search_error_not_a_panic() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn); // registers regexp_match too
        let params = CryptSearchParams {
            text: "(unclosed".into(),
            text_mode: TextMode::Name,
            text_regex: true,
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).is_err());
    }

    #[test]
    fn crypt_set_filter_matches_exact_set_name() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya (card 1) has a printing in Fifth Edition; Abaddon has none.
        let params = CryptSearchParams {
            set: Some("Fifth Edition".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
        // A set no crypt card was printed in matches nothing.
        let params = CryptSearchParams {
            set: Some("Unknown Set".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn crypt_precon_filter_substring_matches_and_skips_null() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Only Abaddon (card 2) has a precon printing; Aaradhya's is NULL.
        let params = CryptSearchParams {
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Abaddon");
    }

    #[test]
    fn exact_precons_deserialize_for_rest_and_mcp() {
        let rest: CryptSearchParams = serde_urlencoded::from_str(
            "precons=Fifth+Edition%3AVentrue%2CNew+Blood%3AVentrue&precon_print=reprint",
        )
        .unwrap();
        assert_eq!(
            rest.precons,
            vec![
                PreconSelection {
                    set: "Fifth Edition".into(),
                    precon: "Ventrue".into(),
                },
                PreconSelection {
                    set: "New Blood".into(),
                    precon: "Ventrue".into(),
                },
            ]
        );
        assert_eq!(rest.precon_print, SetPrintMode::Reprint);

        let mcp: LibrarySearchParams = serde_json::from_str(
            r#"{"precons":[{"set":"New Blood","precon":"Malkavian"}],"precon_print":"first"}"#,
        )
        .unwrap();
        assert_eq!(
            mcp.precons,
            vec![PreconSelection {
                set: "New Blood".into(),
                precon: "Malkavian".into(),
            }]
        );
        assert_eq!(mcp.precon_print, SetPrintMode::First);
        assert!(serde_urlencoded::from_str::<CryptSearchParams>("precons=Ventrue").is_err());
    }

    #[test]
    fn crypt_exact_precons_use_or_and_vdb_print_modes() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        conn.execute_batch(
            "INSERT INTO sets VALUES (3,'New Blood','2022-04-17');
             INSERT INTO printings VALUES (1,3,'Ventrue','C',0);",
        )
        .unwrap();

        let selection = |set: &str, precon: &str| PreconSelection {
            set: set.into(),
            precon: precon.into(),
        };
        let names = |params: CryptSearchParams| {
            search_crypt(&conn, &params)
                .unwrap()
                .into_iter()
                .map(|card| card.name)
                .collect::<Vec<_>>()
        };

        assert_eq!(
            names(CryptSearchParams {
                precons: vec![selection("New Blood", "Ventrue")],
                ..Default::default()
            }),
            vec!["Aaradhya"]
        );
        assert!(names(CryptSearchParams {
            precons: vec![selection("Fifth Edition", "Ventrue")],
            ..Default::default()
        })
        .is_empty());
        assert_eq!(
            names(CryptSearchParams {
                precons: vec![
                    selection("Anarch Revolt", "Anarch Precon"),
                    selection("New Blood", "Ventrue"),
                ],
                ..Default::default()
            }),
            vec!["Aaradhya", "Abaddon"]
        );
        assert!(names(CryptSearchParams {
            precons: vec![selection("New Blood", "Ventrue")],
            precon_print: SetPrintMode::Only,
            ..Default::default()
        })
        .is_empty());
        assert!(names(CryptSearchParams {
            precons: vec![selection("New Blood", "Ventrue")],
            precon_print: SetPrintMode::First,
            ..Default::default()
        })
        .is_empty());
        assert_eq!(
            names(CryptSearchParams {
                precons: vec![selection("New Blood", "Ventrue")],
                precon_print: SetPrintMode::Reprint,
                ..Default::default()
            }),
            vec!["Aaradhya"]
        );
        assert_eq!(
            names(CryptSearchParams {
                precon: Some("does not match".into()),
                precons: vec![selection("Anarch Revolt", "Anarch Precon")],
                precon_print: SetPrintMode::Only,
                ..Default::default()
            }),
            vec!["Abaddon"]
        );
    }

    #[test]
    fn crypt_set_and_precon_together_require_the_same_printing() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Card 6 has TWO printings: one in "Fifth Edition" with no precon,
        // and one in "Anarch Revolt" with precon "Anarch Precon" — neither
        // single printing satisfies both filters at once, so combining
        // set="Fifth Edition" + precon="Anarch" must match nothing, even
        // though each filter alone would match this card via its other
        // printing (the bug: two independent EXISTS clauses would wrongly
        // match here).
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (6,'crypt','Mixed Printings','mixed printings','','Ventrue',5,6,NULL,NULL,NULL,NULL,'Anarch',0,NULL,NULL);
             INSERT INTO printings VALUES (6,1,NULL,'C',1), (6,2,'Anarch Precon','U',0);",
        )
        .unwrap();

        let params = CryptSearchParams {
            set: Some("Fifth Edition".into()),
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());

        // Sanity: each filter alone still matches this card via its own printing.
        let set_only = CryptSearchParams {
            set: Some("Fifth Edition".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &set_only)
            .unwrap()
            .iter()
            .any(|c| c.name == "Mixed Printings"));
        let precon_only = CryptSearchParams {
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &precon_only)
            .unwrap()
            .iter()
            .any(|c| c.name == "Mixed Printings"));

        // A precon that DOES share a printing with the matching set works.
        let matching_pair = CryptSearchParams {
            set: Some("Anarch Revolt".into()),
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &matching_pair)
            .unwrap()
            .iter()
            .any(|c| c.name == "Mixed Printings"));
    }

    #[test]
    fn set_age_and_print_modes_match_vdb_release_date_semantics() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Card 1: Fifth Edition -> New Blood (a V5 reprint).
        // Card 2: Anarch Revolt only. These compact fixtures exercise the
        // age/print definitions from vdb's cardFilters.js within our V5-only
        // print history.
        conn.execute_batch(
            "INSERT INTO sets VALUES (3,'New Blood','2022-04-17');
             INSERT INTO printings VALUES (1,3,NULL,'C',0);",
        )
        .unwrap();

        let names = |params: CryptSearchParams| {
            search_crypt(&conn, &params)
                .unwrap()
                .into_iter()
                .map(|card| card.name)
                .collect::<Vec<_>>()
        };

        assert_eq!(
            names(CryptSearchParams {
                set: Some("New Blood".into()),
                set_age: SetAgeMode::OrNewer,
                ..Default::default()
            }),
            vec!["Aaradhya"]
        );
        assert_eq!(
            names(CryptSearchParams {
                set: Some("Anarch Revolt".into()),
                set_age: SetAgeMode::NotNewer,
                ..Default::default()
            }),
            vec!["Abaddon"]
        );
        assert_eq!(
            names(CryptSearchParams {
                set: Some("Anarch Revolt".into()),
                set_age: SetAgeMode::NotOlder,
                ..Default::default()
            }),
            vec!["Abaddon"]
        );
        assert_eq!(
            names(CryptSearchParams {
                set: Some("Anarch Revolt".into()),
                set_print: SetPrintMode::Only,
                ..Default::default()
            }),
            vec!["Abaddon"]
        );
        assert_eq!(
            names(CryptSearchParams {
                set: Some("Fifth Edition".into()),
                set_print: SetPrintMode::First,
                ..Default::default()
            }),
            vec!["Aaradhya"]
        );
        assert_eq!(
            names(CryptSearchParams {
                set: Some("New Blood".into()),
                set_print: SetPrintMode::Reprint,
                ..Default::default()
            }),
            vec!["Aaradhya"]
        );
        assert!(names(CryptSearchParams {
            set: Some("Fifth Edition".into()),
            set_print: SetPrintMode::Reprint,
            ..Default::default()
        })
        .is_empty());
    }

    #[test]
    fn set_modes_deserialize_for_rest_and_mcp() {
        let rest: CryptSearchParams =
            serde_urlencoded::from_str("set_age=or_newer&set_print=reprint").unwrap();
        assert_eq!(rest.set_age, SetAgeMode::OrNewer);
        assert_eq!(rest.set_print, SetPrintMode::Reprint);

        let mcp: LibrarySearchParams =
            serde_json::from_str(r#"{"set_age":"not_older","set_print":"first"}"#).unwrap();
        assert_eq!(mcp.set_age, SetAgeMode::NotOlder);
        assert_eq!(mcp.set_print, SetPrintMode::First);
    }

    #[test]
    fn library_set_print_mode_uses_the_same_v5_history_rules() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        conn.execute_batch(
            "INSERT INTO sets VALUES (3,'New Blood','2022-04-17');
             INSERT INTO printings VALUES (3,3,NULL,'C',0);",
        )
        .unwrap();

        let params = LibrarySearchParams {
            set: Some("New Blood".into()),
            set_print: SetPrintMode::Reprint,
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Villein");
    }

    #[test]
    fn crypt_artist_filter_substring_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Aaradhya (card 1) is credited to Vagelis Adam.
        let params = CryptSearchParams {
            artist: Some("Vagelis".into()),
            ..Default::default()
        };
        let results = search_crypt(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Aaradhya");
        // No card matches an unknown artist.
        let params = CryptSearchParams {
            artist: Some("Nobody".into()),
            ..Default::default()
        };
        assert!(search_crypt(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_search_filters_to_library_only_and_sorts_by_name() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_library(&conn, &LibrarySearchParams::default()).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Absolute Tyranny", "Arcane Library", "Villein"]
        );
    }

    fn seed_library_sort_cards(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (20,'library','Alpha Numeric Low','alpha numeric low','sort fixture','',NULL,NULL,NULL,'[\"Action\"]','1','3',NULL,NULL,NULL,NULL),
               (21,'library','Beta Numeric High','beta numeric high','sort fixture','',NULL,NULL,NULL,'[\"Action\"]','3','1',NULL,NULL,NULL,NULL),
               (22,'library','Clan Required','clan required','sort fixture','Ventrue',NULL,NULL,NULL,'[\"Master\"]',NULL,'1',NULL,NULL,NULL,NULL),
               (23,'library','Discipline Required','discipline required','sort fixture','',NULL,NULL,NULL,'[\"Combat\"]','X','2',NULL,NULL,NULL,NULL),
               (24,'library','No Requirement','no requirement','sort fixture','',NULL,NULL,NULL,'[\"Reaction\"]',NULL,NULL,NULL,NULL,NULL,NULL);
             INSERT INTO card_disciplines VALUES (23,'aus',0);",
        )
        .unwrap();
    }

    #[test]
    fn library_sort_modes_match_vdb_grouping_and_cost_rules() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_sort_cards(&conn);
        let cases = [
            (
                LibrarySort::Requirement,
                vec![
                    "Clan Required",
                    "Discipline Required",
                    "Alpha Numeric Low",
                    "Beta Numeric High",
                    "No Requirement",
                ],
            ),
            (
                LibrarySort::CostDesc,
                vec![
                    "Beta Numeric High",
                    "Alpha Numeric Low",
                    "Discipline Required",
                    "Clan Required",
                    "No Requirement",
                ],
            ),
            (
                LibrarySort::CostAsc,
                vec![
                    "Alpha Numeric Low",
                    "Beta Numeric High",
                    "Clan Required",
                    "Discipline Required",
                    "No Requirement",
                ],
            ),
            (
                LibrarySort::Name,
                vec![
                    "Alpha Numeric Low",
                    "Beta Numeric High",
                    "Clan Required",
                    "Discipline Required",
                    "No Requirement",
                ],
            ),
            (
                LibrarySort::Type,
                vec![
                    "Alpha Numeric Low",
                    "Beta Numeric High",
                    "Discipline Required",
                    "Clan Required",
                    "No Requirement",
                ],
            ),
        ];

        for (sort, expected) in cases {
            let results = search_library(
                &conn,
                &LibrarySearchParams {
                    text: "sort fixture".into(),
                    sort,
                    ..Default::default()
                },
            )
            .unwrap();
            assert_eq!(
                results
                    .iter()
                    .map(|card| card.name.as_str())
                    .collect::<Vec<_>>(),
                expected,
                "unexpected order for {sort:?}"
            );
        }
    }

    #[test]
    fn library_sort_defaults_and_deserializes_for_rest_and_mcp() {
        assert_eq!(LibrarySearchParams::default().sort, LibrarySort::Name);
        let cases = [
            ("requirement", LibrarySort::Requirement),
            ("cost_desc", LibrarySort::CostDesc),
            ("cost_asc", LibrarySort::CostAsc),
            ("name", LibrarySort::Name),
            ("type", LibrarySort::Type),
        ];

        for (value, expected) in cases {
            let rest: LibrarySearchParams =
                serde_urlencoded::from_str(&format!("sort={value}")).unwrap();
            let mcp: LibrarySearchParams =
                serde_json::from_str(&format!(r#"{{"sort":"{value}"}}"#)).unwrap();
            assert_eq!(rest.sort, expected);
            assert_eq!(mcp.sort, expected);
        }
    }

    #[test]
    fn library_text_modes_limit_the_search_scope() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let name_only = LibrarySearchParams {
            text: "villein".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &name_only).unwrap()[0].name,
            "Villein"
        );

        let excluded_from_name = LibrarySearchParams {
            text: "bound".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert!(search_library(&conn, &excluded_from_name)
            .unwrap()
            .is_empty());

        let text_only = LibrarySearchParams {
            text: "bound".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &text_only).unwrap()[0].name,
            "Villein"
        );

        let excluded_from_text = LibrarySearchParams {
            text: "villein".into(),
            text_mode: TextMode::Text,
            ..Default::default()
        };
        assert!(search_library(&conn, &excluded_from_text)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn library_text_mode_deserializes_for_rest_and_mcp() {
        let rest: LibrarySearchParams = serde_urlencoded::from_str("text_mode=name").unwrap();
        assert_eq!(rest.text_mode, TextMode::Name);
        let mcp: LibrarySearchParams = serde_json::from_str(r#"{"text_mode":"text"}"#).unwrap();
        assert_eq!(mcp.text_mode, TextMode::Text);
    }

    #[test]
    fn library_text_regex_matches_and_off_is_literal() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn); // registers regexp_match too
                     // "^A" anchors the start of the name — Absolute Tyranny and Arcane
                     // Library qualify, Villein does not.
        let params = LibrarySearchParams {
            text: "^A".into(),
            text_mode: TextMode::Name,
            text_regex: true,
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|c| c.name.starts_with('A')));
        // Same pattern with regex off is a literal substring — no library
        // card's name contains the literal text "^A", so nothing matches.
        let params = LibrarySearchParams {
            text: "^A".into(),
            text_mode: TextMode::Name,
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_type_filter_matches_exact_type_not_substring() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // "Master" must not spuriously match a type array that doesn't contain it.
        let params = LibrarySearchParams {
            card_type: Some("Master".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Arcane Library", "Villein"]
        );
    }

    #[test]
    fn library_clan_requirement_filter() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = LibrarySearchParams {
            clan: Some("Tremere".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Arcane Library");

        let path_results = search_library(
            &conn,
            &LibrarySearchParams {
                clan: Some("Power and the Inner Voice".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(path_results.len(), 1);
        assert_eq!(path_results[0].name, "Absolute Tyranny");
        assert_eq!(
            path_results[0].path.as_deref(),
            Some("Power and the Inner Voice")
        );
    }

    #[test]
    fn library_cards_with_no_clan_requirement_report_none() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let results = search_library(&conn, &LibrarySearchParams::default()).unwrap();
        let villein = results.iter().find(|c| c.name == "Villein").unwrap();
        assert_eq!(villein.clan, None);
        assert_eq!(villein.types, vec!["Master"]);
        assert_eq!(villein.pool_cost, Some("2".to_string()));
    }

    /// Extra library rows for the discipline/cost filter tests (kept separate
    /// from `seed` so the shared fixture stays stable for other tests).
    fn seed_library_filter_extras(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (6,'library','Deflection','deflection','bounce text','',NULL,NULL,NULL,'[\"Reaction\"]',NULL,NULL,NULL,NULL,NULL,NULL),
               (7,'library','Theft of Vitae','theft of vitae','steal blood','',NULL,NULL,NULL,'[\"Combat\"]','1',NULL,NULL,NULL,NULL,NULL),
               (8,'library','Hidden Strength','hidden strength','variable cost','',NULL,NULL,NULL,'[\"Combat\"]','X',NULL,NULL,NULL,NULL,NULL),
               (9,'library','Expensive Action','expensive action','cost fixture','',NULL,NULL,NULL,'[\"Action\"]','3',NULL,NULL,NULL,NULL,NULL);
             INSERT INTO card_disciplines VALUES (6,'dom',1),(7,'tha',0),(8,'for',0);",
        )
        .unwrap();
    }

    #[test]
    fn library_discipline_filter_requires_all_listed() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        // Absolute Tyranny requires pot+pre; requiring both matches only it.
        let params = LibrarySearchParams {
            disciplines: vec!["pot".into(), "pre".into()],
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Absolute Tyranny");
        // A single discipline narrows to cards carrying it.
        let params = LibrarySearchParams {
            disciplines: vec!["dom".into()],
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Deflection");
    }

    #[test]
    fn library_superior_flag_excludes_inferior_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        // Absolute Tyranny's pot is inferior — requiring superior excludes it.
        let params = LibrarySearchParams {
            disciplines: vec!["pot".into()],
            disciplines_superior: true,
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
        // Deflection's dom is superior — it survives the superior requirement.
        let params = LibrarySearchParams {
            disciplines: vec!["dom".into()],
            disciplines_superior: true,
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Deflection");
    }

    #[test]
    fn library_discipline_logic_matches_vdb_all_any_none_and_only() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);

        let all = LibrarySearchParams {
            disciplines: vec!["pot".into(), "pre".into()],
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &all).unwrap()[0].name,
            "Absolute Tyranny"
        );

        let any = LibrarySearchParams {
            disciplines: vec!["pot".into(), "dom".into()],
            discipline_logic: DisciplineLogic::Any,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &any)
                .unwrap()
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Absolute Tyranny", "Deflection"]
        );

        let none = LibrarySearchParams {
            disciplines: vec!["pot".into(), "dom".into()],
            discipline_logic: DisciplineLogic::None,
            ..Default::default()
        };
        let excluded = search_library(&conn, &none).unwrap();
        assert!(excluded.iter().all(|card| card.name != "Absolute Tyranny"));
        assert!(excluded.iter().all(|card| card.name != "Deflection"));

        let only = LibrarySearchParams {
            disciplines: vec!["pot".into(), "pre".into()],
            discipline_logic: DisciplineLogic::Only,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &only).unwrap()[0].name,
            "Absolute Tyranny"
        );
        let not_only = LibrarySearchParams {
            disciplines: vec!["pot".into()],
            discipline_logic: DisciplineLogic::Only,
            ..Default::default()
        };
        assert!(search_library(&conn, &not_only).unwrap().is_empty());
    }

    #[test]
    fn library_no_discipline_requirement_is_a_real_filter_option() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let params = LibrarySearchParams {
            discipline_logic: DisciplineLogic::Any,
            include_no_discipline: true,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &params)
                .unwrap()
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Arcane Library", "Villein"]
        );

        let rest: LibrarySearchParams = serde_urlencoded::from_str(
            "disciplines=pot,pre&discipline_logic=only&include_no_discipline=false",
        )
        .unwrap();
        assert_eq!(rest.discipline_logic, DisciplineLogic::Only);
        let mcp: LibrarySearchParams = serde_json::from_str(
            r#"{"disciplines":["dom"],"discipline_logic":"none","include_no_discipline":true}"#,
        )
        .unwrap();
        assert_eq!(mcp.discipline_logic, DisciplineLogic::None);
        assert!(mcp.include_no_discipline);
    }

    #[test]
    fn library_capacity_requirement_filters_derived_bounds() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        conn.execute_batch(
            "INSERT INTO card_capacity_requirements VALUES
               (4, 7, NULL),
               (5, NULL, 5);",
        )
        .unwrap();

        let at_least = LibrarySearchParams {
            capacity_requirement: Some(6),
            capacity_requirement_mode: CapacityRequirementMode::AtLeast,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &at_least).unwrap()[0].name,
            "Absolute Tyranny"
        );
        let too_high = LibrarySearchParams {
            capacity_requirement: Some(8),
            capacity_requirement_mode: CapacityRequirementMode::AtLeast,
            ..Default::default()
        };
        assert!(search_library(&conn, &too_high).unwrap().is_empty());

        let at_most = LibrarySearchParams {
            capacity_requirement: Some(5),
            capacity_requirement_mode: CapacityRequirementMode::AtMost,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &at_most).unwrap()[0].name,
            "Arcane Library"
        );
    }

    #[test]
    fn library_capacity_requirement_deserializes_for_rest_and_mcp() {
        let rest: LibrarySearchParams =
            serde_urlencoded::from_str("capacity_requirement=6&capacity_requirement_mode=at_least")
                .unwrap();
        assert_eq!(rest.capacity_requirement, Some(6));
        assert_eq!(
            rest.capacity_requirement_mode,
            CapacityRequirementMode::AtLeast
        );

        let mcp: LibrarySearchParams = serde_json::from_str(
            r#"{"capacity_requirement":5,"capacity_requirement_mode":"at_most"}"#,
        )
        .unwrap();
        assert_eq!(mcp.capacity_requirement, Some(5));
        assert_eq!(
            mcp.capacity_requirement_mode,
            CapacityRequirementMode::AtMost
        );
    }

    #[test]
    fn library_sect_requirements_support_all_any_not_and_no_requirement() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        conn.execute_batch(
            "INSERT INTO card_requirements VALUES
               (4, 'sabbat', 'sect'),
               (4, 'titled', 'other'),
               (5, 'camarilla', 'sect'),
               (5, 'prince', 'title'),
               (5, 'titled_specific', 'other');",
        )
        .unwrap();

        let all = LibrarySearchParams {
            sect_requirements: vec!["camarilla".into()],
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &all).unwrap()[0].name,
            "Arcane Library"
        );

        let any = LibrarySearchParams {
            sect_requirements: vec!["camarilla".into(), "sabbat".into()],
            sect_requirement_logic: RequirementLogic::Any,
            ..Default::default()
        };
        assert_eq!(search_library(&conn, &any).unwrap().len(), 2);

        let not = LibrarySearchParams {
            sect_requirements: vec!["sabbat".into()],
            sect_requirement_logic: RequirementLogic::None,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &not)
                .unwrap()
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Arcane Library", "Villein"]
        );

        let no_requirement = LibrarySearchParams {
            include_no_sect_requirement: true,
            sect_requirement_logic: RequirementLogic::Any,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &no_requirement)
                .unwrap()
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Villein"]
        );
    }

    #[test]
    fn library_title_requirements_support_exact_and_specific_titled() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        conn.execute_batch(
            "INSERT INTO card_requirements VALUES
               (4, 'sabbat', 'sect'),
               (4, 'titled', 'other'),
               (5, 'camarilla', 'sect'),
               (5, 'prince', 'title'),
               (5, 'titled_specific', 'other');",
        )
        .unwrap();

        for requirement in ["prince", "titled_specific"] {
            let params = LibrarySearchParams {
                title_requirements: vec![requirement.into()],
                ..Default::default()
            };
            assert_eq!(
                search_library(&conn, &params).unwrap()[0].name,
                "Arcane Library"
            );
        }
        let generic = LibrarySearchParams {
            title_requirements: vec!["titled".into()],
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &generic).unwrap()[0].name,
            "Absolute Tyranny"
        );
    }

    #[test]
    fn library_requirement_filters_deserialize_for_rest_and_mcp() {
        let rest: LibrarySearchParams = serde_urlencoded::from_str(
            "sect_requirements=camarilla,sabbat&sect_requirement_logic=any&include_no_sect_requirement=true&title_requirements=prince,titled_specific&title_requirement_logic=none",
        )
        .unwrap();
        assert_eq!(rest.sect_requirements, vec!["camarilla", "sabbat"]);
        assert_eq!(rest.sect_requirement_logic, RequirementLogic::Any);
        assert!(rest.include_no_sect_requirement);
        assert_eq!(rest.title_requirements, vec!["prince", "titled_specific"]);
        assert_eq!(rest.title_requirement_logic, RequirementLogic::None);

        let mcp: LibrarySearchParams = serde_json::from_str(
            r#"{"sect_requirements":["anarch"],"title_requirements":["baron"]}"#,
        )
        .unwrap();
        assert_eq!(mcp.sect_requirements, vec!["anarch"]);
        assert_eq!(mcp.title_requirements, vec!["baron"]);
    }

    #[test]
    fn library_cost_filters_cast_text_and_skip_null_costs() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        // blood_cost_max: only cards WITH a blood cost <= max match; NULL
        // blood cost (Villein, Arcane Library, Deflection) never matches.
        let params = LibrarySearchParams {
            blood_cost_max: Some(1),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Absolute Tyranny", "Theft of Vitae"]
        );
        // pool_cost_max works the same way over pool_cost.
        let params = LibrarySearchParams {
            pool_cost_max: Some(2),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(
            results.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Arcane Library", "Villein"]
        );
        // A max below every stored cost matches nothing.
        let params = LibrarySearchParams {
            pool_cost_max: Some(1),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_variable_x_cost_never_matches_a_max_filter() {
        // CAST('X' AS INTEGER) is 0 in SQLite, so without an explicit guard
        // Hidden Strength (blood cost X) would match every blood_cost_max —
        // including 0. vdb.im treats X as a distinct value, not zero.
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);
        for max in [0, 1, 9] {
            let params = LibrarySearchParams {
                blood_cost_max: Some(max),
                ..Default::default()
            };
            let results = search_library(&conn, &params).unwrap();
            assert!(
                results.iter().all(|c| c.name != "Hidden Strength"),
                "X-cost card leaked through blood_cost_max={max}"
            );
        }
        // …but it still appears when no cost filter is set.
        let results = search_library(&conn, &LibrarySearchParams::default()).unwrap();
        assert!(results.iter().any(|c| c.name == "Hidden Strength"));
    }

    #[test]
    fn library_cost_filter_supports_all_comparison_modes() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        seed_library_filter_extras(&conn);

        let exact = LibrarySearchParams {
            blood_cost: Some(1),
            blood_cost_mode: CostMode::Exact,
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &exact)
                .unwrap()
                .iter()
                .map(|card| card.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Absolute Tyranny", "Theft of Vitae"]
        );

        let at_least = LibrarySearchParams {
            blood_cost: Some(2),
            blood_cost_mode: CostMode::AtLeast,
            ..Default::default()
        };
        let results = search_library(&conn, &at_least).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Expensive Action");

        let at_most = LibrarySearchParams {
            blood_cost: Some(1),
            blood_cost_mode: CostMode::AtMost,
            ..Default::default()
        };
        assert_eq!(search_library(&conn, &at_most).unwrap().len(), 2);
    }

    #[test]
    fn library_cost_modes_deserialize_for_rest_and_mcp() {
        let rest: LibrarySearchParams =
            serde_urlencoded::from_str("blood_cost=2&blood_cost_mode=at_least").unwrap();
        assert_eq!(rest.blood_cost, Some(2));
        assert_eq!(rest.blood_cost_mode, CostMode::AtLeast);

        let mcp: LibrarySearchParams =
            serde_json::from_str(r#"{"pool_cost":1,"pool_cost_mode":"exact"}"#).unwrap();
        assert_eq!(mcp.pool_cost, Some(1));
        assert_eq!(mcp.pool_cost_mode, CostMode::Exact);
    }

    #[test]
    fn library_disciplines_csv_deserializes_from_query_string() {
        let params: LibrarySearchParams =
            serde_urlencoded::from_str("disciplines=POT,%20pre&blood_cost_max=1").unwrap();
        assert_eq!(params.disciplines, vec!["pot", "pre"]);
        assert_eq!(params.blood_cost_max, Some(1));
        let params: LibrarySearchParams =
            serde_json::from_str(r#"{"disciplines":["dom"],"disciplines_superior":true}"#).unwrap();
        assert_eq!(params.disciplines, vec!["dom"]);
        assert!(params.disciplines_superior);
    }

    #[test]
    fn library_set_filter_matches_exact_set_name() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Villein (card 3) has a printing in Fifth Edition; other library
        // cards (4, 5) have none.
        let params = LibrarySearchParams {
            set: Some("Fifth Edition".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Villein");
        let params = LibrarySearchParams {
            set: Some("Anarch Revolt".into()),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_precon_filter_substring_matches_and_skips_null() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Villein's printing has a NULL precon, so it never matches.
        let params = LibrarySearchParams {
            precon: Some("Anarch".into()),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn library_exact_precon_filter_uses_the_same_print_history() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        conn.execute_batch(
            "INSERT INTO sets VALUES (3,'New Blood','2022-04-17');
             INSERT INTO printings VALUES (3,3,'Ventrue','C',0);",
        )
        .unwrap();
        let params = LibrarySearchParams {
            precons: vec![PreconSelection {
                set: "New Blood".into(),
                precon: "Ventrue".into(),
            }],
            precon_print: SetPrintMode::Reprint,
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Villein");
    }

    #[test]
    fn library_artist_filter_substring_matches() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Villein (card 3) is credited to Mike Chaney.
        let params = LibrarySearchParams {
            artist: Some("Chaney".into()),
            ..Default::default()
        };
        let results = search_library(&conn, &params).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Villein");
        let params = LibrarySearchParams {
            artist: Some("Nobody".into()),
            ..Default::default()
        };
        assert!(search_library(&conn, &params).unwrap().is_empty());
    }

    #[test]
    fn crypt_trait_filters_require_every_selected_trait() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let one = CryptSearchParams {
            traits: vec!["1 bleed".into()],
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &one).unwrap()[0].name, "Aaradhya");

        let all = CryptSearchParams {
            traits: vec!["1 bleed".into(), "unlock".into()],
            ..Default::default()
        };
        assert_eq!(search_crypt(&conn, &all).unwrap()[0].name, "Aaradhya");

        let impossible = CryptSearchParams {
            traits: vec!["1 bleed".into(), "maneuver".into()],
            ..Default::default()
        };
        assert!(search_crypt(&conn, &impossible).unwrap().is_empty());
    }

    #[test]
    fn library_trait_filters_and_rest_mcp_shapes_match() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        let multi = LibrarySearchParams {
            traits: vec!["multi-type".into(), "multi-discipline".into()],
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &multi).unwrap()[0].name,
            "Absolute Tyranny"
        );

        let no_requirements = LibrarySearchParams {
            traits: vec!["no-requirements".into()],
            ..Default::default()
        };
        assert_eq!(
            search_library(&conn, &no_requirements).unwrap()[0].name,
            "Villein"
        );

        let rest: CryptSearchParams =
            serde_urlencoded::from_str("traits=1%20bleed%2Cunlock").unwrap();
        assert_eq!(rest.traits, vec!["1 bleed", "unlock"]);
        let mcp: LibrarySearchParams =
            serde_json::from_str(r#"{"traits":["Burn","no-requirements"]}"#).unwrap();
        assert_eq!(mcp.traits, vec!["burn", "no-requirements"]);
    }

    #[test]
    fn list_precons_groups_by_set_and_precon_and_counts_distinct_cards() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // seed() has one precon printing: (Anarch Revolt, "Anarch Precon", card 2).
        // Add a second card to the same precon, and one in a different set.
        conn.execute_batch(
            "INSERT INTO cards VALUES
               (6,'crypt','Baron','baron','','Brujah',6,6,NULL,NULL,NULL,NULL,'Anarch',0,NULL,NULL);
             INSERT INTO sets VALUES (3,'Camarilla Edition','2003-08-18');
             INSERT INTO printings VALUES
               (6,2,'Anarch Precon','U',1),
               (5,3,'Tremere','C',1);",
        )
        .unwrap();

        let precons = list_precons(&conn).unwrap();
        assert_eq!(
            precons,
            vec![
                PreconSummary {
                    set: "Anarch Revolt".into(),
                    precon: "Anarch Precon".into(),
                    card_count: 2,
                },
                PreconSummary {
                    set: "Camarilla Edition".into(),
                    precon: "Tremere".into(),
                    card_count: 1,
                },
            ]
        );
    }

    #[test]
    fn list_precons_ignores_printings_with_no_precon() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        // Only card 2's printing has a precon set; cards 1 and 3 don't.
        let precons = list_precons(&conn).unwrap();
        assert_eq!(precons.len(), 1);
        assert_eq!(precons[0].precon, "Anarch Precon");
    }

    #[test]
    fn precon_card_counts_reports_real_per_card_copies_and_defaults_null_to_one() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sets(id INT, name TEXT, release_date TEXT);
             CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT,
               first_print INT, precon_copies INT);
             INSERT INTO sets VALUES (1,'Fifth Edition','2020-11-30'),(2,'New Blood','2022-04-17');
             INSERT INTO printings VALUES
               (1,1,'Ventrue','U',1,2),
               (2,1,'Ventrue','C',1,NULL),
               (3,1,'Tremere','C',1,1),
               (1,2,'Ventrue','U',1,1);",
        )
        .unwrap();

        let counts = precon_card_counts(
            &conn,
            &PreconCardCountsParams {
                set: "Fifth Edition".into(),
                precon: "Ventrue".into(),
            },
        )
        .unwrap();
        assert_eq!(
            counts,
            vec![
                PreconCardCount {
                    card_id: 1,
                    copies: 2
                }, // explicit precon_copies
                PreconCardCount {
                    card_id: 2,
                    copies: 1
                }, // NULL -> defaults to 1
            ]
        );

        // A different set's "Ventrue" precon is a different printing row entirely.
        let other_set = precon_card_counts(
            &conn,
            &PreconCardCountsParams {
                set: "New Blood".into(),
                precon: "Ventrue".into(),
            },
        )
        .unwrap();
        assert_eq!(
            other_set,
            vec![PreconCardCount {
                card_id: 1,
                copies: 1
            }]
        );

        let unknown = precon_card_counts(
            &conn,
            &PreconCardCountsParams {
                set: "Fifth Edition".into(),
                precon: "Nosferatu".into(),
            },
        )
        .unwrap();
        assert!(unknown.is_empty());
    }

    #[test]
    fn semantic_filter_paths_are_not_truncated_to_the_ui_limit() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        for index in 0..205 {
            conn.execute(
                "INSERT INTO cards VALUES
                 (?1, 'crypt', ?2, ?2, '', 'Ventrue', 5, 6, NULL, NULL, NULL, NULL, 'Camarilla', 0, NULL, NULL)",
                rusqlite::params![10_000 + index, format!("Crypt {index:03}")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO cards VALUES
                 (?1, 'library', ?2, ?2, '', '', NULL, NULL, NULL, '[\"Action\"]', NULL, NULL, NULL, NULL, NULL, NULL)",
                rusqlite::params![20_000 + index, format!("Library {index:03}")],
            )
            .unwrap();
        }

        assert_eq!(
            search_crypt(&conn, &CryptSearchParams::default())
                .unwrap()
                .len(),
            200
        );
        let crypt_candidates = filter_crypt(&conn, &CryptSearchParams::default()).unwrap();
        assert_eq!(crypt_candidates.len(), 207);
        assert_eq!(crypt_candidates.first().unwrap().name, "Aaradhya");
        assert_eq!(crypt_candidates.last().unwrap().name, "Crypt 204");
        assert_eq!(
            search_library(&conn, &LibrarySearchParams::default())
                .unwrap()
                .len(),
            200
        );
        let library_candidates = filter_library(&conn, &LibrarySearchParams::default()).unwrap();
        assert_eq!(library_candidates.len(), 208);
        assert_eq!(library_candidates.first().unwrap().name, "Absolute Tyranny");
        assert_eq!(library_candidates.last().unwrap().name, "Villein");
    }
}
