//! Write an `.ico` into a PE file as the Explorer / taskbar icon.

use std::fs;
use std::path::Path;

use windows::core::PCWSTR;
use windows::Win32::Foundation::MAX_PATH;
use windows::Win32::System::LibraryLoader::{
    BeginUpdateResourceW, EndUpdateResourceW, UpdateResourceW,
};
use windows::Win32::UI::WindowsAndMessaging::{RT_GROUP_ICON, RT_ICON};

const RT_ICON_ID: u16 = 3;
const RT_GROUP_ICON_ID: u16 = 14;

#[derive(Debug, thiserror::Error)]
pub enum IconError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Msg(String),
}

#[derive(Clone)]
struct IcoImage {
    width: u8,
    height: u8,
    color_count: u8,
    planes: u16,
    bit_count: u16,
    data: Vec<u8>,
}

pub fn embed_ico(exe: &Path, ico: &Path) -> Result<(), IconError> {
    let bytes = fs::read(ico)?;
    let images = parse_ico(&bytes)?;
    if images.is_empty() {
        return Err(IconError::Msg("ico has no images".into()));
    }
    let group = group_resource(&images);
    let wide = wide_path(exe)?;
    unsafe {
        let handle = BeginUpdateResourceW(PCWSTR(wide.as_ptr()), false)
            .map_err(|e| IconError::Msg(e.to_string()))?;
        let mut ok = true;
        let mut err = String::new();
        for (i, img) in images.iter().enumerate() {
            let id = (i as u16).saturating_add(1);
            if UpdateResourceW(
                handle,
                PCWSTR(RT_ICON_ID as usize as *const u16),
                PCWSTR(id as usize as *const u16),
                0,
                Some(img.data.as_ptr().cast()),
                img.data.len() as u32,
            )
            .is_err()
            {
                ok = false;
                err = "UpdateResource RT_ICON failed".into();
                break;
            }
        }
        if ok
            && UpdateResourceW(
                handle,
                PCWSTR(RT_GROUP_ICON_ID as usize as *const u16),
                PCWSTR(1 as usize as *const u16),
                0,
                Some(group.as_ptr().cast()),
                group.len() as u32,
            )
            .is_err()
        {
            ok = false;
            err = "UpdateResource RT_GROUP_ICON failed".into();
        }
        let _ = EndUpdateResourceW(handle, !ok);
        if !ok {
            return Err(IconError::Msg(err));
        }
    }
    let _ = (RT_GROUP_ICON, RT_ICON);
    Ok(())
}

fn wide_path(path: &Path) -> Result<Vec<u16>, IconError> {
    let text = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned();
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    if wide.len() >= MAX_PATH as usize {
        return Err(IconError::Msg("path too long".into()));
    }
    wide.push(0);
    Ok(wide)
}

fn parse_ico(bytes: &[u8]) -> Result<Vec<IcoImage>, IconError> {
    if bytes.len() < 6 {
        return Err(IconError::Msg("ico too small".into()));
    }
    let reserved = u16::from_le_bytes([bytes[0], bytes[1]]);
    let kind = u16::from_le_bytes([bytes[2], bytes[3]]);
    let count = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
    if reserved != 0 || kind != 1 || count == 0 {
        return Err(IconError::Msg("not a Windows ico".into()));
    }
    let header = 6 + count * 16;
    if bytes.len() < header {
        return Err(IconError::Msg("ico directory truncated".into()));
    }
    let mut images = Vec::with_capacity(count);
    for i in 0..count {
        let e = 6 + i * 16;
        let width = bytes[e];
        let height = bytes[e + 1];
        let color_count = bytes[e + 2];
        let planes = u16::from_le_bytes([bytes[e + 4], bytes[e + 5]]);
        let bit_count = u16::from_le_bytes([bytes[e + 6], bytes[e + 7]]);
        let size = u32::from_le_bytes(bytes[e + 8..e + 12].try_into().unwrap()) as usize;
        let offset = u32::from_le_bytes(bytes[e + 12..e + 16].try_into().unwrap()) as usize;
        let end = offset.checked_add(size).ok_or_else(|| IconError::Msg("ico overflow".into()))?;
        if end > bytes.len() {
            return Err(IconError::Msg("ico image truncated".into()));
        }
        images.push(IcoImage {
            width,
            height,
            color_count,
            planes: if planes == 0 { 1 } else { planes },
            bit_count: if bit_count == 0 { 32 } else { bit_count },
            data: bytes[offset..end].to_vec(),
        });
    }
    Ok(images)
}

fn group_resource(images: &[IcoImage]) -> Vec<u8> {
    let mut out = Vec::with_capacity(6 + images.len() * 14);
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&(images.len() as u16).to_le_bytes());
    for (i, img) in images.iter().enumerate() {
        out.push(img.width);
        out.push(img.height);
        out.push(img.color_count);
        out.push(0);
        out.extend_from_slice(&img.planes.to_le_bytes());
        out.extend_from_slice(&img.bit_count.to_le_bytes());
        out.extend_from_slice(&(img.data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(i as u16 + 1).to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_rejects_garbage() {
        assert!(parse_ico(b"nope").is_err());
        assert!(parse_ico(&[0, 0, 2, 0, 1, 0]).is_err());
    }
}
