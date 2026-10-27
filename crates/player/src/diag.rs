//! `--diag` report and `galeng.log` (LONG_LIFE_PLAYER PR7).

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use galeng_packer::PakReader;

use crate::audio::Mixer;
use crate::cli::{is_sibling_game_pak, Invocation, Launch};
use crate::fb::BlitKernel;
use crate::font::GameFont;
use crate::movie;
use crate::user_paths::UserPaths;

const LOG_ROTATE_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagMode {
    Full,
    AfterFailure,
}

/// Strip drive paths, UNC, and `\Users\` / `/Users\` segments from a diag line.
///
/// Walks char boundaries. A byte step through UTF-8 panics on the next slice.
pub fn sanitize_diag_line(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < line.len() {
        let rest = &line[i..];
        if let Some(skip) = path_token_len(rest) {
            out.push('?');
            i += skip;
            continue;
        }
        let ch = rest.chars().next().expect("i is a char boundary");
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Byte length of a path token at the start of `rest`, not including a trailing space.
fn path_token_len(rest: &str) -> Option<usize> {
    let b = rest.as_bytes();
    let prefix = if b.len() >= 3
        && b[0].is_ascii_alphabetic()
        && b[1] == b':'
        && (b[2] == b'\\' || b[2] == b'/')
    {
        3
    } else if b.len() >= 2 && b[0] == b'\\' && b[1] == b'\\' {
        2
    } else if users_prefix(rest) {
        7
    } else {
        return None;
    };
    let mut n = prefix;
    for ch in rest[prefix..].chars() {
        if ch == ' ' || ch == '\t' || ch == '\n' {
            break;
        }
        n += ch.len_utf8();
    }
    Some(n)
}

fn users_prefix(rest: &str) -> bool {
    let b = rest.as_bytes();
    if b.len() < 7 || !b[..7].iter().all(|c| c.is_ascii()) {
        return false;
    }
    let head = &rest[..7];
    head.eq_ignore_ascii_case("\\Users\\") || head.eq_ignore_ascii_case("/Users/")
}

/// Pure OS version formatter (fixture-tested; no registry I/O).
///
/// When both DWORD major/minor are present, use them + `CurrentBuild` (ignore `CurrentVersion`).
/// Otherwise parse `CurrentVersion` and `CurrentBuild` as strings.
pub fn format_os_version(
    major_minor: Option<(u32, u32)>,
    current_version: Option<&str>,
    current_build: Option<&str>,
) -> String {
    match major_minor {
        Some((maj, min)) => {
            let build = current_build.unwrap_or("?");
            format!("{maj}.{min}.{build}")
        }
        None => {
            let ver = current_version.unwrap_or("?");
            let build = current_build.unwrap_or("?");
            format!("{ver}.{build}")
        }
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn arch_line() -> String {
    if cfg!(target_arch = "x86_64") {
        "arch: x86_64".into()
    } else {
        format!("arch: {}", std::env::consts::ARCH)
    }
}

fn choose_kernel_label() -> &'static str {
    let forced = std::env::var_os("GALENG_SCALAR").is_some();
    if forced {
        return "scalar";
    }
    #[cfg(target_arch = "x86_64")]
    {
        if std::is_x86_feature_detected!("sse2") {
            return "sse2";
        }
    }
    let _ = BlitKernel::Scalar;
    "scalar"
}

fn simd_line() -> String {
    format!("simd: sse2 kernel={}", choose_kernel_label())
}

fn map_pak_open_err(err: &galeng_packer::Error) -> String {
    schema_diag_line(&err.to_string())
}

/// Pak open failures name the pak's schema, not the player's, and never a path.
fn schema_diag_line(s: &str) -> String {
    for prefix in ["pak schema ", "schema "] {
        if let Some(rest) = s.strip_prefix(prefix) {
            let n: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if !n.is_empty() {
                return format!("pak: error: schema {n}");
            }
        }
    }
    "pak: error: unreadable".into()
}

fn pak_line(pak: Option<&Path>) -> String {
    let Some(path) = pak else {
        return "pak: absent".into();
    };
    if !path.is_file() {
        return "pak: absent".into();
    }
    match PakReader::open(path) {
        Ok(reader) => format!("pak: ok schema={}", reader.index.schema_version),
        Err(e) => map_pak_open_err(&e),
    }
}

fn font_line() -> String {
    match GameFont::load_system() {
        Ok(font) => {
            let name = font
                .source
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("font");
            format!("font: ok {name}")
        }
        Err(e) => format!("font: error: {}", sanitize_diag_line(&e)),
    }
}

fn audio_line() -> String {
    let mixer = Mixer::try_new();
    if mixer.has_device() {
        "audio: ok".into()
    } else {
        "audio: no device".into()
    }
}

fn movie_line() -> String {
    match movie::probe() {
        Ok(()) => "movie: ok".into(),
        Err(e) if e == "unsupported" => "movie: unsupported".into(),
        Err(e) => format!("movie: error: {}", sanitize_diag_line(&e)),
    }
}

fn probe_sdl_video(skip: bool) -> Vec<String> {
    if skip {
        return vec!["sdl.video: skipped".into(), "sdl.renderer: skipped".into()];
    }
    let mut lines = Vec::new();
    let sdl = match sdl2::init() {
        Ok(s) => s,
        Err(e) => {
            lines.push(format!(
                "sdl.video: error: {}",
                sanitize_diag_line(&e.to_string())
            ));
            return lines;
        }
    };
    let video = match sdl.video() {
        Ok(v) => v,
        Err(e) => {
            lines.push(format!("sdl.video: error: {}", sanitize_diag_line(&e)));
            return lines;
        }
    };
    lines.push(format!("sdl.video: {}", video.current_video_driver()));

    match video.num_video_displays() {
        Ok(n) => {
            let bounds = match video.display_bounds(0) {
                Ok(r) => format!("{},{} {}x{}", r.x(), r.y(), r.width(), r.height()),
                Err(e) => format!("error: {}", sanitize_diag_line(&e)),
            };
            lines.push(format!("display: {n} {bounds}"));
        }
        Err(e) => {
            lines.push(format!("display: error: {}", sanitize_diag_line(&e)));
        }
    }

    match video.window("galeng-diag", 1280, 720).hidden().build() {
        Ok(window) => match window.into_canvas().build() {
            Ok(canvas) => {
                lines.push(format!("sdl.renderer: {}", canvas.info().name));
                drop(canvas);
            }
            Err(e) => {
                lines.push(format!(
                    "sdl.renderer: error: {}",
                    sanitize_diag_line(&e.to_string())
                ));
            }
        },
        Err(e) => {
            lines.push(format!(
                "sdl.renderer: error: {}",
                sanitize_diag_line(&e.to_string())
            ));
        }
    }
    lines
}

fn os_line() -> String {
    #[cfg(windows)]
    {
        let (mm, ver, build) = read_os_registry_fields();
        format!(
            "os: {}",
            format_os_version(mm, ver.as_deref(), build.as_deref())
        )
    }
    #[cfg(not(windows))]
    {
        format!("os: {}", std::env::consts::OS)
    }
}

#[cfg(windows)]
fn read_os_registry_fields() -> (Option<(u32, u32)>, Option<String>, Option<String>) {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;

    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let subkey = wide(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
    let sub = PCWSTR(subkey.as_ptr());

    let major = read_dword(sub, "CurrentMajorVersionNumber");
    let minor = read_dword(sub, "CurrentMinorVersionNumber");
    let major_minor = match (major, minor) {
        (Some(maj), Some(min)) => Some((maj, min)),
        _ => None,
    };
    let current_version = read_sz(sub, "CurrentVersion");
    let current_build = read_sz(sub, "CurrentBuild");
    (major_minor, current_version, current_build)
}

#[cfg(windows)]
fn read_dword(subkey: windows::core::PCWSTR, name: &str) -> Option<u32> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD};
    let wide_name: Vec<u16> = std::ffi::OsStr::new(name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut data: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let mut ty = windows::Win32::System::Registry::REG_VALUE_TYPE::default();
    let err = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            subkey,
            PCWSTR(wide_name.as_ptr()),
            RRF_RT_REG_DWORD,
            Some(&mut ty),
            Some(&mut data as *mut u32 as *mut _),
            Some(&mut size),
        )
    };
    if err == ERROR_SUCCESS {
        Some(data)
    } else {
        None
    }
}

#[cfg(windows)]
fn read_sz(subkey: windows::core::PCWSTR, name: &str) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let wide_name: Vec<u16> = std::ffi::OsStr::new(name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut size: u32 = 0;
    let mut ty = windows::Win32::System::Registry::REG_VALUE_TYPE::default();
    let probe = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            subkey,
            PCWSTR(wide_name.as_ptr()),
            RRF_RT_REG_SZ,
            Some(&mut ty),
            None,
            Some(&mut size),
        )
    };
    if probe != ERROR_SUCCESS || size == 0 {
        return None;
    }
    let mut buf = vec![0u8; size as usize];
    let err = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            subkey,
            PCWSTR(wide_name.as_ptr()),
            RRF_RT_REG_SZ,
            Some(&mut ty),
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut size),
        )
    };
    if err != ERROR_SUCCESS {
        return None;
    }
    // REG_SZ is UTF-16 on Windows when using W APIs with byte buffer — RegGetValueW
    // writes wchar bytes. Interpret as u16 LE.
    let u16s: Vec<u16> = buf[..size as usize]
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .take_while(|c| *c != 0)
        .collect();
    String::from_utf16(&u16s).ok()
}

