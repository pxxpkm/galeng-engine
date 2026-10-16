use galeng_schema::{PauseButtons, Slot, TitleButtons};

use crate::assets::{fit_bottom_center, Bank};
use crate::camera::map_rect;
use crate::fb::{hash_rgb, Framebuffer, Rgba, HEIGHT, WIDTH};
use crate::font::GameFont;
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

pub const MSG_X: i32 = 80;
pub const MSG_Y: i32 = 780;
pub const MSG_W: i32 = 1760;
pub const MSG_H: i32 = 260;

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
    let fill = match state {
        ButtonState::Idle => Rgba::rgb(20, 20, 32),
        ButtonState::Hover => Rgba::rgb(110, 88, 40),
        ButtonState::Pressed => Rgba::rgb(70, 48, 20),
    };
    fb.fill_rect(x, y, w, h, fill);
    if state != ButtonState::Idle {
        let edge = Rgba::rgb(255, 220, 120);
        fb.fill_rect(x, y, w, 3, edge);
        fb.fill_rect(x, y + h - 3, w, 3, edge);
        fb.fill_rect(x, y, 3, h, edge);
        fb.fill_rect(x + w - 3, y, 3, h, edge);
        fb.fill_rect(x, y, 8, h, Rgba::rgb(255, 210, 80));
    }
    font.draw_text_in_box(
        fb,
        x,
        y,
        w,
        h,
        20,
        size,
        text,
        Rgba::rgb(255, 255, 255),
    );
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
            fb.blit_nearest(pic.width, pic.height, &pic.rgba, dx, dy, dw, dh);
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
            fb.blit_nearest(pic.width, pic.height, &pic.rgba, dx, dy, dw, dh);
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
                MSG_Y + 80,
                40.0,
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
                MSG_Y + 80,
                40.0,
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
                MSG_Y + 36,
                28.0,
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
                    MSG_Y + 40,
                    28.0,
                    speaker_label,
                    Rgba::rgb(255, 220, 140),
                    MSG_X + MSG_W - 32,
                );
                if let Some(text) = say_shown.or(view.say_text.as_deref()) {
                    font.draw_text(
                        fb,
                        MSG_X + 32,
                        MSG_Y + 70,
                        40.0,
                        text,
                        Rgba::rgb(255, 255, 255),
                        MSG_X + MSG_W - 32,
                    );
                }
                if say_more {
                    font.draw_text(
                        fb,
                        MSG_X + MSG_W - 56,
                        MSG_Y + 36,
                        28.0,
                        "▼",
                        Rgba::rgb(255, 230, 160),
                        MSG_X + MSG_W - 16,
                    );
                }
            }
        }
    }
}

pub const EXPLORE_VERB_W: i32 = 140;
pub const EXPLORE_VERB_H: i32 = 48;
pub const EXPLORE_VERB_GAP: i32 = 12;
pub const EXPLORE_ITEM_W: i32 = 168;
pub const EXPLORE_ITEM_H: i32 = 44;
pub const EXPLORE_ITEM_GAP: i32 = 12;

/// Verb row sits above the message-box band (same idea as [`choice_rect`]).
pub fn explore_verb_rect(index: usize, count: usize) -> (i32, i32, i32, i32) {
    let n = count.max(1) as i32;
    let total_w = n * (EXPLORE_VERB_W + EXPLORE_VERB_GAP) - EXPLORE_VERB_GAP;
    let x0 = (WIDTH as i32 - total_w) / 2;
    let y = MSG_Y - 16 - EXPLORE_VERB_H;
    (
        x0 + index as i32 * (EXPLORE_VERB_W + EXPLORE_VERB_GAP),
        y,
        EXPLORE_VERB_W,
        EXPLORE_VERB_H,
    )
}

/// Inventory chips sit above the verb row.
pub fn explore_item_rect(index: usize) -> (i32, i32, i32, i32) {
    let y = MSG_Y - 16 - EXPLORE_VERB_H - 16 - EXPLORE_ITEM_H;
    let x = 40 + index as i32 * (EXPLORE_ITEM_W + EXPLORE_ITEM_GAP);
    (x, y, EXPLORE_ITEM_W, EXPLORE_ITEM_H)
}

/// Verb / inventory chrome + hotspot outlines for Explore phase.
pub fn draw_explore_chrome(
    fb: &mut Framebuffer,
    font: &GameFont,
    verbs: &[(String, String, bool)],
    inventory: &[(String, String, bool)],
    hotspots: &[(String, galeng_schema::HotspotShape)],
    hover_hotspot: Option<&str>,
    hover_verb: Option<&str>,
    hover_item: Option<&str>,
) {
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
                // Minimal: bounding box only (hit-test ignores polygons for now).
                if let Some((min_x, min_y, max_x, max_y)) = poly_bounds(points) {
                    stroke_rect(fb, min_x, min_y, max_x - min_x, max_y - min_y, color, 1);
                }
            }
        }
    }

    for (i, (id, label, selected)) in verbs.iter().enumerate() {
        let (x, y, w, h) = explore_verb_rect(i, verbs.len());
        let state = if hover_verb == Some(id.as_str()) || *selected {
            ButtonState::Hover
        } else {
            ButtonState::Idle
        };
        draw_button(fb, font, x, y, w, h, label, 28.0, state);
    }

    if !inventory.is_empty() {
        let (_ix0, inv_y, _, _) = explore_item_rect(0);
        font.draw_text(
            fb,
            40,
            inv_y - 28,
            24.0,
            "道具",
            Rgba::rgb(255, 230, 160),
            400,
        );
        for (i, (item_id, label, selected)) in inventory.iter().enumerate() {
            let (x, y, w, h) = explore_item_rect(i);
            let state = if hover_item == Some(item_id.as_str()) || *selected {
                ButtonState::Hover
            } else {
                ButtonState::Idle
            };
            draw_button(fb, font, x, y, w, h, label, 24.0, state);
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

/// Hit-test explore verb bar. Returns verb id.
pub fn hit_explore_verb(lx: i32, ly: i32, verbs: &[(String, String, bool)]) -> Option<String> {
    for (i, (id, _label, _sel)) in verbs.iter().enumerate() {
        let (x, y, w, h) = explore_verb_rect(i, verbs.len());
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(id.clone());
        }
    }
    None
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
        32.0,
        button_state(index, choice_sel, hover_choice, pressed_choice),
    );
    Some((x, y, w, h))
}

