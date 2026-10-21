use galeng_schema::{PauseButtons, Slot, TitleButtons};

use crate::assets::{fit_bottom_center, Bank};
use crate::camera::map_rect;
use crate::fb::{hash_rgb, Framebuffer, Rgba, HEIGHT, WIDTH};
use crate::font::{GameFont, TypeScale};
use crate::backlog;
use crate::settings::{
    self, Settings, AUTO_DELAY_ROW, AUTO_PLAY_ROW, FULLSCREEN_ROW, SETTINGS_ROWS, SKIP_UNREAD_ROW,
    TEXT_SPEED_ROW, UI_LANG_ROW,
};
use crate::gallery;
use crate::music;
use crate::title::{
    title_caption, title_face, title_rect, title_spec, TITLE_COUNT,
};
use crate::menu::{
    index_to_slot, menu_box, menu_caption, menu_spec, slot_rect as file_slot_rect, slot_row_label,
    slot_title, MENU_COUNT, SLOT_COUNT,
};
use crate::vm::{Phase, View};

/// Compact YU-NO–style bottom chrome (logical 1920×1080).
/// Leaves room above for the Explore action button + inventory chips.
pub const MSG_X: i32 = 140;
pub const MSG_Y: i32 = 900;
pub const MSG_W: i32 = 1640;
pub const MSG_H: i32 = 168;

/// Speaker line offset inside the message box.
pub const SAY_SPEAKER_DY: i32 = 10;
/// Body text offset inside the message box (must leave ≥2×line_h above HUD).
pub const SAY_BODY_DY: i32 = 32;

pub const CHOICE_H: i32 = 56;
pub const CHOICE_STRIDE: i32 = 64;

/// Choices sit above the message box so they never collide with the HUD.
pub fn choice_rect(index: usize, count: usize) -> (i32, i32, i32, i32) {
    let n = count.max(1) as i32;
    let i = index as i32;
    let y = MSG_Y - 16 - (n - i) * CHOICE_STRIDE;
    (MSG_X + 40, y.max(8), MSG_W - 80, CHOICE_H)
}

pub fn hit_choice(lx: i32, ly: i32, count: usize) -> Option<usize> {
    for i in 0..count {
        let (x, y, w, h) = choice_rect(i, count);
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(i);
        }
    }
    None
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonState {
    Idle,
    Hover,
    Pressed,
}

pub fn button_state(index: usize, selected: usize, hover: Option<usize>, pressed: Option<usize>) -> ButtonState {
    if pressed == Some(index) {
        ButtonState::Pressed
    } else if let Some(h) = hover {
        if h == index {
            ButtonState::Hover
        } else {
            ButtonState::Idle
        }
    } else if selected == index {
        ButtonState::Hover
    } else {
        ButtonState::Idle
    }
}

/// Soft light chrome (YU-NO-like): near-white fill, dark label, gold only on hover/press.
pub fn draw_button(
    fb: &mut Framebuffer,
    font: &GameFont,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    text: &str,
    size: f32,
    state: ButtonState,
) {
    let (fill, border, label) = match state {
        ButtonState::Idle => (
            Rgba::rgb(248, 248, 252),
            Rgba::rgb(170, 170, 180),
            Rgba::rgb(28, 28, 36),
        ),
        ButtonState::Hover => (
            Rgba::rgb(255, 242, 210),
            Rgba::rgb(210, 170, 70),
            Rgba::rgb(40, 32, 16),
        ),
        ButtonState::Pressed => (
            Rgba::rgb(230, 220, 190),
            Rgba::rgb(180, 140, 50),
            Rgba::rgb(32, 28, 16),
        ),
    };
    fb.fill_rect(x, y, w, h, fill);
    fb.fill_rect(x, y, w, 2, border);
    fb.fill_rect(x, y + h - 2, w, 2, border);
    fb.fill_rect(x, y, 2, h, border);
    fb.fill_rect(x + w - 2, y, 2, h, border);
    font.draw_text_in_box(fb, x, y, w, h, 20, size, text, label);
}

pub fn choices_label(locale: &str) -> &'static str {
    match locale {
        "en" => "Choice",
        "zh-Hans" => "选择",
        _ => "選擇",
    }
}

pub fn ended_label(locale: &str) -> &'static str {
    match locale {
        "en" => "End",
        "zh-Hans" => "终",
        _ => "終",
    }
}

pub fn missing_scene_text(locale: &str, id: &str) -> String {
    match locale {
        "en" => format!("Missing scene {id}"),
        "zh-Hans" => format!("找不到场景 {id}"),
        _ => format!("找不到場景 {id}"),
    }
}

pub fn draw_view(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    view: &View,
    speaker_label: &str,
    assets: &mut Bank,
    say_shown: Option<&str>,
    hide_ui: bool,
    say_more: bool,
    ui_locale: &str,
    msg_box: Option<&str>,
    slide_elapsed_ms: Option<u32>,
) {
    fb.fill(Rgba::rgb(0, 0, 0));
    let cam = &view.camera;
    if let Some(bg) = &view.bg {
        let (dx, dy, dw, dh) = map_rect(cam, 0, 0, WIDTH as i32, HEIGHT as i32);
        if let Some(pic) = assets.get(bg) {
            fb.blit_nearest(pic.width, pic.height, &pic.rgba, dx, dy, dw, dh, pic.opaque);
        } else {
            fb.fill_rect(dx, dy, dw, dh, hash_rgb(bg));
        }
    }
    for ch in &view.chars {
        let to = char_stage_rect(ch, assets);
        let (x, y, w, h) = match view.prev_chars.iter().find(|p| p.id == ch.id) {
            Some(prev)
                if ch.slide_ms.unwrap_or(0) > 0 && char_pose_changed(prev, ch) =>
            {
                let elapsed = slide_elapsed_ms.unwrap_or(u32::MAX);
                let t = (elapsed as f32 / ch.slide_ms.unwrap_or(1) as f32).clamp(0.0, 1.0);
                lerp_rect(char_stage_rect(prev, assets), to, t)
            }
            _ => to,
        };
        let (dx, dy, dw, dh) = map_rect(cam, x, y, w, h);
        if let Some(pic) = assets.character(&ch.id, &ch.face) {
            fb.blit_nearest(pic.width, pic.height, &pic.rgba, dx, dy, dw, dh, pic.opaque);
        } else {
            let key = format!("{}:{}", ch.id, ch.face);
            fb.fill_rect(dx, dy, dw, dh, hash_rgb(&key));
        }
    }
    if let Some(cg) = &view.cg {
        blit_logical_cam(fb, assets, cg, cam);
    }

    if hide_ui {
        return;
    }
    match &view.phase {
        Phase::MissingScene(id) => {
            draw_box(fb, assets, msg_box);
            font.draw_text(
                fb,
                MSG_X + 32,
                MSG_Y + 56,
                36.0,
                &missing_scene_text(ui_locale, id),
                Rgba::rgb(255, 220, 220),
                MSG_X + MSG_W - 32,
            );
        }
        Phase::Ended => {
            draw_box(fb, assets, msg_box);
            font.draw_text(
                fb,
                MSG_X + 32,
                MSG_Y + 56,
                36.0,
                ended_label(ui_locale),
                Rgba::rgb(255, 255, 255),
                MSG_X + MSG_W - 32,
            );
        }
        Phase::Choices => {
            draw_box(fb, assets, msg_box);
            font.draw_text(
                fb,
                MSG_X + 32,
                MSG_Y + SAY_SPEAKER_DY,
                scale.speaker,
                choices_label(ui_locale),
                Rgba::rgb(255, 230, 160),
                MSG_X + MSG_W - 32,
            );
        }
        Phase::Explore => {
            // BG already drawn; chrome (hotspots / verbs) drawn by draw_explore_chrome.
        }
        Phase::Dialogue => {
            if view.say_text.is_some() {
                draw_box(fb, assets, msg_box);
                font.draw_text(
                    fb,
                    MSG_X + 32,
                    MSG_Y + SAY_SPEAKER_DY,
                    scale.speaker,
                    speaker_label,
                    Rgba::rgb(255, 220, 140),
                    MSG_X + MSG_W - 32,
                );
                if let Some(text) = say_shown.or(view.say_text.as_deref()) {
                    font.draw_text(
                        fb,
                        MSG_X + 32,
                        MSG_Y + SAY_BODY_DY,
                        scale.dialogue_body,
                        text,
                        Rgba::rgb(255, 255, 255),
                        MSG_X + MSG_W - 32,
                    );
                }
                if say_more {
                    font.draw_text(
                        fb,
                        MSG_X + MSG_W - 56,
                        MSG_Y + SAY_SPEAKER_DY,
                        24.0,
                        "▼",
                        Rgba::rgb(255, 230, 160),
                        MSG_X + MSG_W - 16,
                    );
                }
            }
        }
    }
}

