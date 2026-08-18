pub fn music_title(locale: &str) -> &'static str {
    match locale {
        "en" => "Music",
        "zh-Hans" => "音乐回顾",
        _ => "音樂回想",
    }
}

/// Track to feed Mixer while the music overlay is open.
pub fn preview_asset<'a>(
    tracks: &'a [galeng_schema::GalleryItem],
    playing: Option<usize>,
    title_bgm: Option<&'a str>,
) -> Option<&'a str> {
    playing
        .and_then(|i| tracks.get(i))
        .map(|t| t.asset.as_str())
        .or(title_bgm)
}

#[cfg(test)]
mod tests {
    use galeng_schema::GalleryItem;

    use super::*;

    #[test]
    fn titles() {
        assert_eq!(music_title("en"), "Music");
        assert_eq!(music_title("zh-Hans"), "音乐回顾");
        assert_eq!(music_title("zh-Hant"), "音樂回想");
    }

    #[test]
    fn preview_keeps_title_until_pick() {
        let tracks = [GalleryItem {
            id: "park".into(),
            asset: "bgm/park".into(),
        }];
        assert_eq!(
            preview_asset(&tracks, None, Some("bgm/park")),
            Some("bgm/park")
        );
        assert_eq!(
            preview_asset(&tracks, Some(0), Some("bgm/title")),
            Some("bgm/park")
        );
        assert_eq!(preview_asset(&tracks, Some(9), Some("bgm/title")), Some("bgm/title"));
        assert_eq!(preview_asset(&[], Some(0), Some("bgm/title")), Some("bgm/title"));
    }
}
