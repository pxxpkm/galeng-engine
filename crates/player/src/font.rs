use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use fontdue::{Font, FontSettings};

use crate::assets::Source;
use crate::fb::{Framebuffer, Rgba};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineSpan {
    pub start: usize,
    pub end: usize,
}

#[derive(Clone)]
struct CachedGlyph {
    xmin: i32,
    ymin: i32,
    width: usize,
    height: usize,
    advance: i32,
    bitmap: Vec<u8>,
}

struct Face {
    font: Font,
    path: PathBuf,
}

pub struct GameFont {
    faces: Vec<Face>,
    pub source: PathBuf,
    glyphs: RefCell<HashMap<(char, u32), CachedGlyph>>,
}

pub fn first_available_index(ids: &[u16]) -> usize {
    ids.iter().position(|&id| id != 0).unwrap_or(0)
}

pub fn system_candidates(locale: Option<&str>) -> Vec<&'static str> {
    let cjk_hant_first = [
        r"C:\Windows\Fonts\msjh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\segoeui.ttf",
    ];
    let cjk_hans_first = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msjh.ttc",
        r"C:\Windows\Fonts\segoeui.ttf",
    ];
    let latin_first = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\msjh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
    ];
    let jp = [
        r"C:\Windows\Fonts\YuGothM.ttc",
        r"C:\Windows\Fonts\YuGothR.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\msgothic.ttc",
    ];
    let head: &[&str] = match locale.unwrap_or("").to_ascii_lowercase().as_str() {
        s if s.starts_with("zh-hans") || s == "zh-cn" || s == "zh-sg" => &cjk_hans_first,
        s if s.starts_with("en") => &latin_first,
        _ => &cjk_hant_first,
    };
    let mut out = Vec::from(head);
    out.extend_from_slice(&jp);
    out
}

impl GameFont {
    pub fn from_bytes(bytes: Vec<u8>, source: PathBuf) -> Result<Self, String> {
        let face = face_from_bytes(bytes, source.clone())?;
        Ok(Self {
            source,
            faces: vec![face],
            glyphs: RefCell::new(HashMap::new()),
        })
    }

    pub fn load_preferred(
        project_font: Option<&str>,
        locale: Option<&str>,
        source: &Source,
    ) -> Result<Self, String> {
        let mut faces = Vec::new();
        if let Some(logical) = project_font {
            match load_project_face(logical, source) {
                Ok(face) => faces.push(face),
                Err(err) => {
                    eprintln!(
                        "galeng-player: project font `{logical}`: {err}; using system font"
                    );
                }
            }
        }
        append_system_faces(&mut faces, locale);
        if faces.is_empty() {
            return Err("no font candidates".into());
        }
        Ok(Self {
            source: faces[0].path.clone(),
            faces,
            glyphs: RefCell::new(HashMap::new()),
        })
    }

    pub fn load_system() -> Result<Self, String> {
        Self::load_preferred(None, None, &Source::Dir(PathBuf::from(".")))
    }

    pub fn face_count(&self) -> usize {
        self.faces.len()
    }

    pub fn face_index_for(&self, ch: char) -> usize {
        let ids: Vec<u16> = self
            .faces
            .iter()
            .map(|face| face.font.lookup_glyph_index(ch))
            .collect();
        first_available_index(&ids)
    }

    fn glyph(&self, ch: char, size: f32) -> CachedGlyph {
        let key = (ch, size.to_bits());
        if let Some(hit) = self.glyphs.borrow().get(&key) {
            return hit.clone();
        }
        let face = &self.faces[self.face_index_for(ch)];
        let (layout, _) = face.font.rasterize(ch, size);
        let (hi, hi_bits) = face.font.rasterize(ch, size * 2.0);
        let (width, height, bitmap) = downsample_coverage_2x(hi.width, hi.height, &hi_bits);
        let made = CachedGlyph {
            xmin: hi.xmin / 2,
            ymin: hi.ymin / 2,
            width,
            height,
            advance: layout.advance_width.round() as i32,
            bitmap,
        };
        self.glyphs.borrow_mut().insert(key, made.clone());
        made
    }