pub const EXPLORE_ITEM_W: i32 = 168;
pub const EXPLORE_ITEM_H: i32 = 44;
pub const EXPLORE_ITEM_GAP: i32 = 12;

/// Compact centered YU-NO action pill (not full-width choice chrome).
pub const EXPLORE_ACTION_W: i32 = 480;
pub const EXPLORE_ACTION_H: i32 = 52;
/// Gap between action pill bottom and MSG_Y.
pub const EXPLORE_ACTION_GAP_ABOVE_MSG: i32 = 28;

/// Single YU-NO action pill, centered on screen above the message box.
pub fn explore_action_rect() -> (i32, i32, i32, i32) {
    let w = EXPLORE_ACTION_W;
    let h = EXPLORE_ACTION_H;
    let x = (WIDTH as i32 - w) / 2;
    let y = MSG_Y - EXPLORE_ACTION_GAP_ABOVE_MSG - h;
    (x, y, w, h)
}

/// Light YU-NO-style action button (near-white fill, dark text) — not dialogue choice chrome.
pub fn draw_explore_action_button(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    text: &str,
    hover: bool,
) {
    let fill = if hover {
        Rgba::rgb(255, 242, 210) // soft gold tint
    } else {
        Rgba::rgb(248, 248, 252) // near-white
    };
    let border = if hover {
        Rgba::rgb(210, 170, 70)
    } else {
        Rgba::rgb(170, 170, 180)
    };
    let label = if hover {
        Rgba::rgb(40, 32, 16)
    } else {
        Rgba::rgb(28, 28, 36)
    };
    fb.fill_rect(x, y, w, h, fill);
    // 2px border
    fb.fill_rect(x, y, w, 2, border);
    fb.fill_rect(x, y + h - 2, w, 2, border);
    fb.fill_rect(x, y, 2, h, border);
    fb.fill_rect(x + w - 2, y, 2, h, border);
    font.draw_text_in_box(fb, x, y, w, h, 16, scale.explore_pill, text, label);
}

/// Inventory chips sit above the action button.
pub fn explore_item_rect(index: usize) -> (i32, i32, i32, i32) {
    let (_ax, ay, _, _) = explore_action_rect();
    let y = ay - 16 - EXPLORE_ITEM_H;
    let x = 40 + index as i32 * (EXPLORE_ITEM_W + EXPLORE_ITEM_GAP);
    (x, y, EXPLORE_ITEM_W, EXPLORE_ITEM_H)
}

/// YU-NO Explore software cursor glyph (drawn into FB; OS cursor hidden in Explore).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExploreCursorKind {
    /// Default pointer — over action pill / inventory / non-scene UI.
    Arrow,
    /// Magnifying glass — look / empty background 「查看」.
    Look,
    /// Footsteps — move.
    Move,
    /// Speech bubble — talk.
    Talk,
    /// Hand — take / open.
    Hand,
    /// Hand + use mark — pending item aim/drag.
    Use,
}

/// Map primary explore verb (or item-use) to a cursor glyph.
///
/// `over_ui`: pointer is on the action pill or inventory strip → always Arrow.
/// `pending_item`: Aim/Drag item mode → Use regardless of hovered verb.
pub fn explore_cursor_kind(
    over_ui: bool,
    pending_item: bool,
    verb: Option<&str>,
) -> ExploreCursorKind {
    if over_ui {
        return ExploreCursorKind::Arrow;
    }
    if pending_item {
        return ExploreCursorKind::Use;
    }
    explore_cursor_from_verb(verb)
}

/// Verb id → cursor (no UI / item overrides). Unknown → Look (investigate default).
pub fn explore_cursor_from_verb(verb: Option<&str>) -> ExploreCursorKind {
    match verb {
        Some("move") => ExploreCursorKind::Move,
        Some("talk") => ExploreCursorKind::Talk,
        Some("take") | Some("open") => ExploreCursorKind::Hand,
        Some("use") => ExploreCursorKind::Use,
        Some("look") | None => ExploreCursorKind::Look,
        Some(_) => ExploreCursorKind::Look,
    }
}

/// Logical size of procedural Explore cursors (readable on 1280×720).
/// Glyph art is authored at [`CURSOR_ART`] and scaled via [`cs`].
const CURSOR_SIZE: i32 = 63;
const CURSOR_ART: i32 = 28;

/// Scale a coordinate / thickness from the 28×28 art space into [`CURSOR_SIZE`].
#[inline]
fn cs(v: i32) -> i32 {
    (v * CURSOR_SIZE + CURSOR_ART / 2) / CURSOR_ART
}

fn cursor_hotspot(kind: ExploreCursorKind) -> (i32, i32) {
    match kind {
        ExploreCursorKind::Arrow => (cs(1), cs(1)),
        ExploreCursorKind::Look => (cs(10), cs(10)),
        ExploreCursorKind::Move => (cs(14), cs(22)),
        ExploreCursorKind::Talk => (cs(14), cs(22)),
        ExploreCursorKind::Hand | ExploreCursorKind::Use => (cs(8), cs(2)),
    }
}

