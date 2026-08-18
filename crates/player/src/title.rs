use galeng_schema::{TitleButton, TitleButtons};

pub const TITLE_COUNT: usize = 7;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TitleAction {
    NewGame,
    Continue,
    LoadSlots,
    Gallery,
    Music,
    Settings,
    Quit,
}

pub const TITLE_ACTIONS: [TitleAction; TITLE_COUNT] = [
    TitleAction::NewGame,
    TitleAction::Continue,
    TitleAction::LoadSlots,
    TitleAction::Gallery,
    TitleAction::Music,
    TitleAction::Settings,
    TitleAction::Quit,
];

/// Cold start shows the title unless the project opted out or the editor jumped in.
pub fn show_title(skip_title: bool, jumped_in: bool) -> bool {
    !skip_title && !jumped_in
}

/// New Game from the title may play OP. skipTitle / --scene never do.
pub fn should_play_title_op(skip_title: bool, jumped_in: bool, title_movie: Option<&str>) -> bool {
    show_title(skip_title, jumped_in) && title_movie.is_some()
}

pub fn game_window_title(project_title: &str) -> String {
    let trimmed = project_title.trim();
    if trimmed.is_empty() {
        "Galeng".into()
    } else {
        trimmed.to_string()
    }
}

pub fn title_labels(locale: &str) -> [&'static str; TITLE_COUNT] {
    match locale {
        "en" => ["New game", "Continue", "Load…", "CG", "Music", "Settings", "Quit"],
        "zh-Hans" => ["开始游戏", "继续", "读档…", "CG 回顾", "音乐回顾", "设置", "离开"],
        _ => ["開始遊戲", "繼續", "讀檔…", "CG 回想", "音樂回想", "設定", "離開"],
    }
}

pub fn default_title_rect(index: usize) -> (i32, i32, i32, i32) {
    let y = 400 + (index as i32) * 68;
    (660, y, 600, 56)
}

pub fn title_spec(buttons: Option<&TitleButtons>, index: usize) -> Option<&TitleButton> {
    buttons.and_then(|set| set.get(index))
}

pub fn title_caption(locale: &str, spec: Option<&TitleButton>, index: usize) -> String {
    match spec.and_then(|btn| btn.label.as_ref()) {
        Some(label) => label.clone(),
        None => title_labels(locale)[index].to_string(),
    }
}

pub fn chrome_rect(
    default: (i32, i32, i32, i32),
    spec: Option<&TitleButton>,
    image_wh: Option<(u32, u32)>,
) -> (i32, i32, i32, i32) {
    let (dx, dy, dw, dh) = default;
    let x = spec.and_then(|btn| btn.x).unwrap_or(dx);
    let y = spec.and_then(|btn| btn.y).unwrap_or(dy);
    let w = spec
        .and_then(|btn| btn.w)
        .or_else(|| image_wh.map(|(width, _)| width as i32))
        .unwrap_or(dw);
    let h = spec
        .and_then(|btn| btn.h)
        .or_else(|| image_wh.map(|(_, height)| height as i32))
        .unwrap_or(dh);
    (x, y, w, h)
}

pub fn title_rect(
    index: usize,
    spec: Option<&TitleButton>,
    image_wh: Option<(u32, u32)>,
) -> (i32, i32, i32, i32) {
    chrome_rect(default_title_rect(index), spec, image_wh)
}

pub fn image_sizes(
    buttons: Option<&TitleButtons>,
    mut size_of: impl FnMut(&str) -> Option<(u32, u32)>,
) -> [Option<(u32, u32)>; TITLE_COUNT] {
    let mut out = [None; TITLE_COUNT];
    for i in 0..TITLE_COUNT {
        if let Some(path) = title_spec(buttons, i).and_then(|btn| btn.image.as_deref()) {
            out[i] = size_of(path);
        }
    }
    out
}

pub fn hit_title(
    lx: i32,
    ly: i32,
    buttons: Option<&TitleButtons>,
    sizes: &[Option<(u32, u32)>; TITLE_COUNT],
) -> Option<usize> {
    for i in 0..TITLE_COUNT {
        let spec = title_spec(buttons, i);
        let (x, y, w, h) = title_rect(i, spec, sizes[i]);
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(i);
        }
    }
    None
}

