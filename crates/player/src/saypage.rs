use crate::draw::{MSG_W, MSG_Y, SAY_BODY_DY};
use crate::font::GameFont;
use crate::hud;

pub const SAY_SIZE: f32 = 40.0;

pub fn say_body_y() -> i32 {
    MSG_Y + SAY_BODY_DY
}

pub fn say_wrap_width() -> i32 {
    MSG_W - 64
}

pub fn lines_per_page() -> usize {
    let h = GameFont::line_h(SAY_SIZE);
    let n = (hud::hud_y() - say_body_y()) / h;
    n.max(1) as usize
}

pub fn pages(font: &GameFont, text: &str) -> Vec<(usize, usize)> {
    let lines = font.wrap_lines(text, SAY_SIZE, say_wrap_width());
    let per = lines_per_page().max(1);
    let mut out = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let end = (i + per).min(lines.len());
        out.push((lines[i].start, lines[end - 1].end));
        i = end;
    }
    if out.is_empty() {
        out.push((0, 0));
    }
    out
}

pub fn page_text<'a>(text: &'a str, pages: &[(usize, usize)], index: usize) -> &'a str {
    let Some((start, end)) = pages.get(index).copied() else {
        return "";
    };
    let end = end.min(text.len());
    let start = start.min(end);
    &text[start..end]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfirmSay {
    FinishReveal,
    NextPage,
    AdvanceBeat,
}

pub fn confirm_say(done: bool, page: usize, page_count: usize) -> ConfirmSay {
    if !done {
        return ConfirmSay::FinishReveal;
    }
    if page + 1 < page_count.max(1) {
        ConfirmSay::NextPage
    } else {
        ConfirmSay::AdvanceBeat
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::font::GameFont;

    fn font() -> GameFont {
        GameFont::load_system().expect("system font")
    }

    #[test]
    fn two_lines_fit_above_hud() {
        assert_eq!(lines_per_page(), 2);
    }

    #[test]
    fn short_line_is_one_page() {
        let font = font();
        let pages = pages(&font, "今天風真好。");
        assert_eq!(pages.len(), 1);
        assert_eq!(page_text("今天風真好。", &pages, 0), "今天風真好。");
    }

    #[test]
    fn two_hundred_hanzi_span_multiple_pages() {
        let font = font();
        let text: String = "風".repeat(200);
        let pages = pages(&font, &text);
        assert!(
            pages.len() >= 2,
            "200 hanzi should not fit on one page, got {}",
            pages.len()
        );
        let mut acc = String::new();
        for i in 0..pages.len() {
            acc.push_str(page_text(&text, &pages, i));
        }
        assert_eq!(acc, text);
    }

    #[test]
    fn newline_forces_a_break() {
        let font = font();
        let text = "上\n下\n左\n右";
        let lines = font.wrap_lines(text, SAY_SIZE, say_wrap_width());
        assert!(lines.len() >= 4, "got {}", lines.len());
        let pages = pages(&font, text);
        assert!(pages.len() >= 2);
    }

    #[test]
    fn confirm_order() {
        assert_eq!(confirm_say(false, 0, 3), ConfirmSay::FinishReveal);
        assert_eq!(confirm_say(true, 0, 3), ConfirmSay::NextPage);
        assert_eq!(confirm_say(true, 1, 3), ConfirmSay::NextPage);
        assert_eq!(confirm_say(true, 2, 3), ConfirmSay::AdvanceBeat);
        assert_eq!(confirm_say(true, 0, 1), ConfirmSay::AdvanceBeat);
    }
}
