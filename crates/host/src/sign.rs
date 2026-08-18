//! Optional Authenticode signing of the exported player.exe (ADR-119).

use std::env;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_TIMESTAMP: &str = "http://timestamp.digicert.com";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SignConfig {
    Off,
    Pfx {
        path: PathBuf,
        password: String,
        timestamp: String,
        required: bool,
    },
    Store {
        thumbprint: Option<String>,
        subject: Option<String>,
        timestamp: String,
        required: bool,
    },
}

impl SignConfig {
    pub fn from_env() -> Self {
        Self::from_pairs(env::vars_os())
    }

    pub fn from_pairs(pairs: impl IntoIterator<Item = (OsString, OsString)>) -> Self {
        let mut pfx = None;
        let mut password = String::new();
        let mut thumbprint = None;
        let mut subject = None;
        let mut timestamp = DEFAULT_TIMESTAMP.to_string();
        let mut required = false;
        for (key, val) in pairs {
            let Ok(k) = key.into_string() else { continue };
            let Ok(v) = val.into_string() else { continue };
            match k.as_str() {
                "GALENG_SIGN_PFX" => {
                    let t = v.trim();
                    if !t.is_empty() {
                        pfx = Some(PathBuf::from(t));
                    }
                }
                "GALENG_SIGN_PASSWORD" => password = v,
                "GALENG_SIGN_THUMBPRINT" => {
                    let t = v.trim();
                    if !t.is_empty() {
                        thumbprint = Some(t.to_string());
                    }
                }
                "GALENG_SIGN_SUBJECT" => {
                    let t = v.trim();
                    if !t.is_empty() {
                        subject = Some(t.to_string());
                    }
                }
                "GALENG_SIGN_TIMESTAMP" => {
                    let t = v.trim();
                    if !t.is_empty() {
                        timestamp = t.to_string();
                    }
                }
                "GALENG_SIGN_REQUIRED" => {
                    let t = v.trim().to_ascii_lowercase();
                    required = t == "1" || t == "true" || t == "yes";
                }
                _ => {}
            }
        }
        if let Some(path) = pfx {
            return Self::Pfx {
                path,
                password,
                timestamp,
                required,
            };
        }
        if thumbprint.is_some() || subject.is_some() {
            return Self::Store {
                thumbprint,
                subject,
                timestamp,
                required,
            };
        }
        Self::Off
    }

    pub fn required(&self) -> bool {
        match self {
            Self::Off => false,
            Self::Pfx { required, .. } | Self::Store { required, .. } => *required,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SignError {
    #[error("{0}")]
    Msg(String),
}

pub fn find_signtool() -> Option<PathBuf> {
    if let Ok(explicit) = env::var("GALENG_SIGNTOOL") {
        let p = PathBuf::from(explicit.trim());
        if p.is_file() {
            return Some(p);
        }
    }
    which("signtool.exe")
        .or_else(|| which("signtool"))
        .or_else(find_windows_kit_signtool)
}

fn which(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    for dir in env::split_paths(&path) {
        let cand = dir.join(name);
        if cand.is_file() {
            return Some(cand);
        }
    }
    None
}

fn find_windows_kit_signtool() -> Option<PathBuf> {
    let roots = [
        env::var_os("ProgramFiles(x86)").map(PathBuf::from),
        env::var_os("ProgramFiles").map(PathBuf::from),
        Some(PathBuf::from(r"C:\Program Files (x86)")),
    ];
    let mut best: Option<PathBuf> = None;
    for root in roots.into_iter().flatten() {
        let bin = root.join(r"Windows Kits\10\bin");
        let Ok(entries) = std::fs::read_dir(&bin) else {
            continue;
        };
        for entry in entries.flatten() {
            let tool = entry.path().join(r"x64\signtool.exe");
            if tool.is_file() {
                best = Some(tool);
            }
        }
    }
    best
}

pub fn sign_exe(exe: &Path, cfg: &SignConfig) -> Result<(), SignError> {
    let SignConfig::Off = cfg else {
        return sign_exe_configured(exe, cfg);
    };
    Err(SignError::Msg(
        "player.exe not signed (set GALENG_SIGN_PFX, GALENG_SIGN_THUMBPRINT, or GALENG_SIGN_SUBJECT)"
            .into(),
    ))
}

fn sign_exe_configured(exe: &Path, cfg: &SignConfig) -> Result<(), SignError> {
    let tool = find_signtool().ok_or_else(|| {
        SignError::Msg("signtool.exe not found (install Windows SDK or set GALENG_SIGNTOOL)".into())
    })?;
    let mut cmd = Command::new(tool);
    cmd.arg("sign").arg("/fd").arg("SHA256").arg("/td").arg("SHA256");
    match cfg {
        SignConfig::Off => unreachable!(),
        SignConfig::Pfx {
            path,
            password,
            timestamp,
            ..
        } => {
            if !path.is_file() {
                return Err(SignError::Msg(format!("PFX not found: {}", path.display())));
            }
            cmd.arg("/tr").arg(timestamp).arg("/f").arg(path);
            if !password.is_empty() {
                cmd.arg("/p").arg(password);
            }
        }
        SignConfig::Store {
            thumbprint,
            subject,
            timestamp,
            ..
        } => {
            cmd.arg("/tr").arg(timestamp);
            if let Some(sha) = thumbprint {
                cmd.arg("/sha1").arg(sha);
            } else if let Some(name) = subject {
                cmd.arg("/n").arg(name);
            }
        }
    }
    cmd.arg(exe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd
        .output()
        .map_err(|e| SignError::Msg(format!("could not run signtool: {e}")))?;
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let detail = [stderr.trim(), stdout.trim()]
        .into_iter()
        .find(|s| !s.is_empty())
        .unwrap_or("signtool failed");
    Err(SignError::Msg(detail.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_when_unset() {
        let empty: [(OsString, OsString); 0] = [];
        assert_eq!(SignConfig::from_pairs(empty), SignConfig::Off);
    }

    #[test]
    fn pfx_wins_over_store() {
        let cfg = SignConfig::from_pairs([
            (OsString::from("GALENG_SIGN_PFX"), OsString::from(r"D:\cert.pfx")),
            (OsString::from("GALENG_SIGN_PASSWORD"), OsString::from("secret")),
            (OsString::from("GALENG_SIGN_THUMBPRINT"), OsString::from("ABCD")),
        ]);
        match cfg {
            SignConfig::Pfx { path, password, required, .. } => {
                assert_eq!(path, PathBuf::from(r"D:\cert.pfx"));
                assert_eq!(password, "secret");
                assert!(!required);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn required_flag() {
        let cfg = SignConfig::from_pairs([
            (OsString::from("GALENG_SIGN_SUBJECT"), OsString::from("Galeng")),
            (OsString::from("GALENG_SIGN_REQUIRED"), OsString::from("true")),
        ]);
        assert!(cfg.required());
        match cfg {
            SignConfig::Store { subject, .. } => assert_eq!(subject.as_deref(), Some("Galeng")),
            other => panic!("{other:?}"),
        }
    }
}