/// Blit a procedural Explore cursor at logical mouse position.
pub fn draw_explore_cursor(fb: &mut Framebuffer, kind: ExploreCursorKind, lx: i32, ly: i32) {
    let (hx, hy) = cursor_hotspot(kind);
    let ox = lx - hx;
    let oy = ly - hy;
    let mut buf = [0u8; (CURSOR_SIZE * CURSOR_SIZE * 4) as usize];
    paint_cursor_glyph(&mut buf, kind);
    fb.blit_nearest(
        CURSOR_SIZE as u32,
        CURSOR_SIZE as u32,
        &buf,
        ox,
        oy,
        CURSOR_SIZE,
        CURSOR_SIZE,
        false,
    );
}

fn buf_put(buf: &mut [u8], x: i32, y: i32, c: Rgba) {
    if x < 0 || y < 0 || x >= CURSOR_SIZE || y >= CURSOR_SIZE {
        return;
    }
    let i = ((y * CURSOR_SIZE + x) * 4) as usize;
    if c.a == 0 {
        return;
    }
    if c.a == 255 || buf[i + 3] == 0 {
        buf[i] = c.r;
        buf[i + 1] = c.g;
        buf[i + 2] = c.b;
        buf[i + 3] = c.a;
        return;
    }
    let a = u32::from(c.a);
    let ia = 255 - a;
    buf[i] = ((u32::from(c.r) * a + u32::from(buf[i]) * ia) / 255) as u8;
    buf[i + 1] = ((u32::from(c.g) * a + u32::from(buf[i + 1]) * ia) / 255) as u8;
    buf[i + 2] = ((u32::from(c.b) * a + u32::from(buf[i + 2]) * ia) / 255) as u8;
    buf[i + 3] = 255;
}

fn buf_fill_rect(buf: &mut [u8], x: i32, y: i32, w: i32, h: i32, c: Rgba) {
    for yy in y..(y + h) {
        for xx in x..(x + w) {
            buf_put(buf, xx, yy, c);
        }
    }
}

fn buf_circle(buf: &mut [u8], cx: i32, cy: i32, r: i32, stroke: i32, c: Rgba, fill: bool) {
    let r2 = r * r;
    let r_in = (r - stroke).max(0);
    let r_in2 = r_in * r_in;
    for y in (cy - r)..=(cy + r) {
        for x in (cx - r)..=(cx + r) {
            let d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
            if fill {
                if d <= r2 {
                    buf_put(buf, x, y, c);
                }
            } else if d <= r2 && d >= r_in2 {
                buf_put(buf, x, y, c);
            }
        }
    }
}

fn paint_cursor_glyph(buf: &mut [u8], kind: ExploreCursorKind) {
    let white = Rgba::rgb(255, 255, 255);
    let black = Rgba::rgb(20, 20, 28);
    let gold = Rgba::rgb(255, 220, 120);
    let outline = Rgba { r: 10, g: 10, b: 16, a: 220 };
    match kind {
        ExploreCursorKind::Arrow => {
            // Classic pointer: filled triangle with dark outline (art-space pts → cs).
            let pts = [
                (cs(0), cs(0)),
                (cs(0), cs(22)),
                (cs(6), cs(17)),
                (cs(11), cs(27)),
                (cs(15), cs(25)),
                (cs(10), cs(15)),
                (cs(18), cs(15)),
            ];
            fill_poly(buf, &pts, white);
            stroke_poly(buf, &pts, outline);
        }
        ExploreCursorKind::Look => {
            // Magnifying glass: ring + handle.
            let cx = cs(10);
            let cy = cs(10);
            let stroke = cs(1).max(1);
            buf_circle(buf, cx, cy, cs(9), stroke, outline, false);
            buf_circle(buf, cx, cy, cs(8), stroke, white, false);
            buf_circle(buf, cx, cy, cs(7), stroke, outline, false);
            // glass tint
            buf_circle(
                buf,
                cx,
                cy,
                cs(5),
                stroke,
                Rgba {
                    r: 180,
                    g: 220,
                    b: 255,
                    a: 90,
                },
                true,
            );
            // handle
            let handle_n = cs(8);
            let thick = cs(3).max(2);
            let gold_t = cs(1).max(1);
            for i in 0..handle_n {
                let x = cs(16) + i;
                let y = cs(16) + i;
                buf_fill_rect(buf, x, y, thick, thick, outline);
                buf_fill_rect(buf, x + gold_t, y + gold_t, gold_t, gold_t, gold);
            }
        }
        ExploreCursorKind::Move => {
            // Two footprints.
            for (ox0, oy0) in [(6, 6), (14, 12)] {
                let ox = cs(ox0);
                let oy = cs(oy0);
                buf_fill_rect(buf, ox, oy, cs(6), cs(10), outline);
                buf_fill_rect(buf, ox + cs(1), oy + cs(1), cs(4), cs(8), white);
                // toes
                buf_fill_rect(buf, ox - cs(1), oy - cs(2), cs(2), cs(3), white);
                buf_fill_rect(buf, ox + cs(2), oy - cs(3), cs(2), cs(3), white);
                buf_fill_rect(buf, ox + cs(5), oy - cs(2), cs(2), cs(3), white);
            }
        }
        ExploreCursorKind::Talk => {
            // Speech bubble.
            buf_fill_rect(buf, cs(3), cs(2), cs(20), cs(14), outline);
            buf_fill_rect(buf, cs(5), cs(4), cs(16), cs(10), white);
            // dots
            let ds = cs(2).max(2);
            buf_fill_rect(buf, cs(8), cs(7), ds, ds, black);
            buf_fill_rect(buf, cs(13), cs(7), ds, ds, black);
            buf_fill_rect(buf, cs(18), cs(7), ds, ds, black);
            // tail
            fill_poly(
                buf,
                &[(cs(8), cs(15)), (cs(12), cs(15)), (cs(6), cs(24))],
                outline,
            );
            fill_poly(
                buf,
                &[(cs(9), cs(15)), (cs(11), cs(15)), (cs(7), cs(21))],
                white,
            );
        }
        ExploreCursorKind::Hand => {
            paint_hand(buf, false);
        }
        ExploreCursorKind::Use => {
            paint_hand(buf, true);
        }
    }
}

