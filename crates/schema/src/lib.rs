//! Plane scenario IR (dialogue and explore): serde types plus JSON Schema validation.

pub mod eval;
pub mod local;
pub mod types;
pub mod validate;

pub use eval::{apply_set, cmp_holds, condition_holds, pred_holds};
pub use local::{
    asset_dir, ensure_asset_groups, is_default_asset_dir, load_local, save_local, store_asset_root,
    LocalConfig, ASSET_GROUP_DIRS, LOCAL_FILE,
};
pub use types::*;
pub use validate::{
    parse_json_utf8, project_body_to_store, project_json_to_store, repo_root, try_repo_root,
    validate_project_file, validate_project_str, validate_project_value, validate_scene_file,
    validate_scene_str, validate_scene_value, Error, KNOWN_PROJECT_KEYS,
};
