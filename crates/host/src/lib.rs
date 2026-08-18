use std::fs;
use std::path::{Path, PathBuf};

pub mod icon;
pub mod sign;

use galeng_schema::{
    validate_project_file, validate_project_str, validate_scene_str, Exit, Project, Scene,
};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("schema: {0}")]
    Schema(#[from] galeng_schema::Error),
    #[error("unknown scene `{0}`")]
    UnknownScene(String),
    #[error("invalid scene id")]
    BadId,
    #[error("{0}")]
    Msg(String),
    #[error("asset not found `{0}`")]
    MissingAsset(String),
    #[error("pack: {0}")]
    Pack(#[from] galeng_packer::Error),
}

#[derive(Clone)]
pub struct ProjectDir {
    pub root: PathBuf,
}

#[derive(Serialize)]
pub struct SceneMeta {
    pub id: String,
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit: Option<Exit>,
}

#[derive(Serialize)]
pub struct AssetMeta {
    pub logical: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameExport {
    pub pak: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exe: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dll: Option<String>,
    pub warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub signed: bool,
}

impl ProjectDir {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, HostError> {
        let root = root.as_ref().canonicalize()?;
        validate_project_file(root.join("galeng.json"))?;
        Ok(Self { root })
    }

    pub fn project(&self) -> Result<Project, HostError> {
        Ok(validate_project_file(self.root.join("galeng.json"))?)
    }

    pub fn save_project(&self, raw: &serde_json::Value) -> Result<Project, HostError> {
        let project = validate_project_str(
            &serde_json::to_string(raw).map_err(|e| HostError::Msg(e.to_string()))?,
        )?;
        let path = self.root.join("galeng.json");
        fs::write(
            path,
            serde_json::to_string_pretty(&project).map_err(|e| HostError::Msg(e.to_string()))?,
        )?;
        Ok(project)
    }

    pub fn list_scenes(&self) -> Result<Vec<SceneMeta>, HostError> {
        self.list_scene_dir(&self.root.join("scenario"))
    }

    pub fn list_archived(&self) -> Result<Vec<SceneMeta>, HostError> {
        self.list_scene_dir(&self.archive_dir())
    }

    fn list_scene_dir(&self, dir: &Path) -> Result<Vec<SceneMeta>, HostError> {
        let mut out = Vec::new();
        if !dir.is_dir() {
            return Ok(out);
        }
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let scene = validate_scene_str(&fs::read_to_string(path)?)?;
            out.push(SceneMeta {
                id: scene.id,
                title: scene.title,
                exit: scene.exit,
            });
        }
        out.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(out)
    }

    pub fn load_scene(&self, id: &str) -> Result<Scene, HostError> {
        let path = self.scene_path(id)?;
        if !path.is_file() {
            return Err(HostError::UnknownScene(id.to_string()));
        }
        Ok(validate_scene_str(&fs::read_to_string(path)?)?)
    }

    pub fn create_scene(&self, id: &str, title: Option<&str>) -> Result<Scene, HostError> {
        let path = self.scene_path(id)?;
        if path.is_file() {
            return Err(HostError::Msg(format!("scene `{id}` already exists")));
        }
        if self.archive_path(id)?.is_file() {
            return Err(HostError::Msg(format!("scene `{id}` is archived")));
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let scene = Scene {
            id: id.to_string(),
            title: title
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            beats: vec![galeng_schema::Beat {
                bg: None,
                chars: None,
                say: None,
                bgm: None,
                se: None,
                amb: None,
                fx: None,
                movie: None,
                camera: None,
                cg: None,
                set: None,
                label: None,
            }],
            exit: None,
        };
        let json = serde_json::to_string_pretty(&scene).map_err(|e| HostError::Msg(e.to_string()))?;
        validate_scene_str(&json)?;
        fs::write(path, json)?;
        Ok(scene)
    }

    pub fn archive_scene(&self, id: &str) -> Result<(), HostError> {
        let live = self.scene_path(id)?;
        if !live.is_file() {
            return Err(HostError::UnknownScene(id.to_string()));
        }
        let start = self.project()?.start_scene;
        if start == id {
            return Err(HostError::Msg(format!("cannot archive start scene `{id}`")));
        }
        let dest = self.archive_path(id)?;
        if dest.is_file() {
            return Err(HostError::Msg(format!("scene `{id}` is already archived")));
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(live, dest)?;
        Ok(())
    }

    pub fn unarchive_scene(&self, id: &str) -> Result<Scene, HostError> {
        let dest = self.scene_path(id)?;
        if dest.is_file() {
            return Err(HostError::Msg(format!("scene `{id}` already exists")));
        }
        let src = self.archive_path(id)?;
        if !src.is_file() {
            return Err(HostError::UnknownScene(id.to_string()));
        }
        fs::rename(&src, &dest)?;
        Ok(validate_scene_str(&fs::read_to_string(dest)?)?)
    }

    pub fn delete_scene(&self, id: &str) -> Result<(), HostError> {
        let path = self.scene_path(id)?;
        if !path.is_file() {
            return Err(HostError::UnknownScene(id.to_string()));
        }
        let start = self.project()?.start_scene;
        if start == id {
            return Err(HostError::Msg(format!("cannot delete start scene `{id}`")));
        }
        fs::remove_file(path)?;
        Ok(())
    }

    pub fn delete_archived(&self, id: &str) -> Result<(), HostError> {
        let path = self.archive_path(id)?;
        if !path.is_file() {
            return Err(HostError::UnknownScene(id.to_string()));
        }
        fs::remove_file(path)?;
        Ok(())
    }

    pub fn write_script_export(&self, id: &str, text: &str) -> Result<String, HostError> {
        let _ = self.scene_path(id)?;
        if text.is_empty() {
            return Err(HostError::Msg("export text is empty".into()));
        }
        let dir = self.root.join("export").join("script");
        fs::create_dir_all(&dir)?;
        let rel = format!("export/script/{id}.ks.txt");
        let path = self.root.join(&rel);
        let body = text.strip_prefix('\u{feff}').unwrap_or(text);
        fs::write(&path, body.as_bytes())?;
        Ok(rel.replace('\\', "/"))
    }

    fn shown_path(&self, path: &Path) -> String {
        match path.strip_prefix(&self.root) {
            Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
            Err(_) => path.to_string_lossy().replace('/', "\\"),
        }
    }

    fn resolve_export_dir(&self, out: Option<&Path>) -> Result<PathBuf, HostError> {
        let Some(out) = out.filter(|p| !p.as_os_str().is_empty()) else {
            return Ok(self.root.join("export").join("game"));
        };
        if out.is_absolute() {
            return Ok(out.to_path_buf());
        }
        for part in out.components() {
            if matches!(part, std::path::Component::ParentDir) {
                return Err(HostError::Msg("export path cannot contain ..".into()));
            }
        }
        Ok(self.root.join(out))
    }

    /// Pack referenced assets into `export/game/game.pak`. Copy player + SDL2 if provided.
    pub fn export_game(&self, player: Option<&Path>) -> Result<GameExport, HostError> {
        self.export_game_opts(player, false, None)
    }

    pub fn export_game_opts(
        &self,
        player: Option<&Path>,
        strict: bool,
        out: Option<&Path>,
    ) -> Result<GameExport, HostError> {
        let dir = self.resolve_export_dir(out)?;
        fs::create_dir_all(&dir)?;
        let pak_path = dir.join("game.pak");
        let report = galeng_packer::pack_with(
            &self.root,
            &pak_path,
            galeng_packer::PackOpts { strict },
        )?;
        let mut out = GameExport {
            pak: self.shown_path(&pak_path),
            exe: None,
            dll: None,
            warnings: report.warnings,
            signed: false,
        };
        if let Some(src) = player {
            if src.is_file() {
                let dest = dir.join("player.exe");
                fs::copy(src, &dest)?;
                out.exe = Some(self.shown_path(&dest));
                if let Some(parent) = src.parent() {
                    let dll = parent.join("SDL2.dll");
                    if dll.is_file() {
                        let dll_dest = dir.join("SDL2.dll");
                        fs::copy(&dll, &dll_dest)?;
                        out.dll = Some(self.shown_path(&dll_dest));
                    }
                }
            }
        }
        if out.exe.is_none() {
            out.warnings
                .push("player.exe not copied (build galeng-player or use the author pack)".into());
        }
        if let Ok(project) = self.project() {
            if let Some(logical) = project.icon.as_deref() {
                match self.resolve_icon(logical) {
                    Ok(src) => {
                        let dest_ico = dir.join("game.ico");
                        if fs::copy(&src, &dest_ico).is_ok() {
                            if let Some(exe) = out.exe.as_ref() {
                                let exe_path = if Path::new(exe).is_absolute() {
                                    PathBuf::from(exe)
                                } else {
                                    self.root.join(exe)
                                };
                                if let Err(err) = icon::embed_ico(&exe_path, &dest_ico) {
                                    out.warnings.push(format!("icon not written into exe: {err}"));
                                }
                            }
                        }
                    }
                    Err(_) => out.warnings.push(format!("missing icon `{logical}`")),
                }
            }
        }
        if let Some(exe) = out.exe.as_ref() {
            let exe_path = if Path::new(exe).is_absolute() {
                PathBuf::from(exe)
            } else {
                self.root.join(exe)
            };
            let cfg = sign::SignConfig::from_env();
            match sign::sign_exe(&exe_path, &cfg) {
                Ok(sign::SignOutcome::Signed) => out.signed = true,
                Ok(sign::SignOutcome::Skipped) => {}
                Err(err) if cfg.required() => return Err(HostError::Msg(err.to_string())),
                Err(err) => out.warnings.push(err.to_string()),
            }
        }
        Ok(out)
    }

    pub fn resolve_icon(&self, logical: &str) -> Result<PathBuf, HostError> {
        self.resolve_with_exts(logical, &["ico", "png"])
    }

    pub fn save_scene(&self, id: &str, raw: &serde_json::Value) -> Result<Scene, HostError> {
        let scene = validate_scene_str(&serde_json::to_string(raw).map_err(|e| HostError::Msg(e.to_string()))?)?;
        if scene.id != id {
            return Err(HostError::Msg("scene id does not match path".into()));
        }
        let path = self.scene_path(id)?;
        fs::write(path, serde_json::to_string_pretty(&scene).map_err(|e| HostError::Msg(e.to_string()))?)?;
        Ok(scene)
    }

    pub fn asset_root_info(&self) -> (PathBuf, bool) {
        (
            galeng_schema::asset_dir(&self.root),
            galeng_schema::is_default_asset_dir(&self.root),
        )
    }

    pub fn set_asset_root(&self, raw: Option<&str>) -> Result<(PathBuf, bool), HostError> {
        match raw.map(str::trim).filter(|s| !s.is_empty()) {
            None => {
                galeng_schema::save_local(&self.root, &galeng_schema::LocalConfig::default())?;
            }
            Some(s) => {
                let picked = PathBuf::from(s);
                fs::create_dir_all(&picked)?;
                galeng_schema::ensure_asset_groups(&picked)?;
                let stored = galeng_schema::store_asset_root(&self.root, &picked);
                let cfg = if stored.is_empty() {
                    galeng_schema::LocalConfig::default()
                } else {
                    galeng_schema::LocalConfig {
                        asset_root: Some(stored),
                    }
                };
                galeng_schema::save_local(&self.root, &cfg)?;
            }
        }
        Ok(self.asset_root_info())
    }

    pub fn list_assets(&self) -> Result<Vec<AssetMeta>, HostError> {
        let mut out = Vec::new();
        let assets = galeng_schema::asset_dir(&self.root);
        if assets.is_dir() {
            walk_assets(&assets, &assets, &mut out)?;
        }
        out.sort_by(|a, b| a.logical.cmp(&b.logical));
        Ok(out)
    }

    pub fn resolve_media(&self, logical: &str) -> Result<PathBuf, HostError> {
        self.resolve_with_exts(logical, MEDIA_EXTS)
    }

    /// Map a file under the asset root to a logical path (no extension).
    pub fn logical_from_asset_file(&self, picked: &Path) -> Result<String, HostError> {
        if !picked.is_file() {
            return Err(HostError::Msg("not a file".into()));
        }
        let ext = picked
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(ext.as_str(), "png" | "webp" | "ico") {
            return Err(HostError::Msg("pick a PNG (or webp / ico) under the asset root".into()));
        }
        let assets = galeng_schema::asset_dir(&self.root)
            .canonicalize()
            .map_err(|_| HostError::Msg("asset root missing".into()))?;
        let file = picked
            .canonicalize()
            .map_err(|e| HostError::Msg(e.to_string()))?;
        if !file.starts_with(&assets) {
            return Err(HostError::Msg("file is outside the asset root".into()));
        }
        let rel = file
            .strip_prefix(&assets)
            .map_err(|_| HostError::Msg("file is outside the asset root".into()))?;
        let logical = rel.with_extension("").to_string_lossy().replace('\\', "/");
        if logical.is_empty() {
            return Err(HostError::BadId);
        }
        for part in logical.split('/') {
            if part.is_empty() || part == "." || part == ".." {
                return Err(HostError::BadId);
            }
            if !part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            {
                return Err(HostError::Msg(format!("invalid asset path `{logical}`")));
            }
        }
        Ok(logical)
    }

    fn resolve_with_exts(&self, logical: &str, exts: &[&str]) -> Result<PathBuf, HostError> {
        if logical.is_empty() {
            return Err(HostError::BadId);
        }
        let assets = galeng_schema::asset_dir(&self.root);
        let mut path = assets.clone();
        for part in logical.split('/') {
            if part.is_empty() || part == "." || part == ".." || part.contains('\\') {
                return Err(HostError::BadId);
            }
            if !part.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
                return Err(HostError::BadId);
            }
            path.push(part);
        }
        let assets_canon = assets
            .canonicalize()
            .map_err(|_| HostError::MissingAsset(logical.into()))?;
        for ext in exts {
            let candidate = path.with_extension(ext);
            let Ok(file) = candidate.canonicalize() else {
                continue;
            };
            if file.starts_with(&assets_canon) && file.is_file() {
                return Ok(file);
            }
        }
        Err(HostError::MissingAsset(logical.into()))
    }

    fn scene_path(&self, id: &str) -> Result<PathBuf, HostError> {
        if id.is_empty()
            || !id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            return Err(HostError::BadId);
        }
        Ok(self.root.join("scenario").join(format!("{id}.json")))
    }

    fn archive_dir(&self) -> PathBuf {
        self.root.join("scenario").join(".archive")
    }

    fn archive_path(&self, id: &str) -> Result<PathBuf, HostError> {
        let _ = self.scene_path(id)?;
        Ok(self.archive_dir().join(format!("{id}.json")))
    }
}

/// Images first, then audio (ogg before wav, same as the player). No movie.
const MEDIA_EXTS: &[&str] = &["png", "webp", "ogg", "wav"];

pub fn media_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("ogg") => "audio/ogg",
        Some("wav") => "audio/wav",
        _ => "application/octet-stream",
    }
}

