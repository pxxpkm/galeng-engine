use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Launch {
    Dir {
        project: PathBuf,
        scene: Option<String>,
        beat: usize,
    },
    Pak {
        pak: PathBuf,
        scene: Option<String>,
        beat: usize,
    },
}

/// Parsed argv: optional launch target plus `--diag`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub launch: Option<Launch>,
    pub diag: bool,
    /// When `--diag` saw `--project`+`--pak`, the mutual-exclusion message for the report.
    pub diag_note: Option<String>,
}

pub fn parse_args(args: &[String]) -> Result<Launch, String> {
    let mut project: Option<PathBuf> = None;
    let mut pak: Option<PathBuf> = None;
    let mut scene: Option<String> = None;
    let mut beat: usize = 0;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--project" => {
                i += 1;
                project = Some(PathBuf::from(args.get(i).ok_or("--project needs a path")?));
            }
            "--pak" => {
                i += 1;
                pak = Some(PathBuf::from(args.get(i).ok_or("--pak needs a path")?));
            }
            "--scene" => {
                i += 1;
                scene = Some(args.get(i).ok_or("--scene needs an id")?.clone());
            }
            "--beat" => {
                i += 1;
                beat = args
                    .get(i)
                    .ok_or("--beat needs a number")?
                    .parse()
                    .map_err(|_| "--beat must be an integer")?;
            }
            other => return Err(format!("unknown arg {other}")),
        }
        i += 1;
    }
    match (project, pak) {
        (Some(_), Some(_)) => Err("--project and --pak are mutually exclusive".into()),
        (Some(project), None) => Ok(Launch::Dir {
            project,
            scene,
            beat,
        }),
        (None, Some(pak)) => Ok(Launch::Pak { pak, scene, beat }),
        (None, None) => {
            Err("usage: galeng-player --project <dir> | --pak <file.pak> [--scene id] [--beat n]".into())
        }
    }
}

/// Parse argv including optional `--diag`. Empty args (no `--diag`) still mean sibling `game.pak`.
pub fn resolve_invocation(args: &[String], exe_dir: &Path) -> Result<Invocation, String> {
    let mut diag = false;
    let mut rest = Vec::with_capacity(args.len());
    for a in args {
        if a == "--diag" {
            diag = true;
        } else {
            rest.push(a.clone());
        }
    }

    if rest.is_empty() {
        if diag {
            return Ok(Invocation {
                launch: None,
                diag: true,
                diag_note: None,
            });
        }
        let pak = exe_dir.join("game.pak");
        if pak.is_file() {
            return Ok(Invocation {
                launch: Some(Launch::Pak {
                    pak,
                    scene: None,
                    beat: 0,
                }),
                diag: false,
                diag_note: None,
            });
        }
        return Err(
            "no game.pak next to player.exe. usage: galeng-player --project <dir> | --pak <file.pak>"
                .into(),
        );
    }

    match parse_args(&rest) {
        Ok(launch) => Ok(Invocation {
            launch: Some(launch),
            diag,
            diag_note: None,
        }),
        Err(e) if diag && e.contains("mutually exclusive") => Ok(Invocation {
            launch: None,
            diag: true,
            diag_note: Some(e),
        }),
        Err(e) => Err(e),
    }
}

/// No args: load `game.pak` next to the exe (ADR-116). Otherwise `parse_args`.
/// Does not accept bare `--diag` (use [`resolve_invocation`]).
pub fn resolve_launch(args: &[String], exe_dir: &Path) -> Result<Launch, String> {
    let inv = resolve_invocation(args, exe_dir)?;
    inv.launch.ok_or_else(|| {
        "usage: galeng-player --project <dir> | --pak <file.pak> [--scene id] [--beat n]".into()
    })
}

/// True when `pak` is exactly `game.pak` whose parent is `exe_dir`.
///
/// Canonicalize both sides when both succeed; otherwise compare raw parents.
/// Relative `--pak game.pak` whose parent is not the exe directory is not sibling.
pub fn is_sibling_game_pak(pak: &Path, exe_dir: &Path) -> bool {
    let Some(name) = pak.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    if name != "game.pak" {
        return false;
    }
    let Some(raw_parent) = pak.parent() else {
        return false;
    };
    match (pak.canonicalize(), exe_dir.canonicalize()) {
        (Ok(canon_pak), Ok(canon_exe)) => match canon_pak.parent() {
            Some(p) => p == canon_exe.as_path(),
            None => false,
        },
        _ => raw_parent == exe_dir,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn sibling_detects_exact_game_pak_beside_exe() {
        let tmp = std::env::temp_dir().join(format!(
            "galeng-pr5-sib-cli-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("game.pak"), b"x").unwrap();
        assert!(is_sibling_game_pak(&tmp.join("game.pak"), &tmp));
        assert!(!is_sibling_game_pak(&tmp.join("other.pak"), &tmp));
        assert!(!is_sibling_game_pak(Path::new("game.pak"), &tmp));
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn resolve_invocation_diag_alone() {
        let tmp = std::env::temp_dir().join(format!(
            "galeng-pr7-diag-alone-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let inv = resolve_invocation(&["--diag".into()], &tmp).unwrap();
        assert!(inv.diag);
        assert!(inv.launch.is_none());
        assert!(inv.diag_note.is_none());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn resolve_invocation_diag_mutual_exclusive_ok() {
        let tmp = PathBuf::from(".");
        let inv = resolve_invocation(
            &[
                "--diag".into(),
                "--project".into(),
                "a".into(),
                "--pak".into(),
                "b".into(),
            ],
            &tmp,
        )
        .unwrap();
        assert!(inv.diag);
        assert!(inv.launch.is_none());
        assert!(inv
            .diag_note
            .as_deref()
            .unwrap_or("")
            .contains("mutually exclusive"));
    }

    #[test]
    fn resolve_invocation_diag_with_project() {
        let tmp = PathBuf::from(".");
        let inv = resolve_invocation(
            &["--diag".into(), "--project".into(), "examples/prologue".into()],
            &tmp,
        )
        .unwrap();
        assert!(inv.diag);
        match inv.launch {
            Some(Launch::Dir { project, .. }) => {
                assert_eq!(project, PathBuf::from("examples/prologue"));
            }
            _ => panic!("expected Dir"),
        }
    }
}
