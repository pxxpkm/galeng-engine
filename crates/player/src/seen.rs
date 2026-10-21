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
    /// When true, skip every flush (schema > 2 or illegal JSON on disk).
    readonly: bool,
}

pub fn read_key(scene: &str, beat: usize) -> String {
    format!("{scene}:{beat}")
}

pub fn read_key_id(scene: &str, id: &str) -> String {
    format!("{scene}:id:{id}")
}

impl Seen {
    pub fn load(path: PathBuf) -> Self {
        match fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str::<SeenFile>(&text) {
                Ok(file) if file.schema_version <= 2 => Self {
                    path,
                    assets: file.cg.into_iter().collect(),
                    read: file.read.into_iter().collect(),
                    readonly: false,
                },
                Ok(_) => Self {
                    path,
                    assets: BTreeSet::new(),
                    read: BTreeSet::new(),
                    readonly: true,
                },
                Err(_) => Self {
                    path,
                    assets: BTreeSet::new(),
                    read: BTreeSet::new(),
                    readonly: true,
                },
            },
            Err(_) => Self {
                path,
                assets: BTreeSet::new(),
                read: BTreeSet::new(),
                readonly: false,
            },
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

    pub fn is_read(&self, scene: &str, beat: usize, id: Option<&str>) -> bool {
        if let Some(id) = id {
            if self.read.contains(&read_key_id(scene, id)) {
                return true;
            }
        }
        self.read.contains(&read_key(scene, beat))
    }

    pub fn note_read(&mut self, scene: &str, beat: usize, id: Option<&str>) -> bool {
        if scene.is_empty() {
            return false;
        }
        let key = match id {
            Some(id) => read_key_id(scene, id),
            None => read_key(scene, beat),
        };
        if !self.read.insert(key) {
            return false;
        }
        let _ = self.flush();
        true
    }

    fn flush(&self) -> Result<(), String> {
        if self.readonly {
            return Ok(());
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let file = SeenFile {
            schema_version: 2,
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
        assert!(!seen.readonly);
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
        assert!(!seen.is_read("park_01", 1, None));
        assert!(seen.note_read("park_01", 1, None));
        assert!(!seen.note_read("park_01", 1, None));
        let again = Seen::load(path);
        assert!(again.is_read("park_01", 1, None));
        assert!(!again.is_read("park_01", 2, None));
    }

    #[test]
    fn old_index_key_still_counts_with_id() {
        let path = temp_path("old-key");
        fs::write(
            &path,
            r#"{"schemaVersion":1,"cg":[],"read":["park_01:3"]}"#,
        )
        .unwrap();
        let seen = Seen::load(path);
        assert!(seen.is_read("park_01", 3, Some("b0123456789abcdef")));
        assert!(!seen.is_read("park_01", 2, Some("b0123456789abcdef")));
    }

    #[test]
    fn note_read_with_id_writes_stable_key() {
        let path = temp_path("id-key");
        let mut seen = Seen::load(path.clone());
        assert!(seen.note_read("park_01", 3, Some("b0123456789abcdef")));
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("park_01:id:b0123456789abcdef"));
        assert!(!text.contains("\"park_01:3\""));
        let again = Seen::load(path);
        assert!(again.is_read("park_01", 3, Some("b0123456789abcdef")));
        assert!(again.is_read("park_01", 99, Some("b0123456789abcdef")));
    }

    #[test]
    fn schema_above_2_does_not_flush() {
        let path = temp_path("new-schema");
        fs::write(
            &path,
            r#"{"schemaVersion":3,"cg":["keep"],"read":["park_01:0"]}"#,
        )
        .unwrap();
        let mut seen = Seen::load(path.clone());
        assert!(seen.readonly);
        assert!(!seen.has("keep"));
        assert!(seen.note("cg/new"));
        assert!(seen.note_read("park_01", 1, None));
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"schemaVersion\": 3") || text.contains("\"schemaVersion\":3"));
        assert!(text.contains("keep"));
        assert!(!text.contains("cg/new"));
    }

    #[test]
    fn illegal_json_does_not_flush() {
        let path = temp_path("bad-json");
        fs::write(&path, "not-json{{{").unwrap();
        let mut seen = Seen::load(path.clone());
        assert!(seen.readonly);
        assert!(seen.note("cg/x"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "not-json{{{");
    }

    #[test]
    fn absent_schema_version_is_writable() {
        let path = temp_path("no-ver");
        fs::write(&path, r#"{"cg":[],"read":[]}"#).unwrap();
        let mut seen = Seen::load(path.clone());
        assert!(!seen.readonly);
        assert!(seen.note_read("a", 0, None));
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"schemaVersion\": 2") || text.contains("\"schemaVersion\":2"));
    }
}
