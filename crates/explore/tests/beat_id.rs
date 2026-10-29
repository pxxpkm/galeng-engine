//! Explore resumes by stable beat id. Old saves with no id still use the index.
//! A missing id is an error and does not pretend the scene is at beat 0.

use std::collections::{BTreeMap, BTreeSet};

use galeng_explore::save::PhaseSave;
use galeng_explore::{
    align_explore_beat_id, resolve_saved_beat, BeatIdConflict, Engine, Error, ExploreSave, Phase,
    StackFrame,
};
use galeng_schema::Beat;

const A: &str = "ba000000000000001";
const B: &str = "bb000000000000002";
const C: &str = "bc000000000000003";
const INS: &str = "bd000000000000004";
const GONE: &str = "be000000000000005";

fn project(start: &str) -> String {
    format!(
        r#"{{
          "id": "beatid",
          "title": "Beat",
          "schemaVersion": 2,
          "resolution": {{ "width": 1920, "height": 1080 }},
          "startScene": "{start}",
          "locale": "zh-Hant",
          "skipTitle": true
        }}"#
    )
}

fn say(id: &str, text: &str) -> String {
    format!(r#"{{ "id": "{id}", "say": {{ "speaker": "甲", "text": "{text}" }} }}"#)
}

fn dialogue(id: &str, beats: &str) -> String {
    format!(r#"{{ "id": "{id}", "sceneKind": "dialogue", "beats": [{beats}] }}"#)
}

fn dialogue_return(id: &str, beats: &str) -> String {
    format!(
        r#"{{ "id": "{id}", "sceneKind": "dialogue", "beats": [{beats}], "exit": {{ "type": "return" }} }}"#
    )
}

fn room() -> String {
    r#"{ "id": "room", "sceneKind": "explore", "beats": [] }"#.into()
}

fn original_dlg() -> String {
    dialogue(
        "dlg",
        &format!("{},{},{}", say(A, "AAA"), say(B, "BBB"), say(C, "CCC")),
    )
}

fn inserted_dlg() -> String {
    dialogue(
        "dlg",
        &format!(
            "{},{},{},{}",
            say(INS, "NEW"),
            say(A, "AAA"),
            say(B, "BBB"),
            say(C, "CCC")
        ),
    )
}

fn save_on_second_line() -> ExploreSave {
    let mut eng = Engine::from_json(&project("dlg"), &[("dlg", &original_dlg())]).unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("AAA"));
    eng.dismiss_say().unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("BBB"));
    let save = eng.try_to_save().unwrap();
    assert_eq!(save.beat_id.as_deref(), Some(B));
    assert_eq!(save.beat_index, 1);
    save
}

#[test]
fn inserted_beat_reloads_the_original_line() {
    let save = save_on_second_line();
    let mut eng = Engine::from_json(
        &project("room"),
        &[("room", &room()), ("dlg", &inserted_dlg())],
    )
    .unwrap();
    assert_eq!(eng.phase(), &Phase::Explore);
    eng.load_save(&save).unwrap();
    assert_eq!(eng.view().scene_id, "dlg");
    assert_eq!(eng.view().beat_index, 2, "id B moved from index 1 to 2");
    assert_eq!(eng.view().say_text.as_deref(), Some("BBB"));
    eng.dismiss_say().unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("CCC"));
}

#[test]
fn old_save_without_beat_id_uses_index() {
    let mut save = save_on_second_line();
    let value = serde_json::to_value(&save).unwrap();
    assert!(value.get("beatId").is_some());
    save.beat_id = None;
    let legacy = serde_json::to_value(&save).unwrap();
    assert!(
        legacy.get("beatId").is_none(),
        "absent id stays off the file"
    );
    let legacy: ExploreSave = serde_json::from_value(legacy).unwrap();
    assert!(legacy.beat_id.is_none());

    let mut eng = Engine::from_json(
        &project("room"),
        &[("room", &room()), ("dlg", &inserted_dlg())],
    )
    .unwrap();
    eng.load_save(&legacy).unwrap();
    assert_eq!(eng.view().beat_index, 1);
    eng.dismiss_say().unwrap();
    assert_eq!(
        eng.view().say_text.as_deref(),
        Some("BBB"),
        "index 1 is A after the insert, so the next line is BBB"
    );
}

