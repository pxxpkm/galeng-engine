//! Machine-local project overlay. Not part of the game IR.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const LOCAL_FILE: &str = "galeng.local.json";

/// Standard author folders under the asset root.
pub const ASSET_GROUP_DIRS: &[&str] = &[
    "bg", "char", "voice", "bgm", "se", "amb", "cg", "movie", "fonts", "ui",
];

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_root: Option<String>,
}

pub fn local_path(project: impl AsRef<Path>) -> PathBuf {
    project.as_ref().join(LOCAL_FILE)
}

pub fn load_local(project: impl AsRef<Path>) -> LocalConfig {
    let path = local_path(project);
    let Ok(text) = fs::read_to_string(path) else {
        return LocalConfig::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_local(project: impl AsRef<Path>, cfg: &LocalConfig) -> Result<(), std::io::Error> {
    let path = local_path(project);
    if cfg.asset_root.is_none() {
        let _ = fs::remove_file(&path);
        return Ok(());
    }
    let text = serde_json::to_string_pretty(cfg).unwrap_or_else(|_| "{}".into());
    fs::write(path, text)
}

/// Directory that holds `bg/`, `char/`, … Default: `<project>/assets`.
pub fn asset_dir(project: impl AsRef<Path>) -> PathBuf {
    let project = project.as_ref();
    match load_local(project).asset_root.as_deref().map(str::trim) {
        None | Some("") => project.join("assets"),
        Some(raw) => {
            let p = PathBuf::from(raw);
            if p.is_absolute() {
                p
            } else {
                project.join(p)
            }
        }
    }
}

pub fn is_default_asset_dir(project: impl AsRef<Path>) -> bool {
    load_local(project)
        .asset_root
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_none()
}

fn display_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path
    }
}

/// Store a picked folder. Under the project → relative; otherwise absolute.
pub fn store_asset_root(project: impl AsRef<Path>, picked: &Path) -> String {
    let project = project.as_ref();
    let canon_proj = display_path(project.canonicalize().unwrap_or_else(|_| project.to_path_buf()));
    let canon_pick = display_path(picked.canonicalize().unwrap_or_else(|_| picked.to_path_buf()));
    if let Ok(rel) = canon_pick.strip_prefix(&canon_proj) {
        let text = rel.to_string_lossy().replace('\\', "/");
        if text.is_empty() || text == "assets" {
            String::new()
        } else {
            text
        }
    } else {
        canon_pick.to_string_lossy().into_owned()
    }
}

pub fn ensure_asset_groups(root: impl AsRef<Path>) -> Result<(), std::io::Error> {
    let root = root.as_ref();
    fs::create_dir_all(root)?;
    for name in ASSET_GROUP_DIRS {
        fs::create_dir_all(root.join(name))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_project_assets() {
        let tmp = std::env::temp_dir().join(format!(
            "galeng-part112-default-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        assert!(is_default_asset_dir(&tmp));
        assert_eq!(asset_dir(&tmp), tmp.join("assets"));
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn override_and_scaffold() {
        let tmp = std::env::temp_dir().join(format!(
            "galeng-part112-over-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let art = tmp.join("art-lib");
        ensure_asset_groups(&art).unwrap();
        assert!(art.join("bg").is_dir());
        assert!(art.join("char").is_dir());
        let stored = store_asset_root(&tmp, &art);
        save_local(
            &tmp,
            &LocalConfig {
                asset_root: Some(stored),
            },
        )
        .unwrap();
        assert!(!is_default_asset_dir(&tmp));
        assert_eq!(
            display_path(asset_dir(&tmp)),
            display_path(art.canonicalize().unwrap())
        );
        save_local(&tmp, &LocalConfig::default()).unwrap();
        assert!(is_default_asset_dir(&tmp));
        assert!(!local_path(&tmp).exists());
        let _ = fs::remove_dir_all(&tmp);
    }
}