fn paint_hand(buf: &mut [u8], use_mark: bool) {
    let white = Rgba::rgb(255, 255, 255);
    let outline = Rgba { r: 10, g: 10, b: 16, a: 220 };
    let gold = Rgba::rgb(255, 200, 80);
    // Palm
    buf_fill_rect(buf, cs(6), cs(10), cs(14), cs(12), outline);
    buf_fill_rect(buf, cs(7), cs(11), cs(12), cs(10), white);
    // Fingers up
    for (fx0, fh0) in [(7, 10), (11, 12), (15, 11), (19, 8)] {
        let fx = cs(fx0);
        let fh = cs(fh0);
        let base = cs(10);
        buf_fill_rect(buf, fx, base - fh, cs(3), fh + cs(2), outline);
        buf_fill_rect(buf, fx + cs(1), base + cs(1) - fh, cs(1).max(1), fh, white);
    }
    if use_mark {
        // Small spark / item diamond near fingertip.
        fill_poly(
            buf,
            &[
                (cs(20), cs(2)),
                (cs(24), cs(6)),
                (cs(20), cs(10)),
                (cs(16), cs(6)),
            ],
            outline,
        );
        fill_poly(
            buf,
            &[
                (cs(20), cs(4)),
                (cs(22), cs(6)),
                (cs(20), cs(8)),
                (cs(18), cs(6)),
            ],
            gold,
        );
    }
}

fn fill_poly(buf: &mut [u8], pts: &[(i32, i32)], c: Rgba) {
    if pts.len() < 3 {
        return;
    }
    let min_y = pts.iter().map(|p| p.1).min().unwrap();
    let max_y = pts.iter().map(|p| p.1).max().unwrap();
    for y in min_y..=max_y {
        let mut nodes = Vec::new();
        let mut j = pts.len() - 1;
        for i in 0..pts.len() {
            let (xi, yi) = pts[i];
            let (xj, yj) = pts[j];
            if (yi < y && yj >= y) || (yj < y && yi >= y) {
                let denom = yj - yi;
                if denom != 0 {
                    nodes.push(xi + (y - yi) * (xj - xi) / denom);
                }
            }
            j = i;
        }
        nodes.sort_unstable();
        let mut k = 0;
        while k + 1 < nodes.len() {
            let x0 = nodes[k];
            let x1 = nodes[k + 1];
            if x1 >= x0 {
                buf_fill_rect(buf, x0, y, (x1 - x0).max(1), 1, c);
            }
            k += 2;
        }
    }
}

fn stroke_poly(buf: &mut [u8], pts: &[(i32, i32)], c: Rgba) {
    if pts.is_empty() {
        return;
    }
    for i in 0..pts.len() {
        let (x0, y0) = pts[i];
        let (x1, y1) = pts[(i + 1) % pts.len()];
        line_pix(buf, x0, y0, x1, y1, c);
    }
}

fn line_pix(buf: &mut [u8], mut x0: i32, mut y0: i32, x1: i32, y1: i32, c: Rgba) {
    let dx = (x1 - x0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let dy = -(y1 - y0).abs();
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx + dy;
    loop {
        buf_put(buf, x0, y0, c);
        if x0 == x1 && y0 == y1 {
            break;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x0 += sx;
        }
        if e2 <= dx {
            err += dx;
            y0 += sy;
        }
    }
}

/// Action pill + inventory. Hotspot outlines are off by default (YU-NO discovery);
/// pass `show_hotspot_outlines` (e.g. `GALENG_EXPLORE_DEBUG_HOTSPOTS`) to stroke them.
pub fn draw_explore_chrome(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    action_label: Option<&str>,
    action_hover: bool,
    inventory: &[(String, String, bool)],
    hotspots: &[(String, galeng_schema::HotspotShape)],
    hover_hotspot: Option<&str>,
    hover_item: Option<&str>,
    show_hotspot_outlines: bool,
) {
    if show_hotspot_outlines {
        let outline = Rgba { r: 80, g: 200, b: 255, a: 120 };
        let hover = Rgba { r: 255, g: 220, b: 80, a: 160 };
        for (id, shape) in hotspots {
            let color = if hover_hotspot == Some(id.as_str()) {
                hover
            } else {
                outline
            };
            match shape {
                galeng_schema::HotspotShape::Rect { x, y, w, h } => {
                    stroke_rect(fb, *x, *y, *w, *h, color, 2);
                }
                galeng_schema::HotspotShape::Polygon { points } => {
                    if let Some((min_x, min_y, max_x, max_y)) = poly_bounds(points) {
                        stroke_rect(fb, min_x, min_y, max_x - min_x, max_y - min_y, color, 1);
                    }
                }
            }
        }
    }

    if let Some(label) = action_label {
        let (x, y, w, h) = explore_action_rect();
        draw_explore_action_button(fb, font, scale, x, y, w, h, label, action_hover);
    }

    if !inventory.is_empty() {
        let (_ix0, inv_y, _, _) = explore_item_rect(0);
        font.draw_text(
            fb,
            40,
            inv_y - 28,
            scale.inventory,
            "道具",
            Rgba::rgb(255, 245, 220),
            400,
        );
        for (i, (item_id, label, selected)) in inventory.iter().enumerate() {
            let (x, y, w, h) = explore_item_rect(i);
            let state = if hover_item == Some(item_id.as_str()) || *selected {
                ButtonState::Hover
            } else {
                ButtonState::Idle
            };
            draw_button(fb, font, x, y, w, h, label, scale.inventory, state);
        }
    }
}

fn poly_bounds(points: &[[i32; 2]]) -> Option<(i32, i32, i32, i32)> {
    let mut it = points.iter();
    let first = it.next()?;
    let mut min_x = first[0];
    let mut min_y = first[1];
    let mut max_x = first[0];
    let mut max_y = first[1];
    for p in it {
        min_x = min_x.min(p[0]);
        min_y = min_y.min(p[1]);
        max_x = max_x.max(p[0]);
        max_y = max_y.max(p[1]);
    }
    Some((min_x, min_y, max_x, max_y))
}

fn stroke_rect(fb: &mut Framebuffer, x: i32, y: i32, w: i32, h: i32, color: Rgba, t: i32) {
    if w <= 0 || h <= 0 {
        return;
    }
    fb.fill_rect(x, y, w, t, color);
    fb.fill_rect(x, y + h - t, w, t, color);
    fb.fill_rect(x, y, t, h, color);
    fb.fill_rect(x + w - t, y, t, h, color);
}

/// Hit-test the single YU-NO action button.
pub fn hit_explore_action(lx: i32, ly: i32) -> bool {
    let (x, y, w, h) = explore_action_rect();
    lx >= x && lx < x + w && ly >= y && ly < y + h
}

/// Hit-test explore inventory strip. Returns item id.
pub fn hit_explore_item(lx: i32, ly: i32, inventory: &[(String, String, bool)]) -> Option<String> {
    for (i, (item_id, _label, _sel)) in inventory.iter().enumerate() {
        let (x, y, w, h) = explore_item_rect(i);
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(item_id.clone());
        }
    }
    None
}

pub fn draw_one_choice(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    view: &View,
    index: usize,
    choice_sel: usize,
    hover_choice: Option<usize>,
    pressed_choice: Option<usize>,
) -> Option<(i32, i32, i32, i32)> {
    let opt = view.choices.get(index)?;
    let n = view.choices.len();
    let (x, y, w, h) = choice_rect(index, n);
    draw_button(
        fb,
        font,
        x,
        y,
        w,
        h,
        &opt.text,
        scale.menu,
        button_state(index, choice_sel, hover_choice, pressed_choice),
    );
    Some((x, y, w, h))
}

