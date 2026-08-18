use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};

/// JSON `null` stays `Some(None)` so a missing key (no change) is distinct from close.
fn deserialize_present_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UiLanguage {
    #[serde(rename = "zh-Hans")]
    ZhHans,
    #[serde(rename = "zh-Hant")]
    ZhHant,
    #[serde(rename = "en")]
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Slot {
    Left,
    #[default]
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Trans {
    None,
    Fade,
    Crossfade,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<BTreeMap<String, String>>,
    /// Percent of typewriter delay. 100 = default. Omitted = 100.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_rate: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GalleryItem {
    pub id: String,
    pub asset: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub title: String,
    pub schema_version: u32,
    pub resolution: Resolution,
    pub start_scene: String,
    pub locale: String,
    #[serde(default)]
    pub skip_title: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_bgm: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_bg: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_movie: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub msg_box: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_languages: Option<Vec<UiLanguage>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub characters: Option<Vec<Character>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cg: Option<Vec<GalleryItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music_gallery: Option<Vec<GalleryItem>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bg {
    pub asset: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trans: Option<Trans>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ms: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CharOnStage {
    pub id: String,
    pub face: String,
    #[serde(default)]
    pub slot: Slot,
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    pub x: i32,
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    pub y: i32,
    #[serde(default, rename = "slideMs", skip_serializing_if = "Option::is_none")]
    pub slide_ms: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AutoAdvance {
    Voice,
    Ms { ms: u32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Say {
    pub speaker: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_advance: Option<AutoAdvance>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bgm {
    pub asset: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_ms: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Se {
    pub asset: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Fx {
    Fade {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ms: Option<u32>,
    },
    Shake {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ms: Option<u32>,
    },
    Flash {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ms: Option<u32>,
    },
    Wait { ms: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Movie {
    pub asset: String,
}

fn is_zero_i32(n: &i32) -> bool {
    *n == 0
}

fn default_zoom() -> u32 {
    100
}

fn is_default_zoom(z: &u32) -> bool {
    *z == 100
}

/// Scene-layer camera. `zoom` is percent; 100 = identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera {
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    pub x: i32,
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    pub y: i32,
    #[serde(default = "default_zoom", skip_serializing_if = "is_default_zoom")]
    pub zoom: u32,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            zoom: 100,
        }
    }
}

impl Camera {
    pub fn is_identity(&self) -> bool {
        self.x == 0 && self.y == 0 && self.zoom == 100
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SetValue {
    Int(i32),
    Bool(bool),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cmp {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gte: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lte: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gt: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lt: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eq: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ne: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConditionPred {
    Bool(bool),
    Int(i32),
    Text(String),
    Cmp(Cmp),
}

pub type Condition = BTreeMap<String, ConditionPred>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Beat {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bg: Option<Bg>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chars: Option<Vec<CharOnStage>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub say: Option<Say>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bgm: Option<Bgm>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub se: Option<Vec<Se>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_present_option"
    )]
    pub amb: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fx: Option<Fx>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub movie: Option<Movie>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_present_option"
    )]
    pub camera: Option<Option<Camera>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_present_option"
    )]
    pub cg: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub set: Option<BTreeMap<String, SetValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChoiceOption {
    pub text: String,
    pub goto: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub set: Option<BTreeMap<String, SetValue>>,
    #[serde(default, rename = "if", skip_serializing_if = "Option::is_none")]
    pub if_cond: Option<Condition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Exit {
    Next { goto: String },
    Choices { options: Vec<ChoiceOption> },
    Branch {
        #[serde(rename = "if")]
        if_cond: Condition,
        then: String,
        #[serde(rename = "else")]
        else_goto: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Scene {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub beats: Vec<Beat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit: Option<Exit>,
}