    pub fn prewarm(&self, text: &str, size: f32) {
        for ch in text.chars() {
            if ch != '\n' {
                let _ = self.glyph(ch, size);
            }
        }
    }

    pub fn line_h(size: f32) -> i32 {
        size as i32 + 10
    }

    pub fn advance(&self, ch: char, size: f32) -> i32 {
        if ch == '\n' {
            0
        } else {
            self.glyph(ch, size).advance
        }
    }

    pub fn wrap_lines(&self, text: &str, size: f32, max_width: i32) -> Vec<LineSpan> {
        if text.is_empty() {
            return vec![LineSpan { start: 0, end: 0 }];
        }
        let mut lines = Vec::new();
        let mut line_start = 0usize;
        let mut x = 0i32;
        for (i, ch) in text.char_indices() {
            if ch == '\n' {
                lines.push(LineSpan {
                    start: line_start,
                    end: i,
                });
                line_start = i + ch.len_utf8();
                x = 0;
                continue;
            }
            let adv = self.advance(ch, size);
            if x > 0 && x + adv > max_width && ch != ' ' {
                lines.push(LineSpan {
                    start: line_start,
                    end: i,
                });
                line_start = i;
                x = 0;
            }
            x += adv;
        }
        lines.push(LineSpan {
            start: line_start,
            end: text.len(),
        });
        lines
    }

    pub fn draw_text(
        &self,
        fb: &mut Framebuffer,
        x: i32,
        y: i32,
        size: f32,
        text: &str,
        color: Rgba,
        wrap_right: i32,
    ) -> i32 {
        let line_h = Self::line_h(size);
        let start_x = x;
        let max_width = wrap_right - start_x;
        let mut baseline = y;
        for (li, line) in self.wrap_lines(text, size, max_width).into_iter().enumerate() {
            if li > 0 {
                baseline += line_h;
            }
            let mut cx = start_x;
            for ch in text[line.start..line.end].chars() {
                let glyph = self.glyph(ch, size);
                blit_glyph(
                    fb,
                    cx + glyph.xmin,
                    baseline + glyph.ymin,
                    glyph.width,
                    glyph.height,
                    &glyph.bitmap,
                    color,
                );
                cx += glyph.advance;
            }
        }
        baseline + line_h
    }

    /// Draw one line with the visual center of a probe glyph on the box mid-line.
    pub fn draw_text_in_box(
        &self,
        fb: &mut Framebuffer,
        box_x: i32,
        box_y: i32,
        box_w: i32,
        box_h: i32,
        pad_x: i32,
        size: f32,
        text: &str,
        color: Rgba,
    ) {
        let probe = text.chars().find(|c| !c.is_whitespace()).unwrap_or('中');
        let g = self.glyph(probe, size);
        let visual_mid = g.ymin + g.height as i32 / 2;
        let baseline = box_y + box_h / 2 - visual_mid;
        self.draw_text(
            fb,
            box_x + pad_x,
            baseline,
            size,
            text,
            color,
            box_x + box_w - pad_x,
        );
    }

    #[cfg(test)]
    pub fn cached_glyph_count(&self) -> usize {
        self.glyphs.borrow().len()
    }
}

fn load_project_face(logical: &str, source: &Source) -> Result<Face, String> {
    if !logical.starts_with("fonts/") {
        return Err("font must be under fonts/".into());
    }
    if galeng_packer::is_blocked_system_font(logical) {
        return Err("Microsoft system font is not allowed".into());
    }
    let (ext, bytes) = source
        .read_asset(logical, &["ttf", "otf", "ttc"])
        .ok_or_else(|| format!("missing `{logical}`"))?;
    face_from_bytes(bytes, PathBuf::from(format!("assets/{logical}.{ext}")))
}

fn append_system_faces(faces: &mut Vec<Face>, locale: Option<&str>) {
    for path in system_candidates(locale) {
        let pb = PathBuf::from(path);
        if faces.iter().any(|face| same_font_path(&face.path, &pb)) {
            continue;
        }
        if let Ok(font) = load_font(path) {
            faces.push(Face { font, path: pb });
        }
    }
}

