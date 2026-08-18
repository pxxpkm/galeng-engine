use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let sdl_root = manifest.join("../../third_party/SDL2");
    let lib_dir = sdl_root.join("lib/x64");
    let dll = lib_dir.join("SDL2.dll");

    println!("cargo:rerun-if-changed={}", lib_dir.display());
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=dylib=SDL2");

    if !dll.exists() {
        panic!("SDL2.dll missing at {}. See third_party/README.md", dll.display());
    }

    if let Ok(out_dir) = env::var("OUT_DIR") {
        // target/<profile>/build/<crate>/out → ../../../
        if let Some(profile_dir) = Path::new(&out_dir).ancestors().nth(3) {
            let dest = profile_dir.join("SDL2.dll");
            let _ = fs::copy(&dll, dest);
        }
    }
}
