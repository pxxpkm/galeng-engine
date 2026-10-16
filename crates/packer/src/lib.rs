//! Zip-compatible `game.pak`: referenced assets + scenario JSON.

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use galeng_schema::{validate_project_file, validate_scene_str, Project, Scene};
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("schema: {0}")]
    Schema(#[from] galeng_schema::Error),
    #[error("zip: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("{0}")]
    Msg(String),
    #[error("strict: {0}")]
    Strict(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PakIndex {
    pub schema_version: u32,
    pub assets: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default)]
pub struct PackReport {
    pub warnings: Vec<String>,
    pub scenes: Vec<String>,
    pub assets: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct PackOpts {
    pub strict: bool,
}


fn collect_explore_action_refs(out: &mut BTreeSet<String>, actions: &[galeng_schema::ExploreAction]) {
    use galeng_schema::ExploreAction;
    for action in actions {
        match action {
            ExploreAction::PlaySe { asset } => {
                out.insert(asset.clone());
            }
            ExploreAction::Bgm { asset: Some(asset), .. } => {
                out.insert(asset.clone());
            }
            _ => {}
        }
    }
}

pub fn collect_refs(project: &Project, scenes: &[Scene]) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    if let Some(s) = &project.title_bgm {
        out.insert(s.clone());
    }
    if let Some(s) = &project.title_bg {
        out.insert(s.clone());
    }
    if let Some(s) = &project.title_movie {
        out.insert(s.clone());
    }
    if let Some(s) = &project.font {
        out.insert(s.clone());
    }
    if let Some(fonts) = &project.fonts {
        for s in fonts.role_logicals() {
            out.insert(s.to_string());
        }
    }
    if let Some(s) = &project.msg_box {
        out.insert(s.clone());
    }
    if let Some(s) = &project.icon {
        out.insert(s.clone());
    }
    if let Some(buttons) = &project.title_buttons {
        for path in buttons.assets() {
            out.insert(path.to_string());
        }
    }
    if let Some(buttons) = &project.pause_buttons {
        for path in buttons.assets() {
            out.insert(path.to_string());
        }
    }
    if let Some(items) = &project.cg {
        for item in items {
            out.insert(item.asset.clone());
        }
    }
    if let Some(items) = &project.music_gallery {
        for item in items {
            out.insert(item.asset.clone());
        }
    }
    for item in &project.items {
        if let Some(icon) = &item.icon {
            out.insert(icon.clone());
        }
    }
    for scene in scenes {
        if let Some(bg) = &scene.bg {
            out.insert(bg.asset.clone());
        }
        collect_explore_action_refs(&mut out, &scene.on_enter);
        collect_explore_action_refs(&mut out, &scene.on_empty_click);
        for interaction in &scene.interactions {
            for rule in &interaction.rules {
                collect_explore_action_refs(&mut out, &rule.actions);
            }
        }
        for beat in &scene.beats {
            if let Some(bg) = &beat.bg {
                out.insert(bg.asset.clone());
            }

            if let Some(bg) = &beat.bg {
                out.insert(bg.asset.clone());
            }
            if let Some(chars) = &beat.chars {
                for ch in chars {
                    out.insert(format!("char/{}/{}", ch.id, ch.face));
                }
            }
            if let Some(say) = &beat.say {
                if let Some(voice) = &say.voice {
                    out.insert(voice.clone());
                }
            }
            if let Some(bgm) = &beat.bgm {
                if let Some(asset) = &bgm.asset {
                    out.insert(asset.clone());
                }
            }
            if let Some(se) = &beat.se {
                for item in se {
                    out.insert(item.asset.clone());
                }
            }
            if let Some(Some(amb)) = &beat.amb {
                out.insert(amb.clone());
            }
            if let Some(Some(cg)) = &beat.cg {
                out.insert(cg.clone());
            }
            if let Some(movie) = &beat.movie {
                out.insert(movie.asset.clone());
            }
        }
    }
    out
}

pub fn load_scenes(project_dir: &Path) -> Result<(Vec<Scene>, Vec<(String, Vec<u8>)>, Vec<String>), Error> {
    let mut scenes = Vec::new();
    let mut files = Vec::new();
    let mut warnings = Vec::new();
    let dir = project_dir.join("scenario");
    if !dir.is_dir() {
        return Ok((scenes, files, warnings));
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("json"))
        .collect();
    entries.sort();
    for path in entries {
        let bytes = fs::read(&path)?;
        let text = String::from_utf8(bytes.clone()).map_err(|_| Error::Msg(format!("not utf-8: {}", path.display())))?;
        match validate_scene_str(&text) {
            Ok(scene) => {
                let name = format!(
                    "scenario/{}.json",
                    path.file_stem().and_then(|s| s.to_str()).unwrap_or("scene")
                );
                files.push((name, bytes));
                scenes.push(scene);
            }
            Err(err) => warnings.push(format!("skip {}: {err}", path.display())),
        }
    }
    Ok((scenes, files, warnings))
}

/// Microsoft retail fonts must not be shipped in a pak (ADR-083).
pub fn is_blocked_system_font(logical_or_name: &str) -> bool {
    let normalized = logical_or_name.replace('\\', "/").to_ascii_lowercase();
    if normalized.contains("windows/fonts/") {
        return true;
    }
    let stem = std::path::Path::new(&normalized)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(normalized.rsplit('/').next().unwrap_or(&normalized));
    let compact = stem.replace([' ', '_', '-'], "");
    const PREFIXES: &[&str] = &[
        "msjh", "msyh", "msgothic", "msmincho", "mingliu", "pmingli", "kaiu",
        "simsun", "simhei", "simkai", "simfang", "segoe", "segui", "meiryo",
        "yugoth", "yumin", "malgun", "gulim", "batang", "tahoma", "arial",
        "times", "comic", "calibri", "cambria", "candara", "consola", "constan",
        "corbel", "georgia", "verdana", "dengxian", "fangsong", "kaiti",
    ];
    PREFIXES.iter().any(|prefix| compact.starts_with(prefix))
}

pub fn is_blocked_system_font_path(path: &Path) -> bool {
    is_blocked_system_font(&path.to_string_lossy())
}

fn logical_ok(logical: &str) -> bool {
    !logical.is_empty()
        && !logical.split('/').any(|p| p.is_empty() || p == "." || p == "..")
}

fn exts_for(logical: &str) -> &'static [&'static str] {
    if logical.starts_with("bgm/") || logical.starts_with("se/") || logical.starts_with("voice/") {
        &["ogg", "wav"]
    } else if logical.starts_with("movie/") {
        &["mp4", "webm", "wmv"]
    } else if logical.starts_with("fonts/") {
        &["ttf", "otf", "ttc"]
    } else {
        &["png"]
    }
}