pub fn title_face<'a>(spec: Option<&'a TitleButton>, hot: bool) -> Option<&'a str> {
    let image = spec.and_then(|btn| btn.image.as_deref())?;
    if hot {
        spec.and_then(|btn| btn.hover.as_deref()).or(Some(image))
    } else {
        Some(image)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galeng_schema::TitleButtons;

    #[test]
    fn cold_start_shows_unless_skipped_or_jumped() {
        assert!(show_title(false, false));
        assert!(!show_title(true, false));
        assert!(!show_title(false, true));
        assert!(!show_title(true, true));
    }

    #[test]
    fn title_op_only_from_real_title() {
        assert!(should_play_title_op(false, false, Some("movie/op")));
        assert!(!should_play_title_op(true, false, Some("movie/op")));
        assert!(!should_play_title_op(false, true, Some("movie/op")));
        assert!(!should_play_title_op(false, false, None));
    }

    #[test]
    fn hit_new_game() {
        let empty = [None; TITLE_COUNT];
        let (x, y, w, h) = title_rect(0, None, None);
        assert_eq!(hit_title(x + 1, y + 1, None, &empty), Some(0));
        assert_eq!(hit_title(x + w / 2, y + h + 10, None, &empty), None);
    }

    #[test]
    fn override_moves_hit() {
        let spec = TitleButton {
            x: Some(80),
            y: Some(720),
            w: Some(200),
            h: Some(40),
            ..TitleButton::default()
        };
        let buttons = TitleButtons {
            new_game: Some(spec.clone()),
            ..TitleButtons::default()
        };
        let sizes = [None; TITLE_COUNT];
        assert_eq!(title_rect(0, Some(&spec), None), (80, 720, 200, 40));
        assert_eq!(hit_title(90, 730, Some(&buttons), &sizes), Some(0));
        let (dx, dy, _, _) = default_title_rect(0);
        assert_eq!(hit_title(dx + 1, dy + 1, Some(&buttons), &sizes), None);
        assert_eq!(title_rect(1, None, None), default_title_rect(1));
    }

    #[test]
    fn image_size_fills_missing_wh() {
        let spec = TitleButton {
            image: Some("ui/title/start".into()),
            label: Some(String::new()),
            ..TitleButton::default()
        };
        assert_eq!(title_rect(0, Some(&spec), Some((320, 64))), (660, 400, 320, 64));
        assert_eq!(title_caption("zh-Hant", Some(&spec), 0), "");
        assert_eq!(title_face(Some(&spec), false), Some("ui/title/start"));
        assert_eq!(title_face(Some(&spec), true), Some("ui/title/start"));
    }

    #[test]
    fn hover_image_when_hot() {
        let spec = TitleButton {
            image: Some("ui/title/start".into()),
            hover: Some("ui/title/start_h".into()),
            ..TitleButton::default()
        };
        assert_eq!(title_face(Some(&spec), true), Some("ui/title/start_h"));
        assert_eq!(title_caption("en", Some(&spec), 0), "New game");
    }

    #[test]
    fn labels_three_locales() {
        assert_eq!(title_labels("en")[0], "New game");
        assert_eq!(title_labels("zh-Hans")[1], "继续");
        assert_eq!(title_labels("zh-Hant")[2], "讀檔…");
        assert_eq!(title_labels("zh-Hant")[3], "CG 回想");
        assert_eq!(title_labels("zh-Hant")[4], "音樂回想");
        assert_eq!(title_labels("zh-Hant")[5], "設定");
        assert_eq!(title_labels("zh-Hant")[6], "離開");
        assert_eq!(TITLE_ACTIONS[1], TitleAction::Continue);
        assert_eq!(TITLE_ACTIONS[4], TitleAction::Music);
    }

    #[test]
    fn window_title_uses_game_name() {
        assert_eq!(game_window_title("Prologue"), "Prologue");
        assert_eq!(game_window_title("  "), "Galeng");
        assert_eq!(game_window_title(""), "Galeng");
    }
}
