//! Message-box chrome: six buttons on the bottom strip of the dialogue box.

use crate::draw::{MSG_H, MSG_W, MSG_X, MSG_Y};

pub const HUD_COUNT: usize = 6;
pub const HUD_H: i32 = 32;
pub const HUD_GAP: i32 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HudAction {
    Auto,
    Skip,
    QuickSave,
    QuickLoad,
    Log,
    Menu,
}

pub const HUD_ACTIONS: [HudAction; HUD_COUNT] = [
    HudAction::Auto,
    HudAction::Skip,
    HudAction::QuickSave,
    HudAction::QuickLoad,
    HudAction::Log,
    HudAction::Menu,
];

pub fn hud_y() -> i32 {
    MSG_Y + MSG_H - HUD_H - 4
}

pub fn hud_rect(index: usize) -> (i32, i32, i32, i32) {
    let i = index.min(HUD_COUNT - 1) as i32;
    let inner = MSG_W - HUD_GAP * (HUD_COUNT as i32 - 1);
    let w = inner / HUD_COUNT as i32;
    let x = MSG_X + i * (w + HUD_GAP);
    (x, hud_y(), w, HUD_H)
}

pub fn hit_hud(lx: i32, ly: i32) -> Option<usize> {
    for i in 0..HUD_COUNT {
        let (x, y, w, h) = hud_rect(i);
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(i);
        }
    }
    None
}

pub fn hud_labels(locale: &str) -> [&'static str; HUD_COUNT] {
    match locale {
        "en" => ["AUTO", "SKIP", "Q.SAVE", "Q.LOAD", "LOG", "MENU"],
        "zh-Hans" => ["自动", "快进", "快存", "快读", "回顾", "菜单"],
        _ => ["自動", "快轉", "快存", "快讀", "回顧", "選單"],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn six_buttons_stay_on_screen() {
        for i in 0..HUD_COUNT {
            let (x, y, w, h) = hud_rect(i);
            assert!(x >= 0 && y >= 0);
            assert!(x + w <= 1920);
            assert!(y + h <= 1080);
        }
        let (x0, y0, w0, h0) = hud_rect(0);
        assert_eq!(hit_hud(x0 + 1, y0 + 1), Some(0));
        assert_eq!(hit_hud(x0 + w0 / 2, y0 + h0 + 20), None);
    }
}
