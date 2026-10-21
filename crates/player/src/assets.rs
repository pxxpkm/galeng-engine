use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    Dir(PathBuf),
    Pak(PathBuf),
}

impl Source {
    pub fn project_dir(&self) -> PathBuf {
        match self {
            Source::Dir(dir) => dir.clone(),
            Source::Pak(pak) => pak
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from(".")),
        }
    }

    /// Extension (no dot) and file bytes for a logical asset path.
    pub fn read_asset(&self, logical: &str, exts: &[&str]) -> Option<(String, Vec<u8>)> {
        match self {
            Source::Dir(dir) => {
                let path = resolve_with_ext(&galeng_schema::asset_dir(dir), logical, exts)?;
                let ext = path.extension()?.to_str()?.to_string();
                Some((ext, std::fs::read(path).ok()?))
            }
            Source::Pak(pak) => {
                let mut reader = galeng_packer::PakReader::open(pak).ok()?;
                reader.read_asset(logical, exts)
            }
        }
    }
}

/// Default picture-cache cap (middle of the 256–384 MB budget in 03-player).
pub const BUDGET_BYTES: usize = 320 * 1024 * 1024;

pub struct Picture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    /// True iff every pixel alpha is 255 (computed once at load).
    pub opaque: bool,
}

impl Picture {
    pub fn byte_len(&self) -> usize {
        self.rgba.len()
    }
}

struct Slot {
    pic: Option<Picture>,
    bytes: usize,
    last_used: u64,
    gen: u64,
}

pub struct Bank {
    source: Source,
    cache: HashMap<String, Slot>,
    used: usize,
    tick: u64,
    generation: u64,
    budget: usize,
}

impl Bank {
    pub fn new(project_dir: impl AsRef<Path>) -> Self {
        Self::from_source(Source::Dir(project_dir.as_ref().to_path_buf()))
    }

    pub fn from_source(source: Source) -> Self {
        Self {
            source,
            cache: HashMap::new(),
            used: 0,
            tick: 0,
            generation: 0,
            budget: BUDGET_BYTES,
        }
    }

    pub fn with_budget(mut self, budget: usize) -> Self {
        self.budget = budget;
        self
    }

    pub fn set_budget(&mut self, budget: usize) {
        self.budget = budget;
        self.evict();
    }

    pub fn begin_frame(&mut self) {
        self.generation = self.generation.wrapping_add(1);
    }

    pub fn bytes_used(&self) -> usize {
        self.used
    }

    pub fn contains(&self, logical: &str) -> bool {
        self.cache
            .get(logical)
            .is_some_and(|slot| slot.pic.is_some())
    }

    pub fn get(&mut self, logical: &str) -> Option<&Picture> {
        self.tick = self.tick.wrapping_add(1);
        if !self.cache.contains_key(logical) {
            let loaded = match &self.source {
                Source::Dir(dir) => {
                    resolve_png(&galeng_schema::asset_dir(dir), logical).and_then(|path| load_png(&path).ok())
                }
                Source::Pak(_) => self
                    .source
                    .read_asset(logical, &["png"])
                    .and_then(|(_, bytes)| load_png_bytes(&bytes).ok()),
            };
            let bytes = loaded.as_ref().map(Picture::byte_len).unwrap_or(0);
            self.used = self.used.saturating_add(bytes);
            self.cache.insert(
                logical.to_string(),
                Slot {
                    pic: loaded,
                    bytes,
                    last_used: self.tick,
                    gen: self.generation,
                },
            );
            self.evict();
        } else if let Some(slot) = self.cache.get_mut(logical) {
            slot.last_used = self.tick;
            slot.gen = self.generation;
        }
        self.cache.get(logical).and_then(|slot| slot.pic.as_ref())
    }

    pub fn character(&mut self, id: &str, face: &str) -> Option<&Picture> {
        let key = format!("char/{id}/{face}");
        self.get(&key)
    }

    fn evict(&mut self) {
        while self.used > self.budget {
            let victim = self
                .cache
                .iter()
                .filter(|(_, slot)| slot.gen != self.generation && slot.bytes > 0)
                .min_by_key(|(_, slot)| slot.last_used)
                .map(|(key, _)| key.clone());
            let Some(key) = victim else {
                break;
            };
            if let Some(slot) = self.cache.remove(&key) {
                self.used = self.used.saturating_sub(slot.bytes);
            }
        }
    }
}

pub fn resolve_png(assets_dir: &Path, logical: &str) -> Option<PathBuf> {
    resolve_with_ext(assets_dir, logical, &["png"])
}

