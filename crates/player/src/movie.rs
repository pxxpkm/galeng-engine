//! Windows Media Foundation Source Reader → RGB32 frames for the software FB.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Once;
use std::time::{Duration, Instant};

use windows::core::{Interface, PCWSTR};
use windows::Win32::Media::MediaFoundation::{
    IMF2DBuffer, IMFMediaType, IMFSample, IMFSourceReader, MFCreateMediaType,
    MFCreateSourceReaderFromURL, MFShutdown, MFStartup, MFSTARTUP_NOSOCKET,
    MFAudioFormat_PCM, MFMediaType_Audio, MFMediaType_Video, MFVideoFormat_RGB32,
    MF_MT_AUDIO_BITS_PER_SAMPLE, MF_MT_AUDIO_NUM_CHANNELS, MF_MT_AUDIO_SAMPLES_PER_SECOND,
    MF_MT_FRAME_SIZE, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MF_SOURCE_READERF_ENDOFSTREAM,
    MF_SOURCE_READER_FIRST_AUDIO_STREAM, MF_SOURCE_READER_FIRST_VIDEO_STREAM, MF_VERSION,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};

use crate::assets::{Source, MOVIE_EXTS};
use crate::fb::{Framebuffer, HEIGHT, WIDTH};

const FIRST_VIDEO: u32 = MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32;
const FIRST_AUDIO: u32 = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Playing,
    Ended,
}

#[derive(Debug, Clone)]
pub struct PcmChunk {
    pub channels: u16,
    pub sample_rate: u32,
    pub samples: Vec<i16>,
}

pub struct Play {
    pub logical: String,
    reader: IMFSourceReader,
    width: u32,
    height: u32,
    frame: Option<Vec<u8>>,
    next_due: Option<Instant>,
    ended: bool,
    temp: Option<PathBuf>,
    audio: Option<AudioFmt>,
    audio_ended: bool,
    audio_ts: i64,
    pending_pcm: Vec<PcmChunk>,
}

#[derive(Clone, Copy)]
struct AudioFmt {
    channels: u16,
    sample_rate: u32,
    bits: u32,
}

impl Play {
    pub fn open(source: &Source, logical: &str) -> Option<Self> {
        ensure_mf().ok()?;
        let (path, temp) = movie_file(source, logical)?;
        let reader = open_reader(&path).ok()?;
        let (width, height) = video_size(&reader).ok()?;
        if width == 0 || height == 0 {
            return None;
        }
        let audio = audio_fmt(&reader).ok().flatten();
        Some(Self {
            logical: logical.to_string(),
            reader,
            width,
            height,
            frame: None,
            next_due: None,
            ended: false,
            temp,
            audio,
            audio_ended: false,
            audio_ts: 0,
            pending_pcm: Vec::new(),
        })
    }

    pub fn take_pcm(&mut self) -> Vec<PcmChunk> {
        std::mem::take(&mut self.pending_pcm)
    }

    pub fn tick(&mut self) -> Status {
        if self.ended {
            return Status::Ended;
        }
        if let Some(due) = self.next_due {
            if Instant::now() < due {
                return Status::Playing;
            }
        }
        match read_frame(&self.reader, self.width, self.height) {
            Ok(Some((rgba, dur, video_ts))) => {
                self.frame = Some(rgba);
                self.next_due = Some(Instant::now() + dur);
                self.drain_audio(video_ts.saturating_add(dur.as_nanos() as i64 / 100));
                Status::Playing
            }
            Ok(None) | Err(_) => {
                self.drain_audio(self.audio_ts.saturating_add(2_000_000));
                self.ended = true;
                Status::Ended
            }
        }
    }

    fn drain_audio(&mut self, until_hns: i64) {
        let Some(ref fmt) = self.audio else {
            return;
        };
        let mut pulled = 0u32;
        while !self.audio_ended && self.audio_ts <= until_hns && pulled < 8 {
            pulled += 1;
            match read_pcm(&self.reader, &fmt) {
                Ok(Some((chunk, ts))) => {
                    self.audio_ts = ts;
                    if !chunk.samples.is_empty() {
                        self.pending_pcm.push(chunk);
                    }
                }
                Ok(None) | Err(_) => {
                    self.audio_ended = true;
                }
            }
        }
    }

    pub fn blit(&self, fb: &mut Framebuffer) {
        let Some(rgba) = &self.frame else {
            return;
        };
        fb.blit_nearest(
            self.width,
            self.height,
            rgba,
            0,
            0,
            WIDTH as i32,
            HEIGHT as i32,
            false,
        );
    }
}

impl Drop for Play {
    fn drop(&mut self) {
        if let Some(path) = self.temp.take() {
            let _ = fs::remove_file(path);
        }
    }
}

