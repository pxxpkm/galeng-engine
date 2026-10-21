use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const CHANNEL_COUNT: usize = 4;
pub const SETTINGS_ROWS: usize = 11;
pub const FULLSCREEN_ROW: usize = 4;
pub const AUTO_PLAY_ROW: usize = 5;
pub const AUTO_DELAY_ROW: usize = 6;
pub const TEXT_SPEED_ROW: usize = 7;
pub const UI_LANG_ROW: usize = 8;
pub const SKIP_UNREAD_ROW: usize = 9;
pub const SIMD_ROW: usize = 10;
pub const STEP: i32 = 10;
pub const DELAY_STEP: u32 = 200;
pub const DELAY_MIN: u32 = 200;
pub const DELAY_MAX: u32 = 5000;
pub const DELAY_DEFAULT: u32 = 800;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum UiLang {
    #[default]
    #[serde(rename = "")]
    Follow,
    #[serde(rename = "zh-Hant")]
    ZhHant,
    #[serde(rename = "zh-Hans")]
    ZhHans,
    #[serde(rename = "en")]
    En,
}

impl UiLang {
    pub fn resolve(self, project_locale: &str) -> &str {
        match self {
            Self::Follow => match project_locale {
                "zh-Hans" | "en" => project_locale,
                _ => "zh-Hant",
            },
            Self::ZhHant => "zh-Hant",
            Self::ZhHans => "zh-Hans",
            Self::En => "en",
        }
    }

    pub fn cycle(self) -> Self {
        match self {
            Self::Follow => Self::ZhHant,
            Self::ZhHant => Self::ZhHans,
            Self::ZhHans => Self::En,
            Self::En => Self::Follow,
        }
    }

    pub fn choice_label(self, display: &str) -> &'static str {
        match (self, display) {
            (Self::Follow, "en") => "Follow game",
            (Self::Follow, "zh-Hans") => "跟随游戏",
            (Self::Follow, _) => "跟隨專案",
            (Self::ZhHant, "en") => "Traditional Chinese",
            (Self::ZhHant, "zh-Hans") => "繁体中文",
            (Self::ZhHant, _) => "繁體中文",
            (Self::ZhHans, "en") => "Simplified Chinese",
            (Self::ZhHans, _) => "簡體中文",
            (Self::En, "zh-Hans") => "英语",
            (Self::En, "zh-Hant") => "英文",
            (Self::En, _) => "English",
        }
    }
}

pub const HEADROOM_BGM: f32 = 0.35;
pub const HEADROOM_VOICE: f32 = 0.55;
pub const HEADROOM_SE: f32 = 0.45;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "hundred")]
    pub master: u8,
    #[serde(default = "hundred")]
    pub bgm: u8,
    #[serde(default = "hundred")]
    pub se: u8,
    #[serde(default = "hundred")]
    pub voice: u8,
    #[serde(default)]
    pub fullscreen: bool,
    #[serde(default)]
    pub auto_play: bool,
    #[serde(default = "default_delay")]
    pub auto_delay_ms: u32,
    #[serde(default = "default_speed")]
    pub text_speed: u8,
    #[serde(default)]
    pub ui_language: UiLang,
    #[serde(default)]
    pub skip_unread: bool,
    #[serde(default = "default_true")]
    pub simd: bool,
}

fn hundred() -> u8 {
    100
}

fn default_delay() -> u32 {
    DELAY_DEFAULT
}

fn default_speed() -> u8 {
    crate::typewriter::SPEED_DEFAULT
}

fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            master: 100,
            bgm: 100,
            se: 100,
            voice: 100,
            fullscreen: false,
            auto_play: false,
            auto_delay_ms: DELAY_DEFAULT,
            text_speed: crate::typewriter::SPEED_DEFAULT,
            ui_language: UiLang::Follow,
            skip_unread: false,
            simd: true,
        }
    }
}

impl Settings {
    pub fn clamp(self) -> Self {
        Self {
            master: self.master.min(100),
            bgm: self.bgm.min(100),
            se: self.se.min(100),
            voice: self.voice.min(100),
            fullscreen: self.fullscreen,
            auto_play: self.auto_play,
            auto_delay_ms: self.auto_delay_ms.clamp(DELAY_MIN, DELAY_MAX),
            text_speed: self
                .text_speed
                .clamp(crate::typewriter::SPEED_MIN, crate::typewriter::SPEED_MAX),
            ui_language: self.ui_language,
            skip_unread: self.skip_unread,
            simd: self.simd,
        }
    }

