use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Hidden auto-save. Not listed in 01–09. F5/F9 stay on 00.
pub const AUTO_SLOT: u8 = 99;

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("slot must be 0-99")]
    BadSlot,
    #[error("save game id `{got}` does not match `{expected}`")]
    GameMismatch { expected: String, got: String },
    #[error("save schema {got} does not match {expected}")]
    SchemaMismatch { expected: u32, got: u32 },
    #[error("save format {got} is newer than supported")]
    FormatTooNew { got: u32 },
}

fn save_format_v1() -> u32 {
    1
}

/// Current writer format. Always written on new saves.
pub const SAVE_FORMAT: u32 = 2;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGame {
    pub schema_version: u32,
    pub game_id: String,
    pub scene: String,
    pub beat_index: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub beat_id: Option<String>,
    #[serde(default = "save_format_v1")]
    pub save_format: u32,
    pub vars: BTreeMap<String, i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carried_bgm: Option<String>,
    pub saved_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resume {
    At(usize),
    NotFound,
}

/// Resolve a save position. When `beat_id` is present, never fall back to index.
pub fn resolve_beat(
    beats: &[galeng_schema::Beat],
    beat_id: Option<&str>,
    beat_index: usize,
) -> Resume {
    if let Some(id) = beat_id {
        let mut found = None;
        for (i, b) in beats.iter().enumerate() {
            if b.id.as_deref() == Some(id) {
                if found.is_some() {
                    return Resume::NotFound;
                }
                found = Some(i);
            }
        }
        return found.map(Resume::At).unwrap_or(Resume::NotFound);
    }
    if beat_index <= beats.len() {
        Resume::At(beat_index)
    } else {
        Resume::NotFound
    }
}

fn effective_save_format(raw: u32) -> u32 {
    if raw == 0 {
        1
    } else {
        raw
    }
}

pub fn default_save_dir(game_id: &str, project_dir: &Path) -> PathBuf {
    std::env::var_os("APPDATA")
        .map(|root| PathBuf::from(root).join("Galeng").join(game_id).join("save"))
        .unwrap_or_else(|| project_dir.join("save"))
}

pub const THUMB_W: u32 = 160;
pub const THUMB_H: u32 = 90;

pub fn slot_path(dir: &Path, slot: u8) -> Result<PathBuf, SaveError> {
    if slot > 99 {
        return Err(SaveError::BadSlot);
    }
    Ok(dir.join(format!("slot-{slot:02}.json")))
}

pub fn write_slot(dir: &Path, slot: u8, save: &SaveGame) -> Result<PathBuf, SaveError> {
    let path = slot_path(dir, slot)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_string_pretty(save)?)?;
    Ok(path)
}

pub fn read_slot(dir: &Path, slot: u8) -> Result<SaveGame, SaveError> {
    let path = slot_path(dir, slot)?;
    let text = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&text)?)
}

pub fn thumb_path(dir: &Path, slot: u8) -> Result<PathBuf, SaveError> {
    if slot > 99 {
        return Err(SaveError::BadSlot);
    }
    Ok(dir.join(format!("slot-{slot:02}.png")))
}

pub fn downscale_rgba(src: &[u8], sw: u32, sh: u32, dw: u32, dh: u32) -> Vec<u8> {
    let mut out = vec![0u8; (dw * dh * 4) as usize];
    if sw == 0 || sh == 0 || dw == 0 || dh == 0 {
        return out;
    }
    for y in 0..dh {
        let sy = y * sh / dh;
        for x in 0..dw {
            let sx = x * sw / dw;
            let si = ((sy * sw + sx) * 4) as usize;
            let di = ((y * dw + x) * 4) as usize;
            if si + 3 < src.len() && di + 3 < out.len() {
                out[di] = src[si];
                out[di + 1] = src[si + 1];
                out[di + 2] = src[si + 2];
                out[di + 3] = src[si + 3];
            }
        }
    }
    out
}

