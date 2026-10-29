use std::collections::{BTreeMap, BTreeSet};

use galeng_schema::Beat;
use serde::{Deserialize, Serialize};

use crate::engine::{Phase, StackFrame};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreSave {
    pub schema_version: u32,
    pub game_id: String,
    pub scene_id: String,
    pub beat_index: usize,
    /// Stable beat id. Absent on saves written before this field; those still
    /// resume by `beat_index`. Format stays 3 — a new format number is rejected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub beat_id: Option<String>,
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
    /// Line on screen when `phase` is Saying and the action queue was empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub say_speaker: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub say_text: Option<String>,
    /// Engine BGM at save time. Absent on older saves, which load as silence
    /// here; the outer save can still fall back to its carried track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bgm: Option<String>,
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

/// Same rules as `galeng_player::save::resolve_beat`.
/// When `beat_id` is present, never fall back to `beat_index`.
pub fn resolve_saved_beat(
    beats: &[Beat],
    beat_id: Option<&str>,
    beat_index: usize,
) -> Option<usize> {
    if let Some(id) = beat_id {
        let mut found = None;
        for (i, beat) in beats.iter().enumerate() {
            if beat.id.as_deref() == Some(id) {
                if found.is_some() {
                    return None;
                }
                found = Some(i);
            }
        }
        return found;
    }
    if beat_index <= beats.len() {
        Some(beat_index)
    } else {
        None
    }
}

/// Keep the outer save's beat id and the explore snapshot on one position.
/// An old explore blob with no id borrows the outer id when both name the same
/// scene. Two different ids are an error. No id at all leaves the index path.
pub fn align_explore_beat_id(
    mut explore: ExploreSave,
    outer_scene: &str,
    outer_beat_id: Option<&str>,
) -> Result<ExploreSave, BeatIdConflict> {
    if explore.scene_id != outer_scene {
        return Ok(explore);
    }
    match (&explore.beat_id, outer_beat_id) {
        (Some(inner), Some(outer)) if inner != outer => Err(BeatIdConflict::Mismatch {
            explore: inner.clone(),
            outer: outer.to_string(),
        }),
        (None, Some(outer)) => {
            explore.beat_id = Some(outer.to_string());
            Ok(explore)
        }
        _ => Ok(explore),
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum BeatIdConflict {
    #[error("explore beat id `{explore}` does not match save beat id `{outer}`")]
    Mismatch { explore: String, outer: String },
}
