use std::io::Cursor;
use std::time::Instant;

use crate::assets::Source;
use crate::settings::Settings;

const MAX_SE: usize = 4;

/// Engine fade-out when a voice clip is replaced or cleared. Not an IR field.
pub const VOICE_FADE_MS: u32 = 200;

pub struct Mixer {
    _stream: Option<rodio::OutputStream>,
    bgm: Option<rodio::Sink>,
    outgoing: Option<rodio::Sink>,
    current_bgm: Option<String>,
    fade_started: Option<Instant>,
    fade_ms: u32,
    voice: Option<rodio::Sink>,
    voice_outgoing: Option<rodio::Sink>,
    current_voice: Option<String>,
    voice_fade_started: Option<Instant>,
    voice_fade_ms: u32,
    se: Vec<rodio::Sink>,
    movie: Option<rodio::Sink>,
    amb: Option<rodio::Sink>,
    current_amb: Option<String>,
    settings: Settings,
}

impl Mixer {
    pub fn try_new() -> Self {
        match rodio::OutputStreamBuilder::open_default_stream() {
            Ok(stream) => {
                let bgm = rodio::Sink::connect_new(stream.mixer());
                let settings = Settings::default();
                bgm.set_volume(settings.gain_bgm(1.0));
                Self {
                    _stream: Some(stream),
                    bgm: Some(bgm),
                    outgoing: None,
                    current_bgm: None,
                    fade_started: None,
                    fade_ms: 0,
                    voice: None,
                    voice_outgoing: None,
                    current_voice: None,
                    voice_fade_started: None,
                    voice_fade_ms: 0,
                    se: Vec::new(),
                    movie: None,
                    amb: None,
                    current_amb: None,
                    settings,
                }
            }
            Err(_) => Self {
                _stream: None,
                bgm: None,
                outgoing: None,
                current_bgm: None,
                fade_started: None,
                fade_ms: 0,
                voice: None,
                voice_outgoing: None,
                current_voice: None,
                voice_fade_started: None,
                voice_fade_ms: 0,
                se: Vec::new(),
                movie: None,
                amb: None,
                current_amb: None,
                settings: Settings::default(),
            },
        }
    }

    pub fn has_device(&self) -> bool {
        self._stream.is_some()
    }

    pub fn set_settings(&mut self, settings: Settings) {
        self.settings = settings;
        self.apply_volumes();
    }

    fn apply_volumes(&mut self) {
        let fade_t = if self.fade_started.is_some() {
            let ms = self.fade_ms.max(1) as f32;
            self.fade_started
                .map(|s| (s.elapsed().as_secs_f32() * 1000.0 / ms).clamp(0.0, 1.0))
                .unwrap_or(1.0)
        } else {
            1.0
        };
        if let Some(sink) = &self.bgm {
            sink.set_volume(self.settings.gain_bgm(fade_t));
        }
        if let Some(sink) = &self.outgoing {
            sink.set_volume(self.settings.gain_bgm(1.0 - fade_t));
        }
        if let Some(sink) = &self.voice {
            sink.set_volume(self.settings.gain_voice());
        }
        if let Some(sink) = &self.voice_outgoing {
            sink.set_volume(self.settings.gain_voice() * (1.0 - self.voice_fade_t()));
        }
        let se_gain = self.settings.gain_se();
        for sink in &self.se {
            sink.set_volume(se_gain);
        }
        if let Some(sink) = &self.amb {
            sink.set_volume(se_gain);
        }
        if let Some(sink) = &self.movie {
            sink.set_volume(self.settings.gain_bgm(1.0));
        }
    }

    pub fn set_movie(&mut self, on: bool) {
        if on {
            self.stop_voice();
            if self.movie.is_some() {
                return;
            }
            let Some(stream) = &self._stream else {
                return;
            };
            let sink = rodio::Sink::connect_new(stream.mixer());
            sink.set_volume(self.settings.gain_bgm(1.0));
            self.movie = Some(sink);
        } else if let Some(sink) = self.movie.take() {
            sink.stop();
        }
    }