fn same_font_path(a: &PathBuf, b: &PathBuf) -> bool {
    let a = a.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    let b = b.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    a == b
}

fn face_from_bytes(bytes: Vec<u8>, path: PathBuf) -> Result<Face, String> {
    let font = Font::from_bytes(
        bytes,
        FontSettings {
            collection_index: 0,
            scale: 40.0,
            ..FontSettings::default()
        },
    )
    .map_err(|e| e.to_string())?;
    Ok(Face { font, path })
}

fn load_font(path: &str) -> Result<Font, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Font::from_bytes(
        bytes,
        FontSettings {
            collection_index: 0,
            scale: 40.0,
            ..FontSettings::default()
        },
    )
    .map_err(|e| e.to_string())
}

fn downsample_coverage_2x(src_w: usize, src_h: usize, src: &[u8]) -> (usize, usize, Vec<u8>) {
    let dw = src_w.div_ceil(2);
    let dh = src_h.div_ceil(2);
    let mut out = vec![0u8; dw.saturating_mul(dh)];
    if dw == 0 || dh == 0 {
        return (dw, dh, out);
    }
    for y in 0..dh {
        for x in 0..dw {
            let mut sum = 0u32;
            let mut n = 0u32;
            for oy in 0..2 {
                for ox in 0..2 {
                    let sx = x * 2 + ox;
                    let sy = y * 2 + oy;
                    if sx < src_w && sy < src_h {
                        let i = sy * src_w + sx;
                        if i < src.len() {
                            sum += u32::from(src[i]);
                            n += 1;
                        }
                    }
                }
            }
            out[y * dw + x] = (sum / n.max(1)) as u8;
        }
    }
    (dw, dh, out)
}

fn srgb_to_lin(c: u8) -> f32 {
    static LUT: OnceLock<[f32; 256]> = OnceLock::new();
    LUT.get_or_init(|| {
        let mut t = [0.0f32; 256];
        for (i, slot) in t.iter_mut().enumerate() {
            let x = i as f32 / 255.0;
            *slot = if x <= 0.04045 {
                x / 12.92
            } else {
                ((x + 0.055) / 1.055).powf(2.4)
            };
        }
        t
    })[c as usize]
}

fn lin_to_srgb(v: f32) -> u8 {
    let v = v.clamp(0.0, 1.0);
    let s = if v <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    };
    (s * 255.0 + 0.5) as u8
}

fn blit_glyph(
    fb: &mut Framebuffer,
    x: i32,
    y: i32,
    w: usize,
    h: usize,
    bitmap: &[u8],
    color: Rgba,
) {
    let sr = srgb_to_lin(color.r);
    let sg = srgb_to_lin(color.g);
    let sb = srgb_to_lin(color.b);
    for gy in 0..h {
        for gx in 0..w {
            let raw = bitmap[gy * w + gx];
            if raw == 0 {
                continue;
            }
            let cov = f32::from(raw) / 255.0;
            let px = (x + gx as i32) as u32;
            let py = (y + gy as i32) as u32;
            if px >= crate::fb::WIDTH || py >= crate::fb::HEIGHT {
                continue;
            }
            let i = ((py * crate::fb::WIDTH + px) * 4) as usize;
            let ia = 1.0 - cov;
            fb.pixels[i] = lin_to_srgb(sr * cov + srgb_to_lin(fb.pixels[i]) * ia);
            fb.pixels[i + 1] = lin_to_srgb(sg * cov + srgb_to_lin(fb.pixels[i + 1]) * ia);
            fb.pixels[i + 2] = lin_to_srgb(sb * cov + srgb_to_lin(fb.pixels[i + 2]) * ia);
            fb.pixels[i + 3] = 255;
        }
    }
}


/// Resolved type sizes (logical px). Defaults match current soft-chrome polish.
#[derive(Debug, Clone, Copy)]
pub struct TypeScale {
    pub dialogue_body: f32,
    pub speaker: f32,
    pub explore_pill: f32,
    pub inventory: f32,
    pub hud: f32,
    pub title: f32,
    pub menu: f32,
    pub settings: f32,
}