pub fn draw_choice_buttons(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    view: &View,
    choice_sel: usize,
    hover_choice: Option<usize>,
    pressed_choice: Option<usize>,
) {
    for i in 0..view.choices.len() {
        let _ = draw_one_choice(fb, font, scale, view, i, choice_sel, hover_choice, pressed_choice);
    }
}

pub fn draw_title(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    locale: &str,
    game_title: &str,
    selected: usize,
    hover: Option<usize>,
    pressed: Option<usize>,
    assets: &mut Bank,
    bg: Option<&str>,
    hide_game_title: bool,
    buttons: Option<&TitleButtons>,
    sizes: &[Option<(u32, u32)>; TITLE_COUNT],
) {
    fb.fill(Rgba::rgb(8, 8, 16));
    if let Some(logical) = bg {
        if let Some(pic) = assets.get(logical) {
            fb.blit_nearest(
                pic.width,
                pic.height,
                &pic.rgba,
                0,
                0,
                WIDTH as i32,
                HEIGHT as i32,
                pic.opaque,
            );
        } else {
            fb.fill_rect(0, 0, WIDTH as i32, HEIGHT as i32, hash_rgb(logical));
        }
    }
    if !hide_game_title {
        font.draw_text(
            fb,
            200,
            280,
            scale.title,
            game_title,
            Rgba::rgb(255, 230, 160),
            1720,
        );
    }
    for i in 0..TITLE_COUNT {
        let spec = title_spec(buttons, i);
        let (x, y, w, h) = title_rect(i, spec, sizes[i]);
        let caption = title_caption(locale, spec, i);
        let hot = hover == Some(i) || pressed == Some(i) || (hover.is_none() && selected == i);
        if let Some(logical) = title_face(spec, hot) {
            if let Some(pic) = assets.get(logical) {
                fb.blit_nearest(pic.width, pic.height, &pic.rgba, x, y, w, h, pic.opaque);
            } else {
                fb.fill_rect(x, y, w, h, hash_rgb(logical));
            }
            if !caption.is_empty() {
                font.draw_text_in_box(
                    fb,
                    x,
                    y,
                    w,
                    h,
                    20,
                    scale.menu,
                    &caption,
                    Rgba::rgb(255, 255, 255),
                );
            }
        } else {
            draw_button(
                fb,
                font,
                x,
                y,
                w,
                h,
                &caption,
                scale.menu,
                button_state(i, selected, hover, pressed),
            );
        }
    }
}

pub fn draw_gallery(
    fb: &mut Framebuffer,
    font: &GameFont,
    locale: &str,
    ids: &[&str],
    selected: usize,
    unlocked: &[bool],
) {
    let labels: Vec<String> = ids
        .iter()
        .enumerate()
        .map(|(i, id)| gallery::row_label(id, unlocked.get(i).copied().unwrap_or(false)))
        .collect();
    let refs: Vec<&str> = labels.iter().map(String::as_str).collect();
    draw_id_list(
        fb,
        font,
        gallery::gallery_title(locale),
        &refs,
        selected,
        None,
    );
}

pub fn draw_music(
    fb: &mut Framebuffer,
    font: &GameFont,
    locale: &str,
    ids: &[&str],
    selected: usize,
    playing: Option<usize>,
) {
    draw_id_list(
        fb,
        font,
        music::music_title(locale),
        ids,
        selected,
        playing,
    );
}

fn draw_id_list(
    fb: &mut Framebuffer,
    font: &GameFont,
    heading: &str,
    ids: &[&str],
    selected: usize,
    playing: Option<usize>,
) {
    fb.fill_rect(
        0,
        0,
        WIDTH as i32,
        HEIGHT as i32,
        Rgba {
            r: 0,
            g: 0,
            b: 0,
            a: 180,
        },
    );
    font.draw_text(
        fb,
        560,
        200,
        32.0,
        heading,
        Rgba::rgb(255, 230, 160),
        1360,
    );
    if ids.is_empty() {
        let (x, y, w, _h) = gallery::row_rect(0);
        font.draw_text(
            fb,
            x + 24,
            y + 40,
            28.0,
            gallery::empty_label(""),
            Rgba::rgb(180, 180, 180),
            x + w - 24,
        );
        return;
    }
    for (i, id) in ids.iter().enumerate() {
        let (x, y, w, h) = gallery::row_rect(i);
        let mark = if playing == Some(i) { "> " } else { "" };
        let label = format!("{mark}{id}");
        draw_button(
            fb,
            font,
            x,
            y,
            w,
            h,
            &label,
            28.0,
            button_state(i, selected, None, None),
        );
    }
}

pub fn draw_movie_skip(fb: &mut Framebuffer, font: &GameFont, locale: &str) {
    let hint = crate::movie::skip_hint(locale);
    font.draw_text(
        fb,
        1400,
        1000,
        28.0,
        hint,
        Rgba::rgb(230, 230, 230),
        500,
    );
}

pub fn draw_cg(fb: &mut Framebuffer, assets: &mut Bank, logical: &str) {
    fb.fill(Rgba::rgb(0, 0, 0));
    blit_logical_full(fb, assets, logical);
}

fn blit_logical_full(fb: &mut Framebuffer, assets: &mut Bank, logical: &str) {
    blit_logical_cam(fb, assets, logical, &galeng_schema::Camera::default());
}

fn blit_logical_cam(
    fb: &mut Framebuffer,
    assets: &mut Bank,
    logical: &str,
    cam: &galeng_schema::Camera,
) {
    let (dx, dy, dw, dh) = map_rect(cam, 0, 0, WIDTH as i32, HEIGHT as i32);
    if let Some(pic) = assets.get(logical) {
        fb.blit_nearest(pic.width, pic.height, &pic.rgba, dx, dy, dw, dh, pic.opaque);
    } else {
        fb.fill_rect(dx, dy, dw, dh, hash_rgb(logical));
    }
}

