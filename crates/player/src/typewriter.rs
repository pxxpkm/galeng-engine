use std::time::{Duration, Instant};

use galeng_schema::Project;
use unicode_segmentation::UnicodeSegmentation;

pub const SPEED_MIN: u8 = 1;
pub const SPEED_MAX: u8 = 10;
pub const SPEED_DEFAULT: u8 = 5;
pub const RATE_MIN: u32 = 25;
pub const RATE_MAX: u32 = 400;
pub const RATE_DEFAULT: u32 = 100;

/// Milliseconds per weight-1 grapheme. Speed 10 is instant (0).
pub fn ms_per_glyph(speed: u8) -> u32 {
    let speed = speed.clamp(SPEED_MIN, SPEED_MAX);
    if speed >= SPEED_MAX {
        0
    } else {
        u32::from(11 - speed) * 8
    }
}

pub fn clamp_rate(rate: u32) -> u32 {
    rate.clamp(RATE_MIN, RATE_MAX)
}

/// Pause after this grapheme, before the next one appears.
pub fn punct_weight(g: &str) -> u32 {
    match g {
        "。" | "．" | "." | "！" | "？" | "!" | "?" | "…" => 3,
        "、" | "，" | "," | "；" | ";" | "：" | ":" | "—" | "～" | "~" => 2,
        _ => 1,
    }
}

pub fn delay_after_ms(speed: u8, rate: u32, grapheme: &str) -> u32 {
    let base = u64::from(ms_per_glyph(speed));
    if base == 0 {
        return 0;
    }
    let rate = u64::from(clamp_rate(rate));
    let weight = u64::from(punct_weight(grapheme));
    (base * rate * weight / 100) as u32
}

/// How many graphemes are visible after `elapsed_ms`. First glyph at t=0.
pub fn glyphs_shown(text: &str, speed: u8, rate: u32, elapsed_ms: u64) -> usize {
    let total = grapheme_count(text);
    if total == 0 || ms_per_glyph(speed) == 0 {
        return total;
    }
    let mut shown = 1usize;
    let mut spent = 0u64;
    for g in text.graphemes(true) {
        if shown >= total {
            break;
        }
        spent = spent.saturating_add(u64::from(delay_after_ms(speed, rate, g)));
        if elapsed_ms < spent {
            break;
        }
        shown += 1;
    }
    shown.min(total)
}

/// When the line is fully visible *and* the last punct hold (if any) has elapsed.
pub fn done_after_ms(text: &str, speed: u8, rate: u32) -> u64 {
    if text.is_empty() || ms_per_glyph(speed) == 0 {
        return 0;
    }
    let gs: Vec<&str> = text.graphemes(true).collect();
    let mut t = 0u64;
    for (i, g) in gs.iter().enumerate() {
        let last = i + 1 == gs.len();
        if !last || punct_weight(g) > 1 {
            t = t.saturating_add(u64::from(delay_after_ms(speed, rate, g)));
        }
    }
    t
}

pub fn text_rate_of(project: &Project, speaker: Option<&str>) -> u32 {
    let Some(id) = speaker.filter(|s| !s.is_empty()) else {
        return RATE_DEFAULT;
    };
    project
        .characters
        .as_ref()
        .and_then(|list| list.iter().find(|ch| ch.id == id))
        .and_then(|ch| ch.text_rate)
        .map(clamp_rate)
        .unwrap_or(RATE_DEFAULT)
}

pub fn grapheme_count(text: &str) -> usize {
    text.graphemes(true).count()
}

pub fn take_graphemes(text: &str, n: usize) -> &str {
    if n == 0 {
        return "";
    }
    match text.grapheme_indices(true).nth(n) {
        Some((idx, _)) => &text[..idx],
        None => text,
    }
}

pub struct Typewriter {
    key: Option<(String, usize, usize)>,
    shown: usize,
    started: Option<Instant>,
    done: bool,
}

impl Typewriter {
    pub fn new() -> Self {
        Self {
            key: None,
            shown: 0,
            started: None,
            done: true,
        }
    }

    pub fn is_done(&self) -> bool {
        self.done
    }

    pub fn complete(&mut self) {
        self.done = true;
    }

    /// Push `started` forward by `d` after a focus pause (wall clock does not stop).
    pub fn shift(&mut self, d: Duration) {
        if let Some(t) = self.started.as_mut() {
            *t += d;
        }
    }

    pub fn visible<'a>(&self, text: &'a str) -> &'a str {
        if self.done {
            text
        } else {
            take_graphemes(text, self.shown)
        }
    }

    /// Reset on line change. Pause when `running` is false (fade / overlay).
    pub fn tick(
        &mut self,
        scene: &str,
        beat: usize,
        page: usize,
        text: &str,
        speed: u8,
        rate: u32,
        now: Instant,
        running: bool,
    ) {
        let key = (scene.to_string(), beat, page);
        if self.key.as_ref() != Some(&key) {
            self.key = Some(key);
            self.shown = 0;
            self.started = None;
            self.done = false;
        }
        let total = grapheme_count(text);
        if total == 0 || ms_per_glyph(speed) == 0 {
            self.shown = total;
            self.done = true;
            return;
        }
        if self.done {
            return;
        }
        if !running {
            return;
        }
        if self.started.is_none() {
            self.started = Some(now);
            self.shown = 1.min(total);
            if self.shown >= total && done_after_ms(text, speed, rate) == 0 {
                self.done = true;
            }
            return;
        }
        let Some(start) = self.started else {
            return;
        };
        let elapsed = now.saturating_duration_since(start);
        let elapsed_ms = elapsed.as_millis() as u64;
        // First glyph at t=0. Never let shown shrink (PIT-035).
        let target = glyphs_shown(text, speed, rate, elapsed_ms);
        self.shown = self.shown.max(target);
        if self.shown >= total && elapsed_ms >= done_after_ms(text, speed, rate) {
            self.done = true;
        }
    }
}