fn movie_file(source: &Source, logical: &str) -> Option<(PathBuf, Option<PathBuf>)> {
    match source {
        Source::Dir(dir) => {
            let path = crate::assets::resolve_movie(&galeng_schema::asset_dir(dir), logical)?;
            Some((path, None))
        }
        Source::Pak(_) => {
            let (ext, bytes) = source.read_asset(logical, MOVIE_EXTS)?;
            let safe: String = logical
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
                .collect();
            let tmp = std::env::temp_dir().join(format!(
                "galeng-movie-{}-{}.{}",
                std::process::id(),
                safe,
                ext
            ));
            fs::write(&tmp, bytes).ok()?;
            Some((tmp.clone(), Some(tmp)))
        }
    }
}

/// Media Foundation availability only — does not open a file or start Play.
pub fn probe() -> Result<(), String> {
    ensure_mf().map_err(|e| e.to_string())
}

pub(crate) fn ensure_mf() -> windows::core::Result<()> {
    static START: Once = Once::new();
    static mut RESULT: Option<windows::core::HRESULT> = None;
    START.call_once(|| {
        let hr = unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET)
        };
        unsafe {
            RESULT = Some(hr.map(|_| windows::core::HRESULT(0)).unwrap_or_else(|e| e.code()));
        }
    });
    let code = unsafe { RESULT.unwrap_or(windows::core::HRESULT(0)) };
    if code.is_ok() {
        Ok(())
    } else {
        Err(windows::core::Error::from(code))
    }
}

fn open_reader(path: &Path) -> windows::core::Result<IMFSourceReader> {
    let wide = wide_path(path);
    unsafe { MFCreateSourceReaderFromURL(PCWSTR(wide.as_ptr()), None) }
}

fn wide_path(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    let mut s: Vec<u16> = path.as_os_str().encode_wide().collect();
    if !s.contains(&0) {
        s.push(0);
    }
    s
}

fn video_size(reader: &IMFSourceReader) -> windows::core::Result<(u32, u32)> {
    let ty = unsafe { MFCreateMediaType()? };
    unsafe {
        ty.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        ty.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32)?;
        reader.SetCurrentMediaType(FIRST_VIDEO, None, &ty)?;
    }
    let current: IMFMediaType = unsafe { reader.GetCurrentMediaType(FIRST_VIDEO) }?;
    let packed = unsafe { current.GetUINT64(&MF_MT_FRAME_SIZE) }?;
    let width = (packed >> 32) as u32;
    let height = packed as u32;
    Ok((width, height))
}

fn audio_fmt(reader: &IMFSourceReader) -> windows::core::Result<Option<AudioFmt>> {
    let ty = unsafe { MFCreateMediaType()? };
    unsafe {
        ty.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
        ty.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)?;
        ty.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
        if reader.SetCurrentMediaType(FIRST_AUDIO, None, &ty).is_err() {
            return Ok(None);
        }
    }
    let current: IMFMediaType = match unsafe { reader.GetCurrentMediaType(FIRST_AUDIO) } {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };
    let channels = unsafe { current.GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS) }.unwrap_or(0);
    let rate = unsafe { current.GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND) }.unwrap_or(0);
    let bits = unsafe { current.GetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE) }.unwrap_or(16);
    if channels == 0 || rate == 0 {
        return Ok(None);
    }
    Ok(Some(AudioFmt {
        channels: channels as u16,
        sample_rate: rate,
        bits,
    }))
}

fn read_pcm(reader: &IMFSourceReader, fmt: &AudioFmt) -> windows::core::Result<Option<(PcmChunk, i64)>> {
    let mut flags = 0u32;
    let mut timestamp = 0i64;
    let mut sample: Option<IMFSample> = None;
    unsafe {
        reader.ReadSample(
            FIRST_AUDIO,
            0,
            None,
            Some(&mut flags),
            Some(&mut timestamp),
            Some(&mut sample),
        )?;
    }
    if flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0 {
        return Ok(None);
    }
    let Some(sample) = sample else {
        return Ok(None);
    };
    let buffer = unsafe { sample.ConvertToContiguousBuffer() }?;
    let mut raw = std::ptr::null_mut();
    let mut len = 0u32;
    unsafe {
        buffer.Lock(&mut raw, None, Some(&mut len))?;
    }
    let bytes = unsafe { std::slice::from_raw_parts(raw, len as usize) };
    let samples = pcm_to_i16(bytes, fmt.bits);
    unsafe {
        let _ = buffer.Unlock();
    }
    Ok(Some((
        PcmChunk {
            channels: fmt.channels,
            sample_rate: fmt.sample_rate,
            samples,
        },
        timestamp,
    )))
}

fn pcm_to_i16(bytes: &[u8], bits: u32) -> Vec<i16> {
    match bits {
        8 => bytes
            .iter()
            .map(|b| (i16::from(*b) - 128) * 256)
            .collect(),
        32 => bytes
            .chunks_exact(4)
            .map(|c| {
                let n = i32::from_le_bytes([c[0], c[1], c[2], c[3]]);
                (n >> 16) as i16
            })
            .collect(),
        _ => bytes
            .chunks_exact(2)
            .map(|c| i16::from_le_bytes([c[0], c[1]]))
            .collect(),
    }
}

