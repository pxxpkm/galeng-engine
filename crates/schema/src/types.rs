use std::collections::BTreeMap;

use serde::de::Error as DeError;
use serde::{Deserialize, Deserializer, Serialize};

fn deserialize_schema_version<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    let version = u32::deserialize(deserializer)?;
    match version {
        1 | 2 => Ok(version),
        other => Err(DeError::custom(format!(
            "schemaVersion must be 1 or 2, got {other}"
        ))),
    }
}

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TitleButton {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub w: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub h: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TitleButtons {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_game: Option<TitleButton>,
    #[serde(default, rename = "continue", skip_serializing_if = "Option::is_none")]
    pub continue_game: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub load: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gallery: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quit: Option<TitleButton>,
}

impl TitleButtons {
    pub fn get(&self, index: usize) -> Option<&TitleButton> {
        match index {
            0 => self.new_game.as_ref(),
            1 => self.continue_game.as_ref(),
            2 => self.load.as_ref(),
            3 => self.gallery.as_ref(),
            4 => self.music.as_ref(),
            5 => self.settings.as_ref(),
            6 => self.quit.as_ref(),
            _ => None,
        }
    }

    pub fn assets(&self) -> Vec<&str> {
        let mut out = Vec::new();
        for i in 0..7 {
            let Some(btn) = self.get(i) else { continue };
            if let Some(path) = btn.image.as_deref() {
                out.push(path);
            }
            if let Some(path) = btn.hover.as_deref() {
                out.push(path);
            }
        }
        out
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PauseButtons {
    #[serde(default, rename = "continue", skip_serializing_if = "Option::is_none")]
    pub continue_game: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quick_save: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quick_load: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_load: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub save: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub load: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<TitleButton>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quit: Option<TitleButton>,
}

impl PauseButtons {
    pub fn get(&self, index: usize) -> Option<&TitleButton> {
        match index {
            0 => self.continue_game.as_ref(),
            1 => self.quick_save.as_ref(),
            2 => self.quick_load.as_ref(),
            3 => self.auto_load.as_ref(),
            4 => self.save.as_ref(),
            5 => self.load.as_ref(),
            6 => self.settings.as_ref(),
            7 => self.title.as_ref(),
            8 => self.quit.as_ref(),
            _ => None,
        }
    }

    pub fn assets(&self) -> Vec<&str> {
        let mut out = Vec::new();
        for i in 0..9 {
            let Some(btn) = self.get(i) else { continue };
            if let Some(path) = btn.image.as_deref() {
                out.push(path);
            }
            if let Some(path) = btn.hover.as_deref() {
                out.push(path);
            }
        }
        out
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verb {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub builtin: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDef {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub consume_on_use: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchDef {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Missing and `false` both mean the switch starts off.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub init: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Fallback {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub per_verb: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_on_hotspot: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global: Option<String>,
}

impl Fallback {
    fn is_empty(&self) -> bool {
        self.per_verb.is_empty() && self.item_on_hotspot.is_none() && self.global.is_none()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectKind {
    Fade,
    Crossfade,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct EffectParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectDef {
    pub id: String,
    pub kind: EffectKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<EffectParams>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransitionDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to_dialogue: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_dialogue: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goto_scene: Option<String>,
}

impl TransitionDefaults {
    fn is_empty(&self) -> bool {
        self.to_dialogue.is_none() && self.from_dialogue.is_none() && self.goto_scene.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub title: String,
    /// `1` is dialogue-only. `2` adds explore. Other integers are rejected.
    #[serde(deserialize_with = "deserialize_schema_version")]
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
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hide_game_title: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_buttons: Option<TitleButtons>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pause_buttons: Option<PauseButtons>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_languages: Option<Vec<UiLanguage>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub characters: Option<Vec<Character>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cg: Option<Vec<GalleryItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music_gallery: Option<Vec<GalleryItem>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub verbs: Vec<Verb>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<ItemDef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub switches: Vec<SwitchDef>,
    #[serde(default, skip_serializing_if = "Fallback::is_empty")]
    pub fallback: Fallback,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub effect_library: Vec<EffectDef>,
    #[serde(default, skip_serializing_if = "TransitionDefaults::is_empty")]
    pub transition_defaults: TransitionDefaults,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bg {
    pub asset: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trans: Option<Trans>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ms: Option<u32>,
}

/// Stage pose. `slot_in_json` keeps an omitted slot omitted and an explicit `"center"` explicit.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(from = "CharOnStageJson", into = "CharOnStageJson")]
pub struct CharOnStage {
    pub id: String,
    pub face: String,
    pub slot: Slot,
    pub x: i32,
    pub y: i32,
    pub slide_ms: Option<u32>,
    slot_in_json: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CharOnStageJson {
    id: String,
    face: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    slot: Option<Slot>,
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    x: i32,
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    y: i32,
    #[serde(default, rename = "slideMs", skip_serializing_if = "Option::is_none")]
    slide_ms: Option<u32>,
}

impl From<CharOnStageJson> for CharOnStage {
    fn from(raw: CharOnStageJson) -> Self {
        Self {
            id: raw.id,
            face: raw.face,
            slot_in_json: raw.slot.is_some(),
            slot: raw.slot.unwrap_or_default(),
            x: raw.x,
            y: raw.y,
            slide_ms: raw.slide_ms,
        }
    }
}

impl From<CharOnStage> for CharOnStageJson {
    fn from(ch: CharOnStage) -> Self {
        Self {
            id: ch.id,
            face: ch.face,
            slot: ch.slot_in_json.then_some(ch.slot),
            x: ch.x,
            y: ch.y,
            slide_ms: ch.slide_ms,
        }
    }
}

impl PartialEq for CharOnStage {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.face == other.face
            && self.slot == other.slot
            && self.x == other.x
            && self.y == other.y
            && self.slide_ms == other.slide_ms
    }
}

impl Eq for CharOnStage {}

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
    Call {
        scene: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        trans: Option<String>,
    },
    #[serde(rename = "return")]
    Return {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        trans: Option<String>,
    },
}

/// Dialogue is the v1 default. Explore uses hotspots instead of a required beat list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SceneKind {
    #[default]
    Dialogue,
    Explore,
}

fn is_default_scene_kind(kind: &SceneKind) -> bool {
    *kind == SceneKind::Dialogue
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HotspotShape {
    Rect { x: i32, y: i32, w: i32, h: i32 },
    Polygon { points: Vec<[i32; 2]> },
}

/// One AND atom. Untagged: `{switch,is}` / `{var,eq}` / `{hasItem}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SwitchPred {
    pub switch: String,
    pub is: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VarPred {
    pub var: String,
    pub eq: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HasItemPred {
    pub has_item: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Pred {
    Switch(SwitchPred),
    Var(VarPred),
    HasItem(HasItemPred),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerbOn {
    pub verb: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ItemOn {
    pub item: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum InteractionOn {
    Verb(VerbOn),
    Item(ItemOn),
}

/// Explore opcode. `type` is camelCase; unknown tags fail.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum ExploreAction {
    Say {
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        speaker: Option<String>,
    },
    SetSwitch { id: String, value: bool },
    SetVar { id: String, value: i32 },
    AddVar { id: String, delta: i32 },
    GiveItem { id: String },
    TakeItem { id: String },
    GotoScene {
        scene: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        trans: Option<String>,
    },
    Call {
        scene: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        trans: Option<String>,
    },
    #[serde(rename = "return")]
    Return {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        trans: Option<String>,
    },
    PlaySe { asset: String },
    Bgm {
        asset: Option<String>,
        #[serde(default, rename = "fadeMs", skip_serializing_if = "Option::is_none")]
        fade_ms: Option<u32>,
    },
    Fx {
        #[serde(rename = "ref")]
        effect_ref: String,
        #[serde(default, rename = "override", skip_serializing_if = "Option::is_none")]
        override_params: Option<EffectParams>,
    },
    ShowHotspot { id: String },
    HideHotspot { id: String },
    EnableHotspot { id: String },
    DisableHotspot { id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InteractionRule {
    pub when: Vec<Pred>,
    #[serde(rename = "do")]
    pub actions: Vec<ExploreAction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Interaction {
    pub hotspot: String,
    pub on: InteractionOn,
    pub rules: Vec<InteractionRule>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotspot {
    pub id: String,
    pub name: String,
    pub shape: HotspotShape,
    /// `None` omitted, `Some(None)` JSON null, `Some(Some(_))` predicate list.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_present_option"
    )]
    pub visible_if: Option<Option<Vec<Pred>>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_present_option"
    )]
    pub enabled_if: Option<Option<Vec<Pred>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_verb: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "is_default_scene_kind")]
    pub scene_kind: SceneKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bg: Option<Bg>,
    #[serde(default)]
    pub beats: Vec<Beat>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hotspots: Vec<Hotspot>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub interactions: Vec<Interaction>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub on_enter: Vec<ExploreAction>,
    /// YU-NO-style room look when clicking empty background (Explore).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub on_empty_click: Vec<ExploreAction>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit: Option<Exit>,
}