pub fn draw_choice_buttons(
    fb: &mut Framebuffer,
    font: &GameFont,
    view: &View,
    choice_sel: usize,
    hover_choice: Option<usize>,
    pressed_choice: Option<usize>,
) {
    for i in 0..view.choices.len() {
        let _ = draw_one_choice(fb, font, view, i, choice_sel, hover_choice, pressed_choice);
    }
}

pub fn draw_title(
    fb: &mut Framebuffer,
    font: &GameFont,
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
            72.0,
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
                fb.blit_nearest(pic.width, pic.height, &pic.rgba, x, y, w, h);
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
                    32.0,
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
                32.0,
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
        fb.blit_nearest(pic.width, pic.height, &pic.rgba, dx, dy, dw, dh);
    } else {
        fb.fill_rect(dx, dy, dw, dh, hash_rgb(logical));
    }
}

pub fn draw_settings(
    fb: &mut Framebuffer,
    font: &GameFont,
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
        32.0,
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
            28.0,
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
            font.draw_text_in_box(fb, x, y, w, h, 24, 28.0, &label, Rgba::rgb(255, 255, 255));
            continue;
        }
        if i == UI_LANG_ROW {
            let label = format!(
                "{}  {}",
                settings::ui_lang_label(locale),
                settings.ui_language.choice_label(locale)
            );
            font.draw_text_in_box(fb, x, y, w, h, 24, 28.0, &label, Rgba::rgb(255, 255, 255));
            continue;
        }
        if i == TEXT_SPEED_ROW {
            let label = format!(
                "{}  {}",
                settings::text_speed_label(locale),
                settings.text_speed
            );
            font.draw_text_in_box(fb, x, y, w, h, 24, 28.0, &label, Rgba::rgb(255, 255, 255));
            continue;
        }
        if i == AUTO_DELAY_ROW {
            let label = format!(
                "{}  {} ms",
                settings::auto_delay_label(locale),
                settings.auto_delay_ms
            );
            font.draw_text_in_box(fb, x, y, w, h, 24, 28.0, &label, Rgba::rgb(255, 255, 255));
            continue;
        }
        let vol = settings.get(i);
        let label = format!("{}  {vol}", settings::channel_label(locale, i));
        font.draw_text_in_box(fb, x, y, 380, h, 24, 28.0, &label, Rgba::rgb(255, 255, 255));
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
                r: 30,
                g: 30,
                b: 40,
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
                fb.blit_nearest(pic.width, pic.height, &pic.rgba, x, y, w, h);
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
                    32.0,
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
                32.0,
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
            fb.blit_nearest(*tw, *th, rgba, x + 8, y + 4, 80, 44);
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
            22.0,
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
            );
            return;
        }
    }
    fb.fill_rect(MSG_X, MSG_Y, MSG_W, MSG_H, Rgba::rgb(8, 8, 16));
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
    fn explore_verb_bar_stays_above_message_box() {
        let verbs = vec![
            ("look".into(), "看".into(), false),
            ("open".into(), "開".into(), true),
            ("take".into(), "拎".into(), false),
            ("use".into(), "用".into(), false),
            ("move".into(), "去".into(), false),
        ];
        for i in 0..verbs.len() {
            let (x, y, w, h) = explore_verb_rect(i, verbs.len());
            assert!(y >= 0, "verb {i} y={y}");
            assert!(y + h <= MSG_Y, "verb {i} overlaps message box: bottom={}", y + h);
            assert!(
                y + h < crate::hud::hud_y(),
                "verb {i} overlaps HUD y={}",
                crate::hud::hud_y()
            );
            assert_eq!(
                hit_explore_verb(x + w / 2, y + h / 2, &verbs).as_deref(),
                Some(verbs[i].0.as_str())
            );
        }
        // Old bottom-chrome region must not hit verbs.
        assert_eq!(hit_explore_verb(WIDTH as i32 / 2, HEIGHT as i32 - 72, &verbs), None);
    }

    #[test]
    fn explore_item_strip_above_verb_bar() {
        let inv = vec![("key".into(), "黃銅鎖匙".into(), true)];
        let (_vx, vy, _vw, _vh) = explore_verb_rect(0, 1);
        let (x, y, w, h) = explore_item_rect(0);
        assert!(y + h <= vy, "inventory overlaps verb bar");
        assert!(y + h <= MSG_Y);
        assert_eq!(
            hit_explore_item(x + w / 2, y + h / 2, &inv).as_deref(),
            Some("key")
        );
    }
}
