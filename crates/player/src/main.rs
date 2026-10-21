#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::process::ExitCode;

use galeng_player::cli::{is_sibling_game_pak, resolve_invocation, Invocation, Launch};
use galeng_player::diag;
use galeng_player::user_paths::user_paths;
use galeng_player::Runtime;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("galeng-player: {err}");
            show_error(&err);
            ExitCode::FAILURE
        }
    }
}

fn show_error(msg: &str) {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let text = HSTRING::from(format!("galeng-player: {msg}"));
        let title = HSTRING::from("Galeng");
        unsafe {
            let _ = MessageBoxW(None, &text, &title, MB_OK | MB_ICONERROR);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = msg;
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let exe_dir = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .ok_or("cannot resolve player.exe directory")?;

    let inv = resolve_invocation(&args, &exe_dir)?;
    if inv.diag {
        diag::run_full(&inv, &exe_dir);
        return Ok(());
    }

    let launch = inv
        .launch
        .clone()
        .ok_or("usage: galeng-player --project <dir> | --pak <file.pak>")?;

    let load_result = match &launch {
        Launch::Dir {
            project,
            scene,
            beat,
        } => {
            let jumped = scene.is_some() || *beat != 0;
            Runtime::load_dir_at(project, scene.as_deref(), *beat)
                .map(|runtime| (runtime, jumped))
                .map_err(|e| e.to_string())
        }
        Launch::Pak { pak, scene, beat } => {
            let jumped = scene.is_some() || *beat != 0;
            Runtime::load_pak_at(pak, scene.as_deref(), *beat)
                .map(|runtime| (runtime, jumped))
                .map_err(|e| e.to_string())
        }
    };

    let (runtime, jumped) = match load_result {
        Ok(v) => v,
        Err(e) => {
            handle_prewindow_failure(&launch, &exe_dir, &e);
            return Err(e);
        }
    };

    let paths = user_paths(
        &launch,
        &exe_dir,
        &runtime.project.id,
        &runtime.project_dir,
    );
    let show = galeng_player::title::show_title(runtime.project.skip_title, jumped);
    match galeng_player::window::run(runtime, show, paths.clone()) {
        Ok(()) => Ok(()),
        Err(e) => {
            let after = Invocation {
                launch: Some(launch),
                diag: false,
                diag_note: Some(e.clone()),
            };
            diag::run_after_failure(&after, &exe_dir, &paths);
            Err(e)
        }
    }
}

fn handle_prewindow_failure(launch: &Launch, exe_dir: &std::path::Path, err: &str) {
    let sibling = matches!(
        launch,
        Launch::Pak { pak, .. } if is_sibling_game_pak(pak, exe_dir)
    );
    if sibling {
        diag::run_prewindow_sibling(exe_dir, err);
    } else {
        diag::emit_sanitized_ods(err);
    }
}
