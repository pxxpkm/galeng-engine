pub const MENU_COUNT: usize = 9;
pub const SLOT_COUNT: usize = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuAction {
    Continue,
    QuickSave,
    QuickLoad,
    AutoLoad,
    SaveSlots,
    LoadSlots,
    Settings,
    ToTitle,
    Quit,
}

pub const ACTIONS: [MenuAction; MENU_COUNT] = [
    MenuAction::Continue,
    MenuAction::QuickSave,
    MenuAction::QuickLoad,
    MenuAction::AutoLoad,
    MenuAction::SaveSlots,
    MenuAction::LoadSlots,
    MenuAction::Settings,
    MenuAction::ToTitle,
    MenuAction::Quit,
];

pub fn labels(locale: &str) -> [&'static str; MENU_COUNT] {
    match locale {
        "en" => [
            "Continue",
            "Quick save",
            "Quick load",
            "Auto load",
            "Save…",
            "Load…",
            "Settings",
            "Title",
            "Quit",
        ],
        "zh-Hans" => [
            "继续",
            "快速存档",
            "快速读档",
            "自动读档",
            "存档…",
            "读档…",
            "设置",
            "回标题",
            "离开",
        ],
        _ => [
            "繼續",
            "快速存檔",
            "快速讀檔",
            "自動讀檔",
            "存檔…",
            "讀檔…",
            "設定",
            "回標題",
            "離開",
        ],
    }
}

pub fn slot_title(locale: &str, saving: bool) -> &'static str {
    match (locale, saving) {
        ("en", true) => "Save slot",
        ("en", false) => "Load slot",
        ("zh-Hans", true) => "存档",
        ("zh-Hans", false) => "读档",
        (_, true) => "存檔",
        (_, false) => "讀檔",
    }
}

pub fn menu_rect(index: usize) -> (i32, i32, i32, i32) {
    let y = 200 + (index as i32) * 60;
    (660, y, 600, 52)
}

pub fn slot_rect(index: usize) -> (i32, i32, i32, i32) {
    let y = 220 + (index as i32) * 62;
    (560, y, 800, 52)
}

pub fn hit_menu(lx: i32, ly: i32) -> Option<usize> {
    hit_list(lx, ly, MENU_COUNT, menu_rect)
}

pub fn hit_slot(lx: i32, ly: i32) -> Option<usize> {
    hit_list(lx, ly, SLOT_COUNT, slot_rect)
}

fn hit_list(
    lx: i32,
    ly: i32,
    count: usize,
    rect: fn(usize) -> (i32, i32, i32, i32),
) -> Option<usize> {
    for i in 0..count {
        let (x, y, w, h) = rect(i);
        if lx >= x && lx < x + w && ly >= y && ly < y + h {
            return Some(i);
        }
    }
    None
}

pub fn wrap_index(index: usize, delta: i32, count: usize) -> usize {
    let n = count as i32;
    if n <= 0 {
        return 0;
    }
    (((index as i32 + delta) % n) + n) as usize % count
}

pub fn index_to_slot(index: usize) -> u8 {
    (index as u8) + 1
}

pub fn digit_to_slot_index(digit: u8) -> Option<usize> {
    if (1..=9).contains(&digit) {
        Some((digit - 1) as usize)
    } else {
        None
    }
}

pub fn slot_row_label(slot: u8, scene: Option<&str>) -> String {
    match scene {
        Some(id) => format!("{slot:02}  {id}"),
        None => format!("{slot:02}  —"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_moves_and_cycles() {
        assert_eq!(wrap_index(0, -1, 4), 3);
        assert_eq!(wrap_index(3, 1, 4), 0);
        assert_eq!(wrap_index(8, 1, 9), 0);
    }

    #[test]
    fn hit_first_item() {
        let (x, y, w, _h) = menu_rect(0);
        assert_eq!(hit_menu(x + 1, y + 1), Some(0));
        assert_eq!(hit_menu(x + w / 2, y - 10), None);
    }

    #[test]
    fn digits_map_to_slots_01_09() {
        assert_eq!(digit_to_slot_index(1), Some(0));
        assert_eq!(index_to_slot(0), 1);
        assert_eq!(digit_to_slot_index(9), Some(8));
        assert_eq!(index_to_slot(8), 9);
        assert_eq!(digit_to_slot_index(0), None);
    }

    #[test]
    fn empty_slot_label() {
        assert_eq!(slot_row_label(3, None), "03  —");
        assert_eq!(slot_row_label(3, Some("park_01")), "03  park_01");
        assert_eq!(
            slot_row_label(1, Some("公園・午後  08-14 12:00")),
            "01  公園・午後  08-14 12:00"
        );
    }

    #[test]
    fn english_labels() {
        assert_eq!(labels("en")[8], "Quit");
        assert_eq!(labels("en")[6], "Settings");
        assert_eq!(labels("en")[3], "Auto load");
        assert_eq!(labels("zh-Hans")[0], "继续");
        assert_eq!(labels("zh-Hant")[3], "自動讀檔");
        assert_eq!(labels("zh-Hant")[4], "存檔…");
        assert_eq!(labels("zh-Hant")[7], "回標題");
    }
}
