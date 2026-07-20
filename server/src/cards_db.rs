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

#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
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
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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
    /// Static SQL only: no request value is ever interpolated into ORDER BY.
    fn order_by(self) -> &'static str {
        match self {
            Self::CapacityDesc => {
                " ORDER BY c.capacity DESC, c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            }
            Self::CapacityAsc => {
                " ORDER BY c.capacity ASC, c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            }
            Self::Clan => {
                " ORDER BY c.clan COLLATE NOCASE ASC, c.capacity DESC, \
                 c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            }
            Self::Group => {
                " ORDER BY c.grp ASC, c.capacity DESC, c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            }
            Self::Name => " ORDER BY c.name_ascii COLLATE NOCASE ASC, c.id ASC",
            Self::Sect => {
                " ORDER BY c.sect COLLATE NOCASE ASC, c.capacity DESC, \
                 c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            }
        }
    }
}

/// Set logic for library discipline requirements, matching VDB's selector.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, JsonSchema)]
pub struct DisciplineRequirement {
    /// Lowercase discipline code, e.g. `dom` or `for`.
    pub code: String,
    /// Require superior level when true; either level matches when false.
    #[serde(default)]
    pub superior: bool,
}

/// Numeric comparison used by library blood/pool cost filters.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CapacityRequirementMode {
    /// Requirement allows a vampire at or below the supplied capacity.
    #[default]
    AtMost,
    /// Requirement needs a vampire at or above the supplied capacity.
    AtLeast,
}

impl CostMode {
    fn as_sql_value(self) -> &'static str {
        match self {
            Self::AtMost => "at_most",
            Self::Exact => "exact",
            Self::AtLeast => "at_least",
        }
    }
}

/// Release-date relation used by set filters, matching vdb's age qualifiers.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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

impl SetAgeMode {
    fn as_sql_value(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::OrNewer => "or_newer",
            Self::OrOlder => "or_older",
            Self::NotNewer => "not_newer",
            Self::NotOlder => "not_older",
        }
    }
}

/// Printing-history qualifier used alongside a selected set.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, JsonSchema)]
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

