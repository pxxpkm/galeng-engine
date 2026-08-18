use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::settings::default_config_path;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeenFile {
    #[serde(default)]
    schema_version: u32,
    #[serde(default)]
    cg: Vec<String>,
    #[serde(default)]
    read: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Seen {
    path: PathBuf,
    assets: BTreeSet<String>,
    read: BTreeSet<String>,
}

pub fn read_key(scene: &str, beat: usize) -> String {
    format!("{scene}:{beat}")
}

impl Seen {
    pub fn load(path: PathBuf) -> Self {
        let file = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<SeenFile>(&text).ok())
            .unwrap_or_default();
        Self {
            path,
            assets: file.cg.into_iter().collect(),
            read: file.read.into_iter().collect(),
        }
    }

    pub fn has(&self, asset: &str) -> bool {
        self.assets.contains(asset)
    }

    /// Record a seen asset path. Writes only when the set grows.
    pub fn note(&mut self, asset: &str) -> bool {
        if asset.is_empty() || !self.assets.insert(asset.to_string()) {
            return false;
        }
        let _ = self.flush();
        true
    }

    pub fn is_read(&self, scene: &str, beat: usize) -> bool {
        self.read.contains(&read_key(scene, beat))
    }

    pub fn note_read(&mut self, scene: &str, beat: usize) -> bool {
        if scene.is_empty() || !self.read.insert(read_key(scene, beat)) {
            return false;
        }
        let _ = self.flush();
        true
    }

    fn flush(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let file = SeenFile {
            schema_version: 1,
            cg: self.assets.iter().cloned().collect(),
            read: self.read.iter().cloned().collect(),
        };
        fs::write(
            &self.path,
            serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
    }
}

pub fn default_seen_path(game_id: &str, project_dir: &Path) -> PathBuf {
    default_config_path(game_id, project_dir).with_file_name("seen.json")
}

pub fn locked_label() -> &'static str {
    "???"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("galeng-part42-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("seen.json")
    }

    #[test]
    fn missing_file_is_empty() {
        let path = temp_path("missing");
        let seen = Seen::load(path);
        assert!(!seen.has("cg/op_still"));
    }

    #[test]
    fn note_persists_by_asset_path() {
        let path = temp_path("round");
        let mut seen = Seen::load(path.clone());
        assert!(seen.note("cg/op_still"));
        assert!(!seen.note("cg/op_still"));
        assert!(seen.has("cg/op_still"));
        assert!(!seen.has("op_still"));

        let again = Seen::load(path);
        assert!(again.has("cg/op_still"));
        assert!(!again.has("op_still"));
    }

    #[test]
    fn empty_path_is_ignored() {
        let mut seen = Seen::load(temp_path("empty"));
        assert!(!seen.note(""));
        assert!(!seen.has(""));
    }

    #[test]
    fn read_set_persists_and_old_file_is_empty() {
        let path = temp_path("read");
        let mut seen = Seen::load(path.clone());
        assert!(!seen.is_read("park_01", 1));
        assert!(seen.note_read("park_01", 1));
        assert!(!seen.note_read("park_01", 1));
        let again = Seen::load(path);
        assert!(again.is_read("park_01", 1));
        assert!(!again.is_read("park_01", 2));
    }
}
