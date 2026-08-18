pub const VISIBLE_LINES: usize = 10;
pub const MAX_LINES: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BacklogLine {
    pub scene: String,
    pub beat_index: usize,
    pub speaker: String,
    pub text: String,
}

/// Overlay state. `scroll == 0` shows the newest lines (bottom of the log).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BacklogView {
    pub open: bool,
    pub scroll: usize,
}

impl BacklogView {
    pub fn new() -> Self {
        Self {
            open: false,
            scroll: 0,
        }
    }

    pub fn wheel_up(&mut self, line_count: usize) {
        if line_count == 0 {
            return;
        }
        if !self.open {
            self.open = true;
            self.scroll = 0;
            return;
        }
        self.scroll = (self.scroll + 1).min(max_scroll(line_count));
    }

    pub fn wheel_down(&mut self) {
        if !self.open {
            return;
        }
        if self.scroll == 0 {
            self.open = false;
        } else {
            self.scroll -= 1;
        }
    }

    pub fn close(&mut self) {
        self.open = false;
        self.scroll = 0;
    }

    /// Inclusive start index and visible count (newest at the end of the slice).
    pub fn window(&self, line_count: usize) -> (usize, usize) {
        if line_count == 0 {
            return (0, 0);
        }
        let vis = VISIBLE_LINES.min(line_count);
        let max_s = max_scroll(line_count);
        let scroll = self.scroll.min(max_s);
        let start = line_count - vis - scroll;
        (start, vis)
    }
}

pub fn max_scroll(line_count: usize) -> usize {
    line_count.saturating_sub(VISIBLE_LINES)
}

pub fn row_rect(visible_index: usize) -> (i32, i32, i32, i32) {
    let y = 148 + (visible_index as i32) * 54;
    (140, y, 1640, 50)
}

pub fn hit_row(lx: i32, ly: i32, visible_count: usize) -> Option<usize> {
    for i in 0..visible_count {
        let (x, y, w, h) = row_rect(i);
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(i);
        }
    }
    None
}

pub fn can_jump(line: &BacklogLine) -> bool {
    !line.scene.is_empty()
}

pub fn title(locale: &str) -> &'static str {
    match locale {
        "en" => "Backlog",
        "zh-Hans" => "回顾",
        _ => "回顧",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wheel_up_opens_then_scrolls() {
        let mut v = BacklogView::new();
        v.wheel_up(0);
        assert!(!v.open);
        v.wheel_up(3);
        assert!(v.open);
        assert_eq!(v.scroll, 0);
        v.wheel_up(3);
        assert_eq!(v.scroll, 0);
        let mut long = BacklogView::new();
        long.wheel_up(12);
        long.wheel_up(12);
        assert_eq!(long.scroll, 1);
        long.wheel_up(12);
        long.wheel_up(12);
        assert_eq!(long.scroll, max_scroll(12));
    }

    #[test]
    fn wheel_down_closes_at_newest() {
        let mut v = BacklogView::new();
        v.wheel_up(12);
        v.wheel_up(12);
        assert_eq!(v.scroll, 1);
        v.wheel_down();
        assert!(v.open);
        assert_eq!(v.scroll, 0);
        v.wheel_down();
        assert!(!v.open);
    }

    #[test]
    fn window_shows_newest_when_scroll_zero() {
        let v = BacklogView {
            open: true,
            scroll: 0,
        };
        assert_eq!(v.window(3), (0, 3));
        assert_eq!(v.window(12), (2, 10));
        let older = BacklogView {
            open: true,
            scroll: 2,
        };
        assert_eq!(older.window(12), (0, 10));
    }

    #[test]
    fn hit_first_visible_row() {
        let (x, y, w, h) = row_rect(0);
        assert_eq!(hit_row(x + 1, y + 1, 2), Some(0));
        assert_eq!(hit_row(x + w / 2, y + h + 10, 2), Some(1));
        assert_eq!(hit_row(x + w / 2, y + h + 80, 2), None);
    }

    #[test]
    fn any_logged_scene_can_jump() {
        let line = BacklogLine {
            scene: "park_01".into(),
            beat_index: 1,
            speaker: "sora".into(),
            text: "今天風真好。".into(),
        };
        assert!(can_jump(&line));
        let empty = BacklogLine {
            scene: String::new(),
            beat_index: 0,
            speaker: "n".into(),
            text: "x".into(),
        };
        assert!(!can_jump(&empty));
    }
}