fn emit_ods(line: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new(&format!("{line}\n"))
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            windows::Win32::System::Diagnostics::Debug::OutputDebugStringW(windows::core::PCWSTR(
                wide.as_ptr(),
            ));
        }
    }
    #[cfg(not(windows))]
    {
        eprintln!("{line}");
    }
}

/// Progress-root label for the report (never a full path).
pub fn user_data_label(
    launch: Option<&Launch>,
    exe_dir: &Path,
    paths: Option<&UserPaths>,
) -> &'static str {
    match launch {
        Some(Launch::Pak { pak, .. }) if is_sibling_game_pak(pak, exe_dir) => {
            if let Some(p) = paths {
                let ud = exe_dir.join("UserData");
                if p.config.starts_with(&ud) {
                    "UserData"
                } else {
                    "fallback appdata"
                }
            } else {
                "UserData"
            }
        }
        Some(_) => "appdata",
        None => "UserData",
    }
}

fn pak_path_for(inv: &Invocation, exe_dir: &Path) -> Option<PathBuf> {
    match &inv.launch {
        Some(Launch::Pak { pak, .. }) => Some(pak.clone()),
        Some(Launch::Dir { .. }) => None,
        None => {
            let p = exe_dir.join("game.pak");
            if p.is_file() {
                Some(p)
            } else {
                None
            }
        }
    }
}

