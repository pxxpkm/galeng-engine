//! Zip-compatible `game.pak`: referenced assets + scenario JSON.

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
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
    pack_with_inner(project_dir.as_ref(), out.as_ref(), opts, false)
}

fn pack_with_inner(
    project_dir: &Path,
    out: &Path,
    opts: PackOpts,
    fail_before_rename: bool,
) -> Result<PackReport, Error> {
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

    let index = PakIndex {
        schema_version: PAK_SCHEMA,
        assets: assets.clone(),
    };
    let index_bytes = serde_json::to_vec_pretty(&index).map_err(|e| Error::Msg(e.to_string()))?;

    // Destination is replaced only after the temp zip is finished. Every
    // failure, including the test injection, returns Err and deletes the temp.
    write_pak_atomic(out, fail_before_rename, |zip| {
        write_entry(zip, "galeng.json", &project_bytes)?;
        for (name, bytes) in &scene_files {
            write_entry(zip, name, bytes)?;
        }
        for (name, bytes) in &asset_bytes {
            write_entry(zip, name, bytes)?;
        }
        write_entry(zip, "index.json", &index_bytes)?;
        Ok(())
    })?;

    Ok(PackReport {
        warnings,
        scenes: scenes.into_iter().map(|s| s.id).collect(),
        assets,
    })
}

/// `<file>` → `<file>.tmp` in the same directory (`game.pak` → `game.pak.tmp`).
fn pak_temp_path(out: &Path) -> Result<PathBuf, Error> {
    let name = out
        .file_name()
        .filter(|n| !n.is_empty())
        .ok_or_else(|| Error::Msg("pak output has no file name".into()))?;
    let mut tmp_name = std::ffi::OsString::from(name);
    tmp_name.push(".tmp");
    match out.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => Ok(parent.join(tmp_name)),
        _ => Ok(PathBuf::from(tmp_name)),
    }
}

/// Write the zip beside `out`, fsync when the platform allows it, then rename.
///
/// The destination is not opened until that rename. A crash mid-write leaves
/// the previous complete pak. Any error deletes the temp, so a failed pack
/// does not leave a partial pak at the final path and is not `Ok`.
///
/// On Windows, `std::fs::rename` does not replace an existing file.
/// `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` does. A locked destination
/// (player still has the pak open) stays as it was; the temp file is removed
/// and the error says the pak is in use.
fn write_pak_atomic(
    out: &Path,
    fail_before_rename: bool,
    write_body: impl FnOnce(&mut ZipWriter<File>) -> Result<(), Error>,
) -> Result<(), Error> {
    let tmp = pak_temp_path(out)?;
    let result = (|| -> Result<(), Error> {
        if let Some(parent) = out.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)?;
            }
        }
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)?;
        let mut zip = ZipWriter::new(file);
        write_body(&mut zip)?;
        let finished = zip.finish()?;
        if let Err(err) = finished.sync_all() {
            if err.kind() != io::ErrorKind::Unsupported {
                return Err(err.into());
            }
        }
        drop(finished);
        if fail_before_rename {
            return Err(Error::Msg("injected pack failure".into()));
        }
        // Map a sharing failure here, after the temp zip is complete, so the
        // caller still sees Err and the cleanup below deletes only the temp.
        rename_over(&tmp, out).map_err(|err| pak_rename_error(out, err))?;
        #[cfg(unix)]
        if let Some(parent) = out.parent() {
            if !parent.as_os_str().is_empty() {
                if let Ok(dir) = File::open(parent) {
                    let _ = dir.sync_all();
                }
            }
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// `std::fs::rename` replaces on Unix. On Windows it errors when `to` exists,
/// so use `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING` there.
#[cfg(windows)]
fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    let from_w = wide(from);
    let to_w = wide(to);
    unsafe {
        MoveFileExW(
            PCWSTR(from_w.as_ptr()),
            PCWSTR(to_w.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .map_err(io_from_windows)?;
    }
    Ok(())
}

/// Keep the Win32 code. `windows::core::Error` stores HRESULT_FROM_WIN32,
/// and dropping that down to `ErrorKind::Other` hides os errors 5 and 32.
#[cfg(windows)]
fn io_from_windows(err: windows::core::Error) -> io::Error {
    let hr = err.code().0 as u32;
    let code = if hr & 0xFFFF_0000 == 0x8007_0000 {
        (hr & 0xFFFF) as i32
    } else {
        err.code().0
    };
    io::Error::from_raw_os_error(code)
}

#[cfg(not(windows))]
fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    fs::rename(from, to)
}

/// A rename that could not replace the destination because it is locked.
/// Windows reports that as `PermissionDenied`, `ERROR_ACCESS_DENIED` (5),
/// or `ERROR_SHARING_VIOLATION` (32). Rust maps 5 to `PermissionDenied` and
/// leaves 32 uncategorized, so both the kind and the raw codes count.
/// The raw codes are checked on every OS: `from_raw_os_error` keeps the
/// number, which lets this mapping be tested on Linux.
fn pak_target_in_use(err: &io::Error) -> bool {
    err.kind() == io::ErrorKind::PermissionDenied
        || matches!(err.raw_os_error(), Some(5) | Some(32))
}

fn pak_in_use_message(to: &Path) -> String {
    let name = to
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("game.pak");
    format!("{name} is in use (is the player running?)")
}

fn pak_rename_error(to: &Path, err: io::Error) -> Error {
    if pak_target_in_use(&err) {
        Error::Msg(pak_in_use_message(to))
    } else {
        Error::Io(err)
    }
}

pub struct PakReader {
    archive: ZipArchive<File>,
    pub index: PakIndex,
}

/// Read-only open. On Windows the share mode includes `FILE_SHARE_DELETE`
/// (and the std read/write shares) so an export can rename a new pak over
/// this path while the player still reads the previous bytes. Same flags as
/// `File::open`; set explicitly so a reader never tightens the lock.
fn open_pak_file(path: &Path) -> io::Result<File> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 0x0000_0001;
        const FILE_SHARE_WRITE: u32 = 0x0000_0002;
        const FILE_SHARE_DELETE: u32 = 0x0000_0004;
        OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .open(path)
    }
    #[cfg(not(windows))]
    {
        File::open(path)
    }
}

