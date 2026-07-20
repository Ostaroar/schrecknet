//! Platform-neutral exact-search query planning.
//!
//! The native server and browser SQLite adapter execute these plans, but all
//! card-filter semantics and placeholder numbering live here. User-provided
//! values are always returned separately in `params`; they are never
//! interpolated into SQL.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SqlValue {
    Null,
    Integer(i64),
    Text(String),
}

impl From<Option<String>> for SqlValue {
    fn from(value: Option<String>) -> Self {
        value.map_or(Self::Null, Self::Text)
    }
}

impl From<Option<i64>> for SqlValue {
    fn from(value: Option<i64>) -> Self {
        value.map_or(Self::Null, Self::Integer)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueryPlan {
    pub sql: String,
    pub params: Vec<SqlValue>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextMode {
    #[default]
    Any,
    Name,
    Text,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RequirementLogic {
    #[default]
    All,
    Any,
    None,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SetAgeMode {
    #[default]
    Exact,
    OrNewer,
    OrOlder,
    NotNewer,
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SetPrintMode {
    #[default]
    Any,
    Only,
    First,
    Reprint,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DisciplineRequirement {
    pub code: String,
    #[serde(default)]
    pub superior: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreconSelection {
    pub set: String,
    pub precon: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CryptPlanInput {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub text_mode: TextMode,
    #[serde(default)]
    pub text_regex: bool,
    #[serde(default)]
    pub clan: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub sects: Vec<String>,
    #[serde(default)]
    pub sect_logic: RequirementLogic,
    #[serde(default)]
    pub votes: Option<i64>,
    #[serde(default)]
    pub traits: Vec<String>,
    #[serde(default)]
    pub group: Option<i64>,
    #[serde(default)]
    pub groups: Vec<i64>,
    #[serde(default)]
    pub capacity_min: Option<i64>,
    #[serde(default)]
    pub capacity_max: Option<i64>,
    #[serde(default)]
    pub disciplines: Vec<String>,
    #[serde(default)]
    pub disciplines_superior: bool,
    #[serde(default)]
    pub discipline_requirements: Vec<DisciplineRequirement>,
    #[serde(default)]
    pub discipline_or: Vec<Vec<DisciplineRequirement>>,
    #[serde(default)]
    pub set: Option<String>,
    #[serde(default)]
    pub set_age: SetAgeMode,
    #[serde(default)]
    pub set_print: SetPrintMode,
    #[serde(default)]
    pub precon: Option<String>,
    #[serde(default)]
    pub precons: Vec<PreconSelection>,
    #[serde(default)]
    pub precon_print: SetPrintMode,
    #[serde(default)]
    pub artist: Option<String>,
}

fn push_param(params: &mut Vec<SqlValue>, value: SqlValue) -> usize {
    params.push(value);
    params.len()
}

fn discipline_expression(
    params: &mut Vec<SqlValue>,
    requirement: &DisciplineRequirement,
) -> String {
    let code = push_param(
        params,
        SqlValue::Text(requirement.code.trim().to_lowercase()),
    );
    let superior = push_param(params, SqlValue::Integer(i64::from(requirement.superior)));
    format!(
        "EXISTS (SELECT 1 FROM card_disciplines cdx\n             WHERE cdx.card_id = c.id AND cdx.discipline = ?{code} AND cdx.superior >= ?{superior})"
    )
}

fn push_discipline_group(
    sql: &mut String,
    params: &mut Vec<SqlValue>,
    requirements: &[DisciplineRequirement],
) {
    if requirements.is_empty() {
        return;
    }
    let expressions = requirements
        .iter()
        .map(|requirement| discipline_expression(params, requirement))
        .collect::<Vec<_>>();
    sql.push_str(" AND (");
    sql.push_str(&expressions.join(" OR "));
    sql.push(')');
}

fn push_group_filter(sql: &mut String, params: &mut Vec<SqlValue>, groups: &[i64]) {
    if groups.is_empty() {
        return;
    }
    let placeholders = groups
        .iter()
        .map(|group| format!("?{}", push_param(params, SqlValue::Integer(*group))))
        .collect::<Vec<_>>();
    sql.push_str(" AND c.grp IN (");
    sql.push_str(&placeholders.join(","));
    sql.push(')');
}

fn push_sect_filter(
    sql: &mut String,
    params: &mut Vec<SqlValue>,
    sects: &[String],
    logic: RequirementLogic,
) {
    if sects.is_empty() {
        return;
    }
    let expressions = sects
        .iter()
        .map(|sect| {
            let index = push_param(params, SqlValue::Text(sect.clone()));
            format!("lower(coalesce(c.sect, '')) = lower(?{index})")
        })
        .collect::<Vec<_>>();
    if logic == RequirementLogic::All {
        for expression in expressions {
            sql.push_str(" AND ");
            sql.push_str(&expression);
        }
    } else {
        sql.push_str(" AND ");
        if logic == RequirementLogic::None {
            sql.push_str("NOT ");
        }
        sql.push('(');
        sql.push_str(&expressions.join(" OR "));
        sql.push(')');
    }
}

fn push_trait_filters(sql: &mut String, params: &mut Vec<SqlValue>, traits: &[String]) {
    for trait_name in traits {
        let index = push_param(params, SqlValue::Text(trait_name.clone()));
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM card_traits ct\n                WHERE ct.card_id = c.id AND ct.trait = ?{index})"
        ));
    }
}

fn push_exact_precon_filter(
    sql: &mut String,
    params: &mut Vec<SqlValue>,
    precons: &[PreconSelection],
    print_mode: SetPrintMode,
) {
    let selections = precons
        .iter()
        .filter_map(|selection| {
            let set = selection.set.trim();
            let precon = selection.precon.trim();
            (!set.is_empty() && !precon.is_empty()).then_some((set, precon))
        })
        .collect::<Vec<_>>();
    if selections.is_empty() {
        return;
    }

    let print_index = push_param(params, SqlValue::Text(print_mode.as_sql_value().into()));
    sql.push_str(" AND (");
    for (offset, (set, precon)) in selections.into_iter().enumerate() {
        if offset > 0 {
            sql.push_str(" OR ");
        }
        let set_index = push_param(params, SqlValue::Text(set.into()));
        let precon_index = push_param(params, SqlValue::Text(precon.into()));
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

/// Builds the complete crypt candidate query used by both SQLite adapters.
pub fn crypt_plan(input: &CryptPlanInput) -> QueryPlan {
    let single_group = input.groups.is_empty().then_some(input.group).flatten();
    let legacy_precon = input
        .precons
        .is_empty()
        .then(|| input.precon.clone())
        .flatten();
    let mut params = vec![
        SqlValue::Text(input.text.trim().to_owned()),
        SqlValue::Integer(i64::from(input.text_mode != TextMode::Text)),
        SqlValue::Integer(i64::from(input.text_mode != TextMode::Name)),
        input.clan.clone().into(),
        single_group.into(),
        input.capacity_min.into(),
        input.capacity_max.into(),
        input.title.clone().into(),
        input.set.clone().into(),
        legacy_precon.into(),
        input.artist.clone().into(),
        SqlValue::Integer(i64::from(input.text_regex)),
        SqlValue::Text(input.set_age.as_sql_value().into()),
        SqlValue::Text(input.set_print.as_sql_value().into()),
        input.votes.into(),
    ];
    let mut sql = String::from(
        "SELECT c.id, c.name, c.clan, c.capacity, c.grp, c.title, c.sect, c.votes,
                c.image_url, c.name_ascii,
                GROUP_CONCAT(cd.discipline || ':' || cd.superior) AS disc
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

    push_group_filter(&mut sql, &mut params, &input.groups);
    push_sect_filter(&mut sql, &mut params, &input.sects, input.sect_logic);
    push_trait_filters(&mut sql, &mut params, &input.traits);
    push_exact_precon_filter(&mut sql, &mut params, &input.precons, input.precon_print);

    let requirements = if input.discipline_requirements.is_empty() {
        input
            .disciplines
            .iter()
            .map(|code| DisciplineRequirement {
                code: code.clone(),
                superior: input.disciplines_superior,
            })
            .collect::<Vec<_>>()
    } else {
        input.discipline_requirements.clone()
    };
    for requirement in &requirements {
        push_discipline_group(&mut sql, &mut params, std::slice::from_ref(requirement));
    }
    for group in &input.discipline_or {
        push_discipline_group(&mut sql, &mut params, group);
    }
    sql.push_str(" GROUP BY c.id");

    QueryPlan { sql, params }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_plan_has_stable_base_parameters() {
        let plan = crypt_plan(&CryptPlanInput::default());
        assert!(plan.sql.contains("WHERE c.kind = 'crypt'"));
        assert!(plan.sql.ends_with(" GROUP BY c.id"));
        assert_eq!(plan.params.len(), 15);
        assert_eq!(plan.params[0], SqlValue::Text(String::new()));
        assert_eq!(plan.params[1], SqlValue::Integer(1));
        assert_eq!(plan.params[2], SqlValue::Integer(1));
    }

    #[test]
    fn dynamic_values_are_bound_and_numbered() {
        let input = CryptPlanInput {
            groups: vec![5, 7],
            sects: vec!["Camarilla' OR 1=1 --".into()],
            sect_logic: RequirementLogic::Any,
            traits: vec!["black hand".into()],
            discipline_requirements: vec![DisciplineRequirement {
                code: "DOM".into(),
                superior: true,
            }],
            discipline_or: vec![vec![DisciplineRequirement {
                code: "for".into(),
                superior: false,
            }]],
            ..CryptPlanInput::default()
        };
        let plan = crypt_plan(&input);
        assert!(!plan.sql.contains("Camarilla' OR 1=1"));
        assert!(plan.sql.contains("c.grp IN (?16,?17)"));
        assert!(plan.sql.contains("ct.trait = ?19"));
        assert_eq!(
            plan.params[17],
            SqlValue::Text("Camarilla' OR 1=1 --".into())
        );
        assert_eq!(plan.params[19], SqlValue::Text("dom".into()));
        assert_eq!(plan.params[21], SqlValue::Text("for".into()));
    }

    #[test]
    fn exact_precons_supersede_legacy_substring() {
        let input = CryptPlanInput {
            precon: Some("legacy".into()),
            precons: vec![PreconSelection {
                set: " New Blood ".into(),
                precon: " Ventrue ".into(),
            }],
            precon_print: SetPrintMode::First,
            ..CryptPlanInput::default()
        };
        let plan = crypt_plan(&input);
        assert_eq!(plan.params[9], SqlValue::Null);
        assert_eq!(plan.params[15], SqlValue::Text("first".into()));
        assert_eq!(plan.params[16], SqlValue::Text("New Blood".into()));
        assert_eq!(plan.params[17], SqlValue::Text("Ventrue".into()));
    }
}