    pub fn pause_movie(&mut self, paused: bool) {
        let Some(sink) = &self.movie else {
            return;
        };
        if paused {
            sink.pause();
        } else {
            sink.play();
        }
    }

    /// Pause or resume every sink without seeking. Focus-loss mute.
    pub fn set_suspended(&mut self, suspended: bool) {
        let pause_or_play = |sink: &rodio::Sink| {
            if suspended {
                sink.pause();
            } else {
                sink.play();
            }
        };
        if let Some(sink) = &self.bgm {
            pause_or_play(sink);
        }
        if let Some(sink) = &self.outgoing {
            pause_or_play(sink);
        }
        if let Some(sink) = &self.voice {
            pause_or_play(sink);
        }
        if let Some(sink) = &self.voice_outgoing {
            pause_or_play(sink);
        }
        for sink in &self.se {
            pause_or_play(sink);
        }
        if let Some(sink) = &self.amb {
            pause_or_play(sink);
        }
        if let Some(sink) = &self.movie {
            pause_or_play(sink);
        }
    }

    pub fn push_movie_pcm(&mut self, channels: u16, sample_rate: u32, samples: Vec<i16>) {
        let Some(sink) = &self.movie else {
            return;
        };
        if samples.is_empty() || channels == 0 || sample_rate == 0 {
            return;
        }
        let floats: Vec<f32> = samples.iter().map(|s| f32::from(*s) / 32768.0).collect();
        sink.append(rodio::buffer::SamplesBuffer::new(
            channels,
            sample_rate,
            floats,
        ));
    }

    pub fn sync(&mut self, bgm: Option<&str>, fade_ms: u32, source: &Source) {
        if self.current_bgm.as_deref() == bgm {
            return;
        }
        if let Some(old) = self.outgoing.take() {
            old.stop();
        }
        if fade_ms == 0 {
            if let Some(sink) = &self.bgm {
                sink.stop();
            }
            self.outgoing = None;
            self.fade_started = None;
            self.fade_ms = 0;
        } else if let Some(old) = self.bgm.take() {
            old.set_volume(self.settings.gain_bgm(1.0));
            self.outgoing = Some(old);
            self.fade_started = Some(Instant::now());
            self.fade_ms = fade_ms;
            if let Some(stream) = &self._stream {
                let incoming = rodio::Sink::connect_new(stream.mixer());
                incoming.set_volume(0.0);
                self.bgm = Some(incoming);
            }
        }
        self.current_bgm = bgm.map(str::to_string);
        let Some(logical) = bgm else {
            if fade_ms == 0 {
                // already stopped
            }
            return;
        };
        let Some(sink) = &self.bgm else {
            return;
        };
        let Some(decoder) = decode(source, logical) else {
            return;
        };
        if fade_ms == 0 {
            sink.set_volume(self.settings.gain_bgm(1.0));
        }
        use rodio::Source;
        sink.append(decoder.repeat_infinite());
    }

    pub fn tick(&mut self) {
        if let Some(started) = self.fade_started {
            let ms = self.fade_ms.max(1) as f32;
            let t = (started.elapsed().as_secs_f32() * 1000.0 / ms).clamp(0.0, 1.0);
            if let Some(sink) = &self.bgm {
                sink.set_volume(self.settings.gain_bgm(t));
            }
            if let Some(sink) = &self.outgoing {
                sink.set_volume(self.settings.gain_bgm(1.0 - t));
            }
            if t >= 1.0 {
                if let Some(old) = self.outgoing.take() {
                    old.stop();
                }
                self.fade_started = None;
            }
        }
        if self.voice_fade_started.is_some() {
            let t = self.voice_fade_t();
            if let Some(sink) = &self.voice_outgoing {
                sink.set_volume(self.settings.gain_voice() * (1.0 - t));
            }
            if t >= 1.0 {
                if let Some(old) = self.voice_outgoing.take() {
                    old.stop();
                }
                self.voice_fade_started = None;
            }
        }
    }