pub fn resolve_audio(assets_dir: &Path, logical: &str) -> Option<PathBuf> {
    resolve_with_ext(assets_dir, logical, &["ogg", "wav"])
}

pub const MOVIE_EXTS: &[&str] = &["mp4", "webm", "wmv"];

pub fn resolve_movie(assets_dir: &Path, logical: &str) -> Option<PathBuf> {
    resolve_with_ext(assets_dir, logical, MOVIE_EXTS)
}

/// PCM / WAVE duration from the `fmt ` + `data` chunks. Unknown formats return None.
pub fn wav_duration_from_bytes(bytes: &[u8]) -> Option<u32> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut i = 12usize;
    let mut byte_rate = 0u32;
    let mut data_size = None;
    while i + 8 <= bytes.len() {
        let id = &bytes[i..i + 4];
        let size = u32::from_le_bytes(bytes[i + 4..i + 8].try_into().ok()?) as usize;
        let body = i + 8;
        if id == b"fmt " && size >= 16 && body + 12 <= bytes.len() {
            byte_rate = u32::from_le_bytes(bytes[body + 8..body + 12].try_into().ok()?);
        } else if id == b"data" {
            data_size = Some(size.min(bytes.len().saturating_sub(body)));
        }
        i = body.saturating_add(size);
        if size % 2 == 1 {
            i = i.saturating_add(1);
        }
    }
    if byte_rate == 0 {
        return None;
    }
    let n = data_size? as u64;
    Some((n.saturating_mul(1000) / u64::from(byte_rate)) as u32)
}

pub fn wav_duration_ms(path: &Path) -> Option<u32> {
    wav_duration_from_bytes(&std::fs::read(path).ok()?)
}

pub fn audio_duration_ms(project_dir: &Path, logical: &str) -> Option<u32> {
    audio_duration_from_source(&Source::Dir(project_dir.to_path_buf()), logical)
}

pub fn audio_duration_from_source(source: &Source, logical: &str) -> Option<u32> {
    let (ext, bytes) = source.read_asset(logical, &["ogg", "wav"])?;
    match ext.as_str() {
        "wav" => wav_duration_from_bytes(&bytes),
        "ogg" => ogg_duration_from_bytes(bytes),
        _ => None,
    }
}

/// Vorbis duration via rodio. `total_duration` if the decoder knows it; else count samples.
pub fn ogg_duration_from_bytes(bytes: Vec<u8>) -> Option<u32> {
    let decoder = rodio::Decoder::new(Cursor::new(bytes)).ok()?;
    use rodio::Source;
    if let Some(d) = decoder.total_duration() {
        return Some(d.as_millis().min(u128::from(u32::MAX)) as u32);
    }
    let rate = u64::from(decoder.sample_rate().max(1));
    let ch = u64::from(decoder.channels().max(1));
    let samples = decoder.count() as u64;
    if samples == 0 {
        return None;
    }
    Some((samples.saturating_mul(1000) / (rate.saturating_mul(ch))) as u32)
}

pub fn ogg_duration_ms(path: &Path) -> Option<u32> {
    ogg_duration_from_bytes(std::fs::read(path).ok()?)
}

pub fn resolve_with_ext(assets_dir: &Path, logical: &str, exts: &[&str]) -> Option<PathBuf> {
    let mut path = assets_dir.to_path_buf();
    for part in logical.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return None;
        }
        path.push(part);
    }
    for ext in exts {
        let candidate = path.with_extension(ext);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn load_png_bytes(bytes: &[u8]) -> Result<Picture, String> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (width, height) = img.dimensions();
    let rgba = img.into_raw();
    let opaque = rgba.chunks_exact(4).all(|px| px[3] == 255);
    Ok(Picture {
        width,
        height,
        rgba,
        opaque,
    })
}

pub fn load_png(path: &Path) -> Result<Picture, String> {
    load_png_bytes(&std::fs::read(path).map_err(|e| e.to_string())?)
}

pub fn fit_bottom_center(
    src_w: u32,
    src_h: u32,
    slot_x: i32,
    slot_y: i32,
    slot_w: i32,
    slot_h: i32,
) -> (i32, i32, i32, i32) {
    if src_w == 0 || src_h == 0 || slot_w <= 0 || slot_h <= 0 {
        return (slot_x, slot_y, 0, 0);
    }
    let scale = (slot_w as f32 / src_w as f32).min(slot_h as f32 / src_h as f32);
    let w = (src_w as f32 * scale).round().max(1.0) as i32;
    let h = (src_h as f32 * scale).round().max(1.0) as i32;
    let x = slot_x + (slot_w - w) / 2;
    let y = slot_y + slot_h - h;
    (x, y, w, h)
}