fn read_frame(
    reader: &IMFSourceReader,
    width: u32,
    height: u32,
) -> windows::core::Result<Option<(Vec<u8>, Duration, i64)>> {
    let mut flags = 0u32;
    let mut timestamp = 0i64;
    let mut sample: Option<IMFSample> = None;
    unsafe {
        reader.ReadSample(
            FIRST_VIDEO,
            0,
            None,
            Some(&mut flags),
            Some(&mut timestamp),
            Some(&mut sample),
        )?;
    }
    if flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0 {
        return Ok(None);
    }
    let Some(sample) = sample else {
        return Ok(Some((Vec::new(), Duration::from_millis(33), timestamp)));
    };
    let duration = unsafe { sample.GetSampleDuration() }
        .ok()
        .filter(|&d| d > 0)
        .map(|d| Duration::from_nanos((d as u64).saturating_mul(100)))
        .unwrap_or(Duration::from_millis(33));
    let buffer = unsafe { sample.ConvertToContiguousBuffer() }?;
    let rgba = if let Ok(buf2d) = buffer.cast::<IMF2DBuffer>() {
        copy_rgb32_2d(&buf2d, width, height)?
    } else {
        let mut raw = std::ptr::null_mut();
        let mut len = 0u32;
        unsafe {
            buffer.Lock(&mut raw, None, Some(&mut len))?;
        }
        let bytes = unsafe { std::slice::from_raw_parts(raw, len as usize) };
        let out = bgra_to_rgba(bytes, width, height, (width as usize).saturating_mul(4));
        unsafe {
            let _ = buffer.Unlock();
        }
        out
    };
    Ok(Some((rgba, duration, timestamp)))
}

fn copy_rgb32_2d(
    buf: &IMF2DBuffer,
    width: u32,
    height: u32,
) -> windows::core::Result<Vec<u8>> {
    let mut scan0 = std::ptr::null_mut();
    let mut pitch = 0i32;
    unsafe {
        buf.Lock2D(&mut scan0, &mut pitch)?;
    }
    let pitch_abs = pitch.unsigned_abs() as usize;
    let h = height as usize;
    let mut src = scan0;
    if pitch < 0 {
        src = unsafe { scan0.offset(pitch.saturating_mul(height as i32 - 1) as isize) };
    }
    let bytes = if pitch < 0 {
        // bottom-up: copy row by row from last
        let mut tmp = Vec::with_capacity(pitch_abs * h);
        for y in 0..h {
            let row = unsafe { scan0.offset(pitch.saturating_mul((height as i32 - 1) - y as i32) as isize) };
            let slice = unsafe { std::slice::from_raw_parts(row, pitch_abs) };
            tmp.extend_from_slice(slice);
        }
        let out = bgra_to_rgba(&tmp, width, height, pitch_abs);
        unsafe {
            let _ = buf.Unlock2D();
        }
        return Ok(out);
    } else {
        unsafe { std::slice::from_raw_parts(src, pitch_abs.saturating_mul(h)) }
    };
    let out = bgra_to_rgba(bytes, width, height, pitch_abs);
    unsafe {
        let _ = buf.Unlock2D();
    }
    Ok(out)
}

fn bgra_to_rgba(src: &[u8], width: u32, height: u32, stride: usize) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let mut out = vec![0u8; w.saturating_mul(h).saturating_mul(4)];
    for y in 0..h {
        let row = y.saturating_mul(stride);
        for x in 0..w {
            let i = row.saturating_add(x.saturating_mul(4));
            let o = (y * w + x) * 4;
            if i + 3 < src.len() && o + 3 < out.len() {
                out[o] = src[i + 2];
                out[o + 1] = src[i + 1];
                out[o + 2] = src[i];
                out[o + 3] = 255;
            }
        }
    }
    out
}

pub fn skip_hint(locale: &str) -> &'static str {
    match locale {
        "en" => "Click to skip",
        "zh-Hans" => "点击跳过",
        _ => "點擊跳過",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skip_hint_three_locales() {
        assert_eq!(skip_hint("en"), "Click to skip");
        assert_eq!(skip_hint("zh-Hans"), "点击跳过");
        assert_eq!(skip_hint("zh-Hant"), "點擊跳過");
    }

    #[test]
    fn missing_movie_does_not_open() {
        let src = Source::Dir(std::env::temp_dir().join("galeng-no-movie"));
        assert!(Play::open(&src, "movie/none").is_none());
    }
}

// Keep MF loaded for the process; shutting down while SDL runs is worse.
#[allow(dead_code)]
fn _keep_shutdown_symbol() {
    let _ = MFShutdown;
}
