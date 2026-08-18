use galeng_player::{preview_snapshot, Runtime};
use galeng_schema::{repo_root, validate_scene_file};

#[test]
fn prologue_snapshots_match_fixture() {
    let fixture: Vec<galeng_player::PreviewSnap> = serde_json::from_str(
        &std::fs::read_to_string(repo_root().join("fixtures/preview/prologue.json")).unwrap(),
    )
    .expect("fixture json");
    for expected in fixture {
        let path = repo_root()
            .join("examples/prologue/scenario")
            .join(format!("{}.json", expected.scene));
        let scene = validate_scene_file(&path).unwrap();
        let got = preview_snapshot(&scene, expected.beat_index);
        assert_eq!(got, expected, "scene {} beat {}", expected.scene, expected.beat_index);
    }
}

#[test]
fn live_first_line_matches_park_01_beat_1() {
    let rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    let view = rt.view();
    assert_eq!(view.scene_id, "park_01");
    assert_eq!(view.beat_index, 1);
    let scene = validate_scene_file(
        repo_root().join("examples/prologue/scenario/park_01.json"),
    )
    .unwrap();
    let snap = preview_snapshot(&scene, 1);
    assert_eq!(view.bg.as_deref(), snap.bg.as_deref());
    assert_eq!(view.chars, snap.chars);
    assert_eq!(view.cg.as_deref(), snap.cg.as_deref());
    assert_eq!(view.bgm.as_deref(), snap.bgm.as_deref());
    assert_eq!(view.say_speaker.as_deref(), snap.say_speaker.as_deref());
    assert_eq!(view.say_text.as_deref(), snap.say_text.as_deref());
    assert_eq!(view.voice.as_deref(), snap.voice.as_deref());
    assert_eq!(view.amb.as_deref(), snap.amb.as_deref());
}