/// Collect the shared diag lines for Full or AfterFailure.
pub fn collect_lines(
    mode: DiagMode,
    inv: &Invocation,
    exe_dir: &Path,
    paths: Option<&UserPaths>,
) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(note) = &inv.diag_note {
        lines.push(format!("cli: error: {}", sanitize_diag_line(note)));
    }
    lines.push(format!("player: {}", env!("CARGO_PKG_VERSION")));
    lines.push(arch_line());
    lines.push(os_line());

    let skip_video = mode == DiagMode::AfterFailure;
    lines.extend(probe_sdl_video(skip_video));

    let pak = pak_path_for(inv, exe_dir);
    lines.push(pak_line(pak.as_deref()));
    lines.push(font_line());
    lines.push(audio_line());
    lines.push(movie_line());
    lines.push(simd_line());
    lines.push(format!(
        "user_data: {}",
        user_data_label(inv.launch.as_ref(), exe_dir, paths)
    ));
    lines
}

/// Overwrite `<exe_dir>/UserData/diag.txt`. On `create_dir_all` failure: ODS fallback, no write.
pub fn write_diag_txt(exe_dir: &Path, lines: &[String]) {
    let root = exe_dir.join("UserData");
    if fs::create_dir_all(&root).is_err() {
        emit_ods("user_data: fallback appdata");
        return;
    }
    let path = root.join("diag.txt");
    let body = lines.join("\n") + "\n";
    let _ = fs::write(&path, body);
}

/// Append lines to `galeng.log` with UTC unix seconds; rotate at 1 MiB (one generation).
pub fn append_galeng_log(log_path: &Path, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    rotate_if_needed(log_path);
    let ts = unix_now();
    let mut body = String::new();
    for line in lines {
        let safe = sanitize_diag_line(line);
        body.push_str(&format!("{ts} {safe}\n"));
    }
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let _ = f.write_all(body.as_bytes());
    }
}

/// Append one already-short line (vsync / input) to `galeng.log`.
pub fn append_log_line(log_path: &Path, line: &str) {
    append_galeng_log(log_path, &[line.to_string()]);
}

fn rotate_if_needed(log_path: &Path) {
    let Ok(meta) = fs::metadata(log_path) else {
        return;
    };
    if meta.len() <= LOG_ROTATE_BYTES {
        return;
    }
    let rotated = log_path.with_extension("log.1");
    let _ = fs::remove_file(&rotated);
    let _ = fs::rename(log_path, &rotated);
}

/// Full `--diag`: collect, write diag.txt, always ok from caller's perspective.
pub fn run_full(inv: &Invocation, exe_dir: &Path) {
    let lines = collect_lines(DiagMode::Full, inv, exe_dir, None);
    write_diag_txt(exe_dir, &lines);
}

