//! Replace one file by writing a temp file in the same directory, fsyncing when
//! the platform allows it, then renaming over the destination.
//!
//! A crash mid-write leaves the previous complete file. A crash after the rename
//! leaves the new complete file. The temp is removed if the write or the rename fails.
//!
//! Saving more than one file (for example `galeng.json` and a scene) is not one
//! transaction. One of them can be new while the other is still old.
//!
//! On Windows, `std::fs::rename` does not replace an existing file.
//! `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` does.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub fn replace_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    replace_file_inner(path, bytes, false)
}

fn replace_file_inner(path: &Path, bytes: &[u8], fail_before_rename: bool) -> io::Result<()> {
    let tmp = temp_beside(path)?;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)?;
        file.write_all(bytes)?;
        // Some platforms cannot fsync. The bytes are already in the temp file;
        // a crash still cannot truncate the destination.
        if let Err(err) = file.sync_all() {
            if err.kind() != io::ErrorKind::Unsupported {
                return Err(err);
            }
        }
        drop(file);
        if fail_before_rename {
            return Err(io::Error::new(
                io::ErrorKind::Other,
                "injected write failure",
            ));
        }
        rename_over(&tmp, path)?;
        // The new file is already in place. Directory fsync is best-effort.
        #[cfg(unix)]
        if let Some(parent) = path.parent() {
            if let Ok(dir) = File::open(parent) {
                let _ = dir.sync_all();
            }
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn temp_beside(path: &Path) -> io::Result<PathBuf> {
    let name = path.file_name().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "path has no file name")
    })?;
    let mut tmp_name = std::ffi::OsString::from(name);
    tmp_name.push(".tmp");
    Ok(path.with_file_name(tmp_name))
}

/// `std::fs::rename` replaces on Unix. On Windows it errors when `to` exists,
/// so use `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING` there.
#[cfg(windows)]
fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    let from_w = wide(from);
    let to_w = wide(to);
    unsafe {
        MoveFileExW(
            PCWSTR(from_w.as_ptr()),
            PCWSTR(to_w.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    fs::rename(from, to)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "galeng-e01a-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn success_replaces_and_reads_back_the_same_json() {
        let dir = scratch("ok");
        let path = dir.join("galeng.json");
        fs::write(&path, b"{\"title\":\"old\"}\n").unwrap();
        let body = b"{\n  \"title\": \"new\"\n}\n";
        replace_file(&path, body).unwrap();
        assert_eq!(fs::read(&path).unwrap(), body);
        assert!(!dir.join("galeng.json.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn success_creates_a_missing_file() {
        let dir = scratch("new");
        let path = dir.join("scene.json");
        replace_file(&path, b"{\"id\":\"scene\"}").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"{\"id\":\"scene\"}");
        assert!(!dir.join("scene.json.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn injected_error_keeps_original_and_deletes_temp() {
        let dir = scratch("inject");
        let path = dir.join("galeng.json");
        fs::write(&path, b"OLD-COMPLETE").unwrap();
        let err = replace_file_inner(&path, b"NEW-PARTIAL", true).unwrap_err();
        assert!(err.to_string().contains("injected"));
        assert_eq!(fs::read(&path).unwrap(), b"OLD-COMPLETE");
        assert!(!dir.join("galeng.json.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dir_dest_keeps_original_and_deletes_temp() {
        let dir = scratch("dir-dest");
        let path = dir.join("galeng.json");
        // Windows ignores the readonly bit on a directory, so that does not
        // fail the temp write. A directory at the destination makes both
        // rename and MoveFileEx fail. The marker is the content that must stay.
        fs::create_dir(&path).unwrap();
        fs::write(path.join("keep.txt"), b"OLD-COMPLETE").unwrap();
        assert!(replace_file(&path, b"NEW-COMPLETE").is_err());
        assert_eq!(fs::read(path.join("keep.txt")).unwrap(), b"OLD-COMPLETE");
        assert!(path.is_dir());
        assert!(!dir.join("galeng.json.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