fn walk_assets(root: &Path, dir: &Path, out: &mut Vec<AssetMeta>) -> Result<(), HostError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            walk_assets(root, &path, out)?;
            continue;
        }
        let rel = path.strip_prefix(root).unwrap_or(&path);
        let logical = rel
            .with_extension("")
            .to_string_lossy()
            .replace('\\', "/");
        let kind = match path.extension().and_then(|s| s.to_str()) {
            Some("png") | Some("webp") | Some("ico") => "image",
            Some("wav") | Some("ogg") => "audio",
            Some("mp4") | Some("webm") | Some("wmv") => "movie",
            Some("ttf") | Some("otf") | Some("ttc") => "font",
            _ => "other",
        };
        out.push(AssetMeta { logical, kind: kind.into() });
    }
    Ok(())
}

const PLAYER_NAMES: &[&str] = &["galeng-player.exe", "galeng-player"];

/// Newest `galeng-player` among the given directories (PIT-037).
pub fn player_exe_in(dirs: &[PathBuf]) -> Option<PathBuf> {
    let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
    for dir in dirs {
        for name in PLAYER_NAMES {
            let path = dir.join(name);
            let Ok(meta) = path.metadata() else {
                continue;
            };
            if !meta.is_file() {
                continue;
            }
            let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            match &best {
                None => best = Some((path, modified)),
                Some((_, prev)) if modified >= *prev => best = Some((path, modified)),
                Some(_) => {}
            }
        }
    }
    best.map(|(path, _)| path)
}

/// Dev layout: `<repo>/target/{release,debug}/galeng-player.exe`.
pub fn player_exe(repo: &Path) -> Option<PathBuf> {
    player_exe_in(&[repo.join("target/release"), repo.join("target/debug")])
}

/// Author zip: player next to this host. Dev: also search `repo/target/*`.
pub fn find_player_exe(repo: Option<&Path>) -> Option<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
        }
    }
    if let Some(repo) = repo {
        dirs.push(repo.join("target/release"));
        dirs.push(repo.join("target/debug"));
    }
    player_exe_in(&dirs)
}
