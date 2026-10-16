use std::time::{Duration, Instant};

use sdl2::event::Event;
use sdl2::keyboard::{Keycode, Mod, Scancode};
use sdl2::mouse::MouseButton;
use sdl2::pixels::PixelFormatEnum;
use sdl2::rect::Rect;

use crate::assets::Bank;
use crate::audio::Mixer;
use crate::backlog::{self, BacklogView};
use crate::draw::{
    draw_backlog, draw_button, draw_cg, draw_choice_buttons, draw_explore_chrome, draw_explore_cursor,
    draw_gallery, draw_hud, draw_menu, draw_music, draw_one_choice, draw_settings, draw_slots,
    draw_movie_skip, draw_title, draw_view, explore_cursor_kind, hit_choice, hit_explore_action,
    hit_explore_item, letterbox, window_to_logical, ButtonState, EXPLORE_ITEM_H,
    EXPLORE_ITEM_W,
};
use crate::hud::{self, HudAction, HUD_ACTIONS};
use crate::menu::{
    digit_to_slot_index, hit_menu, hit_slot, index_to_slot, menu_sizes, wrap_index, MenuAction,
    ACTIONS, MENU_COUNT, SLOT_COUNT,
};
use crate::gallery;
use crate::title::{
    game_window_title, hit_title, image_sizes, TitleAction, TITLE_ACTIONS, TITLE_COUNT,
};
use crate::fb::{mix_rgba, Framebuffer, HEIGHT, WIDTH};
use crate::font::GameFont;
use crate::save::{
    check_save, default_save_dir, downscale_rgba, read_slot, read_thumb, write_slot, write_thumb,
    AUTO_SLOT, THUMB_H, THUMB_W,
};
use crate::seen::{default_seen_path, Seen};
use crate::settings::{
    default_config_path, hit_row as hit_setting, read_config, wait_ms, write_config, STEP,
    AUTO_DELAY_ROW, AUTO_PLAY_ROW, DELAY_MIN, DELAY_STEP, FULLSCREEN_ROW, SETTINGS_ROWS, SKIP_UNREAD_ROW,
    TEXT_SPEED_ROW, UI_LANG_ROW,
};
use crate::fx::{flash_alpha, flash_white, shake_offset};
use crate::movie;
use crate::saypage::{self, ConfirmSay};
use crate::skip::{ctrl_skips, SkipClock};
use crate::typewriter::Typewriter;
use crate::vm::{Phase, Runtime};
use galeng_explore::ItemUseMode;

struct Fade {
    from: Vec<u8>,
    started: Instant,
    ms: u32,
}

/// Inventory chip gesture: click = Aim select; drag past threshold = Drag use.
enum InvDrag {
    Idle,
    Press { item: String, x: i32, y: i32 },
    Drag { item: String },
}

const INV_DRAG_PX: i32 = 10;

#[derive(Clone, PartialEq, Eq)]
struct SceneLayerKey {
    scene: String,
    beat: usize,
    phase: Phase,
    say: String,
    speaker: String,
    hide: bool,
    more: bool,
    locale: String,
}

#[derive(Clone, PartialEq, Eq)]
struct ChromeSnap {
    choice: usize,
    hover_choice: Option<usize>,
    pressed_choice: Option<usize>,
    hover_hud: Option<usize>,
    pressed_hud: Option<usize>,
    title_sel: usize,
    menu_sel: usize,
    skip_latch: bool,
    auto_play: bool,
    overlay: bool,
    title_open: bool,
}