pub fn resolve_asset_file(assets_dir: &Path, logical: &str) -> Option<PathBuf> {
    if !logical_ok(logical) {
        return None;
    }
    let mut path = assets_dir.to_path_buf();
    for part in logical.split('/') {
        path.push(part);
    }
    for ext in exts_for(logical) {
        let candidate = path.with_extension(ext);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn zip_options(store: bool) -> SimpleFileOptions {
    let method = if store {
        CompressionMethod::Stored
    } else {
        CompressionMethod::Deflated
    };
    SimpleFileOptions::default()
        .compression_method(method)
        .unix_permissions(0o644)
}

fn should_store(name: &str) -> bool {
    name.ends_with(".png") || name.ends_with(".ogg") || name.ends_with(".wav") || name.ends_with(".mp4")
}

fn write_entry(zip: &mut ZipWriter<File>, name: &str, bytes: &[u8]) -> Result<(), Error> {
    zip.start_file(name, zip_options(should_store(name)))?;
    zip.write_all(bytes)?;
    Ok(())
}

pub fn pack(project_dir: impl AsRef<Path>, out: impl AsRef<Path>) -> Result<PackReport, Error> {
    pack_with(project_dir, out, PackOpts::default())
}

pub fn pack_with(
    project_dir: impl AsRef<Path>,
    out: impl AsRef<Path>,
    opts: PackOpts,
) -> Result<PackReport, Error> {
    let project_dir = project_dir.as_ref();
    let out = out.as_ref();
    let project_bytes = fs::read(project_dir.join("galeng.json"))?;
    let project = validate_project_file(project_dir.join("galeng.json"))?;
    let (scenes, scene_files, mut warnings) = load_scenes(project_dir)?;
    let mut font_roles: Vec<String> = Vec::new();
    if let Some(font) = &project.font {
        font_roles.push(font.clone());
    }
    if let Some(fonts) = &project.fonts {
        for s in fonts.role_logicals() {
            font_roles.push(s.to_string());
        }
    }
    for font in &font_roles {
        if !font.starts_with("fonts/") {
            return Err(Error::Msg(format!(
                "font must be under fonts/, got `{font}`"
            )));
        }
        if is_blocked_system_font(font) {
            return Err(Error::Msg(format!(
                "refusing Microsoft system font `{font}`"
            )));
        }
    }
    let refs = collect_refs(&project, &scenes);

    let assets_dir = galeng_schema::asset_dir(project_dir);
    let mut assets = BTreeMap::new();
    let mut asset_bytes: Vec<(String, Vec<u8>)> = Vec::new();
    for logical in &refs {
        if !logical_ok(logical) {
            warnings.push(format!("skip bad path `{logical}`"));
            continue;
        }
        if logical.starts_with("fonts/") && is_blocked_system_font(logical) {
            return Err(Error::Msg(format!(
                "refusing Microsoft system font `{logical}`"
            )));
        }
        match resolve_asset_file(&assets_dir, logical) {
            Some(path) => {
                if is_blocked_system_font_path(&path) {
                    return Err(Error::Msg(format!(
                        "refusing Microsoft system font `{}`",
                        path.display()
                    )));
                }
                let ext = path
                    .extension()
                    .and_then(|s| s.to_str())
                    .ok_or_else(|| Error::Msg(format!("no ext {}", path.display())))?;
                let entry = format!("assets/{logical}.{ext}");
                asset_bytes.push((entry.clone(), fs::read(&path)?));
                assets.insert(logical.clone(), entry);
            }
            None => warnings.push(format!("missing asset `{logical}`")),
        }
    }

    if opts.strict && !warnings.is_empty() {
        return Err(Error::Strict(warnings.join("; ")));
    }

    if let Some(parent) = out.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let file = File::create(out)?;
    let mut zip = ZipWriter::new(file);
    write_entry(&mut zip, "galeng.json", &project_bytes)?;
    for (name, bytes) in &scene_files {
        write_entry(&mut zip, name, bytes)?;
    }
    for (name, bytes) in &asset_bytes {
        write_entry(&mut zip, name, bytes)?;
    }
    let index = PakIndex {
        schema_version: 1,
        assets: assets.clone(),
    };
    let index_bytes = serde_json::to_vec_pretty(&index).map_err(|e| Error::Msg(e.to_string()))?;
    write_entry(&mut zip, "index.json", &index_bytes)?;
    zip.finish()?;

    Ok(PackReport {
        warnings,
        scenes: scenes.into_iter().map(|s| s.id).collect(),
        assets,
    })
}

pub struct PakReader {
    archive: ZipArchive<File>,
    pub index: PakIndex,
}

impl PakReader {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, Error> {
        let file = File::open(path.as_ref()).map_err(|e| {
            Error::Msg(format!("open {}: {e}", path.as_ref().display()))
        })?;
        let mut archive = ZipArchive::new(file)?;
        let index = match read_named(&mut archive, "index.json") {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or(PakIndex {
                schema_version: 1,
                assets: BTreeMap::new(),
            }),
            Err(_) => PakIndex {
                schema_version: 1,
                assets: BTreeMap::new(),
            },
        };
        Ok(Self { archive, index })
    }

    pub fn names(&self) -> Vec<String> {
        self.archive.file_names().map(str::to_string).collect()
    }

    pub fn has_entry(&self, name: &str) -> bool {
        self.archive.file_names().any(|n| n == name)
    }

    pub fn project_json(&mut self) -> Result<String, Error> {
        let bytes = read_named(&mut self.archive, "galeng.json")?;
        String::from_utf8(bytes).map_err(|_| Error::Msg("galeng.json is not utf-8".into()))
    }

    pub fn scene_texts(&mut self) -> Result<Vec<(String, String)>, Error> {
        let names: Vec<String> = self
            .archive
            .file_names()
            .filter(|n| n.starts_with("scenario/") && n.ends_with(".json") && !n.ends_with('/'))
            .map(str::to_string)
            .collect();
        let mut out = Vec::new();
        for name in names {
            let bytes = read_named(&mut self.archive, &name)?;
            let text = String::from_utf8(bytes)
                .map_err(|_| Error::Msg(format!("{name} is not utf-8")))?;
            out.push((name, text));
        }
        Ok(out)
    }

    pub fn read_asset(&mut self, logical: &str, exts: &[&str]) -> Option<(String, Vec<u8>)> {
        if !logical_ok(logical) {
            return None;
        }
        if let Some(entry) = self.index.assets.get(logical).cloned() {
            if let Ok(bytes) = read_named(&mut self.archive, &entry) {
                let ext = Path::new(&entry)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                return Some((ext, bytes));
            }
        }
        for ext in exts {
            let name = format!("assets/{logical}.{ext}");
            if let Ok(bytes) = read_named(&mut self.archive, &name) {
                return Some(((*ext).to_string(), bytes));
            }
        }
        None
    }
}

fn read_named(archive: &mut ZipArchive<File>, name: &str) -> Result<Vec<u8>, Error> {
    let mut file = archive.by_name(name)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}
