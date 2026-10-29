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

/// Top-level keys in `galeng.project.schema.json` `properties`.
/// Unknown keys are kept on disk by the host; validation sees only these.
pub const KNOWN_PROJECT_KEYS: &[&str] = &[
    "id",
    "title",
    "schemaVersion",
    "resolution",
    "startScene",
    "locale",
    "skipTitle",
    "titleBgm",
    "titleBg",
    "titleMovie",
    "font",
    "fonts",
    "msgBox",
    "icon",
    "hideGameTitle",
    "titleButtons",
    "pauseButtons",
    "uiLanguages",
    "characters",
    "cg",
    "musicGallery",
    "verbs",
    "items",
    "switches",
    "fallback",
    "effectLibrary",
    "transitionDefaults",
];

fn is_known_project_key(key: &str) -> bool {
    KNOWN_PROJECT_KEYS.contains(&key)
}

/// Schema check ignores top-level keys it does not define.
/// Callers that rewrite the file must copy those keys back themselves.
fn known_project_value(value: &Value) -> Value {
    let Some(obj) = value.as_object() else {
        return value.clone();
    };
    let mut known = serde_json::Map::new();
    for (key, item) in obj {
        if is_known_project_key(key) {
            known.insert(key.clone(), item.clone());
        }
    }
    Value::Object(known)
}

pub fn validate_project_value(value: &Value) -> Result<Project, Error> {
    apply_schema(project_validator(), &known_project_value(value))
}

/// Pretty JSON to write. Known fields keep `Project`'s field order.
/// Unknown keys from this body are appended. Omitted known keys stay omitted.
pub fn project_body_to_store(raw: &Value) -> Result<(Project, String), Error> {
    let project = validate_project_value(raw)?;
    let body = serde_json::to_string_pretty(&project)?;
    let Some(raw_obj) = raw.as_object() else {
        return Ok((project, body));
    };
    let mut unknown = serde_json::Map::new();
    for (key, item) in raw_obj {
        if !is_known_project_key(key) {
            unknown.insert(key.clone(), item.clone());
        }
    }
    Ok((project, append_unknown_object_keys(body, &unknown)?))
}

/// Same document as [`project_body_to_store`], parsed for callers that want a value.
pub fn project_json_to_store(raw: &Value) -> Result<(Project, Value), Error> {
    let (project, body) = project_body_to_store(raw)?;
    Ok((project, serde_json::from_str(&body)?))
}

fn append_unknown_object_keys(
    body: String,
    unknown: &serde_json::Map<String, Value>,
) -> Result<String, Error> {
    if unknown.is_empty() {
        return Ok(body);
    }
    let trimmed = body.trim_end();
    if !trimmed.ends_with('}') {
        return Err(Error::Schema(
            "project document is not a JSON object".into(),
        ));
    }
    let head = &trimmed[..trimmed.len() - 1];
    let mut out = head.trim_end().to_string();
    if !out.ends_with('{') {
        out.push(',');
    }
    out.push('\n');
    for (index, (key, value)) in unknown.iter().enumerate() {
        if index > 0 {
            out.push_str(",\n");
        }
        let rendered = serde_json::to_string_pretty(value)?;
        let mut lines = rendered.lines();
        let first = lines.next().unwrap_or("");
        out.push_str("  ");
        out.push_str(&serde_json::to_string(key)?);
        out.push_str(": ");
        out.push_str(first);
        for line in lines {
            out.push('\n');
            out.push_str("  ");
            out.push_str(line);
        }
    }
    out.push('\n');
    out.push('}');
    Ok(out)
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