pub fn write_thumb(dir: &Path, slot: u8, rgba: &[u8], width: u32, height: u32) -> Result<PathBuf, SaveError> {
    let path = thumb_path(dir, slot)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let img = image::RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| SaveError::Io(std::io::Error::new(std::io::ErrorKind::InvalidInput, "bad thumb")))?;
    img.save(&path)
        .map_err(|e| SaveError::Io(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
    Ok(path)
}

pub fn read_thumb(dir: &Path, slot: u8) -> Option<(u32, u32, Vec<u8>)> {
    let path = thumb_path(dir, slot).ok()?;
    let img = image::open(path).ok()?.to_rgba8();
    let (w, h) = img.dimensions();
    Some((w, h, img.into_raw()))
}

/// Local wall-clock `MM-DD HH:MM` from unix seconds (ADR-107).
pub fn format_saved_at(unix: u64) -> String {
    format_saved_at_offset(unix, local_offset_secs(unix))
}

/// `offset_secs` is local − UTC at that instant.
pub fn format_saved_at_offset(unix: u64, offset_secs: i64) -> String {
    let secs = (unix as i64).saturating_add(offset_secs);
    let days = secs.div_euclid(86_400);
    let tod = secs.rem_euclid(86_400) as u64;
    let hour = tod / 3600;
    let min = (tod % 3600) / 60;
    let (year, month, day) = civil_from_days(days);
    let _ = year;
    format!("{month:02}-{day:02} {hour:02}:{min:02}")
}

fn local_offset_secs(unix: u64) -> i64 {
    windows_local_offset_secs(unix).unwrap_or(0)
}

#[cfg(windows)]
fn windows_local_offset_secs(unix: u64) -> Option<i64> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::Storage::FileSystem::FileTimeToLocalFileTime;

    const UNIX_EPOCH_AS_FILETIME: u64 = 11_644_473_600 * 10_000_000;
    let utc = unix.saturating_mul(10_000_000).saturating_add(UNIX_EPOCH_AS_FILETIME);
    let utc_ft = FILETIME {
        dwLowDateTime: utc as u32,
        dwHighDateTime: (utc >> 32) as u32,
    };
    let mut local_ft = FILETIME::default();
    unsafe { FileTimeToLocalFileTime(&utc_ft, &mut local_ft) }.ok()?;
    let local = (u64::from(local_ft.dwHighDateTime) << 32) | u64::from(local_ft.dwLowDateTime);
    let delta_100ns = local as i64 - utc as i64;
    Some(delta_100ns / 10_000_000)
}

#[cfg(not(windows))]
fn windows_local_offset_secs(_unix: u64) -> Option<i64> {
    None
}