    pub fn bump_delay(&mut self, delta: i32) {
        let next = (self.auto_delay_ms as i32 + delta).clamp(DELAY_MIN as i32, DELAY_MAX as i32);
        self.auto_delay_ms = next as u32;
    }

    pub fn bump_speed(&mut self, delta: i32) {
        let next = (self.text_speed as i32 + delta).clamp(
            i32::from(crate::typewriter::SPEED_MIN),
            i32::from(crate::typewriter::SPEED_MAX),
        );
        self.text_speed = next as u8;
    }

    pub fn get(&self, index: usize) -> u8 {
        match index {
            0 => self.master,
            1 => self.bgm,
            2 => self.se,
            3 => self.voice,
            _ => 0,
        }
    }

    pub fn bump(&mut self, index: usize, delta: i32) {
        let next = (self.get(index) as i32 + delta).clamp(0, 100) as u8;
        match index {
            0 => self.master = next,
            1 => self.bgm = next,
            2 => self.se = next,
            3 => self.voice = next,
            _ => {}
        }
    }

    pub fn gain_bgm(&self, fade_t: f32) -> f32 {
        HEADROOM_BGM * pct(self.master) * pct(self.bgm) * fade_t.clamp(0.0, 1.0)
    }

    pub fn gain_voice(&self) -> f32 {
        HEADROOM_VOICE * pct(self.master) * pct(self.voice)
    }

    pub fn gain_se(&self) -> f32 {
        HEADROOM_SE * pct(self.master) * pct(self.se)
    }
}

fn pct(v: u8) -> f32 {
    f32::from(v.min(100)) / 100.0
}

pub fn channel_label(locale: &str, index: usize) -> &'static str {
    match (locale, index) {
        ("en", 0) => "Master",
        ("en", 1) => "BGM",
        ("en", 2) => "SE",
        ("en", 3) => "Voice",
        ("zh-Hans", 0) => "主音量",
        ("zh-Hans", 1) => "BGM",
        ("zh-Hans", 2) => "音效",
        ("zh-Hans", 3) => "语音",
        (_, 0) => "主音量",
        (_, 1) => "BGM",
        (_, 2) => "音效",
        _ => "語音",
    }
}

/// How long to wait before auto-advancing this line.
pub fn wait_ms(auto_play: bool, delay_ms: u32, beat_auto: Option<u32>) -> Option<u32> {
    let delay = delay_ms.clamp(DELAY_MIN, DELAY_MAX);
    match (auto_play, beat_auto) {
        (false, None) => None,
        (false, Some(ms)) => Some(ms),
        (true, None) => Some(delay),
        (true, Some(ms)) => Some(ms.saturating_add(delay)),
    }
}

pub fn auto_play_label(locale: &str) -> &'static str {
    match locale {
        "en" => "Auto",
        "zh-Hans" => "自动翻页",
        _ => "自動翻頁",
    }
}

pub fn ui_lang_label(locale: &str) -> &'static str {
    match locale {
        "en" => "Language",
        "zh-Hans" => "界面语言",
        _ => "界面語言",
    }
}

pub fn text_speed_label(locale: &str) -> &'static str {
    match locale {
        "en" => "Text speed",
        "zh-Hans" => "文字速度",
        _ => "文字速度",
    }
}

pub fn auto_delay_label(locale: &str) -> &'static str {
    match locale {
        "en" => "Auto delay",
        "zh-Hans" => "自动延迟",
        _ => "自動延遲",
    }
}

pub fn skip_unread_label(locale: &str) -> &'static str {
    match locale {
        "en" => "Skip unread",
        "zh-Hans" => "快进未读",
        _ => "快轉未讀",
    }
}

pub fn fullscreen_label(locale: &str) -> &'static str {
    match locale {
        "en" => "Fullscreen",
        "zh-Hans" => "全屏",
        _ => "全螢幕",
    }
}

pub fn simd_label(locale: &str) -> &'static str {
    match locale {
        "en" => "SIMD blend",
        "zh-Hans" => "SIMD混合",
        _ => "SIMD混合",
    }
}

pub fn on_off(locale: &str, on: bool) -> &'static str {
    match (locale, on) {
        ("en", true) => "On",
        ("en", false) => "Off",
        ("zh-Hans", true) => "开",
        ("zh-Hans", false) => "关",
        (_, true) => "開",
        (_, false) => "關",
    }
}

pub fn settings_title(locale: &str) -> &'static str {
    match locale {
        "en" => "Settings",
        "zh-Hans" => "设置",
        _ => "設定",
    }
}

