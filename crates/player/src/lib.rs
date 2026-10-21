pub mod assets;
pub mod audio;
pub mod backlog;
pub mod camera;
pub mod cli;
pub mod draw;
pub mod fb;
pub mod font;
pub mod fx;
pub mod gallery;
pub mod hud;
pub mod input;
pub mod interp;
pub mod menu;
#[cfg(windows)]
pub mod movie;
#[cfg(not(windows))]
#[path = "movie_stub.rs"]
pub mod movie;
pub mod music;
pub mod save;
pub mod saypage;
pub mod seen;
pub mod settings;
pub mod user_paths;
pub mod skip;
pub mod title;
pub mod typewriter;
pub mod vm;
pub mod window;

pub use interp::interpolate_text;
pub use galeng_explore::ItemUseMode;
pub use vm::{preview_snapshot, Phase, PreviewSnap, Runtime, View, VmError};

#[cfg(test)]
mod font_smoke {
    use super::*;

    #[test]
    fn blocked_project_font_falls_back_to_system() {
        let font = font::GameFont::load_preferred(
            Some("fonts/msjh"),
            None,
            &assets::Source::Dir(std::path::PathBuf::from(".")),
        )
        .expect("system fallback");
        let path = font.source.to_string_lossy().to_ascii_lowercase();
        assert!(
            path.contains("msjh") || path.contains("msyh") || path.contains("segoe"),
            "{path}"
        );
    }

    #[test]
    fn rasterize_chinese_has_pixels() {
        let font = font::GameFont::load_system().expect("system font");
        let mut fb = fb::Framebuffer::new();
        font.draw_text(
            &mut fb,
            80,
            820,
            40.0,
            "今天風真好。",
            fb::Rgba::rgb(255, 255, 255),
            1800,
        );
        assert!(
            fb.count_nonblack_in(80, 760, 800, 200) > 50,
            "expected CJK glyphs in the message box area"
        );
    }

    #[test]
    fn second_draw_reuses_glyph_cache() {
        let font = font::GameFont::load_system().expect("system font");
        let mut fb = fb::Framebuffer::new();
        font.draw_text(
            &mut fb,
            80,
            820,
            40.0,
            "今天",
            fb::Rgba::rgb(255, 255, 255),
            1800,
        );
        let first = font.cached_glyph_count();
        font.draw_text(
            &mut fb,
            80,
            820,
            40.0,
            "今天",
            fb::Rgba::rgb(255, 255, 255),
            1800,
        );
        assert_eq!(font.cached_glyph_count(), first);
        assert!(first >= 2);
    }

    #[test]
    fn supersampled_glyph_has_soft_edge() {
        let font = font::GameFont::load_system().expect("system font");
        let mut fb = fb::Framebuffer::new();
        font.draw_text(
            &mut fb,
            80,
            820,
            40.0,
            "今",
            fb::Rgba::rgb(255, 255, 255),
            1800,
        );
        let mut mid = 0usize;
        for px in fb.pixels.chunks_exact(4) {
            if (16..240).contains(&px[0]) && px[1] == px[0] && px[2] == px[0] {
                mid += 1;
            }
        }
        assert!(
            mid > 20,
            "expected anti-aliased edge pixels, got {mid} mid greys"
        );
    }

    #[test]
    fn missing_glyph_picks_next_face() {
        assert_eq!(font::first_available_index(&[0, 12]), 1);
        assert_eq!(font::first_available_index(&[0, 0]), 0);
        assert_eq!(font::first_available_index(&[4, 9]), 0);
    }

    #[test]
    fn system_candidates_follow_locale() {
        let hant = font::system_candidates(Some("zh-Hant"));
        assert!(hant[0].ends_with("msjh.ttc"));
        let hans = font::system_candidates(Some("zh-Hans"));
        assert!(hans[0].ends_with("msyh.ttc"));
        let en = font::system_candidates(Some("en"));
        assert!(en[0].ends_with("segoeui.ttf"));
        assert!(hant.iter().any(|p| p.contains("YuGoth") || p.contains("meiryo")));
    }

    #[test]
    fn loads_more_than_one_face_when_files_exist() {
        let loaded = font::GameFont::load_system().expect("system font");
        assert!(loaded.face_count() >= 1);
        let msjh = std::path::Path::new(r"C:\Windows\Fonts\msjh.ttc").exists();
        let segoe = std::path::Path::new(r"C:\Windows\Fonts\segoeui.ttf").exists();
        if msjh && segoe {
            assert!(
                loaded.face_count() >= 2,
                "expected a fallback chain, got {}",
                loaded.face_count()
            );
        }
        let _ = loaded.face_index_for('今');
        let _ = loaded.face_index_for('A');
    }
}