pub fn draw_settings(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    locale: &str,
    settings: &Settings,
    selected: usize,
) {
    fb.fill_rect(
        0,
        0,
        WIDTH as i32,
        HEIGHT as i32,
        Rgba {
            r: 0,
            g: 0,
            b: 0,
            a: 160,
        },
    );
    font.draw_text(
        fb,
        360,
        180,
        scale.menu,
        settings::settings_title(locale),
        Rgba::rgb(255, 230, 160),
        1560,
    );
    for i in 0..SETTINGS_ROWS {
        let (x, y, w, h) = settings::row_rect(i);
        draw_button(
            fb,
            font,
            x,
            y,
            w,
            h,
            "",
            scale.settings,
            button_state(i, selected, None, None),
        );
        if i == FULLSCREEN_ROW || i == AUTO_PLAY_ROW || i == SKIP_UNREAD_ROW {
            let on = if i == FULLSCREEN_ROW {
                settings.fullscreen
            } else if i == AUTO_PLAY_ROW {
                settings.auto_play
            } else {
                settings.skip_unread
            };
            let name = if i == FULLSCREEN_ROW {
                settings::fullscreen_label(locale)
            } else if i == AUTO_PLAY_ROW {
                settings::auto_play_label(locale)
            } else {
                settings::skip_unread_label(locale)
            };
            let label = format!("{}  {}", name, settings::on_off(locale, on));
            font.draw_text_in_box(fb, x, y, w, h, 24, scale.settings, &label, Rgba::rgb(28, 28, 36));
            continue;
        }
        if i == UI_LANG_ROW {
            let label = format!(
                "{}  {}",
                settings::ui_lang_label(locale),
                settings.ui_language.choice_label(locale)
            );
            font.draw_text_in_box(fb, x, y, w, h, 24, scale.settings, &label, Rgba::rgb(28, 28, 36));
            continue;
        }
        if i == TEXT_SPEED_ROW {
            let label = format!(
                "{}  {}",
                settings::text_speed_label(locale),
                settings.text_speed
            );
            font.draw_text_in_box(fb, x, y, w, h, 24, scale.settings, &label, Rgba::rgb(28, 28, 36));
            continue;
        }
        if i == AUTO_DELAY_ROW {
            let label = format!(
                "{}  {} ms",
                settings::auto_delay_label(locale),
                settings.auto_delay_ms
            );
            font.draw_text_in_box(fb, x, y, w, h, 24, scale.settings, &label, Rgba::rgb(28, 28, 36));
            continue;
        }
        let vol = settings.get(i);
        let label = format!("{}  {vol}", settings::channel_label(locale, i));
        font.draw_text_in_box(fb, x, y, 380, h, 24, scale.settings, &label, Rgba::rgb(28, 28, 36));
        let bar_x = x + 400;
        let bar_y = y + 28;
        let bar_w = w - 440;
        let bar_h = 20;
        fb.fill_rect(
            bar_x,
            bar_y,
            bar_w,
            bar_h,
            Rgba {
                r: 200,
                g: 200,
                b: 210,
                a: 255,
            },
        );
        let filled = (bar_w as i32 * i32::from(vol) / 100).max(0);
        if filled > 0 {
            fb.fill_rect(
                bar_x,
                bar_y,
                filled,
                bar_h,
                Rgba {
                    r: 180,
                    g: 160,
                    b: 80,
                    a: 255,
                },
            );
        }
    }
}

pub fn draw_menu(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    locale: &str,
    selected: usize,
    hover: Option<usize>,
    pressed: Option<usize>,
    assets: &mut Bank,
    buttons: Option<&PauseButtons>,
    sizes: &[Option<(u32, u32)>; MENU_COUNT],
) {
    fb.fill_rect(
        0,
        0,
        WIDTH as i32,
        HEIGHT as i32,
        Rgba {
            r: 0,
            g: 0,
            b: 0,
            a: 140,
        },
    );
    for i in 0..MENU_COUNT {
        let spec = menu_spec(buttons, i);
        let (x, y, w, h) = menu_box(i, spec, sizes[i]);
        let caption = menu_caption(locale, spec, i);
        let hot = hover == Some(i) || pressed == Some(i) || (hover.is_none() && selected == i);
        if let Some(logical) = title_face(spec, hot) {
            if let Some(pic) = assets.get(logical) {
                fb.blit_nearest(pic.width, pic.height, &pic.rgba, x, y, w, h, pic.opaque);
            } else {
                fb.fill_rect(x, y, w, h, hash_rgb(logical));
            }
            if !caption.is_empty() {
                font.draw_text_in_box(
                    fb,
                    x,
                    y,
                    w,
                    h,
                    20,
                    scale.menu,
                    &caption,
                    Rgba::rgb(255, 255, 255),
                );
            }
        } else {
            draw_button(
                fb,
                font,
                x,
                y,
                w,
                h,
                &caption,
                scale.menu,
                button_state(i, selected, hover, pressed),
            );
        }
    }
}

pub fn draw_slots(
    fb: &mut Framebuffer,
    font: &GameFont,
    locale: &str,
    saving: bool,
    selected: usize,
    scenes: &[Option<String>; SLOT_COUNT],
    thumbs: &[Option<(u32, u32, Vec<u8>)>; SLOT_COUNT],
) {
    fb.fill_rect(
        0,
        0,
        WIDTH as i32,
        HEIGHT as i32,
        Rgba {
            r: 0,
            g: 0,
            b: 0,
            a: 140,
        },
    );
    font.draw_text(
        fb,
        560,
        190,
        32.0,
        slot_title(locale, saving),
        Rgba::rgb(255, 230, 160),
        1360,
    );
    for i in 0..SLOT_COUNT {
        let (x, y, w, h) = file_slot_rect(i);
        draw_button(
            fb,
            font,
            x,
            y,
            w,
            h,
            "",
            28.0,
            button_state(i, selected, None, None),
        );
        let text_x = if let Some((tw, th, rgba)) = &thumbs[i] {
            fb.blit_nearest(*tw, *th, rgba, x + 8, y + 4, 80, 44, false);
            x + 96
        } else {
            x + 20
        };
        let text = slot_row_label(index_to_slot(i), scenes[i].as_deref());
        font.draw_text_in_box(
            fb,
            text_x,
            y,
            x + w - text_x,
            h,
            8,
            28.0,
            &text,
            Rgba::rgb(255, 255, 255),
        );
    }
}

pub fn draw_backlog(
    fb: &mut Framebuffer,
    font: &GameFont,
    locale: &str,
    rows: &[(String, String, bool)],
) {
    fb.fill_rect(
        0,
        0,
        WIDTH as i32,
        HEIGHT as i32,
        Rgba {
            r: 0,
            g: 0,
            b: 0,
            a: 160,
        },
    );
    fb.fill_rect(
        120,
        80,
        1680,
        660,
        Rgba {
            r: 12,
            g: 12,
            b: 22,
            a: 230,
        },
    );
    font.draw_text(
        fb,
        152,
        130,
        32.0,
        backlog::title(locale),
        Rgba::rgb(255, 230, 160),
        1760,
    );
    for (i, (speaker, text, jumpable)) in rows.iter().enumerate() {
        let y = 180 + (i as i32) * 54;
        let speaker_color = if *jumpable {
            Rgba::rgb(255, 220, 140)
        } else {
            Rgba::rgb(140, 130, 120)
        };
        let text_color = if *jumpable {
            Rgba::rgb(255, 255, 255)
        } else {
            Rgba::rgb(150, 150, 150)
        };
        font.draw_text(fb, 152, y, 26.0, speaker, speaker_color, 400);
        font.draw_text(fb, 420, y, 28.0, text, text_color, 1760);
    }
}