pub fn default_config_path(game_id: &str, project_dir: &Path) -> PathBuf {
    std::env::var_os("APPDATA")
        .map(|root| PathBuf::from(root).join("Galeng").join(game_id).join("config.json"))
        .unwrap_or_else(|| project_dir.join("config.json"))
}

pub fn write_config(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

pub fn read_config(path: &Path) -> Settings {
    let Ok(text) = fs::read_to_string(path) else {
        return Settings::default();
    };
    serde_json::from_str::<Settings>(&text)
        .unwrap_or_default()
        .clamp()
}

pub fn row_rect(index: usize) -> (i32, i32, i32, i32) {
    let y = 96 + (index as i32) * 64;
    (360, y, 1200, 56)
}

pub fn hit_row(lx: i32, ly: i32) -> Option<usize> {
    for i in 0..SETTINGS_ROWS {
        let (x, y, w, h) = row_rect(i);
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(i);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bump_clamps_0_100() {
        let mut s = Settings::default();
        s.bump(0, 20);
        assert_eq!(s.master, 100);
        s.bump(1, -30);
        assert_eq!(s.bgm, 70);
        s.bump(1, -100);
        assert_eq!(s.bgm, 0);
    }

    #[test]
    fn full_volume_keeps_old_headroom() {
        let s = Settings::default();
        assert!((s.gain_bgm(1.0) - HEADROOM_BGM).abs() < 0.001);
        assert!((s.gain_voice() - HEADROOM_VOICE).abs() < 0.001);
        assert!((s.gain_se() - HEADROOM_SE).abs() < 0.001);
        let mut mute = s;
        mute.bump(0, -100);
        assert_eq!(mute.gain_bgm(1.0), 0.0);
    }

    #[test]
    fn config_round_trip_temp() {
        let dir = std::env::temp_dir().join(format!("galeng-part32-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        let mut s = Settings::default();
        s.bgm = 40;
        write_config(&path, &s).unwrap();
        let loaded = read_config(&path);
        assert_eq!(loaded.bgm, 40);
        assert_eq!(loaded.master, 100);
        assert!(!loaded.fullscreen);
        s.fullscreen = true;
        write_config(&path, &s).unwrap();
        assert!(read_config(&path).fullscreen);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn old_config_without_fullscreen_defaults_off() {
        let dir = std::env::temp_dir().join(format!("galeng-part33-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        fs::write(&path, r#"{"master":80,"bgm":100,"se":100,"voice":100}"#).unwrap();
        let loaded = read_config(&path);
        assert!(!loaded.fullscreen);
        assert!(!loaded.skip_unread);
        assert!(loaded.simd);
        assert_eq!(loaded.ui_language, UiLang::Follow);
        assert_eq!(loaded.master, 80);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_config_is_default() {
        let path = std::env::temp_dir().join("galeng-no-such-config-part32.json");
        let _ = fs::remove_file(&path);
        assert_eq!(read_config(&path), Settings::default());
    }

    #[test]
    fn hit_first_row() {
        let (x, y, w, _h) = row_rect(0);
        assert_eq!(hit_row(x + 1, y + 1), Some(0));
        assert_eq!(hit_row(x + w / 2, y + 128), Some(2));
    }

    #[test]
    fn wait_ms_respects_toggle_and_beat() {
        assert_eq!(wait_ms(false, 800, None), None);
        assert_eq!(wait_ms(false, 800, Some(550)), Some(550));
        assert_eq!(wait_ms(true, 800, None), Some(800));
        assert_eq!(wait_ms(true, 800, Some(550)), Some(1350));
        assert_eq!(wait_ms(true, 0, None), Some(DELAY_MIN));
    }

    #[test]
    fn ui_lang_follow_and_cycle() {
        assert_eq!(UiLang::Follow.resolve("zh-Hant"), "zh-Hant");
        assert_eq!(UiLang::Follow.resolve("en"), "en");
        assert_eq!(UiLang::ZhHans.resolve("en"), "zh-Hans");
        assert_eq!(UiLang::Follow.cycle(), UiLang::ZhHant);
        assert_eq!(UiLang::En.cycle(), UiLang::Follow);
    }

    #[test]
    fn delay_bump_clamps() {
        let mut s = Settings::default();
        assert_eq!(s.auto_delay_ms, 800);
        s.bump_delay(10_000);
        assert_eq!(s.auto_delay_ms, DELAY_MAX);
        s.bump_delay(-10_000);
        assert_eq!(s.auto_delay_ms, DELAY_MIN);
        assert!(!s.auto_play);
    }
}