    fn voice_fade_t(&self) -> f32 {
        let Some(started) = self.voice_fade_started else {
            return 1.0;
        };
        let ms = self.voice_fade_ms.max(1) as f32;
        (started.elapsed().as_secs_f32() * 1000.0 / ms).clamp(0.0, 1.0)
    }

    pub fn voice_is_fading(&self) -> bool {
        self.voice_fade_started.is_some()
    }

    /// Hard stop. Used by Ctrl skip, movie / title OP, and overlays.
    pub fn stop_voice(&mut self) {
        if let Some(sink) = self.voice.take() {
            sink.stop();
        }
        if let Some(sink) = self.voice_outgoing.take() {
            sink.stop();
        }
        self.current_voice = None;
        self.voice_fade_started = None;
        self.voice_fade_ms = 0;
    }

    pub fn sync_voice(&mut self, voice: Option<&str>, source: &Source, fade_ms: u32) {
        if self.current_voice.as_deref() == voice {
            return;
        }
        if let Some(old) = self.voice_outgoing.take() {
            old.stop();
        }
        if fade_ms == 0 {
            if let Some(sink) = self.voice.take() {
                sink.stop();
            }
            self.voice_fade_started = None;
            self.voice_fade_ms = 0;
        } else if let Some(old) = self.voice.take() {
            old.set_volume(self.settings.gain_voice());
            self.voice_outgoing = Some(old);
            self.voice_fade_started = Some(Instant::now());
            self.voice_fade_ms = fade_ms;
        } else if self.current_voice.is_some() {
            // No live sink (no card, or clip already ended) — still expose fade for tests / tick.
            self.voice_fade_started = Some(Instant::now());
            self.voice_fade_ms = fade_ms;
        } else {
            self.voice_fade_started = None;
            self.voice_fade_ms = 0;
        }
        self.current_voice = voice.map(str::to_string);
        let Some(logical) = voice else {
            return;
        };
        let Some(stream) = &self._stream else {
            return;
        };
        let Some(decoder) = decode(source, logical) else {
            return;
        };
        let sink = rodio::Sink::connect_new(stream.mixer());
        sink.set_volume(self.settings.gain_voice());
        sink.append(decoder);
        self.voice = Some(sink);
    }

    pub fn play_se(&mut self, logicals: &[String], source: &Source) {
        let Some(stream) = &self._stream else {
            return;
        };
        self.se.retain(|sink| !sink.empty());
        for logical in logicals {
            if self.se.len() >= MAX_SE {
                let old = self.se.remove(0);
                old.stop();
            }
            let Some(decoder) = decode(source, logical) else {
                continue;
            };
            let sink = rodio::Sink::connect_new(stream.mixer());
            sink.set_volume(self.settings.gain_se());
            sink.append(decoder);
            self.se.push(sink);
        }
    }

    pub fn current_amb(&self) -> Option<&str> {
        self.current_amb.as_deref()
    }

    pub fn stop_amb(&mut self) {
        if let Some(sink) = self.amb.take() {
            sink.stop();
        }
        self.current_amb = None;
    }

    /// Looping ambience. Same path does not restart. `None` stops.
    pub fn sync_amb(&mut self, amb: Option<&str>, source: &Source) {
        if self.current_amb.as_deref() == amb {
            return;
        }
        if let Some(sink) = self.amb.take() {
            sink.stop();
        }
        self.current_amb = amb.map(str::to_string);
        let Some(logical) = amb else {
            return;
        };
        let Some(stream) = &self._stream else {
            return;
        };
        let Some(decoder) = decode(source, logical) else {
            return;
        };
        let sink = rodio::Sink::connect_new(stream.mixer());
        sink.set_volume(self.settings.gain_se());
        use rodio::Source;
        sink.append(decoder.repeat_infinite());
        self.amb = Some(sink);
    }
}

fn decode(source: &Source, logical: &str) -> Option<rodio::Decoder<Cursor<Vec<u8>>>> {
    let (_, bytes) = source.read_asset(logical, &["ogg", "wav"])?;
    rodio::Decoder::new(Cursor::new(bytes)).ok()
}