pub fn draw_hud(
    fb: &mut Framebuffer,
    font: &GameFont,
    scale: &TypeScale,
    locale: &str,
    hover: Option<usize>,
    pressed: Option<usize>,
    auto_on: bool,
    skip_on: bool,
) {
    let names = crate::hud::hud_labels(locale);
    for i in 0..crate::hud::HUD_COUNT {
        let (x, y, w, h) = crate::hud::hud_rect(i);
        let mut label = names[i].to_string();
        if i == 0 && auto_on {
            label.push('*');
        }
        if i == 1 && skip_on {
            label.push('*');
        }
        draw_button(
            fb,
            font,
            x,
            y,
            w,
            h,
            &label,
            scale.hud,
            button_state(i, usize::MAX, hover, pressed),
        );
    }
}

fn draw_box(fb: &mut Framebuffer, assets: &mut Bank, msg_box: Option<&str>) {
    if let Some(logical) = msg_box {
        if let Some(pic) = assets.get(logical) {
            fb.blit_nearest(
                pic.width,
                pic.height,
                &pic.rgba,
                MSG_X,
                MSG_Y,
                MSG_W,
                MSG_H,
                pic.opaque,
            );
            return;
        }
    }
    // Soft fallback when no msgBox asset: translucent-looking dark panel + light edge.
    fb.fill_rect(MSG_X, MSG_Y, MSG_W, MSG_H, Rgba::rgb(28, 30, 42));
    let edge = Rgba::rgb(200, 185, 140);
    fb.fill_rect(MSG_X, MSG_Y, MSG_W, 2, edge);
    fb.fill_rect(MSG_X, MSG_Y + MSG_H - 2, MSG_W, 2, edge);
    fb.fill_rect(MSG_X, MSG_Y, 2, MSG_H, edge);
    fb.fill_rect(MSG_X + MSG_W - 2, MSG_Y, 2, MSG_H, edge);
    // Inner highlight band
    fb.fill_rect(MSG_X + 2, MSG_Y + 2, MSG_W - 4, 1, Rgba::rgb(255, 245, 220));
}

fn char_pose_changed(a: &galeng_schema::CharOnStage, b: &galeng_schema::CharOnStage) -> bool {
    a.slot != b.slot || a.x != b.x || a.y != b.y
}

fn lerp_rect(
    from: (i32, i32, i32, i32),
    to: (i32, i32, i32, i32),
    t: f32,
) -> (i32, i32, i32, i32) {
    let mix = |a: i32, b: i32| (a as f32 + (b - a) as f32 * t).round() as i32;
    (mix(from.0, to.0), mix(from.1, to.1), mix(from.2, to.2), mix(from.3, to.3))
}

fn char_stage_rect(ch: &galeng_schema::CharOnStage, assets: &mut Bank) -> (i32, i32, i32, i32) {
    let (sx, sy, sw, sh) = slot_rect(ch.slot);
    if let Some(pic) = assets.character(&ch.id, &ch.face) {
        let (x, y, w, h) = fit_bottom_center(pic.width, pic.height, sx, sy, sw, sh);
        (x + ch.x, y + ch.y, w, h)
    } else {
        (sx + ch.x, sy + ch.y, sw, sh)
    }
}

fn slot_rect(slot: Slot) -> (i32, i32, i32, i32) {
    match slot {
        Slot::Left => (360, 200, 520, 880),
        Slot::Center => (700, 160, 520, 920),
        Slot::Right => (1040, 200, 520, 880),
    }
}

pub fn letterbox(
    window_w: u32,
    window_h: u32,
) -> (i32, i32, u32, u32, f32) {
    let scale = (window_w as f32 / WIDTH as f32).min(window_h as f32 / HEIGHT as f32);
    let w = (WIDTH as f32 * scale).round() as u32;
    let h = (HEIGHT as f32 * scale).round() as u32;
    let x = (window_w.saturating_sub(w) / 2) as i32;
    let y = (window_h.saturating_sub(h) / 2) as i32;
    (x, y, w, h, scale)
}