impl PakReader {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, Error> {
        // Do not put disk paths in the error — PR7/PR8 short codes.
        let file = open_pak_file(path.as_ref()).map_err(|_| Error::Msg("pak unreadable".into()))?;
        let mut archive = ZipArchive::new(file).map_err(|_| Error::Msg("pak unreadable".into()))?;
        let index = match read_named(&mut archive, "index.json") {
            Ok(bytes) => {
                let parsed: PakIndex = serde_json::from_slice(&bytes)
                    .map_err(|_| Error::Msg("pak index invalid".into()))?;
                if parsed.schema_version < 1 {
                    return Err(Error::Msg(format!(
                        "pak schema {} is unsupported",
                        parsed.schema_version
                    )));
                }
                if parsed.schema_version > PAK_SCHEMA {
                    return Err(Error::Msg(format!(
                        "pak schema {} is newer than this player ({PAK_SCHEMA})",
                        parsed.schema_version
                    )));
                }
                parsed
            }
            Err(Error::Zip(zip::result::ZipError::FileNotFound)) => PakIndex {
                schema_version: PAK_SCHEMA,
                assets: BTreeMap::new(),
            },
            Err(e) => return Err(e),
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
            // Do not trust index.assets values: same name checks + whitelist, and
            // require the entry extension to be one the caller asked for.
            if entry_name_allowed(&entry) {
                let ext = Path::new(&entry)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                if exts.iter().any(|e| *e == ext) {
                    if let Ok(bytes) = read_named(&mut self.archive, &entry) {
                        return Some((ext.to_string(), bytes));
                    }
                }
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

/// Player-facing pak schema. Pack writes this; open rejects anything newer.
pub const PAK_SCHEMA: u32 = 1;

/// Cap for a single zip entry loaded into memory (PR8).
pub const MAX_ENTRY_BYTES: u64 = 256 * 1024 * 1024;

fn entry_name_ok(name: &str) -> bool {
    if name.contains('\\') || name.starts_with('/') {
        return false;
    }
    !name.split('/').any(|p| p.is_empty() || p == "..")
}

fn entry_whitelisted(name: &str) -> bool {
    if name == "galeng.json" || name == "index.json" {
        return true;
    }
    if let Some(rest) = name.strip_prefix("scenario/") {
        return !rest.is_empty() && !rest.contains('/') && rest.ends_with(".json");
    }
    if let Some(rest) = name.strip_prefix("assets/") {
        return !rest.is_empty();
    }
    false
}

fn entry_name_allowed(name: &str) -> bool {
    entry_name_ok(name) && entry_whitelisted(name)
}

fn read_named(archive: &mut ZipArchive<File>, name: &str) -> Result<Vec<u8>, Error> {
    if !entry_name_allowed(name) {
        return Err(Error::Msg("pak entry rejected".into()));
    }
    let mut file = archive.by_name(name)?;
    if file.size() > MAX_ENTRY_BYTES {
        return Err(Error::Msg("pak entry too large".into()));
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_ENTRY_BYTES {
        return Err(Error::Msg("pak entry too large".into()));
    }
    Ok(bytes)
}

#[cfg(test)]
mod entry_guard_tests {
    use super::*;

    #[test]
    fn name_rejects_slash_dotdot_and_backslash() {
        assert!(!entry_name_ok("assets/../x.png"));
        assert!(!entry_name_ok("/assets/x.png"));
        assert!(!entry_name_ok("assets\\x.png"));
        assert!(!entry_name_ok("assets//x.png"));
        assert!(entry_name_ok("assets/bg/park.png"));
        assert!(entry_name_ok("galeng.json"));
    }

    #[test]
    fn whitelist_excludes_input_json() {
        assert!(!entry_whitelisted("input.json"));
        assert!(entry_whitelisted("galeng.json"));
        assert!(entry_whitelisted("index.json"));
        assert!(entry_whitelisted("scenario/park_01.json"));
        assert!(!entry_whitelisted("scenario/nested/x.json"));
        assert!(entry_whitelisted("assets/bg/park.png"));
        assert!(!entry_whitelisted("assets/"));
    }

    #[test]
    fn size_cap_constant() {
        assert_eq!(MAX_ENTRY_BYTES, 256 * 1024 * 1024);
        assert!(MAX_ENTRY_BYTES < u64::from(u32::MAX));
    }
}

#[cfg(test)]
mod atomic_pak_tests {
    use super::*;

    const OLD_PAK: &[u8] = b"OLD-PAK-COMPLETE";

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "galeng-e09-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_project(dir: &Path, extra: &str) {
        let body = format!(
            r#"{{
              "id": "e09",
              "title": "E09",
              "schemaVersion": 1,
              "resolution": {{"width": 1920, "height": 1080}},
              "startScene": "a",
              "locale": "en"{extra}
            }}"#
        );
        fs::write(dir.join("galeng.json"), body).unwrap();
    }

    fn assert_no_temp(out: &Path) {
        let tmp = pak_temp_path(out).unwrap();
        assert!(!tmp.exists(), "temp pak left at {}", tmp.display());
    }

    #[test]
    fn success_produces_pak_and_removes_temp() {
        let dir = scratch("ok");
        let project = dir.join("proj");
        fs::create_dir_all(&project).unwrap();
        write_project(&project, "");
        let out = dir.join("out").join("game.pak");
        let report = pack(&project, &out).expect("pack");
        assert!(report.scenes.is_empty());
        assert!(out.is_file(), "success must produce the pak");
        let reader = PakReader::open(&out).expect("pak opens");
        assert!(reader.has_entry("galeng.json"));
        assert!(reader.has_entry("index.json"));
        assert_no_temp(&out);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn success_replaces_previous_pak() {
        let dir = scratch("replace");
        let project = dir.join("proj");
        fs::create_dir_all(&project).unwrap();
        write_project(&project, "");
        let out = dir.join("game.pak");
        fs::write(&out, OLD_PAK).unwrap();
        pack(&project, &out).expect("pack");
        let bytes = fs::read(&out).unwrap();
        assert_ne!(bytes, OLD_PAK);
        assert!(bytes.starts_with(b"PK"), "replaced file is not a zip");
        assert!(PakReader::open(&out).is_ok());
        assert_no_temp(&out);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn injected_failure_leaves_no_artifact() {
        let dir = scratch("fail-none");
        let project = dir.join("proj");
        fs::create_dir_all(&project).unwrap();
        write_project(&project, "");
        let out = dir.join("game.pak");
        let err = pack_with_inner(&project, &out, PackOpts::default(), true).unwrap_err();
        assert!(err.to_string().contains("injected"), "{err}");
        assert!(!out.exists(), "failed pack must not leave a pak");
        assert_no_temp(&out);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn injected_failure_does_not_clobber_existing_pak() {
        let dir = scratch("fail-old");
        let project = dir.join("proj");
        fs::create_dir_all(&project).unwrap();
        write_project(&project, "");
        let out = dir.join("game.pak");
        fs::write(&out, OLD_PAK).unwrap();
        let err = pack_with_inner(&project, &out, PackOpts::default(), true).unwrap_err();
        assert!(err.to_string().contains("injected"), "{err}");
        assert_eq!(fs::read(&out).unwrap(), OLD_PAK);
        assert!(
            PakReader::open(&out).is_err(),
            "old bytes must not become a readable pak"
        );
        assert_no_temp(&out);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn strict_failure_keeps_old_pak_and_writes_nothing_new() {
        let dir = scratch("strict");
        let project = dir.join("proj");
        fs::create_dir_all(&project).unwrap();
        write_project(&project, r#", "titleBg": "bg/missing""#);
        let out = dir.join("nested").join("game.pak");
        fs::create_dir_all(out.parent().unwrap()).unwrap();
        fs::write(&out, OLD_PAK).unwrap();
        let err = pack_with(&project, &out, PackOpts { strict: true }).unwrap_err();
        assert!(err.to_string().contains("strict"), "{err}");
        assert!(err.to_string().contains("bg/missing"), "{err}");
        assert_eq!(fs::read(&out).unwrap(), OLD_PAK);
        assert_no_temp(&out);

        fs::remove_file(&out).unwrap();
        let err = pack_with(&project, &out, PackOpts { strict: true }).unwrap_err();
        assert!(err.to_string().contains("strict"), "{err}");
        assert!(!out.exists(), "strict failure must not create a pak");
        assert_no_temp(&out);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn locked_rename_says_pak_is_in_use() {
        let denied = io::Error::new(io::ErrorKind::PermissionDenied, "access is denied");
        let mapped = pak_rename_error(Path::new("export/game/game.pak"), denied);
        assert_eq!(
            mapped.to_string(),
            "game.pak is in use (is the player running?)"
        );

        // Windows ERROR_ACCESS_DENIED (5) and ERROR_SHARING_VIOLATION (32).
        // On Linux those numbers are other errnos; the mapping still keys off
        // the raw code so this test does not need a Windows host.
        for code in [5, 32] {
            let err = io::Error::from_raw_os_error(code);
            let mapped = pak_rename_error(Path::new("game.pak"), err);
            assert_eq!(
                mapped.to_string(),
                "game.pak is in use (is the player running?)",
                "raw os error {code}"
            );
        }

        let missing = io::Error::new(io::ErrorKind::NotFound, "no such file");
        let mapped = pak_rename_error(Path::new("game.pak"), missing);
        assert!(
            !mapped.to_string().contains("in use"),
            "unrelated rename errors stay io errors: {mapped}"
        );
        assert!(
            !pak_target_in_use(&io::Error::from_raw_os_error(2)),
            "file-not-found / ENOENT is not a lock"
        );
    }

    #[test]
    fn rename_failure_keeps_directory_marker_and_removes_temp() {
        let dir = scratch("dir-dest");
        let project = dir.join("proj");
        fs::create_dir_all(&project).unwrap();
        write_project(&project, "");
        let out = dir.join("game.pak");
        fs::create_dir(&out).unwrap();
        fs::write(out.join("keep.txt"), OLD_PAK).unwrap();
        assert!(pack(&project, &out).is_err());
        assert_eq!(fs::read(out.join("keep.txt")).unwrap(), OLD_PAK);
        assert!(out.is_dir());
        assert_no_temp(&out);
        let _ = fs::remove_dir_all(&dir);
    }
}