impl SetPrintMode {
    fn as_sql_value(self) -> &'static str {
        match self {
            Self::Any => "any",
            Self::Only => "only",
            Self::First => "first",
            Self::Reprint => "reprint",
        }
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

#[derive(Debug, Clone, Serialize)]
pub struct Discipline {
    pub code: String,
    pub superior: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CryptCard {
    pub id: i64,
    pub name: String,
    pub clan: String,
    pub capacity: i64,
    pub group: i64,
    pub title: Option<String>,
    pub sect: Option<String>,
    pub votes: i64,
    pub image_url: Option<String>,
    pub disciplines: Vec<Discipline>,
}

#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
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
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
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
    /// Static SQL only: no request value is ever interpolated into ORDER BY.
    fn order_by(self) -> &'static str {
        match self {
            Self::Requirement => concat!(
                " ORDER BY ",
                "CASE WHEN NULLIF(TRIM(c.clan), '') IS NULL THEN 1 ELSE 0 END ASC, ",
                "c.clan COLLATE NOCASE ASC, disc_sort IS NULL ASC, ",
                "disc_sort COLLATE NOCASE ASC, type_sort COLLATE NOCASE ASC, ",
                "c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            ),
            Self::CostDesc => concat!(
                " ORDER BY CASE WHEN ",
                "c.blood_cost IS NOT NULL AND c.blood_cost != '' ",
                "AND c.blood_cost NOT GLOB '*[^0-9]*' THEN 0 ELSE 1 END ASC, ",
                "CASE WHEN c.blood_cost IS NOT NULL AND c.blood_cost != '' ",
                "AND c.blood_cost NOT GLOB '*[^0-9]*' ",
                "THEN CAST(c.blood_cost AS INTEGER) END DESC, ",
                "CASE WHEN c.pool_cost IS NOT NULL AND c.pool_cost != '' ",
                "AND c.pool_cost NOT GLOB '*[^0-9]*' THEN 0 ELSE 1 END ASC, ",
                "CASE WHEN c.pool_cost IS NOT NULL AND c.pool_cost != '' ",
                "AND c.pool_cost NOT GLOB '*[^0-9]*' ",
                "THEN CAST(c.pool_cost AS INTEGER) END DESC, ",
                "type_sort COLLATE NOCASE ASC, ",
                "CASE WHEN NULLIF(TRIM(c.clan), '') IS NULL THEN 1 ELSE 0 END ASC, ",
                "c.clan COLLATE NOCASE ASC, disc_sort IS NULL ASC, ",
                "disc_sort COLLATE NOCASE ASC, c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            ),
            Self::CostAsc => concat!(
                " ORDER BY CASE WHEN ",
                "c.blood_cost IS NOT NULL AND c.blood_cost != '' ",
                "AND c.blood_cost NOT GLOB '*[^0-9]*' THEN 0 ELSE 1 END ASC, ",
                "CASE WHEN c.blood_cost IS NOT NULL AND c.blood_cost != '' ",
                "AND c.blood_cost NOT GLOB '*[^0-9]*' ",
                "THEN CAST(c.blood_cost AS INTEGER) END ASC, ",
                "CASE WHEN c.pool_cost IS NOT NULL AND c.pool_cost != '' ",
                "AND c.pool_cost NOT GLOB '*[^0-9]*' THEN 0 ELSE 1 END ASC, ",
                "CASE WHEN c.pool_cost IS NOT NULL AND c.pool_cost != '' ",
                "AND c.pool_cost NOT GLOB '*[^0-9]*' ",
                "THEN CAST(c.pool_cost AS INTEGER) END ASC, ",
                "type_sort COLLATE NOCASE ASC, ",
                "CASE WHEN NULLIF(TRIM(c.clan), '') IS NULL THEN 1 ELSE 0 END ASC, ",
                "c.clan COLLATE NOCASE ASC, disc_sort IS NULL ASC, ",
                "disc_sort COLLATE NOCASE ASC, c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            ),
            Self::Name => " ORDER BY c.name_ascii COLLATE NOCASE ASC, c.id ASC",
            Self::Type => concat!(
                " ORDER BY type_sort COLLATE NOCASE ASC, ",
                "CASE WHEN NULLIF(TRIM(c.clan), '') IS NULL THEN 1 ELSE 0 END ASC, ",
                "c.clan COLLATE NOCASE ASC, disc_sort IS NULL ASC, ",
                "disc_sort COLLATE NOCASE ASC, c.name_ascii COLLATE NOCASE ASC, c.id ASC"
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryCard {
    pub id: i64,
    pub name: String,
    pub types: Vec<String>,
    pub clan: Option<String>,
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

fn effective_discipline_requirements(
    requirements: &[DisciplineRequirement],
    legacy_codes: &[String],
    legacy_superior: bool,
) -> Vec<DisciplineRequirement> {
    if !requirements.is_empty() {
        return requirements.to_vec();
    }
    legacy_codes
        .iter()
        .map(|code| DisciplineRequirement {
            code: code.to_lowercase(),
            superior: legacy_superior,
        })
        .collect()
}

/// Adds one ANDed requirement group whose entries are OR alternatives. A
/// one-entry group is therefore a normal required discipline. Values are
/// always bound; only placeholder indexes are written into the SQL string.
fn push_discipline_group(
    sql: &mut String,
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    requirements: &[DisciplineRequirement],
) {
    if requirements.is_empty() {
        return;
    }
    sql.push_str(" AND (");
    for (index, requirement) in requirements.iter().enumerate() {
        if index > 0 {
            sql.push_str(" OR ");
        }
        sql.push_str(&discipline_exists_expression(bound, requirement));
    }
    sql.push(')');
}

fn discipline_exists_expression(
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    requirement: &DisciplineRequirement,
) -> String {
    let expression = format!(
        "EXISTS (SELECT 1 FROM card_disciplines cdx
            WHERE cdx.card_id = c.id AND cdx.discipline = ?{n} AND cdx.superior >= ?{m})",
        n = bound.len() + 1,
        m = bound.len() + 2,
    );
    bound.push(Box::new(requirement.code.to_lowercase()));
    bound.push(Box::new(requirement.superior as i64));
    expression
}

fn push_library_discipline_filter(
    sql: &mut String,
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    params: &LibrarySearchParams,
) {
    let requirements = params
        .disciplines
        .iter()
        .map(|code| DisciplineRequirement {
            code: code.to_lowercase(),
            superior: params.disciplines_superior,
        })
        .collect::<Vec<_>>();
    let no_requirement = "NOT EXISTS (SELECT 1 FROM card_disciplines cdn WHERE cdn.card_id = c.id)";

    match params.discipline_logic {
        DisciplineLogic::All => {
            for requirement in &requirements {
                push_discipline_group(sql, bound, std::slice::from_ref(requirement));
            }
            if params.include_no_discipline {
                if requirements.is_empty() {
                    sql.push_str(&format!(" AND {no_requirement}"));
                } else {
                    sql.push_str(" AND 0");
                }
            }
        }
        DisciplineLogic::Any | DisciplineLogic::None => {
            let mut alternatives = requirements
                .iter()
                .map(|requirement| discipline_exists_expression(bound, requirement))
                .collect::<Vec<_>>();
            if params.include_no_discipline {
                alternatives.push(no_requirement.into());
            }
            if !alternatives.is_empty() {
                if params.discipline_logic == DisciplineLogic::None {
                    sql.push_str(" AND NOT (");
                } else {
                    sql.push_str(" AND (");
                }
                sql.push_str(&alternatives.join(" OR "));
                sql.push(')');
            }
        }
        DisciplineLogic::Only => {
            if params.include_no_discipline {
                if requirements.is_empty() {
                    sql.push_str(&format!(" AND {no_requirement}"));
                } else {
                    sql.push_str(" AND 0");
                }
                return;
            }
            if requirements.is_empty() {
                return;
            }
            for requirement in &requirements {
                push_discipline_group(sql, bound, std::slice::from_ref(requirement));
            }
            sql.push_str(&format!(
                " AND (SELECT COUNT(DISTINCT cdo.discipline) FROM card_disciplines cdo
                    WHERE cdo.card_id = c.id) = ?{}",
                bound.len() + 1
            ));
            bound.push(Box::new(requirements.len() as i64));
        }
    }
}

fn requirement_token_expression(
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    requirement: &str,
) -> String {
    let index = bound.len() + 1;
    bound.push(Box::new(requirement.to_lowercase()));
    format!(
        "EXISTS (SELECT 1 FROM card_requirements cre
            WHERE cre.card_id = c.id AND cre.requirement = ?{index})"
    )
}

fn requirement_family_absent_expression(
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    kind: &str,
) -> String {
    let index = bound.len() + 1;
    bound.push(Box::new(kind.to_owned()));
    format!(
        "NOT EXISTS (SELECT 1 FROM card_requirements crn
            WHERE crn.card_id = c.id AND crn.kind = ?{index})"
    )
}

fn push_library_requirement_filter(
    sql: &mut String,
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    requirements: &[String],
    logic: RequirementLogic,
    include_no_requirement: bool,
    family_kind: &str,
) {
    if logic == RequirementLogic::All {
        for requirement in requirements {
            let expression = requirement_token_expression(bound, requirement);
            sql.push_str(&format!(" AND {expression}"));
        }
        if include_no_requirement {
            if requirements.is_empty() {
                let expression = requirement_family_absent_expression(bound, family_kind);
                sql.push_str(&format!(" AND {expression}"));
            } else {
                sql.push_str(" AND 0");
            }
        }
        return;
    }

    let mut alternatives = requirements
        .iter()
        .map(|requirement| requirement_token_expression(bound, requirement))
        .collect::<Vec<_>>();
    if include_no_requirement {
        alternatives.push(requirement_family_absent_expression(bound, family_kind));
    }
    if alternatives.is_empty() {
        return;
    }
    if logic == RequirementLogic::None {
        sql.push_str(" AND NOT (");
    } else {
        sql.push_str(" AND (");
    }
    sql.push_str(&alternatives.join(" OR "));
    sql.push(')');
}

fn push_group_filter(
    sql: &mut String,
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    groups: &[i64],
) {
    if groups.is_empty() {
        return;
    }
    sql.push_str(" AND c.grp IN (");
    for (index, group) in groups.iter().enumerate() {
        if index > 0 {
            sql.push(',');
        }
        sql.push_str(&format!("?{}", bound.len() + 1));
        bound.push(Box::new(*group));
    }
    sql.push(')');
}

fn push_crypt_sect_filter(
    sql: &mut String,
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    sects: &[String],
    logic: RequirementLogic,
) {
    if sects.is_empty() {
        return;
    }

    if logic == RequirementLogic::All {
        for sect in sects {
            sql.push_str(&format!(
                " AND lower(coalesce(c.sect, '')) = lower(?{})",
                bound.len() + 1
            ));
            bound.push(Box::new(sect.clone()));
        }
        return;
    }

    sql.push_str(" AND ");
    if logic == RequirementLogic::None {
        sql.push_str("NOT ");
    }
    sql.push('(');
    for (index, sect) in sects.iter().enumerate() {
        if index > 0 {
            sql.push_str(" OR ");
        }
        sql.push_str(&format!(
            "lower(coalesce(c.sect, '')) = lower(?{})",
            bound.len() + 1
        ));
        bound.push(Box::new(sect.clone()));
    }
    sql.push(')');
}

fn push_trait_filters(
    sql: &mut String,
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    traits: &[String],
) {
    for trait_name in traits {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM card_traits ct
                WHERE ct.card_id = c.id AND ct.trait = ?{})",
            bound.len() + 1
        ));
        bound.push(Box::new(trait_name.clone()));
    }
}

fn push_exact_precon_filter(
    sql: &mut String,
    bound: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
    precons: &[PreconSelection],
    print_mode: SetPrintMode,
) {
    let selections: Vec<_> = precons
        .iter()
        .filter_map(|selection| {
            let set = selection.set.trim();
            let precon = selection.precon.trim();
            (!set.is_empty() && !precon.is_empty()).then_some((set, precon))
        })
        .collect();
    if selections.is_empty() {
        return;
    }

    bound.push(Box::new(print_mode.as_sql_value()));
    let print_index = bound.len();
    sql.push_str(" AND (");
    for (index, (set, precon)) in selections.into_iter().enumerate() {
        if index > 0 {
            sql.push_str(" OR ");
        }
        bound.push(Box::new(set.to_owned()));
        let set_index = bound.len();
        bound.push(Box::new(precon.to_owned()));
        let precon_index = bound.len();
        sql.push_str(&format!(
            "EXISTS (SELECT 1 FROM printings pp
              JOIN sets sp ON sp.id = pp.set_id
              WHERE pp.card_id = c.id
                AND sp.name = ?{set_index}
                AND pp.precon = ?{precon_index}
                AND (?{print_index} = 'any'
                  OR (?{print_index} = 'only'
                    AND 1 = (SELECT COUNT(DISTINCT po.set_id) FROM printings po
                             WHERE po.card_id = c.id)
                    AND 1 = (SELECT COUNT(DISTINCT COALESCE(po.precon, ''))
                             FROM printings po
                             WHERE po.card_id = c.id AND po.set_id = pp.set_id))
                  OR (?{print_index} = 'first'
                    AND sp.release_date = (SELECT MIN(sf.release_date)
                      FROM printings pf JOIN sets sf ON sf.id = pf.set_id
                      WHERE pf.card_id = c.id))
                  OR (?{print_index} = 'reprint'
                    AND sp.release_date > (SELECT MIN(sr.release_date)
                      FROM printings pr JOIN sets sr ON sr.id = pr.set_id
                      WHERE pr.card_id = c.id))))"
        ));
    }
    sql.push(')');
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

fn search_crypt_inner(
    conn: &Connection,
    params: &CryptSearchParams,
    limited: bool,
) -> rusqlite::Result<Vec<CryptCard>> {
    // The per-discipline EXISTS clauses are built dynamically (the count
    // varies) but every value is bound — no string interpolation of input.
    // set + precon are ANDed inside ONE EXISTS on the same printing row, not
    // two separate EXISTS clauses — a card can have printing A in set X with
    // no precon and printing B in set Y with a precon, and two independent
    // clauses would wrongly match set=X + precon=<B's precon> even though no
    // single printing has both (found live via the precon browser, which
    // was the first caller to combine the two).
    let single_group = if params.groups.is_empty() {
        params.group
    } else {
        None
    };
    let legacy_precon = if params.precons.is_empty() {
        params.precon.clone()
    } else {
        None
    };
    let mut sql = String::from(
        "SELECT c.id, c.name, c.clan, c.capacity, c.grp, c.title, c.sect, c.votes,
                c.image_url, GROUP_CONCAT(cd.discipline || ':' || cd.superior) AS disc
         FROM cards c
         LEFT JOIN card_disciplines cd ON cd.card_id = c.id
         WHERE c.kind = 'crypt'
           AND (?1 = ''
                OR (?2 AND (CASE WHEN ?12 THEN regexp_match(?1, c.name_ascii)
                                 ELSE c.name_ascii LIKE '%' || ?1 || '%' END))
                OR (?3 AND (CASE WHEN ?12 THEN regexp_match(?1, c.card_text)
                                 ELSE c.card_text LIKE '%' || ?1 || '%' END)))
           AND (?4 IS NULL OR c.clan LIKE '%' || ?4 || '%')
           AND (?5 IS NULL OR c.grp = ?5)
           AND (?6 IS NULL OR c.capacity >= ?6)
           AND (?7 IS NULL OR c.capacity <= ?7)
           AND (?8 IS NULL
                OR (lower(?8) = 'non-titled' AND c.title IS NULL)
                OR lower(c.title) = lower(?8))
           AND ((?9 IS NULL AND ?10 IS NULL) OR EXISTS (
                SELECT 1 FROM printings p JOIN sets s ON s.id = p.set_id
                WHERE p.card_id = c.id
                  AND (?10 IS NULL OR p.precon LIKE '%' || ?10 || '%')
                  AND (?9 IS NULL
                    OR (?13 = 'exact' AND s.name = ?9)
                    OR (?13 = 'or_newer' AND s.release_date >=
                        (SELECT release_date FROM sets WHERE name = ?9))
                    OR (?13 = 'or_older' AND s.release_date <=
                        (SELECT release_date FROM sets WHERE name = ?9))
                    OR (?13 = 'not_newer' AND NOT EXISTS (
                        SELECT 1 FROM printings pn JOIN sets sn ON sn.id = pn.set_id
                        WHERE pn.card_id = c.id AND sn.release_date >
                            (SELECT release_date FROM sets WHERE name = ?9)))
                    OR (?13 = 'not_older' AND NOT EXISTS (
                        SELECT 1 FROM printings po JOIN sets so ON so.id = po.set_id
                        WHERE po.card_id = c.id AND so.release_date <
                            (SELECT release_date FROM sets WHERE name = ?9))))
                  AND (?9 IS NULL OR ?14 = 'any'
                    OR (?14 = 'only' AND 1 = (
                        SELECT COUNT(DISTINCT px.set_id) FROM printings px
                        WHERE px.card_id = c.id))
                    OR (?14 = 'first' AND
                        (SELECT release_date FROM sets WHERE name = ?9) = (
                            SELECT MIN(sf.release_date) FROM printings pf
                            JOIN sets sf ON sf.id = pf.set_id WHERE pf.card_id = c.id))
                    OR (?14 = 'reprint' AND
                        (SELECT release_date FROM sets WHERE name = ?9) > (
                            SELECT MIN(sr.release_date) FROM printings pr
                            JOIN sets sr ON sr.id = pr.set_id WHERE pr.card_id = c.id)))))
           AND (?11 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
                WHERE ca.card_id = c.id AND a.name LIKE '%' || ?11 || '%'))
           AND (?15 IS NULL
                OR (?15 = 0 AND c.votes = 0)
                OR (?15 > 0 AND c.votes >= ?15))",
    );
    let mut bound: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(params.text.trim().to_owned()),
        Box::new(params.text_mode != TextMode::Text),
        Box::new(params.text_mode != TextMode::Name),
        Box::new(params.clan.clone()),
        Box::new(single_group),
        Box::new(params.capacity_min),
        Box::new(params.capacity_max),
        Box::new(params.title.clone()),
        Box::new(params.set.clone()),
        Box::new(legacy_precon),
        Box::new(params.artist.clone()),
        Box::new(params.text_regex as i64),
        Box::new(params.set_age.as_sql_value()),
        Box::new(params.set_print.as_sql_value()),
        Box::new(params.votes),
    ];
    push_group_filter(&mut sql, &mut bound, &params.groups);
    push_crypt_sect_filter(&mut sql, &mut bound, &params.sects, params.sect_logic);
    push_trait_filters(&mut sql, &mut bound, &params.traits);
    push_exact_precon_filter(&mut sql, &mut bound, &params.precons, params.precon_print);
    for requirement in effective_discipline_requirements(
        &params.discipline_requirements,
        &params.disciplines,
        params.disciplines_superior,
    ) {
        push_discipline_group(&mut sql, &mut bound, std::slice::from_ref(&requirement));
    }
    for group in &params.discipline_or {
        push_discipline_group(&mut sql, &mut bound, group);
    }
    sql.push_str(" GROUP BY c.id");
    sql.push_str(params.sort.order_by());
    if limited {
        sql.push_str(" LIMIT 200");
    }

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(bound.iter().map(|b| b.as_ref())),
        |row| {
            let disc: Option<String> = row.get(9)?;
            Ok(CryptCard {
                id: row.get(0)?,
                name: row.get(1)?,
                clan: row.get(2)?,
                capacity: row.get(3)?,
                group: row.get(4)?,
                title: row.get(5)?,
                sect: row.get(6)?,
                votes: row.get(7)?,
                image_url: row.get(8)?,
                disciplines: parse_disciplines(disc),
            })
        },
    )?;

    rows.collect()
}

