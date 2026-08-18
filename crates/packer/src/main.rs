use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

use galeng_packer::{pack_with, PackOpts};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("galeng-packer: {err}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let mut project: Option<PathBuf> = None;
    let mut out: Option<PathBuf> = None;
    let mut strict = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--project" => {
                i += 1;
                project = Some(PathBuf::from(args.get(i).ok_or("--project needs a path")?));
            }
            "--out" => {
                i += 1;
                out = Some(PathBuf::from(args.get(i).ok_or("--out needs a path")?));
            }
            "--strict" => strict = true,
            other => return Err(format!("unknown arg {other}")),
        }
        i += 1;
    }
    let project = project.ok_or("usage: galeng-packer --project <dir> --out <file.pak> [--strict]")?;
    let out = out.ok_or("usage: galeng-packer --project <dir> --out <file.pak> [--strict]")?;
    let report = pack_with(&project, &out, PackOpts { strict }).map_err(|e| e.to_string())?;
    for warn in &report.warnings {
        eprintln!("galeng-packer: {warn}");
    }
    eprintln!(
        "galeng-packer: wrote {} ({} scenes, {} assets)",
        out.display(),
        report.scenes.len(),
        report.assets.len()
    );
    Ok(())
}
