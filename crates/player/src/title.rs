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

pub fn title_rect(index: usize) -> (i32, i32, i32, i32) {
    let y = 400 + (index as i32) * 68;
    (660, y, 600, 56)
}

pub fn hit_title(lx: i32, ly: i32) -> Option<usize> {
    for i in 0..TITLE_COUNT {
        let (x, y, w, h) = title_rect(i);
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
        let (x, y, w, h) = title_rect(0);
        assert_eq!(hit_title(x + 1, y + 1), Some(0));
        assert_eq!(hit_title(x + w / 2, y + h + 10), None);
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