pub fn window_to_logical(mx: i32, my: i32, window_w: u32, window_h: u32) -> Option<(i32, i32)> {
    let (x, y, w, h, _scale) = letterbox(window_w, window_h);
    if mx < x || my < y || mx >= x + w as i32 || my >= y + h as i32 {
        return None;
    }
    let lx = ((mx - x) as f32 * WIDTH as f32 / w as f32) as i32;
    let ly = ((my - y) as f32 * HEIGHT as f32 / h as f32) as i32;
    Some((lx, ly))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mouse_hover_does_not_also_light_keyboard_sel() {
        assert_eq!(button_state(0, 0, Some(1), None), ButtonState::Idle);
        assert_eq!(button_state(1, 0, Some(1), None), ButtonState::Hover);
        assert_eq!(button_state(0, 0, None, None), ButtonState::Hover);
    }

    #[test]
    fn fourth_choice_stays_on_screen() {
        let (_x, y, _w, h) = choice_rect(3, 4);
        assert!(y >= 0);
        assert!(y + h <= HEIGHT as i32);
        assert_eq!(hit_choice(MSG_X + 50, y + 8, 4), Some(3));
    }

    #[test]
    fn chrome_labels_three_locales() {
        assert_eq!(choices_label("en"), "Choice");
        assert_eq!(ended_label("en"), "End");
        assert_eq!(missing_scene_text("en", "park_02"), "Missing scene park_02");
        assert_eq!(choices_label("zh-Hans"), "选择");
        assert_eq!(ended_label("zh-Hans"), "终");
        assert_eq!(missing_scene_text("zh-Hans", "x"), "找不到场景 x");
        assert_eq!(choices_label("zh-Hant"), "選擇");
        assert_eq!(ended_label("zh-Hant"), "終");
        assert_eq!(missing_scene_text("zh-Hant", "x"), "找不到場景 x");
    }

    #[test]
    fn button_glyph_sits_inside_box() {
        let font = GameFont::load_system().expect("system font");
        let mut fb = Framebuffer::new();
        let (x, y, w, h) = (100, 200, 400, 56);
        draw_button(&mut fb, &font, x, y, w, h, "開始遊戲", 32.0, ButtonState::Idle);
        let pixels = fb.count_nonblack_in(x as u32, y as u32, w as u32, h as u32);
        assert!(pixels > 40, "expected label pixels inside the button");
        let above = fb.count_nonblack_in(x as u32, (y - 8).max(0) as u32, w as u32, 6);
        assert_eq!(above, 0, "label leaked above the box");
    }

    #[test]
    fn explore_action_button_stays_above_message_box() {
        let (x, y, w, h) = explore_action_rect();
        assert_eq!((x, y, w, h), (720, 820, 480, 52));
        assert!(y >= 0, "action y={y}");
        assert!(y + h <= MSG_Y, "action overlaps message box: bottom={}", y + h);
        assert!(
            MSG_Y - (y + h) >= 8,
            "action needs ≥8px gap above msg box, gap={}",
            MSG_Y - (y + h)
        );
        assert!(
            y + h < crate::hud::hud_y(),
            "action overlaps HUD y={}",
            crate::hud::hud_y()
        );
        // Compact centered pill — not full-width choice chrome.
        assert!(w <= 560, "action too wide: {w}");
        assert!(w >= 420, "action too narrow: {w}");
        assert!(h >= 48 && h <= 56, "action height {h}");
        let cx = x + w / 2;
        assert!(
            (cx - WIDTH as i32 / 2).abs() <= 1,
            "action not centered: cx={cx}"
        );
        assert!(w < MSG_W - 80, "action still looks like choice_rect width");
        // Message box stays on-screen.
        assert!(MSG_X >= 0 && MSG_Y >= 0);
        assert!(MSG_X + MSG_W <= WIDTH as i32);
        assert!(MSG_Y + MSG_H <= HEIGHT as i32);
        assert!(hit_explore_action(x + w / 2, y + h / 2));
        assert!(!hit_explore_action(WIDTH as i32 / 2, HEIGHT as i32 - 72));
        // Far left/right of old full-width bar must miss.
        assert!(!hit_explore_action(MSG_X + 40, y + h / 2));
        assert!(!hit_explore_action(MSG_X + MSG_W - 40, y + h / 2));
    }

    #[test]
    fn explore_action_button_paints_light_not_dark_idle() {
        let font = GameFont::load_system()
            .or_else(|_| {
                let p = std::path::PathBuf::from(
                    "/usr/share/fonts/truetype/sand-box/google/Sen/Sen-VariableFont_wght.ttf",
                );
                let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
                GameFont::from_bytes(bytes, p)
            })
            .expect("font");
        let mut fb = Framebuffer::new();
        // Scene-ish mid-gray so near-white button stands out.
        fb.fill(Rgba::rgb(90, 90, 100));
        let (x, y, w, h) = explore_action_rect();
        draw_explore_action_button(&mut fb, &font, &TypeScale::default(), x, y, w, h, "開 · 書桌", false);
        // Sample near-left interior (avoid centered glyph) — near-white, not dark Idle.
        let sx = x + 8;
        let sy = y + h / 2;
        let i = ((sy as u32 * WIDTH + sx as u32) * 4) as usize;
        let (r, g, b) = (fb.pixels[i], fb.pixels[i + 1], fb.pixels[i + 2]);
        assert!(r > 200 && g > 200 && b > 200, "expected light fill, got rgb({r},{g},{b})");
    }

    #[test]
    fn explore_item_strip_above_action_button() {
        let inv = vec![("key".into(), "黃銅鎖匙".into(), true)];
        let (_ax, ay, _aw, _ah) = explore_action_rect();
        let (x, y, w, h) = explore_item_rect(0);
        assert!(y + h <= ay, "inventory overlaps action button");
        assert!(y + h <= MSG_Y);
        assert_eq!(
            hit_explore_item(x + w / 2, y + h / 2, &inv).as_deref(),
            Some("key")
        );
    }

    #[test]
    fn explore_cursor_kind_from_verb_id() {
        assert_eq!(
            explore_cursor_kind(false, false, Some("look")),
            ExploreCursorKind::Look
        );
        assert_eq!(
            explore_cursor_kind(false, false, Some("move")),
            ExploreCursorKind::Move
        );
        assert_eq!(
            explore_cursor_kind(false, false, Some("talk")),
            ExploreCursorKind::Talk
        );
        assert_eq!(
            explore_cursor_kind(false, false, Some("take")),
            ExploreCursorKind::Hand
        );
        assert_eq!(
            explore_cursor_kind(false, false, Some("open")),
            ExploreCursorKind::Hand
        );
        assert_eq!(
            explore_cursor_kind(false, false, Some("use")),
            ExploreCursorKind::Use
        );
        assert_eq!(
            explore_cursor_kind(false, false, None),
            ExploreCursorKind::Look
        );
        // UI chrome always arrow.
        assert_eq!(
            explore_cursor_kind(true, false, Some("move")),
            ExploreCursorKind::Arrow
        );
        // Pending item wins over verb.
        assert_eq!(
            explore_cursor_kind(false, true, Some("look")),
            ExploreCursorKind::Use
        );
        // UI wins over pending item too.
        assert_eq!(
            explore_cursor_kind(true, true, Some("look")),
            ExploreCursorKind::Arrow
        );
    }

    #[test]
    fn explore_chrome_hides_hotspot_outlines_by_default() {
        let font = GameFont::load_system()
            .or_else(|_| {
                let p = std::path::PathBuf::from(
                    "/usr/share/fonts/truetype/sand-box/google/Sen/Sen-VariableFont_wght.ttf",
                );
                let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
                GameFont::from_bytes(bytes, p)
            })
            .expect("font");
        let mut fb = Framebuffer::new();
        fb.fill(Rgba::rgb(0, 0, 0));
        let hotspots = vec![(
            "desk".into(),
            galeng_schema::HotspotShape::Rect {
                x: 200,
                y: 200,
                w: 300,
                h: 200,
            },
        )];
        draw_explore_chrome(
            &mut fb,
            &font,
            &TypeScale::default(),
            None,
            false,
            &[],
            &hotspots,
            Some("desk"),
            None,
            false,
        );
        // Top edge of hotspot rect must stay black (no cyan/yellow stroke).
        let edge = fb.count_nonblack_in(200, 200, 300, 2);
        assert_eq!(edge, 0, "expected no hotspot outline stroke, got {edge} lit px");

        // Debug flag still paints outlines.
        draw_explore_chrome(
            &mut fb,
            &font,
            &TypeScale::default(),
            None,
            false,
            &[],
            &hotspots,
            Some("desk"),
            None,
            true,
        );
        let edge_dbg = fb.count_nonblack_in(200, 200, 300, 2);
        assert!(edge_dbg > 10, "debug outlines should light the stroke");
    }

    #[test]
    fn explore_cursor_blits_nonblack_pixels() {
        let mut fb = Framebuffer::new();
        fb.fill(Rgba::rgb(0, 0, 0));
        draw_explore_cursor(&mut fb, ExploreCursorKind::Look, 400, 300);
        // CURSOR_SIZE is 52; sample a window large enough for scaled glyphs.
        let n = fb.count_nonblack_in(340, 240, 120, 120);
        assert!(n > 60, "look cursor should paint pixels, got {n}");
    }

    #[test]
    fn explore_cursor_size_is_readable() {
        assert!(
            CURSOR_SIZE >= 48 && CURSOR_SIZE <= 80,
            "CURSOR_SIZE={CURSOR_SIZE} should be readable on 1280×720"
        );
        assert_eq!(cs(28), CURSOR_SIZE);
        // Half-art rounds with cs(); odd CURSOR_SIZE need not equal size/2.
        assert_eq!(cs(14), (14 * CURSOR_SIZE + CURSOR_ART / 2) / CURSOR_ART);
    }
}