/// After `window::run` Err: append skipped-video report to progress `galeng.log`.
pub fn run_after_failure(inv: &Invocation, exe_dir: &Path, paths: &UserPaths) {
    let lines = collect_lines(DiagMode::AfterFailure, inv, exe_dir, Some(paths));
    append_galeng_log(&paths.log, &lines);
}

/// Pre-window failure with sibling `game.pak`: append to `<exe>/UserData/galeng.log`.
pub fn run_prewindow_sibling(exe_dir: &Path, err: &str) {
    let root = exe_dir.join("UserData");
    if fs::create_dir_all(&root).is_err() {
        emit_ods(&format!("galeng-player: {}", sanitize_diag_line(err)));
        return;
    }
    let inv = Invocation {
        launch: Some(Launch::Pak {
            pak: exe_dir.join("game.pak"),
            scene: None,
            beat: 0,
        }),
        diag: false,
        diag_note: Some(err.to_string()),
    };
    let lines = collect_lines(DiagMode::AfterFailure, &inv, exe_dir, None);
    append_galeng_log(&root.join("galeng.log"), &lines);
}

/// One sanitized ODS line (no log dirs).
pub fn emit_sanitized_ods(err: &str) {
    emit_ods(&format!("galeng-player: {}", sanitize_diag_line(err)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_drive_unc_and_users() {
        assert_eq!(
            sanitize_diag_line(r"open C:\Users\leo\game.pak: denied"),
            "open ? denied"
        );
        // Drive consumes through end of token; leading \\ of UNC may already be eaten.
        assert_eq!(sanitize_diag_line(r"read \\server\share\file"), "read ?");
        assert_eq!(sanitize_diag_line(r"bad \Users\leo\secret"), "bad ?");
        assert_eq!(sanitize_diag_line("ok /Users/leo/x y"), "ok ? y");
        assert_eq!(
            sanitize_diag_line("vsync: not supported"),
            "vsync: not supported"
        );
        assert_eq!(sanitize_diag_line("找不到場景 庭園"), "找不到場景 庭園");
        assert_eq!(
            sanitize_diag_line("input: unknown key 鍵"),
            "input: unknown key 鍵"
        );
        assert_eq!(
            sanitize_diag_line("open C:\\遊戲\\存檔.pak denied"),
            "open ? denied"
        );
    }

    #[test]
    fn newer_pak_reports_its_schema_not_the_player() {
        assert_eq!(
            schema_diag_line("pak schema 2 is newer than this player (1)"),
            "pak: error: schema 2"
        );
        assert_eq!(
            schema_diag_line("pak schema 0 is unsupported"),
            "pak: error: schema 0"
        );
        assert_eq!(schema_diag_line("pak unreadable"), "pak: error: unreadable");
    }

    #[test]
    fn os_version_fixtures() {
        assert_eq!(
            format_os_version(None, Some("6.3"), Some("9600")),
            "6.3.9600"
        );
        assert_eq!(
            format_os_version(Some((10, 0)), Some("6.3"), Some("19045")),
            "10.0.19045"
        );
        assert_eq!(
            format_os_version(Some((10, 0)), None, Some("19045")),
            "10.0.19045"
        );
    }

    #[test]
    fn pak_absent_when_missing() {
        let missing = PathBuf::from("/no/such/galeng-pr7-missing.pak");
        assert_eq!(pak_line(Some(&missing)), "pak: absent");
        assert_eq!(pak_line(None), "pak: absent");
    }

    #[test]
    fn pak_unreadable_maps_short() {
        let tmp = std::env::temp_dir().join(format!(
            "galeng-pr7-badpak-{}-{}",
            std::process::id(),
            unix_now()
        ));
        let _ = fs::write(&tmp, b"not-a-zip");
        let line = pak_line(Some(&tmp));
        assert_eq!(line, "pak: error: unreadable");
        assert!(!line.contains('\\'));
        assert!(!line.contains(tmp.to_string_lossy().as_ref()));
        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn log_rotate_keeps_one_generation() {
        let dir = std::env::temp_dir().join(format!("galeng-pr7-rotate-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let log = dir.join("galeng.log");
        // Just over 1 MiB
        fs::write(&log, vec![b'x'; (LOG_ROTATE_BYTES as usize) + 8]).unwrap();
        append_galeng_log(&log, &["player: test".into()]);
        assert!(dir.join("galeng.log.1").is_file());
        let body = fs::read_to_string(&log).unwrap();
        assert!(body.contains("player: test"));
        let _ = fs::remove_dir_all(&dir);
    }
}
