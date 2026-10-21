use std::fs;
use std::path::{Path, PathBuf};

use crate::cli::{is_sibling_game_pak, Launch};
use crate::save::default_save_dir;
use crate::seen::default_seen_path;
use crate::settings::default_config_path;

/// Progress file locations for one launch.
///
/// Sibling `game.pak` (beside the exe) uses `<exe_dir>/UserData/` with no game-id
/// subfolder. `--project` and other `--pak` paths keep the APPDATA helpers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserPaths {
    pub config: PathBuf,
    pub seen: PathBuf,
    pub save_dir: PathBuf,
    /// Reserved for PR6 (`input.json` override).
    pub input: PathBuf,
    /// Reserved for PR7 (`galeng.log`).
    pub log: PathBuf,
}

/// Resolve config / seen / save / input / log for this launch.
///
/// On sibling `game.pak`, tries `create_dir_all(UserData)` once; failure falls back
/// to APPDATA helpers and emits `user_data: fallback appdata` (no absolute path).
pub fn user_paths(
    launch: &Launch,
    exe_dir: &Path,
    game_id: &str,
    project_dir: &Path,
) -> UserPaths {
    match launch {
        Launch::Pak { pak, .. } if is_sibling_game_pak(pak, exe_dir) => {
            let root = exe_dir.join("UserData");
            match fs::create_dir_all(&root) {
                Ok(()) => userdata_under(&root),
                Err(_) => {
                    emit_user_data_fallback();
                    appdata_paths(game_id, project_dir)
                }
            }
        }
        _ => appdata_paths(game_id, project_dir),
    }
}

fn userdata_under(root: &Path) -> UserPaths {
    UserPaths {
        config: root.join("config.json"),
        seen: root.join("seen.json"),
        save_dir: root.join("save"),
        input: root.join("input.json"),
        log: root.join("galeng.log"),
    }
}

fn appdata_paths(game_id: &str, project_dir: &Path) -> UserPaths {
    let config = default_config_path(game_id, project_dir);
    let seen = default_seen_path(game_id, project_dir);
    let save_dir = default_save_dir(game_id, project_dir);
    // input/log sit beside config (APPDATA game folder, or project_dir fallback).
    let parent = config
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| project_dir.to_path_buf());
    UserPaths {
        config,
        seen,
        save_dir,
        input: parent.join("input.json"),
        log: parent.join("galeng.log"),
    }
}

fn emit_user_data_fallback() {
    let line = "user_data: fallback appdata";
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new(&format!("{line}\n"))
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            windows::Win32::System::Diagnostics::Debug::OutputDebugStringW(
                windows::core::PCWSTR(wide.as_ptr()),
            );
        }
    }
    #[cfg(not(windows))]
    {
        eprintln!("{line}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static N: AtomicU64 = AtomicU64::new(0);

    fn temp(label: &str) -> PathBuf {
        let n = N.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "galeng-pr5-{}-{}-{}",
            label,
            std::process::id(),
            n
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn sibling_game_pak_uses_userdata_without_game_id() {
        let exe = temp("sib-exe");
        fs::write(exe.join("game.pak"), b"x").unwrap();
        let pak = exe.join("game.pak");
        let launch = Launch::Pak {
            pak: pak.clone(),
            scene: None,
            beat: 0,
        };
        let paths = user_paths(&launch, &exe, "example-prologue", &exe);
        assert_eq!(paths.config, exe.join("UserData/config.json"));
        assert_eq!(paths.seen, exe.join("UserData/seen.json"));
        assert_eq!(paths.save_dir, exe.join("UserData/save"));
        assert_eq!(paths.input, exe.join("UserData/input.json"));
        assert_eq!(paths.log, exe.join("UserData/galeng.log"));
        assert!(!paths.config.to_string_lossy().contains("example-prologue"));
        assert!(exe.join("UserData").is_dir());
        let _ = fs::remove_dir_all(&exe);
    }

    #[test]
    fn relative_game_pak_not_beside_exe_uses_appdata_helpers() {
        let exe = temp("rel-exe");
        let other = temp("rel-other");
        fs::write(other.join("game.pak"), b"x").unwrap();
        // Simulate `--pak game.pak` from another cwd: parent is not exe_dir.
        let launch = Launch::Pak {
            pak: PathBuf::from("game.pak"),
            scene: None,
            beat: 0,
        };
        let project = other.clone();
        let prev = std::env::var_os("APPDATA");
        let fake_app = temp("rel-appdata");
        std::env::set_var("APPDATA", &fake_app);
        let paths = user_paths(&launch, &exe, "gid", &project);
        assert_eq!(
            paths.save_dir,
            fake_app.join("Galeng").join("gid").join("save")
        );
        assert_eq!(
            paths.config,
            fake_app.join("Galeng").join("gid").join("config.json")
        );
        match prev {
            Some(v) => std::env::set_var("APPDATA", v),
            None => std::env::remove_var("APPDATA"),
        }
        let _ = fs::remove_dir_all(&exe);
        let _ = fs::remove_dir_all(&other);
        let _ = fs::remove_dir_all(&fake_app);
    }

    #[test]
    fn other_pak_name_beside_exe_uses_appdata() {
        let exe = temp("other-exe");
        fs::write(exe.join("other.pak"), b"x").unwrap();
        let launch = Launch::Pak {
            pak: exe.join("other.pak"),
            scene: None,
            beat: 0,
        };
        let prev = std::env::var_os("APPDATA");
        let fake_app = temp("other-appdata");
        std::env::set_var("APPDATA", &fake_app);
        let paths = user_paths(&launch, &exe, "gid", &exe);
        assert_eq!(
            paths.save_dir,
            fake_app.join("Galeng").join("gid").join("save")
        );
        match prev {
            Some(v) => std::env::set_var("APPDATA", v),
            None => std::env::remove_var("APPDATA"),
        }
        let _ = fs::remove_dir_all(&exe);
        let _ = fs::remove_dir_all(&fake_app);
    }

    #[test]
    fn project_dir_launch_matches_appdata_helpers() {
        let project = temp("proj");
        let launch = Launch::Dir {
            project: project.clone(),
            scene: None,
            beat: 0,
        };
        let exe = temp("proj-exe");
        let prev = std::env::var_os("APPDATA");
        let fake_app = temp("proj-appdata");
        std::env::set_var("APPDATA", &fake_app);
        let paths = user_paths(&launch, &exe, "gid", &project);
        assert_eq!(paths.save_dir, default_save_dir("gid", &project));
        assert_eq!(paths.config, default_config_path("gid", &project));
        assert_eq!(paths.seen, default_seen_path("gid", &project));
        match prev {
            Some(v) => std::env::set_var("APPDATA", v),
            None => std::env::remove_var("APPDATA"),
        }
        let _ = fs::remove_dir_all(&project);
        let _ = fs::remove_dir_all(&exe);
        let _ = fs::remove_dir_all(&fake_app);
    }
}