pub fn format_slot_label(title: &str, saved_at: u64) -> String {
    let name = title.trim();
    let name = if name.is_empty() { "—" } else { name };
    format!("{name}  {}", format_saved_at(saved_at))
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

pub fn check_save(save: &SaveGame, game_id: &str, schema_version: u32) -> Result<(), SaveError> {
    if save.game_id != game_id {
        return Err(SaveError::GameMismatch {
            expected: game_id.to_string(),
            got: save.game_id.clone(),
        });
    }
    if save.schema_version != schema_version {
        return Err(SaveError::SchemaMismatch {
            expected: schema_version,
            got: save.schema_version,
        });
    }
    let fmt = effective_save_format(save.save_format);
    if fmt > SAVE_FORMAT {
        return Err(SaveError::FormatTooNew { got: save.save_format });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_slot_over_99() {
        assert!(slot_path(Path::new("save"), 100).is_err());
        assert!(slot_path(Path::new("save"), AUTO_SLOT).is_ok());
    }

    #[test]
    fn check_rejects_wrong_game() {
        let save = SaveGame {
            schema_version: 1,
            game_id: "a".into(),
            scene: "s".into(),
            beat_index: 0,
            beat_id: None,
            save_format: 1,
            vars: BTreeMap::new(),
            carried_bgm: None,
            saved_at: 0,
            label: None,
        };
        assert!(check_save(&save, "b", 1).is_err());
        assert!(check_save(&save, "a", 2).is_err());
        assert!(check_save(&save, "a", 1).is_ok());
    }

    #[test]
    fn thumb_round_trip_temp() {
        let tmp = std::env::temp_dir().join(format!("galeng-part54-{}-thumb", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let src = vec![200u8, 10, 10, 255, 10, 200, 10, 255, 10, 10, 200, 255, 255, 255, 0, 255];
        let small = downscale_rgba(&src, 2, 2, THUMB_W, THUMB_H);
        assert_eq!(small.len(), (THUMB_W * THUMB_H * 4) as usize);
        write_thumb(&tmp, 1, &small, THUMB_W, THUMB_H).unwrap();
        assert!(tmp.join("slot-01.png").is_file());
        let (w, h, bytes) = read_thumb(&tmp, 1).expect("read");
        assert_eq!((w, h), (THUMB_W, THUMB_H));
        assert_eq!(bytes.len(), small.len());
        assert!(read_thumb(&tmp, 2).is_none());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn old_json_without_label_still_reads() {
        let tmp = std::env::temp_dir().join(format!("galeng-part56-{}-old", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(
            tmp.join("slot-01.json"),
            r#"{"schemaVersion":1,"gameId":"a","scene":"park_01","beatIndex":0,"vars":{},"savedAt":0}"#,
        )
        .unwrap();
        let save = read_slot(&tmp, 1).unwrap();
        assert_eq!(save.scene, "park_01");
        assert!(save.label.is_none());
        assert!(save.beat_id.is_none());
        assert_eq!(save.save_format, 1);
        assert!(check_save(&save, "a", 1).is_ok());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn save_format_zero_and_absent_are_v1() {
        let absent: SaveGame = serde_json::from_str(
            r#"{"schemaVersion":1,"gameId":"a","scene":"s","beatIndex":0,"vars":{},"savedAt":0}"#,
        )
        .unwrap();
        assert_eq!(absent.save_format, 1);
        let zero: SaveGame = serde_json::from_str(
            r#"{"schemaVersion":1,"saveFormat":0,"gameId":"a","scene":"s","beatIndex":0,"vars":{},"savedAt":0}"#,
        )
        .unwrap();
        assert_eq!(effective_save_format(zero.save_format), 1);
        assert!(check_save(&zero, "a", 1).is_ok());
    }

    #[test]
    fn save_format_above_2_is_refused() {
        let save: SaveGame = serde_json::from_str(
            r#"{"schemaVersion":1,"saveFormat":3,"gameId":"a","scene":"s","beatIndex":0,"vars":{},"savedAt":0}"#,
        )
        .unwrap();
        match check_save(&save, "a", 1) {
            Err(SaveError::FormatTooNew { got: 3 }) => {}
            other => panic!("expected FormatTooNew, got {other:?}"),
        }
    }

    #[test]
    fn resolve_beat_by_id_and_index() {
        use galeng_schema::Beat;
        let beats = vec![
            Beat {
                id: Some("b0123456789abcdef".into()),
                ..Beat::default()
            },
            Beat {
                id: Some("bfedcba9876543210".into()),
                ..Beat::default()
            },
        ];
        assert_eq!(
            resolve_beat(&beats, Some("bfedcba9876543210"), 0),
            Resume::At(1)
        );
        assert_eq!(resolve_beat(&beats, Some("bmissing000000000"), 1), Resume::NotFound);
        assert_eq!(resolve_beat(&beats, None, 0), Resume::At(0));
        assert_eq!(resolve_beat(&beats, None, 2), Resume::At(2)); // == len → exit
        assert_eq!(resolve_beat(&beats, None, 3), Resume::NotFound);
        let dup = vec![
            Beat {
                id: Some("b0123456789abcdef".into()),
                ..Beat::default()
            },
            Beat {
                id: Some("b0123456789abcdef".into()),
                ..Beat::default()
            },
        ];
        assert_eq!(
            resolve_beat(&dup, Some("b0123456789abcdef"), 0),
            Resume::NotFound
        );
        // id present: never fall back to index even when index is in range
        assert_eq!(
            resolve_beat(&beats, Some("bmissing000000000"), 0),
            Resume::NotFound
        );
    }

    #[test]
    fn format_label_has_title_and_clock() {
        let text = format_slot_label("公園・午後", 0);
        assert!(text.contains("公園・午後"));
        assert!(
            text.contains(&format_saved_at(0)),
            "label should use local clock, got {text}"
        );
    }

    #[test]
    fn offset_shifts_civil_clock() {
        assert_eq!(format_saved_at_offset(0, 0), "01-01 00:00");
        assert_eq!(format_saved_at_offset(0, 8 * 3600), "01-01 08:00");
        assert_eq!(format_saved_at_offset(0, -8 * 3600), "12-31 16:00");
        let clock = format_saved_at(1_700_000_000);
        assert!(
            clock.as_bytes().len() == 11 && clock.as_bytes()[2] == b'-' && clock.as_bytes()[5] == b' ',
            "expected MM-DD HH:MM, got {clock}"
        );
    }
}
