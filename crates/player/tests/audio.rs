use std::fs;

use galeng_player::assets::{audio_duration_ms, ogg_duration_ms, resolve_audio, wav_duration_ms};
use galeng_player::{Phase, Runtime};
use galeng_schema::repo_root;

#[test]
fn resolve_park_wav() {
    let dir = repo_root().join("examples/prologue/assets");
    let path = resolve_audio(&dir, "bgm/park").expect("park audio");
    assert_eq!(path.extension().and_then(|s| s.to_str()), Some("wav"));
}

#[test]
fn resolve_voice_and_se_wav() {
    let dir = repo_root().join("examples/prologue/assets");
    for logical in ["voice/sora/001", "voice/sora/002", "se/breeze"] {
        let path = resolve_audio(&dir, logical).unwrap_or_else(|| panic!("{logical}"));
        assert_eq!(path.extension().and_then(|s| s.to_str()), Some("wav"));
        let bytes = fs::read(&path).unwrap();
        assert!(bytes.len() > 2000, "{logical} too small to be a real clip");
        assert!(
            bytes.windows(2).skip(44).any(|w| w != [0, 0]),
            "{logical} looks silent after the WAV header"
        );
    }
}

#[test]
fn prologue_starts_park_bgm() {
    let rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    assert_eq!(rt.view().bgm.as_deref(), Some("bgm/park"));
    assert_eq!(rt.view().bgm_fade_ms, 800);
}

#[test]
fn first_line_has_voice() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    assert_eq!(rt.view().voice.as_deref(), Some("voice/sora/001"));
    let se = rt.take_se();
    assert!(se.contains(&"se/breeze".to_string()), "skipped beat 0 must queue se: {se:?}");
    assert!(rt.take_se().is_empty());
}

#[test]
fn click_changes_then_clears_voice() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.take_se();
    rt.click_advance();
    assert_eq!(rt.view().voice.as_deref(), Some("voice/sora/002"));
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Choices);
    assert_eq!(rt.view().voice, None);
    assert_eq!(rt.view().say_text.as_deref(), Some("要不要一起走走？"));
}

#[test]
fn home_keeps_park_bgm() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.click_advance();
    rt.click_advance();
    rt.choose(1);
    assert_eq!(rt.view().scene_id, "home_01");
    assert_eq!(rt.view().bgm.as_deref(), Some("bgm/park"));
    assert_eq!(rt.view().voice, None);
}

#[test]
fn sora_001_wav_duration_is_about_half_second() {
    let path = repo_root().join("examples/prologue/assets/voice/sora/001.wav");
    let ms = wav_duration_ms(&path).expect("duration");
    assert!((500..=650).contains(&ms), "unexpected duration {ms}ms");
    let via_logical = audio_duration_ms(&repo_root().join("examples/prologue"), "voice/sora/001");
    assert_eq!(via_logical, Some(ms));
}

#[test]
fn resolve_and_duration_fixture_ogg() {
    let path = repo_root().join("fixtures/audio/tone.ogg");
    assert!(path.is_file(), "missing {}", path.display());
    let ms = ogg_duration_ms(&path).expect("ogg duration");
    assert!((100..=400).contains(&ms), "unexpected ogg duration {ms}ms");
    let dir = repo_root().join("fixtures/audio");
    let resolved = resolve_audio(&dir, "tone").expect("tone");
    assert_eq!(resolved.extension().and_then(|s| s.to_str()), Some("ogg"));
}

#[test]
fn mixer_tick_does_not_panic() {
    let mut mixer = galeng_player::audio::Mixer::try_new();
    let root = galeng_player::assets::Source::Dir(repo_root().join("examples/prologue"));
    mixer.sync(Some("bgm/park"), 800, &root);
    mixer.tick();
    mixer.sync(None, 200, &root);
    mixer.tick();
    mixer.sync(Some("bgm/park"), 0, &root);
    mixer.tick();
}

#[test]
fn mixer_movie_pcm_does_not_panic() {
    let mut mixer = galeng_player::audio::Mixer::try_new();
    mixer.set_movie(true);
    mixer.push_movie_pcm(1, 8000, vec![0i16; 160]);
    mixer.pause_movie(true);
    mixer.pause_movie(false);
    mixer.set_movie(false);
    mixer.set_movie(false);
}

#[test]
fn voice_path_change_starts_fade() {
    let mut mixer = galeng_player::audio::Mixer::try_new();
    let root = galeng_player::assets::Source::Dir(repo_root().join("examples/prologue"));
    mixer.sync_voice(Some("voice/sora/001"), &root, 200);
    assert!(
        !mixer.voice_is_fading(),
        "first clip has nothing to fade out"
    );
    mixer.sync_voice(Some("voice/sora/001"), &root, 200);
    assert!(
        !mixer.voice_is_fading(),
        "same path must not restart fade"
    );
    mixer.sync_voice(Some("voice/sora/002"), &root, 200);
    assert!(mixer.voice_is_fading(), "replace should fade the old clip");
    mixer.tick();
}

#[test]
fn voice_fade_zero_is_hard_cut() {
    let mut mixer = galeng_player::audio::Mixer::try_new();
    let root = galeng_player::assets::Source::Dir(repo_root().join("examples/prologue"));
    mixer.sync_voice(Some("voice/sora/001"), &root, 200);
    mixer.sync_voice(Some("voice/sora/002"), &root, 0);
    assert!(!mixer.voice_is_fading());
    mixer.stop_voice();
    assert!(!mixer.voice_is_fading());
    mixer.tick();
}

#[test]
fn mixer_amb_same_path_does_not_clear() {
    let mut mixer = galeng_player::audio::Mixer::try_new();
    let root = galeng_player::assets::Source::Dir(repo_root().join("examples/prologue"));
    mixer.sync_amb(Some("se/breeze"), &root);
    assert_eq!(mixer.current_amb(), Some("se/breeze"));
    mixer.sync_amb(Some("se/breeze"), &root);
    assert_eq!(mixer.current_amb(), Some("se/breeze"));
    mixer.sync_amb(None, &root);
    assert_eq!(mixer.current_amb(), None);
    mixer.stop_amb();
    mixer.tick();
}
