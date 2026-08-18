pub fn gallery_title(locale: &str) -> &'static str {
    match locale {
        "en" => "CG",
        "zh-Hans" => "CG 回顾",
        _ => "CG 回想",
    }
}

pub fn row_label(id: &str, unlocked: bool) -> String {
    if unlocked {
        id.to_string()
    } else {
        crate::seen::locked_label().to_string()
    }
}

pub fn empty_label(locale: &str) -> &'static str {
    match locale {
        "en" => "—",
        _ => "—",
    }
}

pub fn row_rect(index: usize) -> (i32, i32, i32, i32) {
    let y = 240 + (index as i32) * 64;
    (560, y, 800, 56)
}

pub fn hit_row(lx: i32, ly: i32, count: usize) -> Option<usize> {
    for i in 0..count {
        let (x, y, w, h) = row_rect(i);
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
    fn hit_first_row() {
        let (x, y, w, h) = row_rect(0);
        assert_eq!(hit_row(x + 1, y + 1, 1), Some(0));
        assert_eq!(hit_row(x + w / 2, y + h + 20, 1), None);
    }

    #[test]
    fn titles() {
        assert_eq!(gallery_title("en"), "CG");
        assert_eq!(gallery_title("zh-Hant"), "CG 回想");
    }

    #[test]
    fn locked_row_hides_id() {
        assert_eq!(row_label("op_still", true), "op_still");
        assert_eq!(row_label("op_still", false), "???");
    }
}
