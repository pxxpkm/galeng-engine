//! Non-Windows stub: movies unsupported; API preserved for the shared window loop.

use crate::assets::Source;
use crate::fb::Framebuffer;

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
}

impl Play {
    pub fn open(_source: &Source, _logical: &str) -> Option<Self> {
        None
    }

    pub fn take_pcm(&mut self) -> Vec<PcmChunk> {
        Vec::new()
    }

    pub fn tick(&mut self) -> Status {
        Status::Ended
    }

    pub fn blit(&self, _fb: &mut Framebuffer) {}
}

pub fn skip_hint(locale: &str) -> &'static str {
    match locale {
        "en" => "Click to skip",
        "zh-Hans" => "点击跳过",
        _ => "點擊跳過",
    }
}

/// Stub platforms: movies unsupported.
pub fn probe() -> Result<(), String> {
    Err("unsupported".into())
}

