use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::engine::{Phase, StackFrame};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreSave {
    pub schema_version: u32,
    pub game_id: String,
    pub scene_id: String,
    pub beat_index: usize,
    pub phase: PhaseSave,
    pub call_stack: Vec<StackFrame>,
    pub switches: BTreeMap<String, bool>,
    pub vars: BTreeMap<String, i32>,
    pub inventory: BTreeSet<String>,
    #[serde(default)]
    pub hotspot_visible: BTreeMap<String, bool>,
    #[serde(default)]
    pub hotspot_enabled: BTreeMap<String, bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_verb: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_item: Option<String>,
    #[serde(default)]
    pub inventory_open: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PhaseSave {
    Explore,
    Saying,
    Dialogue,
    Choices,
    Ended,
    Error(String),
}

impl From<&Phase> for PhaseSave {
    fn from(p: &Phase) -> Self {
        match p {
            Phase::Explore => Self::Explore,
            Phase::Saying => Self::Saying,
            Phase::Dialogue => Self::Dialogue,
            Phase::Choices => Self::Choices,
            Phase::Ended => Self::Ended,
            Phase::Error(m) => Self::Error(m.clone()),
        }
    }
}

impl From<&PhaseSave> for Phase {
    fn from(p: &PhaseSave) -> Self {
        match p {
            PhaseSave::Explore => Phase::Explore,
            PhaseSave::Saying => Phase::Saying,
            PhaseSave::Dialogue => Phase::Dialogue,
            PhaseSave::Choices => Phase::Choices,
            PhaseSave::Ended => Phase::Ended,
            PhaseSave::Error(m) => Phase::Error(m.clone()),
        }
    }
}

/// Encode (scene_id, hotspot_id) as "scene_id\\thotspot_id".
pub fn override_key(scene: &str, hotspot: &str) -> String {
    format!("{scene}\t{hotspot}")
}

pub fn parse_override_key(key: &str) -> Option<(String, String)> {
    let (a, b) = key.split_once('\t')?;
    Some((a.to_string(), b.to_string()))
}