pub fn search_library(
    conn: &Connection,
    params: &LibrarySearchParams,
) -> rusqlite::Result<Vec<LibraryCard>> {
    search_library_inner(conn, params, true)
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
    let type_pattern = params.card_type.as_ref().map(|t| format!("%\"{t}\"%"));
    let legacy_precon = if params.precons.is_empty() {
        params.precon.clone()
    } else {
        None
    };
    let blood_cost = params.blood_cost.or(params.blood_cost_max);
    let blood_cost_mode = if params.blood_cost.is_some() {
        params.blood_cost_mode
    } else {
        CostMode::AtMost
    };
    let pool_cost = params.pool_cost.or(params.pool_cost_max);
    let pool_cost_mode = if params.pool_cost.is_some() {
        params.pool_cost_mode
    } else {
        CostMode::AtMost
    };
    // Costs are stored as TEXT (e.g. "2"); CAST for numeric comparison. A
    // NULL cost never matches a cost filter, and neither does the variable
    // cost "X" (CAST('X') is 0, which would otherwise match every max —
    // vdb.im treats X as a distinct value, not zero; e.g. Hidden Strength,
    // Monkey Wrench). Per-discipline EXISTS clauses are built dynamically
    // like search_crypt — every value is bound, never interpolated.
    let mut sql = String::from(
        "SELECT c.id, c.name, c.types, c.clan, c.blood_cost, c.pool_cost,
                c.image_url, GROUP_CONCAT(cd.discipline) AS disc,
                (SELECT GROUP_CONCAT(ordered.discipline, ',') FROM (
                    SELECT d2.discipline FROM card_disciplines d2
                    WHERE d2.card_id = c.id ORDER BY d2.discipline
                ) ordered) AS disc_sort,
                (SELECT GROUP_CONCAT(type_entry.value, '/')
                 FROM json_each(c.types) type_entry) AS type_sort
         FROM cards c
         LEFT JOIN card_disciplines cd ON cd.card_id = c.id
         WHERE c.kind = 'library'
           AND (?1 = ''
                OR (?2 AND (CASE WHEN ?13 THEN regexp_match(?1, c.name_ascii)
                                 ELSE c.name_ascii LIKE '%' || ?1 || '%' END))
                OR (?3 AND (CASE WHEN ?13 THEN regexp_match(?1, c.card_text)
                                 ELSE c.card_text LIKE '%' || ?1 || '%' END)))
           AND (?4 IS NULL OR c.types LIKE ?4)
           AND (?5 IS NULL OR c.clan LIKE '%' || ?5 || '%')
           AND (?6 IS NULL OR (c.blood_cost IS NOT NULL AND c.blood_cost != 'X' AND
                ((?7 = 'at_most' AND CAST(c.blood_cost AS INTEGER) <= ?6) OR
                 (?7 = 'exact' AND CAST(c.blood_cost AS INTEGER) = ?6) OR
                 (?7 = 'at_least' AND CAST(c.blood_cost AS INTEGER) >= ?6))))
           AND (?8 IS NULL OR (c.pool_cost IS NOT NULL AND c.pool_cost != 'X' AND
                ((?9 = 'at_most' AND CAST(c.pool_cost AS INTEGER) <= ?8) OR
                 (?9 = 'exact' AND CAST(c.pool_cost AS INTEGER) = ?8) OR
                 (?9 = 'at_least' AND CAST(c.pool_cost AS INTEGER) >= ?8))))
           AND ((?10 IS NULL AND ?11 IS NULL) OR EXISTS (
                SELECT 1 FROM printings p JOIN sets s ON s.id = p.set_id
                WHERE p.card_id = c.id
                  AND (?11 IS NULL OR p.precon LIKE '%' || ?11 || '%')
                  AND (?10 IS NULL
                    OR (?14 = 'exact' AND s.name = ?10)
                    OR (?14 = 'or_newer' AND s.release_date >=
                        (SELECT release_date FROM sets WHERE name = ?10))
                    OR (?14 = 'or_older' AND s.release_date <=
                        (SELECT release_date FROM sets WHERE name = ?10))
                    OR (?14 = 'not_newer' AND NOT EXISTS (
                        SELECT 1 FROM printings pn JOIN sets sn ON sn.id = pn.set_id
                        WHERE pn.card_id = c.id AND sn.release_date >
                            (SELECT release_date FROM sets WHERE name = ?10)))
                    OR (?14 = 'not_older' AND NOT EXISTS (
                        SELECT 1 FROM printings po JOIN sets so ON so.id = po.set_id
                        WHERE po.card_id = c.id AND so.release_date <
                            (SELECT release_date FROM sets WHERE name = ?10))))
                  AND (?10 IS NULL OR ?15 = 'any'
                    OR (?15 = 'only' AND 1 = (
                        SELECT COUNT(DISTINCT px.set_id) FROM printings px
                        WHERE px.card_id = c.id))
                    OR (?15 = 'first' AND
                        (SELECT release_date FROM sets WHERE name = ?10) = (
                            SELECT MIN(sf.release_date) FROM printings pf
                            JOIN sets sf ON sf.id = pf.set_id WHERE pf.card_id = c.id))
                    OR (?15 = 'reprint' AND
                        (SELECT release_date FROM sets WHERE name = ?10) > (
                            SELECT MIN(sr.release_date) FROM printings pr
                            JOIN sets sr ON sr.id = pr.set_id WHERE pr.card_id = c.id)))))
           AND (?12 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
                WHERE ca.card_id = c.id AND a.name LIKE '%' || ?12 || '%'))",
    );
    let mut bound: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(params.text.trim().to_owned()),
        Box::new(params.text_mode != TextMode::Text),
        Box::new(params.text_mode != TextMode::Name),
        Box::new(type_pattern),
        Box::new(params.clan.clone()),
        Box::new(blood_cost),
        Box::new(blood_cost_mode.as_sql_value()),
        Box::new(pool_cost),
        Box::new(pool_cost_mode.as_sql_value()),
        Box::new(params.set.clone()),
        Box::new(legacy_precon),
        Box::new(params.artist.clone()),
        Box::new(params.text_regex as i64),
        Box::new(params.set_age.as_sql_value()),
        Box::new(params.set_print.as_sql_value()),
    ];
    push_library_discipline_filter(&mut sql, &mut bound, params);
    push_exact_precon_filter(&mut sql, &mut bound, &params.precons, params.precon_print);
    push_library_requirement_filter(
        &mut sql,
        &mut bound,
        &params.sect_requirements,
        params.sect_requirement_logic,
        params.include_no_sect_requirement,
        "sect",
    );
    push_library_requirement_filter(
        &mut sql,
        &mut bound,
        &params.title_requirements,
        params.title_requirement_logic,
        false,
        "title",
    );
    push_trait_filters(&mut sql, &mut bound, &params.traits);
    if let Some(capacity) = params.capacity_requirement {
        let (column, operator) = match params.capacity_requirement_mode {
            CapacityRequirementMode::AtMost => ("max_capacity", "<="),
            CapacityRequirementMode::AtLeast => ("min_capacity", ">="),
        };
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM card_capacity_requirements ccr
                WHERE ccr.card_id = c.id AND ccr.{column} IS NOT NULL
                  AND ccr.{column} {operator} ?{})",
            bound.len() + 1
        ));
        bound.push(Box::new(capacity));
    }
    sql.push_str(" GROUP BY c.id");
    sql.push_str(params.sort.order_by());
    if limited {
        sql.push_str(" LIMIT 200");
    }

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(bound.iter().map(|b| b.as_ref())),
        |row| {
            let types_json: String = row.get(2)?;
            let disc: Option<String> = row.get(7)?;
            let clan: Option<String> = row.get(3)?;
            Ok(LibraryCard {
                id: row.get(0)?,
                name: row.get(1)?,
                types: serde_json::from_str(&types_json).unwrap_or_default(),
                clan: clan.filter(|c| !c.is_empty()),
                blood_cost: row.get(4)?,
                pool_cost: row.get(5)?,
                image_url: row.get(6)?,
                disciplines: disc
                    .map(|d| d.split(',').map(str::to_string).collect())
                    .unwrap_or_default(),
            })
        },
    )?;

    rows.collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PreconSummary {
    pub set: String,
    pub precon: String,
    pub card_count: i64,
}