#[test]
fn deleted_beat_id_fails_without_jumping_to_zero() {
    let mut save = save_on_second_line();
    save.beat_id = Some(GONE.into());
    let mut eng = Engine::from_json(
        &project("room"),
        &[("room", &room()), ("dlg", &inserted_dlg())],
    )
    .unwrap();
    let err = eng.load_save(&save).unwrap_err();
    match err {
        Error::BeatNotFound { scene, beat_id } => {
            assert_eq!(scene, "dlg");
            assert_eq!(beat_id, GONE);
        }
        other => panic!("expected BeatNotFound, got {other}"),
    }
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.phase(), &Phase::Explore);
    assert_eq!(eng.view().beat_index, 0);
    assert!(eng.view().say_text.is_none());
}

#[test]
fn dialogue_frame_beat_id_survives_an_insert() {
    let child = dialogue_return("child", &say(C, "CHILD"));
    let parent = dialogue(
        "parent",
        &format!("{},{},{}", say(INS, "NEW"), say(A, "AT"), say(B, "AFTER")),
    );
    let save = ExploreSave {
        schema_version: 2,
        game_id: "beatid".into(),
        scene_id: "child".into(),
        beat_index: 0,
        beat_id: Some(C.into()),
        phase: PhaseSave::Saying,
        call_stack: vec![StackFrame::Dialogue {
            scene_id: "parent".into(),
            // Stale index would be the inserted line. The id is the call site.
            beat_index: 0,
            beat_id: Some(A.into()),
        }],
        switches: BTreeMap::new(),
        vars: BTreeMap::new(),
        inventory: BTreeSet::new(),
        hotspot_visible: BTreeMap::new(),
        hotspot_enabled: BTreeMap::new(),
        selected_verb: None,
        pending_item: None,
        inventory_open: false,
        say_speaker: Some("甲".into()),
        say_text: Some("CHILD".into()),
        bgm: None,
    };
    let mut eng = Engine::from_json(
        &project("room"),
        &[("room", &room()), ("parent", &parent), ("child", &child)],
    )
    .unwrap();
    eng.load_save(&save).unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("CHILD"));
    eng.dismiss_say().unwrap();
    assert_eq!(eng.view().scene_id, "parent");
    assert_eq!(
        eng.view().say_text.as_deref(),
        Some("AFTER"),
        "return resumes after the call-site id, not the inserted line"
    );
}

#[test]
fn align_outer_beat_id_with_explore_snapshot() {
    let mut save = save_on_second_line();
    save.beat_id = None;
    let aligned = align_explore_beat_id(save.clone(), "dlg", Some(B)).unwrap();
    assert_eq!(aligned.beat_id.as_deref(), Some(B));

    save.beat_id = Some(A.into());
    let err = align_explore_beat_id(save.clone(), "dlg", Some(B)).unwrap_err();
    assert_eq!(
        err,
        BeatIdConflict::Mismatch {
            explore: A.into(),
            outer: B.into(),
        }
    );

    save.beat_id = None;
    let other_scene = align_explore_beat_id(save, "room", Some(B)).unwrap();
    assert!(other_scene.beat_id.is_none());
}

#[test]
fn resolve_saved_beat_matches_dialogue_rules() {
    let beats = vec![
        Beat {
            id: Some(A.into()),
            ..Beat::default()
        },
        Beat {
            id: Some(B.into()),
            ..Beat::default()
        },
    ];
    assert_eq!(resolve_saved_beat(&beats, Some(B), 0), Some(1));
    assert_eq!(resolve_saved_beat(&beats, Some(GONE), 0), None);
    assert_eq!(resolve_saved_beat(&beats, None, 0), Some(0));
    assert_eq!(resolve_saved_beat(&beats, None, 2), Some(2));
    assert_eq!(resolve_saved_beat(&beats, None, 3), None);
    let dup = vec![
        Beat {
            id: Some(A.into()),
            ..Beat::default()
        },
        Beat {
            id: Some(A.into()),
            ..Beat::default()
        },
    ];
    assert_eq!(resolve_saved_beat(&dup, Some(A), 0), None);
}