impl Default for TypeScale {
    fn default() -> Self {
        Self {
            dialogue_body: 34.0,
            speaker: 28.0,
            explore_pill: 30.0,
            inventory: 26.0,
            hud: 24.0,
            title: 72.0,
            menu: 32.0,
            settings: 28.0,
        }
    }
}

impl TypeScale {
    pub fn from_project(project: &galeng_schema::Project) -> Self {
        let mut s = Self::default();
        let Some(fonts) = project.fonts.as_ref() else {
            return s;
        };
        let Some(sc) = fonts.scale.as_ref() else {
            return s;
        };
        if let Some(v) = sc.dialogue_body {
            s.dialogue_body = v;
        }
        if let Some(v) = sc.speaker {
            s.speaker = v;
        }
        if let Some(v) = sc.explore_pill {
            s.explore_pill = v;
        }
        if let Some(v) = sc.inventory {
            s.inventory = v;
        }
        if let Some(v) = sc.hud {
            s.hud = v;
        }
        if let Some(v) = sc.title {
            s.title = v;
        }
        if let Some(v) = sc.menu {
            s.menu = v;
        }
        if let Some(v) = sc.settings {
            s.settings = v;
        }
        s
    }
}

/// Dialogue / UI / title faces loaded for a project.
pub struct FontSet {
    pub dialogue: GameFont,
    pub ui: GameFont,
    pub title: GameFont,
}

impl FontSet {
    pub fn load(project: &galeng_schema::Project, source: &Source) -> Result<Self, String> {
        let locale = Some(project.locale.as_str());
        let dialogue = GameFont::load_preferred(project.font_dialogue(), locale, source)?;
        let ui = GameFont::load_preferred(project.font_ui(), locale, source)?;
        let title = GameFont::load_preferred(project.font_title(), locale, source)?;
        Ok(Self {
            dialogue,
            ui,
            title,
        })
    }
}


#[cfg(test)]
mod font_manager_tests {
    use super::*;
    use galeng_schema::{FontConfig, FontScale, Project, Resolution};

    fn bare_project() -> Project {
        Project {
            id: "t".into(),
            title: "t".into(),
            schema_version: 1,
            resolution: Resolution {
                width: 1920,
                height: 1080,
            },
            start_scene: "a".into(),
            locale: "zh-Hant".into(),
            skip_title: true,
            title_bgm: None,
            title_bg: None,
            title_movie: None,
            font: Some("fonts/legacy".into()),
            fonts: None,
            msg_box: None,
            icon: None,
            hide_game_title: false,
            title_buttons: None,
            pause_buttons: None,
            ui_languages: None,
            characters: None,
            cg: None,
            music_gallery: None,
            verbs: vec![],
            items: vec![],
            switches: vec![],
            fallback: Default::default(),
            effect_library: vec![],
            transition_defaults: Default::default(),
        }
    }

    #[test]
    fn type_scale_defaults_match_soft_chrome() {
        let s = TypeScale::default();
        assert_eq!(s.dialogue_body, 34.0);
        assert_eq!(s.speaker, 28.0);
        assert_eq!(s.explore_pill, 30.0);
    }

    #[test]
    fn font_roles_fall_back_to_deprecated_font() {
        let p = bare_project();
        assert_eq!(p.font_dialogue(), Some("fonts/legacy"));
        assert_eq!(p.font_ui(), Some("fonts/legacy"));
        let mut p2 = p;
        p2.fonts = Some(FontConfig {
            dialogue: Some("fonts/dlg".into()),
            ui: Some("fonts/ui".into()),
            title: None,
            scale: Some(FontScale {
                dialogue_body: Some(40.0),
                ..Default::default()
            }),
        });
        assert_eq!(p2.font_dialogue(), Some("fonts/dlg"));
        assert_eq!(p2.font_ui(), Some("fonts/ui"));
        assert_eq!(p2.font_title(), Some("fonts/ui"));
        assert_eq!(TypeScale::from_project(&p2).dialogue_body, 40.0);
    }
}
