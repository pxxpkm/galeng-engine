#![windows_subsystem = "windows"]

use std::env;
use std::process::ExitCode;

use galeng_player::cli::{resolve_launch, Launch};
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
    use windows::core::HSTRING;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let text = HSTRING::from(format!("galeng-player: {msg}"));
    let title = HSTRING::from("Galeng");
    unsafe {
        let _ = MessageBoxW(None, &text, &title, MB_OK | MB_ICONERROR);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let exe_dir = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .ok_or("cannot resolve player.exe directory")?;
    let launch = resolve_launch(&args, &exe_dir)?;
    let (runtime, jumped) = match launch {
        Launch::Dir {
            project,
            scene,
            beat,
        } => {
            let jumped = scene.is_some() || beat != 0;
            let runtime =
                Runtime::load_dir_at(&project, scene.as_deref(), beat).map_err(|e| e.to_string())?;
            (runtime, jumped)
        }
        Launch::Pak { pak, scene, beat } => {
            let jumped = scene.is_some() || beat != 0;
            let runtime =
                Runtime::load_pak_at(&pak, scene.as_deref(), beat).map_err(|e| e.to_string())?;
            (runtime, jumped)
        }
    };
    let show = galeng_player::title::show_title(runtime.project.skip_title, jumped);
    galeng_player::window::run(runtime, show)
}