/// Confirm click: finish reveal, or say the line is ready to advance.
pub fn confirm_advances(done: bool) -> bool {
    done
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chinese_slices_by_grapheme() {
        assert_eq!(grapheme_count("今天風真好。"), 6);
        assert_eq!(take_graphemes("今天風真好。", 2), "今天");
        assert_eq!(take_graphemes("今天風真好。", 0), "");
        assert_eq!(take_graphemes("今天風真好。", 99), "今天風真好。");
    }

    #[test]
    fn speed_ten_is_instant() {
        assert_eq!(ms_per_glyph(10), 0);
        assert!(ms_per_glyph(1) > ms_per_glyph(5));
    }

    #[test]
    fn confirm_waits_until_done() {
        assert!(!confirm_advances(false));
        assert!(confirm_advances(true));
    }

    #[test]
    fn tick_reveals_over_time() {
        let mut tw = Typewriter::new();
        let t0 = Instant::now();
        tw.tick("park_01", 1, 0, "今天風真好。", 5, RATE_DEFAULT, t0, true);
        assert!(!tw.is_done());
        assert_eq!(tw.visible("今天風真好。"), "今");
        let almost = t0 + Duration::from_millis(1);
        tw.tick("park_01", 1, 0, "今天風真好。", 5, RATE_DEFAULT, almost, true);
        assert_eq!(
            tw.visible("今天風真好。"),
            "今",
            "first glyph must not vanish before one step"
        );
        let later = t0 + Duration::from_millis(u64::from(ms_per_glyph(5)));
        tw.tick("park_01", 1, 0, "今天風真好。", 5, RATE_DEFAULT, later, true);
        assert_eq!(tw.visible("今天風真好。"), "今天");
        tw.complete();
        assert!(tw.is_done());
        assert_eq!(tw.visible("今天風真好。"), "今天風真好。");
    }

    #[test]
    fn paused_new_line_stays_empty_then_holds_first_glyph() {
        let mut tw = Typewriter::new();
        let t0 = Instant::now();
        tw.tick("park_01", 1, 0, "今天風真好。", 5, RATE_DEFAULT, t0, false);
        assert_eq!(tw.visible("今天風真好。"), "");
        tw.tick("park_01", 1, 0, "今天風真好。", 5, RATE_DEFAULT, t0, true);
        assert_eq!(tw.visible("今天風真好。"), "今");
        tw.tick(
            "park_01",
            1,
            0,
            "今天風真好。",
            5,
            RATE_DEFAULT,
            t0 + Duration::from_millis(u64::from(ms_per_glyph(5))),
            false,
        );
        assert_eq!(tw.visible("今天風真好。"), "今");
    }

    #[test]
    fn period_holds_longer_than_hanzi() {
        let step = u64::from(ms_per_glyph(5));
        assert_eq!(glyphs_shown("好好", 5, 100, step), 2);
        assert_eq!(glyphs_shown("好。", 5, 100, step), 2);
        assert_eq!(done_after_ms("好好", 5, 100), step);
        assert_eq!(done_after_ms("好。", 5, 100), step + step * 3);
        assert!(done_after_ms("好。", 5, 100) > done_after_ms("好好", 5, 100));
    }

    #[test]
    fn lower_rate_reveals_faster() {
        let step = u64::from(ms_per_glyph(5));
        assert_eq!(glyphs_shown("今天風", 5, 50, step / 2), 2);
        assert_eq!(glyphs_shown("今天風", 5, 100, step / 2), 1);
    }

    #[test]
    fn speed_ten_ignores_rate_and_punct() {
        assert_eq!(glyphs_shown("好。世界", 10, 400, 0), 4);
    }

    #[test]
    fn text_rate_reads_roster_or_default() {
        let mut project = Project {
            id: "x".into(),
            title: "x".into(),
            schema_version: 1,
            resolution: galeng_schema::Resolution {
                width: 1920,
                height: 1080,
            },
            start_scene: "a".into(),
            locale: "en".into(),
            skip_title: false,
            title_bgm: None,
            title_bg: None,
            title_movie: None,
            font: None,
            fonts: None,
            msg_box: None,
            icon: None,
            hide_game_title: false,
            title_buttons: None,
            pause_buttons: None,
            ui_languages: None,
            characters: Some(vec![galeng_schema::Character {
                id: "sora".into(),
                display: None,
                text_rate: Some(80),
            }]),
            cg: None,
            music_gallery: None,
            verbs: Vec::new(),
            items: Vec::new(),
            switches: Vec::new(),
            fallback: Default::default(),
            effect_library: Vec::new(),
            transition_defaults: Default::default(),
        };
        assert_eq!(text_rate_of(&project, Some("sora")), 80);
        assert_eq!(text_rate_of(&project, Some("other")), 100);
        assert_eq!(text_rate_of(&project, None), 100);
        project.characters.as_mut().unwrap()[0].text_rate = Some(10);
        assert_eq!(text_rate_of(&project, Some("sora")), 25);
    }

    #[test]
    fn shift_delays_completion() {
        let mut tw = Typewriter::new();
        let t0 = Instant::now();
        tw.tick("s", 0, 0, "今天風真好。", 5, 100, t0, true);
        assert!(!tw.is_done());
        // Pause 10s then shift started forward so elapsed stays small.
        tw.shift(Duration::from_secs(10));
        tw.tick(
            "s",
            0,
            0,
            "今天風真好。",
            5,
            100,
            t0 + Duration::from_secs(10) + Duration::from_millis(1),
            true,
        );
        assert!(!tw.is_done(), "shift must prevent instant completion after pause");
    }
}
