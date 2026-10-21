use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use jsonschema::Validator;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::types::{Project, Scene};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("schema validation failed:\n{0}")]
    Schema(String),
    #[error("UTF-8 BOM is not allowed")]
    Bom,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

/// Source-tree root when this crate was built inside the repo.
/// `None` on a machine that does not have that path (author zip).
pub fn try_repo_root() -> Option<PathBuf> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .ok()
}

/// Panics if the compile-time repo path is missing. Tests only.
pub fn repo_root() -> PathBuf {
    try_repo_root().expect("repo root")
}

fn load_schema_value(name: &str) -> Value {
    let text = match name {
        "galeng.project.schema.json" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/schema/schema/galeng.project.schema.json"
        )),
        "galeng.scene.schema.json" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/schema/schema/galeng.scene.schema.json"
        )),
        other => panic!("unknown schema {other}"),
    };
    serde_json::from_str(text).expect("schema JSON")
}

fn compile(name: &str) -> Validator {
    let schema = load_schema_value(name);
    Validator::new(&schema).unwrap_or_else(|err| panic!("compile {name}: {err}"))
}

fn project_validator() -> &'static Validator {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    VALIDATOR.get_or_init(|| compile("galeng.project.schema.json"))
}

fn scene_validator() -> &'static Validator {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    VALIDATOR.get_or_init(|| compile("galeng.scene.schema.json"))
}

pub fn parse_json_utf8(text: &str) -> Result<Value, Error> {
    if text.starts_with('\u{feff}') {
        return Err(Error::Bom);
    }
    Ok(serde_json::from_str(text)?)
}

fn apply_schema<T: DeserializeOwned>(validator: &Validator, value: &Value) -> Result<T, Error> {
    let errors: Vec<String> = validator
        .iter_errors(value)
        .map(|err| {
            let path = err.instance_path.to_string();
            if path.is_empty() {
                format!("{err}")
            } else {
                format!("{path}: {err}")
            }
        })
        .collect();
    if !errors.is_empty() {
        return Err(Error::Schema(errors.join("\n")));
    }
    Ok(serde_json::from_value(value.clone())?)
}

pub fn validate_project_value(value: &Value) -> Result<Project, Error> {
    apply_schema(project_validator(), value)
}

pub fn validate_scene_value(value: &Value) -> Result<Scene, Error> {
    let scene: Scene = apply_schema(scene_validator(), value)?;
    reject_duplicate_beat_ids(&scene)?;
    Ok(scene)
}

fn reject_duplicate_beat_ids(scene: &Scene) -> Result<(), Error> {
    let mut seen = std::collections::BTreeSet::new();
    for beat in &scene.beats {
        let Some(id) = beat.id.as_deref() else {
            continue;
        };
        if !seen.insert(id) {
            return Err(Error::Schema(format!("duplicate beat id `{id}`")));
        }
    }
    Ok(())
}

pub fn validate_project_str(text: &str) -> Result<Project, Error> {
    validate_project_value(&parse_json_utf8(text)?)
}

pub fn validate_scene_str(text: &str) -> Result<Scene, Error> {
    validate_scene_value(&parse_json_utf8(text)?)
}

pub fn validate_project_file(path: impl AsRef<Path>) -> Result<Project, Error> {
    validate_project_str(&fs::read_to_string(path)?)
}

pub fn validate_scene_file(path: impl AsRef<Path>) -> Result<Scene, Error> {
    validate_scene_str(&fs::read_to_string(path)?)
}