/// Lists every (set, precon) pair with at least one printing, plus the
/// number of distinct cards known to belong to it. Card *quantities* per
/// precon deck are not tracked — KRCG's export records which printings
/// existed, not each deck's exact copy counts (see docs/feature-parity.md's
/// precon-browser note, same NULL-honesty policy as sect/votes/banned).
/// To browse a precon's actual cards, call search_crypt/search_library with
/// this pair's `set` + `precon` (both exact for this purpose — the two
/// filters together are precise enough that reusing the search path avoids
/// a second copy of the same query logic).
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
               image_url TEXT);
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
               (1,'crypt','Aaradhya','aaradhya','tyrant text','Ventrue',10,6,'Cardinal',NULL,NULL,NULL,'Sabbat',3,'https://static.krcg.org/card/1.jpg'),
               (2,'crypt','Abaddon','abaddon','',  'Salubri',8,7,NULL,NULL,NULL,NULL,'Independent',0,NULL),
               (3,'library','Villein','villein','blood bound text','',NULL,NULL,NULL,'[\"Master\"]',NULL,'2',NULL,NULL,'https://static.krcg.org/card/3.jpg'),
               (4,'library','Absolute Tyranny','absolute tyranny','vote text','',NULL,NULL,NULL,'[\"Action Modifier\",\"Reaction\"]','1',NULL,NULL,NULL,NULL),
               (5,'library','Arcane Library','arcane library','','Tremere',NULL,NULL,NULL,'[\"Master\"]',NULL,'2',NULL,NULL,NULL);
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
               (6,'crypt','Mixed Printings','mixed printings','','Ventrue',5,6,NULL,NULL,NULL,NULL,'Anarch',0,NULL);
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
               (20,'library','Alpha Numeric Low','alpha numeric low','sort fixture','',NULL,NULL,NULL,'[\"Action\"]','1','3',NULL,NULL,NULL),
               (21,'library','Beta Numeric High','beta numeric high','sort fixture','',NULL,NULL,NULL,'[\"Action\"]','3','1',NULL,NULL,NULL),
               (22,'library','Clan Required','clan required','sort fixture','Ventrue',NULL,NULL,NULL,'[\"Master\"]',NULL,'1',NULL,NULL,NULL),
               (23,'library','Discipline Required','discipline required','sort fixture','',NULL,NULL,NULL,'[\"Combat\"]','X','2',NULL,NULL,NULL),
               (24,'library','No Requirement','no requirement','sort fixture','',NULL,NULL,NULL,'[\"Reaction\"]',NULL,NULL,NULL,NULL,NULL);
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
               (6,'library','Deflection','deflection','bounce text','',NULL,NULL,NULL,'[\"Reaction\"]',NULL,NULL,NULL,NULL,NULL),
               (7,'library','Theft of Vitae','theft of vitae','steal blood','',NULL,NULL,NULL,'[\"Combat\"]','1',NULL,NULL,NULL,NULL),
               (8,'library','Hidden Strength','hidden strength','variable cost','',NULL,NULL,NULL,'[\"Combat\"]','X',NULL,NULL,NULL,NULL),
               (9,'library','Expensive Action','expensive action','cost fixture','',NULL,NULL,NULL,'[\"Action\"]','3',NULL,NULL,NULL,NULL);
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
               (6,'crypt','Baron','baron','','Brujah',6,6,NULL,NULL,NULL,NULL,'Anarch',0,NULL);
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
    fn semantic_filter_paths_are_not_truncated_to_the_ui_limit() {
        let conn = Connection::open_in_memory().unwrap();
        seed(&conn);
        for index in 0..205 {
            conn.execute(
                "INSERT INTO cards VALUES
                 (?1, 'crypt', ?2, ?2, '', 'Ventrue', 5, 6, NULL, NULL, NULL, NULL, 'Camarilla', 0, NULL)",
                rusqlite::params![10_000 + index, format!("Crypt {index:03}")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO cards VALUES
                 (?1, 'library', ?2, ?2, '', '', NULL, NULL, NULL, '[\"Action\"]', NULL, NULL, NULL, NULL, NULL)",
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