pub fn run(mut runtime: Runtime, mut title_open: bool) -> Result<(), String> {
    let font = GameFont::load_preferred(
        runtime.project.font.as_deref(),
        Some(runtime.project.locale.as_str()),
        &runtime.source,
    )?;
    let mut assets = Bank::from_source(runtime.source.clone());
    let config_path = default_config_path(&runtime.project.id, &runtime.project_dir);
    let mut settings = read_config(&config_path);
    let mut seen = Seen::load(default_seen_path(
        &runtime.project.id,
        &runtime.project_dir,
    ));
    let mut mixer = Mixer::try_new();
    mixer.set_settings(settings);
    let sdl = sdl2::init()?;
    let video = sdl.video()?;
    let mouse_util = sdl.mouse();
    let mut os_cursor_hidden = false;
    let mut window = video
        .window(&game_window_title(&runtime.project.title), 1280, 720)
        .position_centered()
        .resizable()
        .build()
        .map_err(|e| e.to_string())?;
    apply_window_icon(&mut window, &runtime);
    let mut canvas = window
        .into_canvas()
        .present_vsync()
        .build()
        .map_err(|e| e.to_string())?;
    if settings.fullscreen {
        set_desktop_fullscreen(&mut canvas, true);
    }
    let creator = canvas.texture_creator();
    let mut texture = creator
        .create_texture_streaming(PixelFormatEnum::ABGR8888, WIDTH, HEIGHT)
        .map_err(|e| e.to_string())?;

    let mut fb = Framebuffer::new();
    let mut fade: Option<Fade> = None;
    let mut auto_until: Option<Instant> = None;
    let mut auto_key: Option<(String, usize, Option<u32>, bool, usize)> = None;
    let mut fx_until: Option<Instant> = None;
    let mut fx_key: Option<(String, usize, Option<u32>, Option<u32>, Option<u32>)> = None;
    let mut shake_started: Option<Instant> = None;
    let mut flash_started: Option<Instant> = None;
    let mut slide_started: Option<Instant> = None;
    let mut slide_key: Option<(String, usize, Option<u32>)> = None;
    let mut skip = SkipClock::new();
    let mut menu_open = false;
    let mut menu_sel = 0usize;
    let mut slot_pick: Option<bool> = None;
    let mut slot_sel = 0usize;
    let mut backlog = BacklogView::new();
    let mut title_sel = 0usize;
    let mut title_dirty = false;
    let mut settings_open = false;
    let mut settings_sel = 0usize;
    let mut settings_from_menu = false;
    let mut gallery_open = false;
    let mut gallery_sel = 0usize;
    let mut cg_view: Option<usize> = None;
    let mut music_open = false;
    let mut music_sel = 0usize;
    let mut music_playing: Option<usize> = None;
    let mut typewriter = Typewriter::new();
    let mut say_page = 0usize;
    let mut say_page_key: Option<(String, usize)> = None;
    let mut say_page_count;
    let mut ui_hidden = false;
    let mut skip_latch = false;
    let mut choice_sel = 0usize;
    // Explore focus: Some(hotspot id); explore_focus_room = empty-background (看·房間).
    let mut explore_focus: Option<String> = None;
    let mut explore_focus_room: bool = false;
    let mut explore_action_index: usize = 0;
    let mut inv_drag = InvDrag::Idle;
    let mut pressed_title: Option<usize> = None;
    let mut pressed_menu: Option<usize> = None;
    let mut pressed_choice: Option<usize> = None;
    let mut pressed_hud: Option<usize> = None;
    let mut movie: Option<movie::Play> = None;
    let mut last_thumb: Option<Vec<u8>> = None;
    let mut last_present: Vec<u8> = Vec::new();
    let mut layer_cache: Option<(SceneLayerKey, Vec<u8>)> = None;
    let mut last_chrome: Option<ChromeSnap> = None;
    let mut title_op: Option<movie::Play> = None;
    let mut events = sdl.event_pump()?;

    'running: loop {
        let view = runtime.view();
        let speaker = view
            .say_speaker
            .as_deref()
            .map(|s| runtime.speaker_display(s))
            .unwrap_or_default();
        let overlay = menu_open
            || slot_pick.is_some()
            || backlog.open
            || title_open
            || settings_open
            || gallery_open
            || music_open;
        let ui_locale = settings
            .ui_language
            .resolve(&runtime.project.locale)
            .to_string();
        let ctrl = !overlay
            && (events.keyboard_state().is_scancode_pressed(Scancode::LCtrl)
                || events.keyboard_state().is_scancode_pressed(Scancode::RCtrl));
        let skipping = ctrl || skip_latch;
        if fade
            .as_ref()
            .is_some_and(|s| s.started.elapsed().as_secs_f32() * 1000.0 >= s.ms as f32)
        {
            fade = None;
        }
        if !title_open {
            if let Some(ms) = runtime.take_transition() {
                if skipping {
                    fade = None;
                } else {
                    let from = if last_present.len() == fb.pixels.len() {
                        last_present.clone()
                    } else {
                        vec![0u8; fb.pixels.len()]
                    };
                    fade = Some(Fade {
                        from,
                        started: Instant::now(),
                        ms: ms.max(1),
                    });
                }
            }
        }
        if view.phase == Phase::Dialogue {
            if let Some(text) = view.say_text.as_deref() {
                let key = (view.scene_id.clone(), view.beat_index);
                if say_page_key.as_ref() != Some(&key) {
                    say_page_key = Some(key);
                    say_page = 0;
                }
                let spans = saypage::pages(&font, text);
                say_page_count = spans.len().max(1);
                if say_page >= say_page_count {
                    say_page = say_page_count - 1;
                }
                let page_text = saypage::page_text(text, &spans, say_page);
                font.prewarm(page_text, 40.0);
                font.prewarm(&speaker, 28.0);
                typewriter.tick(
                    &view.scene_id,
                    view.beat_index,
                    say_page,
                    page_text,
                    settings.text_speed,
                    crate::typewriter::text_rate_of(&runtime.project, view.say_speaker.as_deref()),
                    Instant::now(),
                    !overlay && fade.is_none() && !title_open,
                );
            } else {
                say_page_count = 1;
                say_page = 0;
            }
        } else {
            typewriter.complete();
            say_page_count = 1;
            say_page = 0;
        }
        let say_shown = view.say_text.as_deref().map(|text| {
            let spans = saypage::pages(&font, text);
            let page_text = saypage::page_text(text, &spans, say_page);
            typewriter.visible(page_text)
        });
        let say_more = view.phase == Phase::Dialogue
            && typewriter.is_done()
            && say_page + 1 < say_page_count;
        if view.phase == Phase::Choices {
            let n = view.choices.len().max(1);
            if choice_sel >= n {
                choice_sel = 0;
            }
        }
        let (ww, wh) = canvas.output_size()?;
        let mouse = events.mouse_state();
        let title_sizes = image_sizes(runtime.project.title_buttons.as_ref(), |logical| {
            assets.get(logical).map(|pic| (pic.width, pic.height))
        });
        let pause_sizes = menu_sizes(runtime.project.pause_buttons.as_ref(), |logical| {
            assets.get(logical).map(|pic| (pic.width, pic.height))
        });
        let mut hover_title = None;
        let mut hover_menu = None;
        let mut hover_choice = None;
        let mut hover_hud = None;
        if let Some((lx, ly)) = window_to_logical(mouse.x(), mouse.y(), ww, wh) {
            if title_open && !settings_open && !gallery_open && !music_open && slot_pick.is_none()
            {
                hover_title = hit_title(
                    lx,
                    ly,
                    runtime.project.title_buttons.as_ref(),
                    &title_sizes,
                );
            } else if menu_open && slot_pick.is_none() && !settings_open {
                hover_menu = hit_menu(
                    lx,
                    ly,
                    runtime.project.pause_buttons.as_ref(),
                    &pause_sizes,
                );
            } else if !overlay && view.phase == Phase::Choices {
                hover_choice = hit_choice(lx, ly, view.choices.len());
            }
            if show_hud_now(
                overlay,
                title_open,
                ui_hidden,
                title_op.is_some(),
                movie.is_some(),
                &view,
            ) {
                hover_hud = hud::hit_hud(lx, ly);
            }
        }
        if let Some(i) = hover_title {
            title_sel = i;
        }
        if let Some(i) = hover_menu {
            menu_sel = i;
        }
        if let Some(i) = hover_choice {
            choice_sel = i;
        }
        if !mouse.left() {
            pressed_title = None;
            pressed_menu = None;
            pressed_choice = None;
            pressed_hud = None;
        }
        if !title_open {
            if let Some(cg) = view.cg.as_deref() {
                seen.note(cg);
            }
        }
        assets.begin_frame();
        if let Some(play) = title_op.as_mut() {
            let ended = play.tick() == movie::Status::Ended;
            for chunk in play.take_pcm() {
                mixer.push_movie_pcm(chunk.channels, chunk.sample_rate, chunk.samples);
            }
            if ended {
                title_op = None;
                mixer.set_movie(false);
            }
        } else if !overlay && !title_open {
            match view.movie.as_deref() {
                Some(logical) => {
                    if movie.as_ref().map(|m| m.logical.as_str()) != Some(logical) {
                        movie = movie::Play::open(&runtime.source, logical);
                        if movie.is_none() {
                            mixer.set_movie(false);
                            advance_reading(&mut runtime, &mut seen);
                        } else {
                            mixer.set_movie(true);
                        }
                    }
                    if let Some(play) = movie.as_mut() {
                        let ended = play.tick() == movie::Status::Ended;
                        for chunk in play.take_pcm() {
                            mixer.push_movie_pcm(chunk.channels, chunk.sample_rate, chunk.samples);
                        }
                        if ended {
                            movie = None;
                            mixer.set_movie(false);
                            advance_reading(&mut runtime, &mut seen);
                        }
                    }
                }
                None => {
                    movie = None;
                    mixer.set_movie(false);
                }
            }
        }
        let can_cache_layer = fade.is_none()
            && movie.is_none()
            && title_op.is_none()
            && !title_open
            && !overlay
            && view.phase != Phase::Explore;
        let layer_key = SceneLayerKey {
            scene: view.scene_id.clone(),
            beat: view.beat_index,
            phase: view.phase.clone(),
            say: say_shown.unwrap_or("").to_string(),
            speaker: speaker.clone(),
            hide: ui_hidden,
            more: say_more,
            locale: ui_locale.clone(),
        };
        let scene_hit = can_cache_layer && layer_cache.as_ref().is_some_and(|(k, _)| k == &layer_key);
        let chrome = ChromeSnap {
            choice: choice_sel,
            hover_choice,
            pressed_choice,
            hover_hud,
            pressed_hud,
            title_sel,
            menu_sel,
            skip_latch,
            auto_play: settings.auto_play,
            overlay,
            title_open,
        };
        let chrome_hit = last_chrome.as_ref() == Some(&chrome);
        let mut dirty: Vec<(i32, i32, i32, i32)> = Vec::new();
        let mut full_upload = true;
        let sliding = matches!(
            (slide_started, view.char_slide_ms),
            (Some(start), Some(ms))
                if start.elapsed() < Duration::from_millis(u64::from(ms))
        );
        if scene_hit && chrome_hit && shake_started.is_none() && flash_started.is_none() && !sliding
            && view.phase != Phase::Explore
        {
            full_upload = false;
        } else if scene_hit && shake_started.is_none() && flash_started.is_none() && !sliding
            && view.phase != Phase::Explore
        {
            full_upload = false;
            if view.phase == Phase::Choices {
                if let Some(prev) = &last_chrome {
                    for i in [prev.choice, choice_sel] {
                        if let Some(r) = draw_one_choice(
                            &mut fb,
                            &font,
                            &view,
                            i,
                            choice_sel,
                            hover_choice,
                            pressed_choice,
                        ) {
                            dirty.push(r);
                        }
                    }
                } else {
                    draw_choice_buttons(
                        &mut fb,
                        &font,
                        &view,
                        choice_sel,
                        hover_choice,
                        pressed_choice,
                    );
                    full_upload = true;
                }
            }
            if show_hud_now(
                overlay,
                title_open,
                ui_hidden,
                title_op.is_some(),
                movie.is_some(),
                &view,
            ) {
                draw_hud(
                    &mut fb,
                    &font,
                    &ui_locale,
                    hover_hud,
                    pressed_hud,
                    settings.auto_play,
                    skip_latch,
                );
                for i in 0..hud::HUD_COUNT {
                    dirty.push(hud::hud_rect(i));
                }
            }
        } else {
            draw_view(
                &mut fb,
                &font,
                &view,
                &speaker,
                &mut assets,
                say_shown,
                ui_hidden,
                say_more,
                &ui_locale,
                runtime.project.msg_box.as_deref(),
                slide_started.map(|s| s.elapsed().as_millis().min(u128::from(u32::MAX)) as u32),
            );
            if can_cache_layer {
                layer_cache = Some((layer_key, fb.pixels.clone()));
            } else {
                layer_cache = None;
            }
            if !title_open && view.phase == Phase::Choices {
                draw_choice_buttons(
                    &mut fb,
                    &font,
                    &view,
                    choice_sel,
                    hover_choice,
                    pressed_choice,
                );
            }
            if !title_open && !ui_hidden && view.phase == Phase::Explore {
                let inv = explore_inv_rows(&runtime);
                let hotspots = runtime.explore_hotspots();
                let (ww, wh) = canvas.output_size().unwrap_or((1280, 720));
                let ms = events.mouse_state();
                let logical = window_to_logical(ms.x(), ms.y(), ww, wh);
                let hover_hs = logical.and_then(|(lx, ly)| runtime.explore_hit(lx, ly));
                let on_action = logical
                    .map(|(lx, ly)| hit_explore_action(lx, ly))
                    .unwrap_or(false);
                let hover_item = logical.and_then(|(lx, ly)| hit_explore_item(lx, ly, &inv));
                // Keep focus when pointer moves onto the action button.
                if let Some(id) = hover_hs.clone() {
                    if explore_focus.as_deref() != Some(id.as_str()) || explore_focus_room {
                        explore_focus = Some(id.clone());
                        explore_focus_room = false;
                        explore_action_index = 0;
                        sync_explore_action(&mut runtime, Some(&id), 0);
                    }
                } else if on_action && (explore_focus.is_some() || explore_focus_room) {
                    // keep
                } else if hover_item.is_some() || !matches!(inv_drag, InvDrag::Idle) {
                    // keep inventory / drag without clearing room/hotspot focus
                } else if logical.is_some() {
                    // Empty scene background: room look.
                    if !explore_focus_room || explore_focus.is_some() {
                        explore_focus = None;
                        explore_focus_room = true;
                        explore_action_index = 0;
                        // Don't clear pending_item here — only on click empty.
                        if runtime.explore_pending_item().is_none() {
                            runtime.select_verb(Some("look"));
                        }
                    }
                }
                let action_label = if let Some(id) = explore_focus.as_deref() {
                    let actions = runtime.explore_available_actions(id);
                    if actions.is_empty() {
                        None
                    } else {
                        let i = explore_action_index % actions.len();
                        Some(actions[i].label.clone())
                    }
                } else if explore_focus_room {
                    runtime.explore_empty_action().map(|a| a.label)
                } else {
                    None
                };
                let debug_hs = std::env::var_os("GALENG_EXPLORE_DEBUG_HOTSPOTS").is_some();
                draw_explore_chrome(
                    &mut fb,
                    &font,
                    action_label.as_deref(),
                    on_action && action_label.is_some(),
                    &inv,
                    &hotspots,
                    explore_focus.as_deref(),
                    hover_item.as_deref(),
                    debug_hs,
                );
                // Drag ghost: floating inventory chip under cursor.
                if let InvDrag::Drag { item } = &inv_drag {
                    if let Some((lx, ly)) = logical {
                        let label = inv
                            .iter()
                            .find(|(id, _, _)| id == item)
                            .map(|(_, l, _)| l.as_str())
                            .unwrap_or(item.as_str());
                        draw_button(
                            &mut fb,
                            &font,
                            lx - EXPLORE_ITEM_W / 2,
                            ly - EXPLORE_ITEM_H / 2,
                            EXPLORE_ITEM_W,
                            EXPLORE_ITEM_H,
                            label,
                            24.0,
                            ButtonState::Pressed,
                        );
                    }
                }
                // YU-NO P2: software cursor by primary action; hide OS pointer in Explore.
                let over_ui = (on_action && action_label.is_some()) || hover_item.is_some();
                let pending = runtime.explore_pending_item().is_some()
                    || matches!(inv_drag, InvDrag::Drag { .. });
                let verb = if pending {
                    None
                } else if let Some(id) = explore_focus.as_deref() {
                    let actions = runtime.explore_available_actions(id);
                    if actions.is_empty() {
                        None
                    } else {
                        let i = explore_action_index % actions.len();
                        actions[i].verb.as_deref().map(|s| s.to_string())
                    }
                } else if explore_focus_room {
                    Some("look".to_string())
                } else {
                    Some("look".to_string())
                };
                let kind = explore_cursor_kind(over_ui, pending, verb.as_deref());
                if let Some((lx, ly)) = logical {
                    draw_explore_cursor(&mut fb, kind, lx, ly);
                }
            }
        }
        // Hide OS cursor while Explore chrome owns the software cursor.
        let hide_os = !title_open
            && !overlay
            && !ui_hidden
            && view.phase == Phase::Explore
            && title_op.is_none()
            && movie.is_none();
        if hide_os != os_cursor_hidden {
            mouse_util.show_cursor(!hide_os);
            os_cursor_hidden = hide_os;
        }
        last_chrome = Some(chrome);
        if let Some(play) = title_op.as_ref().or(movie.as_ref()) {
            play.blit(&mut fb);
            if !overlay {
                draw_movie_skip(&mut fb, &font, &ui_locale);
            }
        }
        if full_upload && !overlay && !title_open && title_op.is_none() {
            last_thumb = Some(downscale_rgba(&fb.pixels, WIDTH, HEIGHT, THUMB_W, THUMB_H));
        }
        let show_hud = show_hud_now(
            overlay,
            title_open,
            ui_hidden,
            title_op.is_some(),
            movie.is_some(),
            &view,
        );
        if full_upload && show_hud {
            draw_hud(
                &mut fb,
                &font,
                &ui_locale,
                hover_hud,
                pressed_hud,
                settings.auto_play,
                skip_latch,
            );
        }
        if !overlay && !title_open && movie.is_none() && title_op.is_none() {
            if let (Some(start), Some(ms)) = (flash_started, view.fx_flash_ms) {
                let elapsed = start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
                flash_white(&mut fb, flash_alpha(elapsed, ms));
            }
        }
        let cgs = runtime.project.cg.as_deref().unwrap_or(&[]);
        if let Some(i) = cg_view {
            if let Some(item) = cgs.get(i) {
                if seen.has(&item.asset) {
                    draw_cg(&mut fb, &mut assets, &item.asset);
                }
            }
        } else if gallery_open {
            let ids: Vec<&str> = cgs.iter().map(|g| g.id.as_str()).collect();
            let unlocked: Vec<bool> = cgs.iter().map(|g| seen.has(&g.asset)).collect();
            draw_gallery(&mut fb, &font, &ui_locale, &ids, gallery_sel, &unlocked);
        } else if music_open {
            let tracks = runtime.project.music_gallery.as_deref().unwrap_or(&[]);
            let ids: Vec<&str> = tracks.iter().map(|g| g.id.as_str()).collect();
            draw_music(
                &mut fb,
                &font,
                &ui_locale,
                &ids,
                music_sel,
                music_playing,
            );
        }
        if backlog.open {
            let (start, count) = backlog.window(runtime.backlog().len());
            let rows: Vec<(String, String, bool)> = runtime.backlog()[start..start + count]
                .iter()
                .map(|line| {
                    (
                        runtime.speaker_display(&line.speaker),
                        line.text.clone(),
                        backlog::can_jump(line),
                    )
                })
                .collect();
            draw_backlog(&mut fb, &font, &ui_locale, &rows);
        }
        if let Some(saving) = slot_pick {
            let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
            let mut scenes: [Option<String>; SLOT_COUNT] = Default::default();
            let mut thumbs: [Option<(u32, u32, Vec<u8>)>; SLOT_COUNT] = Default::default();
            for (i, slot) in scenes.iter_mut().enumerate() {
                let n = index_to_slot(i);
                if let Ok(save) = read_slot(&dir, n) {
                    if check_save(&save, &runtime.project.id, runtime.project.schema_version).is_ok()
                    {
                        *slot = Some(save.label.unwrap_or(save.scene));
                    }
                }
                thumbs[i] = read_thumb(&dir, n);
            }
            draw_slots(
                &mut fb,
                &font,
                &ui_locale,
                saving,
                slot_sel,
                &scenes,
                &thumbs,
            );
        } else if settings_open {
            draw_settings(
                &mut fb,
                &font,
                &ui_locale,
                &settings,
                settings_sel,
            );
        } else if menu_open {
            draw_menu(
                &mut fb,
                &font,
                &ui_locale,
                menu_sel,
                hover_menu,
                pressed_menu,
                &mut assets,
                runtime.project.pause_buttons.as_ref(),
                &pause_sizes,
            );
        } else if gallery_open || music_open {
            // list / full-view already drawn above; do not redraw the title over it
        } else if title_open {
            draw_title(
                &mut fb,
                &font,
                &ui_locale,
                &runtime.project.title,
                title_sel,
                hover_title,
                pressed_title,
                &mut assets,
                runtime.project.title_bg.as_deref(),
                runtime.project.hide_game_title,
                runtime.project.title_buttons.as_ref(),
                &title_sizes,
            );
        }
        mixer.pause_movie(overlay);
        if (movie.is_some() || title_op.is_some()) && !title_open {
            mixer.set_movie(true);
            mixer.sync(None, 0, &runtime.source);
            mixer.sync_amb(None, &runtime.source);
            mixer.stop_voice();
        } else if music_open {
            mixer.set_movie(false);
            let tracks = runtime.project.music_gallery.as_deref().unwrap_or(&[]);
            mixer.sync(
                crate::music::preview_asset(
                    tracks,
                    music_playing,
                    runtime.project.title_bgm.as_deref(),
                ),
                0,
                &runtime.source,
            );
            mixer.sync_amb(None, &runtime.source);
            mixer.stop_voice();
        } else if title_open {
            mixer.set_movie(false);
            mixer.sync(
                runtime.project.title_bgm.as_deref(),
                0,
                &runtime.source,
            );
            mixer.sync_amb(None, &runtime.source);
            mixer.stop_voice();
        } else {
            mixer.set_movie(false);
            mixer.sync(view.bgm.as_deref(), view.bgm_fade_ms, &runtime.source);
            mixer.sync_amb(view.amb.as_deref(), &runtime.source);
        }
        mixer.tick();
        if skipping || title_open || movie.is_some() || title_op.is_some() {
            mixer.stop_voice();
        } else {
            mixer.sync_voice(
                view.voice.as_deref(),
                &runtime.source,
                crate::audio::VOICE_FADE_MS,
            );
        }
        if !title_open {
            let se = runtime.take_se();
            if !se.is_empty() {
                mixer.play_se(&se, &runtime.source);
            }
        }

        let skip_present = !full_upload
            && dirty.is_empty()
            && shake_started.is_none()
            && flash_started.is_none()
            && !sliding
            && fade.is_none();
        if skip_present {
            std::thread::sleep(Duration::from_millis(1));
        } else if let Some(state) = &fade {
            let t = state.started.elapsed().as_secs_f32() * 1000.0 / state.ms as f32;
            let mixed = mix_rgba(&state.from, &fb.pixels, t);
            last_present.clone_from(&mixed);
            texture
                .update(None, &mixed, (WIDTH * 4) as usize)
                .map_err(|e| e.to_string())?;
            present_frame(&mut canvas, &texture, 0, 0)?;
        } else {
            if full_upload || overlay || title_open {
                last_present.clone_from(&fb.pixels);
                texture
                    .update(None, &fb.pixels, (WIDTH * 4) as usize)
                    .map_err(|e| e.to_string())?;
            } else {
                for (x, y, w, h) in dirty {
                    upload_rect(&mut texture, &fb, x, y, w, h)?;
                }
            }
            let (ox, oy) = if overlay {
                (0, 0)
            } else if let (Some(start), Some(ms)) = (shake_started, view.fx_shake_ms) {
                let elapsed = start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
                shake_offset(elapsed, ms)
            } else {
                (0, 0)
            };
            present_frame(&mut canvas, &texture, ox, oy)?;
        }

        let wait = wait_ms(
            settings.auto_play,
            settings.auto_delay_ms,
            view.auto_advance_ms,
        );
        let key = (
            view.scene_id.clone(),
            view.beat_index,
            wait,
            settings.auto_play,
            say_page,
        );
        if auto_key.as_ref() != Some(&key) {
            auto_key = Some(key);
            auto_until = None;
        }
        let fxk = (
            view.scene_id.clone(),
            view.beat_index,
            view.fx_wait_ms,
            view.fx_shake_ms,
            view.fx_flash_ms,
        );
        if fx_key.as_ref() != Some(&fxk) {
            fx_key = Some(fxk);
            fx_until = None;
            shake_started = view.fx_shake_ms.map(|_| Instant::now());
            flash_started = view.fx_flash_ms.map(|_| Instant::now());
        }
        let sk = (
            view.scene_id.clone(),
            view.beat_index,
            view.char_slide_ms,
        );
        if slide_key.as_ref() != Some(&sk) {
            slide_key = Some(sk);
            slide_started = view.char_slide_ms.map(|_| Instant::now());
        }
        let fx_hold = runtime.fx_holds();
        let movie_hold = runtime.movie_holds();
        let title_op_hold = title_op.is_some();
        if fx_hold {
            if !overlay && fade.is_none() && fx_until.is_none() {
                let ms = view
                    .fx_wait_ms
                    .or(view.fx_shake_ms)
                    .or(view.fx_flash_ms)
                    .or(view.char_slide_ms)
                    .unwrap_or(0);
                fx_until = Some(Instant::now() + Duration::from_millis(u64::from(ms)));
            }
            if !overlay && fade.is_none() && !skipping {
                if let Some(deadline) = fx_until {
                    if Instant::now() >= deadline {
                        fx_until = None;
                        advance_reading(&mut runtime, &mut seen);
                    }
                }
            }
        } else if movie_hold || title_op_hold {
            auto_until = None;
        } else if !overlay && fade.is_none() && typewriter.is_done() && auto_until.is_none() {
            if say_page + 1 < say_page_count {
                if settings.auto_play || view.auto_advance_ms.is_some() {
                    let ms = settings.auto_delay_ms.max(DELAY_MIN);
                    auto_until = Some(Instant::now() + Duration::from_millis(u64::from(ms)));
                }
            } else {
                auto_until = wait.map(|ms| Instant::now() + Duration::from_millis(u64::from(ms)));
            }
        }
        if !fx_hold && !overlay && fade.is_none() && !skipping {
            if let Some(deadline) = auto_until {
                if Instant::now() >= deadline && view.phase == Phase::Dialogue {
                    auto_until = None;
                    apply_confirm_say(
                        &mut typewriter,
                        &mut say_page,
                        say_page_count,
                        &mut runtime,
                        &mut seen,
                    );
                }
            }
        }

        if skipping {
            typewriter.complete();
        }
        if title_op_hold && !overlay && skip.pulse(skipping, Instant::now()) {
            title_op = None;
            mixer.set_movie(false);
        } else if !overlay
            && skip.pulse(skipping, Instant::now())
            && ctrl_skips(
                view.phase.clone(),
                settings.skip_unread,
                seen.is_read(&view.scene_id, view.beat_index),
                fx_hold || movie_hold,
            )
        {
            fade = None;
            apply_confirm_say(
                &mut typewriter,
                &mut say_page,
                say_page_count,
                &mut runtime,
                &mut seen,
            );
        }

        for event in events.poll_iter() {
            match event {
                Event::Quit { .. } => break 'running,
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::KpEnter),
                    keymod,
                    repeat: false,
                    ..
                } if keymod.intersects(Mod::LALTMOD | Mod::RALTMOD) => {
                    settings.fullscreen = !settings.fullscreen;
                    set_desktop_fullscreen(&mut canvas, settings.fullscreen);
                    let _ = write_config(&config_path, &settings);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Escape),
                    ..
                } => {
                    if title_op.take().is_some() {
                        mixer.set_movie(false);
                    } else if cg_view.take().is_some() {
                    } else if gallery_open {
                        gallery_open = false;
                    } else if music_open {
                        music_open = false;
                        music_playing = None;
                    } else if settings_open {
                        let _ = write_config(&config_path, &settings);
                        settings_open = false;
                        if settings_from_menu {
                            menu_open = true;
                        }
                    } else if backlog.open {
                        backlog.close();
                    } else if slot_pick.take().is_some() {
                        if !title_open {
                            menu_open = true;
                        }
                    } else if title_open {
                    } else {
                        menu_open = !menu_open;
                        if menu_open {
                            menu_sel = 0;
                        }
                    }
                }
                Event::MouseWheel { y, direction, .. } => {
                    if menu_open || slot_pick.is_some() || title_open || settings_open || gallery_open || music_open {
                        continue;
                    }
                    let dy = match direction {
                        sdl2::mouse::MouseWheelDirection::Flipped => -y,
                        _ => y,
                    };
                    // YU-NO P1: cycle multi-action button when hovering a hotspot.
                    if !backlog.open
                        && !ui_hidden
                        && runtime.view().phase == Phase::Explore
                    {
                        if let Some(id) = explore_focus.clone() {
                            let n = runtime.explore_available_actions(&id).len();
                            if n > 1 && dy != 0 {
                                if dy > 0 {
                                    explore_action_index = (explore_action_index + n - 1) % n;
                                } else {
                                    explore_action_index = (explore_action_index + 1) % n;
                                }
                                sync_explore_action(
                                    &mut runtime,
                                    Some(&id),
                                    explore_action_index,
                                );
                                continue;
                            }
                        }
                    }
                    if dy > 0 {
                        backlog.wheel_up(runtime.backlog().len());
                    } else if dy < 0 {
                        backlog.wheel_down();
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Up),
                    ..
                } if slot_pick.is_some() => {
                    slot_sel = wrap_index(slot_sel, -1, SLOT_COUNT);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Down),
                    ..
                } if slot_pick.is_some() => {
                    slot_sel = wrap_index(slot_sel, 1, SLOT_COUNT);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Up),
                    ..
                } if menu_open => {
                    menu_sel = wrap_index(menu_sel, -1, MENU_COUNT);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Down),
                    ..
                } if menu_open => {
                    menu_sel = wrap_index(menu_sel, 1, MENU_COUNT);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Up),
                    ..
                } if gallery_open && cg_view.is_none() => {
                    let n = runtime.project.cg.as_ref().map(|v| v.len()).unwrap_or(0);
                    if n > 0 {
                        gallery_sel = wrap_index(gallery_sel, -1, n);
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Down),
                    ..
                } if gallery_open && cg_view.is_none() => {
                    let n = runtime.project.cg.as_ref().map(|v| v.len()).unwrap_or(0);
                    if n > 0 {
                        gallery_sel = wrap_index(gallery_sel, 1, n);
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Up),
                    ..
                } if music_open => {
                    let n = runtime
                        .project
                        .music_gallery
                        .as_ref()
                        .map(|v| v.len())
                        .unwrap_or(0);
                    if n > 0 {
                        music_sel = wrap_index(music_sel, -1, n);
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Down),
                    ..
                } if music_open => {
                    let n = runtime
                        .project
                        .music_gallery
                        .as_ref()
                        .map(|v| v.len())
                        .unwrap_or(0);
                    if n > 0 {
                        music_sel = wrap_index(music_sel, 1, n);
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Up),
                    ..
                } if settings_open => {
                    settings_sel = wrap_index(settings_sel, -1, SETTINGS_ROWS);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Down),
                    ..
                } if settings_open => {
                    settings_sel = wrap_index(settings_sel, 1, SETTINGS_ROWS);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Left),
                    ..
                } if settings_open => {
                    apply_setting_delta(
                        &mut settings,
                        settings_sel,
                        setting_delta(settings_sel, -1),
                        &mut mixer,
                        &mut canvas,
                        &config_path,
                    );
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Right),
                    ..
                } if settings_open => {
                    apply_setting_delta(
                        &mut settings,
                        settings_sel,
                        setting_delta(settings_sel, 1),
                        &mut mixer,
                        &mut canvas,
                        &config_path,
                    );
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Up),
                    ..
                } if !overlay && view.phase == Phase::Choices && !view.choices.is_empty() => {
                    choice_sel = wrap_index(choice_sel, -1, view.choices.len());
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Down),
                    ..
                } if !overlay && view.phase == Phase::Choices && !view.choices.is_empty() => {
                    choice_sel = wrap_index(choice_sel, 1, view.choices.len());
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Up),
                    ..
                } if title_open => {
                    title_sel = wrap_index(title_sel, -1, TITLE_COUNT);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Down),
                    ..
                } if title_open => {
                    title_sel = wrap_index(title_sel, 1, TITLE_COUNT);
                }
                Event::KeyDown {
                    keycode: Some(code),
                    ..
                } if slot_pick.is_some() && digit_from_key(code) != 0 => {
                    if let Some(idx) = digit_to_slot_index(digit_from_key(code)) {
                        slot_sel = idx;
                        if apply_numbered_slot(
                            &mut runtime,
                            slot_pick,
                            idx,
                            &mut fade,
                            &mut auto_until,
                            &mut auto_key,
                            last_thumb.as_deref(),
                        ) {
                            slot_pick = None;
                            menu_open = false;
                            title_open = false;
                            title_dirty = false;
                        }
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } if slot_pick.is_some() => {
                    if apply_numbered_slot(
                        &mut runtime,
                        slot_pick,
                        slot_sel,
                        &mut fade,
                        &mut auto_until,
                        &mut auto_key,
                        last_thumb.as_deref(),
                    ) {
                        slot_pick = None;
                        menu_open = false;
                        title_open = false;
                        title_dirty = false;
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } if gallery_open => {
                    if cg_view.take().is_none() {
                        let cgs = runtime.project.cg.as_deref().unwrap_or(&[]);
                        if let Some(item) = cgs.get(gallery_sel) {
                            if seen.has(&item.asset) {
                                cg_view = Some(gallery_sel);
                            }
                        }
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } if music_open => {
                    let n = runtime
                        .project
                        .music_gallery
                        .as_ref()
                        .map(|v| v.len())
                        .unwrap_or(0);
                    if n > 0 {
                        music_playing = Some(music_sel.min(n - 1));
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } if title_op.is_some() => {
                    title_op = None;
                    mixer.set_movie(false);
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } if title_open && !settings_open && !gallery_open && !music_open => {
                    match TITLE_ACTIONS[title_sel] {
                        TitleAction::NewGame => {
                            start_new_game(
                                &mut runtime,
                                title_dirty,
                                &mut fade,
                                &mut auto_until,
                                &mut auto_key,
                            );
                            title_open = false;
                            title_dirty = false;
                            title_op = begin_title_op(&runtime);
                            if title_op.is_some() {
                                mixer.set_movie(true);
                            }
                        }
                        TitleAction::Continue => {
                            if load_slot(
                                &mut runtime,
                                AUTO_SLOT,
                                &mut fade,
                                &mut auto_until,
                                &mut auto_key,
                            ) {
                                title_open = false;
                                title_dirty = false;
                            }
                        }
                        TitleAction::LoadSlots => {
                            slot_pick = Some(false);
                            slot_sel = 0;
                        }
                        TitleAction::Gallery => {
                            gallery_open = true;
                            gallery_sel = 0;
                            cg_view = None;
                        }
                        TitleAction::Music => {
                            music_open = true;
                            music_sel = 0;
                            music_playing = None;
                        }
                        TitleAction::Settings => {
                            settings_open = true;
                            settings_sel = 0;
                            settings_from_menu = false;
                        }
                        TitleAction::Quit => break 'running,
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } if menu_open => {
                    match ACTIONS[menu_sel] {
                        MenuAction::Continue => menu_open = false,
                        MenuAction::QuickSave => {
                            let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
                            let _ = write_slot(&dir, 0, &runtime.to_save());
                            persist_thumb(&dir, 0, last_thumb.as_deref());
                            menu_open = false;
                        }
                        MenuAction::QuickLoad => {
                            if load_slot(&mut runtime, 0, &mut fade, &mut auto_until, &mut auto_key)
                            {
                                menu_open = false;
                            }
                        }
                        MenuAction::AutoLoad => {
                            if load_slot(
                                &mut runtime,
                                AUTO_SLOT,
                                &mut fade,
                                &mut auto_until,
                                &mut auto_key,
                            ) {
                                menu_open = false;
                            }
                        }
                        MenuAction::SaveSlots => {
                            slot_pick = Some(true);
                            slot_sel = 0;
                        }
                        MenuAction::LoadSlots => {
                            slot_pick = Some(false);
                            slot_sel = 0;
                        }
                        MenuAction::Settings => {
                            settings_open = true;
                            settings_sel = 0;
                            settings_from_menu = true;
                            menu_open = false;
                        }
                        MenuAction::ToTitle => {
                            go_to_title(
                                &mut title_open,
                                &mut title_sel,
                                &mut title_dirty,
                                &mut menu_open,
                                &mut slot_pick,
                                &mut backlog,
                                &mut gallery_open,
                                &mut cg_view,
                                &mut music_open,
                                &mut music_playing,
                                &mut fade,
                                &mut ui_hidden,
                                &mut skip_latch,
                            );
                        }
                        MenuAction::Quit => break 'running,
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::F5),
                    ..
                } if !title_open => {
                    let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
                    let _ = write_slot(&dir, 0, &runtime.to_save());
                    persist_thumb(&dir, 0, last_thumb.as_deref());
                }
                Event::KeyDown {
                    keycode: Some(Keycode::F9),
                    ..
                } => {
                    let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
                    if let Ok(save) = read_slot(&dir, 0) {
                        if check_save(&save, &runtime.project.id, runtime.project.schema_version).is_ok()
                        {
                            let _ = runtime.apply_save(&save);
                            fade = None;
                            auto_until = None;
                            auto_key = None;
                            title_open = false;
                            title_dirty = false;
                        }
                    }
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } if backlog.open => {
                    backlog.close();
                }
                Event::KeyDown {
                    keycode: Some(Keycode::Return) | Some(Keycode::Space),
                    ..
                } => {
                    if ui_hidden {
                        ui_hidden = false;
                        continue;
                    }
                    if fade.take().is_some() {
                        continue;
                    }
                    if matches!(view.phase, Phase::Ended | Phase::MissingScene(_)) {
                        go_to_title(
                            &mut title_open,
                            &mut title_sel,
                            &mut title_dirty,
                            &mut menu_open,
                            &mut slot_pick,
                            &mut backlog,
                            &mut gallery_open,
                            &mut cg_view,
                            &mut music_open,
                            &mut music_playing,
                            &mut fade,
                            &mut ui_hidden,
                            &mut skip_latch,
                        );
                        continue;
                    }
                    if view.phase == Phase::Choices {
                        if runtime.choose(choice_sel) {
                            let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
                            let _ = write_slot(&dir, AUTO_SLOT, &runtime.to_save());
                        }
                        continue;
                    }
                    if view.phase == Phase::Dialogue {
                        apply_confirm_say(
                            &mut typewriter,
                            &mut say_page,
                            say_page_count,
                            &mut runtime,
                            &mut seen,
                        );
                        continue;
                    }
                    if view.phase == Phase::Explore {
                        // Space/Enter does not click hotspots — wait for mouse.
                        continue;
                    }
                    advance_reading(&mut runtime, &mut seen);
                }
                Event::MouseMotion { x, y, .. } => {
                    if let InvDrag::Press {
                        item,
                        x: sx,
                        y: sy,
                    } = &inv_drag
                    {
                        let (ww, wh) = canvas.output_size()?;
                        if let Some((lx, ly)) = window_to_logical(x, y, ww, wh) {
                            if (lx - *sx).abs() >= INV_DRAG_PX || (ly - *sy).abs() >= INV_DRAG_PX {
                                let item = item.clone();
                                inv_drag = InvDrag::Drag { item };
                                // Drag must not also leave Aim pending.
                                runtime.select_item(None);
                            }
                        }
                    }
                }
                Event::MouseButtonUp {
                    mouse_btn: MouseButton::Left,
                    x,
                    y,
                    ..
                } => {
                    let (ww, wh) = canvas.output_size()?;
                    let logical = window_to_logical(x, y, ww, wh);
                    let gesture = std::mem::replace(&mut inv_drag, InvDrag::Idle);
                    match gesture {
                        InvDrag::Drag { item } => {
                            if runtime.view().phase == Phase::Explore {
                                if let Some((lx, ly)) = logical {
                                    if let Some(hs) = runtime.explore_hit(lx, ly) {
                                        runtime.interact_with_item(
                                            &hs,
                                            &item,
                                            ItemUseMode::Drag,
                                        );
                                    }
                                }
                            }
                        }
                        InvDrag::Press { item, .. } => {
                            // Click without drag → Aim select / toggle.
                            if runtime.view().phase == Phase::Explore
                                && !overlay
                                && !title_open
                                && !menu_open
                                && !ui_hidden
                            {
                                let cur = runtime.explore_pending_item();
                                if cur.as_deref() == Some(item.as_str()) {
                                    runtime.select_item(None);
                                } else {
                                    runtime.select_item(Some(&item));
                                }
                            }
                        }
                        InvDrag::Idle => {}
                    }
                }
                Event::MouseButtonDown {
                    mouse_btn: MouseButton::Right,
                    ..
                } if !overlay && !title_open => {
                    ui_hidden = !ui_hidden;
                }
                Event::MouseButtonDown {
                    mouse_btn: MouseButton::Left,
                    x,
                    y,
                    ..
                } => {
                    let (ww, wh) = canvas.output_size()?;
                    let Some((lx, ly)) = window_to_logical(x, y, ww, wh) else {
                        continue;
                    };
                    if settings_open {
                        if let Some(i) = hit_setting(lx, ly) {
                            settings_sel = i;
                            let (x, _y, w, _h) = crate::settings::row_rect(i);
                            let sign = if lx < x + w / 2 { -1 } else { 1 };
                            let delta = setting_delta(i, sign);
                            apply_setting_delta(
                                &mut settings,
                                i,
                                delta,
                                &mut mixer,
                                &mut canvas,
                                &config_path,
                            );
                        }
                        continue;
                    }
                    if backlog.open {
                        let (start, count) = backlog.window(runtime.backlog().len());
                        if let Some(i) = backlog::hit_row(lx, ly, count) {
                            let (scene, beat) = {
                                let line = &runtime.backlog()[start + i];
                                (line.scene.clone(), line.beat_index)
                            };
                            if runtime.jump_back(&scene, beat) {
                                fade = None;
                                auto_until = None;
                                auto_key = None;
                            }
                        }
                        backlog.close();
                        continue;
                    }
                    if let Some(saving) = slot_pick {
                        if let Some(i) = hit_slot(lx, ly) {
                            slot_sel = i;
                            if apply_numbered_slot(
                                &mut runtime,
                                Some(saving),
                                i,
                                &mut fade,
                                &mut auto_until,
                                &mut auto_key,
                                last_thumb.as_deref(),
                            ) {
                                slot_pick = None;
                                menu_open = false;
                                title_open = false;
                                title_dirty = false;
                            }
                        }
                        continue;
                    }
                    if menu_open {
                        if let Some(i) = hit_menu(
                            lx,
                            ly,
                            runtime.project.pause_buttons.as_ref(),
                            &pause_sizes,
                        ) {
                            pressed_menu = Some(i);
                            menu_sel = i;
                            match ACTIONS[i] {
                                MenuAction::Continue => menu_open = false,
                                MenuAction::QuickSave => {
                                    let dir = default_save_dir(
                                        &runtime.project.id,
                                        &runtime.project_dir,
                                    );
                                    let _ = write_slot(&dir, 0, &runtime.to_save());
                                    persist_thumb(&dir, 0, last_thumb.as_deref());
                                    menu_open = false;
                                }
                                MenuAction::QuickLoad => {
                                    if load_slot(
                                        &mut runtime,
                                        0,
                                        &mut fade,
                                        &mut auto_until,
                                        &mut auto_key,
                                    ) {
                                        menu_open = false;
                                    }
                                }
                                MenuAction::AutoLoad => {
                                    if load_slot(
                                        &mut runtime,
                                        AUTO_SLOT,
                                        &mut fade,
                                        &mut auto_until,
                                        &mut auto_key,
                                    ) {
                                        menu_open = false;
                                    }
                                }
                                MenuAction::SaveSlots => {
                                    slot_pick = Some(true);
                                    slot_sel = 0;
                                }
                                MenuAction::LoadSlots => {
                                    slot_pick = Some(false);
                                    slot_sel = 0;
                                }
                                MenuAction::Settings => {
                                    settings_open = true;
                                    settings_sel = 0;
                                    settings_from_menu = true;
                                    menu_open = false;
                                }
                                MenuAction::ToTitle => {
                                    go_to_title(
                                        &mut title_open,
                                        &mut title_sel,
                                        &mut title_dirty,
                                        &mut menu_open,
                                        &mut slot_pick,
                                        &mut backlog,
                                        &mut gallery_open,
                                        &mut cg_view,
                                        &mut music_open,
                                        &mut music_playing,
                                        &mut fade,
                                        &mut ui_hidden,
                                        &mut skip_latch,
                                    );
                                }
                                MenuAction::Quit => break 'running,
                            }
                        }
                        continue;
                    }
                    if gallery_open {
                        if cg_view.take().is_none() {
                            let cgs = runtime.project.cg.as_deref().unwrap_or(&[]);
                            if let Some(i) = gallery::hit_row(lx, ly, cgs.len()) {
                                gallery_sel = i;
                                if cgs.get(i).is_some_and(|item| seen.has(&item.asset)) {
                                    cg_view = Some(i);
                                }
                            }
                        }
                        continue;
                    }
                    if music_open {
                        let n = runtime
                            .project
                            .music_gallery
                            .as_ref()
                            .map(|v| v.len())
                            .unwrap_or(0);
                        if let Some(i) = gallery::hit_row(lx, ly, n) {
                            music_sel = i;
                            music_playing = Some(i);
                        }
                        continue;
                    }
                    if title_op.take().is_some() {
                        mixer.set_movie(false);
                        continue;
                    }
                    if title_open {
                        if let Some(i) = hit_title(
                            lx,
                            ly,
                            runtime.project.title_buttons.as_ref(),
                            &title_sizes,
                        ) {
                            title_sel = i;
                            pressed_title = Some(i);
                            match TITLE_ACTIONS[i] {
                                TitleAction::NewGame => {
                                    start_new_game(
                                        &mut runtime,
                                        title_dirty,
                                        &mut fade,
                                        &mut auto_until,
                                        &mut auto_key,
                                    );
                                    title_open = false;
                                    title_dirty = false;
                                    title_op = begin_title_op(&runtime);
                                    if title_op.is_some() {
                                        mixer.set_movie(true);
                                    }
                                }
                                TitleAction::Continue => {
                                    if load_slot(
                                        &mut runtime,
                                        AUTO_SLOT,
                                        &mut fade,
                                        &mut auto_until,
                                        &mut auto_key,
                                    ) {
                                        title_open = false;
                                        title_dirty = false;
                                    }
                                }
                                TitleAction::LoadSlots => {
                                    slot_pick = Some(false);
                                    slot_sel = 0;
                                }
                                TitleAction::Gallery => {
                                    gallery_open = true;
                                    gallery_sel = 0;
                                    cg_view = None;
                                }
                                TitleAction::Music => {
                                    music_open = true;
                                    music_sel = 0;
                                    music_playing = None;
                                }
                                TitleAction::Settings => {
                                    settings_open = true;
                                    settings_sel = 0;
                                    settings_from_menu = false;
                                }
                                TitleAction::Quit => break 'running,
                            }
                        }
                        continue;
                    }
                    if ui_hidden {
                        ui_hidden = false;
                        continue;
                    }
                    if show_hud_now(
                        overlay,
                        title_open,
                        ui_hidden,
                        title_op.is_some(),
                        movie.is_some(),
                        &runtime.view(),
                    ) {
                        if let Some(i) = hud::hit_hud(lx, ly) {
                            pressed_hud = Some(i);
                            apply_hud(
                                HUD_ACTIONS[i],
                                &mut settings,
                                &config_path,
                                &mut skip_latch,
                                &mut ui_hidden,
                                &mut backlog,
                                &mut menu_open,
                                &mut menu_sel,
                                &mut runtime,
                                &mut fade,
                                &mut auto_until,
                                &mut auto_key,
                                &mut title_open,
                                &mut title_dirty,
                                last_thumb.as_deref(),
                            );
                            continue;
                        }
                    }
                    if fade.take().is_some() {
                        continue;
                    }
                    if matches!(
                        runtime.view().phase,
                        Phase::Ended | Phase::MissingScene(_)
                    ) {
                        go_to_title(
                            &mut title_open,
                            &mut title_sel,
                            &mut title_dirty,
                            &mut menu_open,
                            &mut slot_pick,
                            &mut backlog,
                            &mut gallery_open,
                            &mut cg_view,
                            &mut music_open,
                            &mut music_playing,
                            &mut fade,
                            &mut ui_hidden,
                            &mut skip_latch,
                        );
                        continue;
                    }
                    if runtime.view().phase == Phase::Choices {
                        if let Some(i) = hit_choice(lx, ly, runtime.view().choices.len()) {
                            choice_sel = i;
                            pressed_choice = Some(i);
                            if runtime.choose(i) {
                                let dir = default_save_dir(
                                    &runtime.project.id,
                                    &runtime.project_dir,
                                );
                                let _ = write_slot(&dir, AUTO_SLOT, &runtime.to_save());
                            }
                        }
                    } else if runtime.view().phase == Phase::Dialogue {
                        apply_confirm_say(
                            &mut typewriter,
                            &mut say_page,
                            say_page_count,
                            &mut runtime,
                            &mut seen,
                        );
                    } else if runtime.view().phase == Phase::Explore {
                        let inv = explore_inv_rows(&runtime);
                        if let Some(iid) = hit_explore_item(lx, ly, &inv) {
                            // Defer Aim toggle / Drag to MouseButtonUp.
                            inv_drag = InvDrag::Press {
                                item: iid,
                                x: lx,
                                y: ly,
                            };
                        } else if hit_explore_action(lx, ly) {
                            if let Some(id) = explore_focus.clone() {
                                sync_explore_action(
                                    &mut runtime,
                                    Some(&id),
                                    explore_action_index,
                                );
                                runtime.interact_hotspot(&id);
                            } else if explore_focus_room {
                                runtime.interact_empty();
                            }
                        } else if let Some(hs) = runtime.explore_hit(lx, ly) {
                            explore_focus = Some(hs.clone());
                            explore_focus_room = false;
                            explore_action_index = 0;
                            sync_explore_action(&mut runtime, Some(&hs), 0);
                            runtime.interact_hotspot(&hs);
                        } else {
                            explore_focus = None;
                            explore_focus_room = true;
                            explore_action_index = 0;
                            runtime.interact_empty();
                        }
                    } else {
                        advance_reading(&mut runtime, &mut seen);
                    }
                }
                _ => {}
            }
        }
    }
    Ok(())
}

fn apply_window_icon(window: &mut sdl2::video::Window, runtime: &Runtime) {
    let bytes = std::env::current_exe()
        .ok()
        .and_then(|exe| std::fs::read(exe.parent()?.join("game.ico")).ok())
        .or_else(|| {
            let logical = runtime.project.icon.as_deref()?;
            runtime
                .source
                .read_asset(logical, &["ico", "png"])
                .map(|(_, data)| data)
        });
    let Some(bytes) = bytes else {
        return;
    };
    let Ok(img) = image::load_from_memory(&bytes) else {
        return;
    };
    let rgba = img.into_rgba8();
    let w = rgba.width();
    let h = rgba.height();
    let mut raw = rgba.into_raw();
    let pitch = w.saturating_mul(4);
    let Ok(surface) = sdl2::surface::Surface::from_data(
        &mut raw,
        w,
        h,
        pitch,
        PixelFormatEnum::ABGR8888,
    ) else {
        return;
    };
    window.set_icon(surface);
}

fn set_desktop_fullscreen(
    canvas: &mut sdl2::render::Canvas<sdl2::video::Window>,
    on: bool,
) {
    let mode = if on {
        sdl2::video::FullscreenType::Desktop
    } else {
        sdl2::video::FullscreenType::Off
    };
    let _ = canvas.window_mut().set_fullscreen(mode);
}

fn apply_setting_delta(
    settings: &mut crate::settings::Settings,
    index: usize,
    delta: i32,
    mixer: &mut Mixer,
    canvas: &mut sdl2::render::Canvas<sdl2::video::Window>,
    config_path: &std::path::Path,
) {
    if index == FULLSCREEN_ROW {
        settings.fullscreen = !settings.fullscreen;
        set_desktop_fullscreen(canvas, settings.fullscreen);
    } else if index == AUTO_PLAY_ROW {
        settings.auto_play = !settings.auto_play;
    } else if index == SKIP_UNREAD_ROW {
        settings.skip_unread = !settings.skip_unread;
    } else if index == AUTO_DELAY_ROW {
        settings.bump_delay(delta);
    } else if index == TEXT_SPEED_ROW {
        settings.bump_speed(delta);
    } else if index == UI_LANG_ROW {
        settings.ui_language = settings.ui_language.cycle();
    } else {
        settings.bump(index, delta);
        mixer.set_settings(*settings);
    }
    let _ = write_config(config_path, settings);
}

fn setting_delta(index: usize, sign: i32) -> i32 {
    if index == AUTO_DELAY_ROW {
        sign * DELAY_STEP as i32
    } else if index == TEXT_SPEED_ROW {
        sign
    } else if index == FULLSCREEN_ROW
        || index == AUTO_PLAY_ROW
        || index == SKIP_UNREAD_ROW
        || index == UI_LANG_ROW
    {
        sign
    } else {
        sign * STEP
    }
}

fn digit_from_key(key: Keycode) -> u8 {
    match key {
        Keycode::Num1 | Keycode::Kp1 => 1,
        Keycode::Num2 | Keycode::Kp2 => 2,
        Keycode::Num3 | Keycode::Kp3 => 3,
        Keycode::Num4 | Keycode::Kp4 => 4,
        Keycode::Num5 | Keycode::Kp5 => 5,
        Keycode::Num6 | Keycode::Kp6 => 6,
        Keycode::Num7 | Keycode::Kp7 => 7,
        Keycode::Num8 | Keycode::Kp8 => 8,
        Keycode::Num9 | Keycode::Kp9 => 9,
        _ => 0,
    }
}

fn go_to_title(
    title_open: &mut bool,
    title_sel: &mut usize,
    title_dirty: &mut bool,
    menu_open: &mut bool,
    slot_pick: &mut Option<bool>,
    backlog: &mut BacklogView,
    gallery_open: &mut bool,
    cg_view: &mut Option<usize>,
    music_open: &mut bool,
    music_playing: &mut Option<usize>,
    fade: &mut Option<Fade>,
    ui_hidden: &mut bool,
    skip_latch: &mut bool,
) {
    *menu_open = false;
    *slot_pick = None;
    backlog.close();
    *gallery_open = false;
    *cg_view = None;
    *music_open = false;
    *music_playing = None;
    *title_open = true;
    *title_sel = 0;
    *title_dirty = true;
    *fade = None;
    *ui_hidden = false;
    *skip_latch = false;
}

fn apply_hud(
    action: HudAction,
    settings: &mut crate::settings::Settings,
    config_path: &std::path::Path,
    skip_latch: &mut bool,
    ui_hidden: &mut bool,
    backlog: &mut BacklogView,
    menu_open: &mut bool,
    menu_sel: &mut usize,
    runtime: &mut Runtime,
    fade: &mut Option<Fade>,
    auto_until: &mut Option<Instant>,
    auto_key: &mut Option<(String, usize, Option<u32>, bool, usize)>,
    title_open: &mut bool,
    title_dirty: &mut bool,
    last_thumb: Option<&[u8]>,
) {
    *ui_hidden = false;
    match action {
        HudAction::Auto => {
            settings.auto_play = !settings.auto_play;
            let _ = write_config(config_path, settings);
        }
        HudAction::Skip => {
            *skip_latch = !*skip_latch;
        }
        HudAction::QuickSave => {
            if !*title_open {
                let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
                let _ = write_slot(&dir, 0, &runtime.to_save());
                persist_thumb(&dir, 0, last_thumb);
            }
        }
        HudAction::QuickLoad => {
            if load_slot(runtime, 0, fade, auto_until, auto_key) {
                *title_open = false;
                *title_dirty = false;
            }
        }
        HudAction::Log => {
            backlog.wheel_up(runtime.backlog().len());
        }
        HudAction::Menu => {
            *menu_open = true;
            *menu_sel = 0;
        }
    }
}

fn apply_confirm_say(
    typewriter: &mut Typewriter,
    say_page: &mut usize,
    page_count: usize,
    runtime: &mut Runtime,
    seen: &mut Seen,
) {
    match saypage::confirm_say(typewriter.is_done(), *say_page, page_count) {
        ConfirmSay::FinishReveal => typewriter.complete(),
        ConfirmSay::NextPage => *say_page += 1,
        ConfirmSay::AdvanceBeat => advance_reading(runtime, seen),
    }
}

fn advance_reading(runtime: &mut Runtime, seen: &mut Seen) {
    let view = runtime.view();
    if view.phase == Phase::Dialogue && view.say_text.is_some() {
        seen.note_read(&view.scene_id, view.beat_index);
    }
    runtime.click_advance();
}

fn begin_title_op(runtime: &Runtime) -> Option<movie::Play> {
    let logical = runtime.project.title_movie.as_deref()?;
    movie::Play::open(&runtime.source, logical)
}

fn start_new_game(
    runtime: &mut Runtime,
    dirty: bool,
    fade: &mut Option<Fade>,
    auto_until: &mut Option<Instant>,
    auto_key: &mut Option<(String, usize, Option<u32>, bool, usize)>,
) {
    if dirty {
        let _ = runtime.restart();
    }
    *fade = None;
    *auto_until = None;
    *auto_key = None;
}

fn load_slot(
    runtime: &mut Runtime,
    slot: u8,
    fade: &mut Option<Fade>,
    auto_until: &mut Option<Instant>,
    auto_key: &mut Option<(String, usize, Option<u32>, bool, usize)>,
) -> bool {
    let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
    let Ok(save) = read_slot(&dir, slot) else {
        return false;
    };
    if check_save(&save, &runtime.project.id, runtime.project.schema_version).is_err() {
        return false;
    }
    if runtime.apply_save(&save).is_err() {
        return false;
    }
    *fade = None;
    *auto_until = None;
    *auto_key = None;
    true
}

fn persist_thumb(dir: &std::path::Path, slot: u8, thumb: Option<&[u8]>) {
    if slot == AUTO_SLOT {
        return;
    }
    if let Some(px) = thumb {
        let _ = write_thumb(dir, slot, px, THUMB_W, THUMB_H);
    }
}

fn apply_numbered_slot(
    runtime: &mut Runtime,
    slot_pick: Option<bool>,
    index: usize,
    fade: &mut Option<Fade>,
    auto_until: &mut Option<Instant>,
    auto_key: &mut Option<(String, usize, Option<u32>, bool, usize)>,
    thumb: Option<&[u8]>,
) -> bool {
    let Some(saving) = slot_pick else {
        return false;
    };
    let slot = index_to_slot(index);
    if saving {
        let dir = default_save_dir(&runtime.project.id, &runtime.project_dir);
        let ok = write_slot(&dir, slot, &runtime.to_save()).is_ok();
        if ok {
            persist_thumb(&dir, slot, thumb);
        }
        ok
    } else {
        load_slot(runtime, slot, fade, auto_until, auto_key)
    }
}


fn sync_explore_action(runtime: &mut Runtime, hotspot_id: Option<&str>, index: usize) {
    if runtime.explore_pending_item().is_some() {
        return;
    }
    let Some(id) = hotspot_id else {
        return;
    };
    let actions = runtime.explore_available_actions(id);
    if actions.is_empty() {
        return;
    }
    let action = &actions[index % actions.len()];
    if let Some(verb) = action.verb.as_deref() {
        runtime.select_verb(Some(verb));
    }
}

fn explore_inv_rows(runtime: &Runtime) -> Vec<(String, String, bool)> {
    let pending = runtime.explore_pending_item();
    runtime
        .explore_inventory()
        .into_iter()
        .map(|id| {
            let on = pending.as_deref() == Some(id.as_str());
            let label = runtime
                .project
                .items
                .iter()
                .find(|item| item.id == id)
                .map(|item| item.name.clone())
                .unwrap_or_else(|| id.clone());
            (id, label, on)
        })
        .collect()
}

fn show_hud_now(
    overlay: bool,
    title_open: bool,
    ui_hidden: bool,
    title_op: bool,
    movie: bool,
    view: &crate::vm::View,
) -> bool {
    !overlay
        && !title_open
        && !ui_hidden
        && !title_op
        && !movie
        && matches!(
            view.phase,
            Phase::Dialogue | Phase::Choices | Phase::Ended | Phase::MissingScene(_)
        )
        && (view.say_text.is_some() || view.phase != Phase::Dialogue)
}

fn upload_rect(
    texture: &mut sdl2::render::Texture,
    fb: &Framebuffer,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Result<(), String> {
    let x0 = x.max(0) as u32;
    let y0 = y.max(0) as u32;
    let x1 = (x + w).clamp(0, WIDTH as i32) as u32;
    let y1 = (y + h).clamp(0, HEIGHT as i32) as u32;
    if x0 >= x1 || y0 >= y1 {
        return Ok(());
    }
    let rw = x1 - x0;
    let rh = y1 - y0;
    let offset = ((y0 * WIDTH + x0) * 4) as usize;
    let pitch = (WIDTH * 4) as usize;
    let last = offset + ((rh - 1) as usize) * pitch + (rw as usize) * 4;
    texture
        .update(
            Rect::new(x0 as i32, y0 as i32, rw, rh),
            &fb.pixels[offset..last],
            pitch,
        )
        .map_err(|e| e.to_string())
}

fn present_frame(
    canvas: &mut sdl2::render::Canvas<sdl2::video::Window>,
    texture: &sdl2::render::Texture,
    ox: i32,
    oy: i32,
) -> Result<(), String> {
    let (ww, wh) = canvas.output_size()?;
    canvas.set_draw_color(sdl2::pixels::Color::RGB(0, 0, 0));
    canvas.clear();
    let (dx, dy, dw, dh, _) = letterbox(ww, wh);
    canvas.copy(texture, None, Rect::new(dx + ox, dy + oy, dw, dh))?;
    canvas.present();
    Ok(())
}
