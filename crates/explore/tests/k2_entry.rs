//! K2: boot a named explore room, and Call/Return from a parked dialogue frame.

use std::collections::HashMap;

use galeng_explore::{Engine, Error, Phase};
use galeng_schema::{validate_project_str, validate_scene_str, Project, Scene};

fn project_and_scenes(project: &str, scenes: &[(&str, &str)]) -> (Project, HashMap<String, Scene>) {
    let project = validate_project_str(project).unwrap();
    let mut map = HashMap::new();
    for (_, text) in scenes {
        let scene = validate_scene_str(text).unwrap();
        map.insert(scene.id.clone(), scene);
    }
    (project, map)
}

const PROJECT: &str = r#"{
  "id": "k2",
  "title": "K2",
  "schemaVersion": 2,
  "resolution": { "width": 1920, "height": 1080 },
  "startScene": "hall",
  "locale": "zh-Hant",
  "skipTitle": true
}"#;

fn hall() -> &'static str {
    r#"{
      "id": "hall",
      "sceneKind": "explore",
      "onEnter": [{ "type": "setSwitch", "id": "startRan", "value": true }],
      "hotspots": [
        { "id": "arch", "name": "Arch", "shape": { "type": "rect", "x": 0, "y": 0, "w": 10, "h": 10 } }
      ]
    }"#
}

fn room_say_then_switch() -> &'static str {
    r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "desk", "name": "Desk", "shape": { "type": "rect", "x": 0, "y": 0, "w": 40, "h": 40 } }
      ],
      "onEnter": [
        { "type": "say", "text": "entered" },
        { "type": "setSwitch", "id": "entered", "value": true }
      ]
    }"#
}

#[test]
fn boot_at_enters_that_room_not_the_start_scene() {
    let (project, scenes) = project_and_scenes(PROJECT, &[("hall", hall()), ("room", room_say_then_switch())]);
    let mut eng = Engine::boot_at(project, scenes, "room").unwrap();
    assert_eq!(eng.project().start_scene, "hall");
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().say_text.as_deref(), Some("entered"));
    assert_ne!(eng.view().switches.get("entered"), Some(&true));
    assert_ne!(eng.view().switches.get("startRan"), Some(&true));
    assert!(!eng.hotspot_overlay().is_empty());
    eng.dismiss_say().unwrap();
    assert_eq!(eng.phase(), &Phase::Explore);
    assert_eq!(eng.view().switches.get("entered"), Some(&true));
    assert_eq!(eng.view().say_text, None);
    eng.advance().unwrap();
    assert_eq!(eng.phase(), &Phase::Explore);
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.view().say_text, None);
    assert_eq!(eng.view().switches.get("entered"), Some(&true));
    assert_ne!(eng.view().switches.get("startRan"), Some(&true));
}

#[test]
fn boot_at_missing_scene_is_not_missing_start() {
    let (project, scenes) = project_and_scenes(PROJECT, &[("hall", hall())]);
    match Engine::boot_at(project, scenes, "room") {
        Err(Error::MissingScene(id)) => assert_eq!(id, "room"),
        Ok(_) => panic!("boot_at missing room should fail"),
        Err(other) => panic!("expected MissingScene, got {other}"),
    }
}

#[test]
fn new_still_reports_missing_start() {
    match Engine::from_json(PROJECT, &[]) {
        Err(Error::MissingStart(id)) => assert_eq!(id, "hall"),
        Ok(_) => panic!("missing start should fail"),
        Err(other) => panic!("expected MissingStart, got {other}"),
    }
}

#[test]
fn parked_call_into_explore_returns_to_caller_end() {
    let talk = r#"{
      "id": "talk",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "n", "text": "go" } }],
      "exit": { "type": "call", "scene": "room" }
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "door", "name": "Door", "shape": { "type": "rect", "x": 0, "y": 0, "w": 20, "h": 20 } }
      ],
      "onEnter": [
        { "type": "say", "text": "entered" },
        { "type": "setSwitch", "id": "entered", "value": true }
      ],
      "interactions": [{
        "hotspot": "door",
        "on": { "verb": "look" },
        "rules": [{ "when": [], "do": [{ "type": "return" }] }]
      }]
    }"#;
    let (project, scenes) = project_and_scenes(PROJECT, &[("talk", talk), ("room", room)]);
    let mut eng = Engine::parked(project, scenes, "talk", 1).unwrap();
    assert_eq!(eng.phase(), &Phase::Dialogue);
    assert_eq!(eng.scene_id(), "talk");
    assert_eq!(eng.view().call_depth, 0);
    assert_eq!(eng.view().say_text, None);
    eng.call_from_here("room", None).unwrap();
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().say_text.as_deref(), Some("entered"));
    assert_ne!(eng.view().switches.get("entered"), Some(&true));
    assert_eq!(eng.view().call_depth, 1);
    eng.dismiss_say().unwrap();
    assert_eq!(eng.phase(), &Phase::Explore);
    assert_eq!(eng.view().switches.get("entered"), Some(&true));
    assert!(!eng.hotspot_overlay().is_empty());
    eng.select_verb(Some("look"));
    eng.interact("door").unwrap();
    assert_eq!(eng.phase(), &Phase::Ended);
    assert_eq!(eng.scene_id(), "talk");
    assert_eq!(eng.view().beat_index, 1);
    assert_eq!(eng.view().say_text, None);
    assert_eq!(eng.view().call_depth, 0);
    assert_eq!(eng.view().switches.get("entered"), Some(&true));
    eng.advance().unwrap();
    assert_eq!(eng.phase(), &Phase::Ended);
    assert_eq!(eng.view().say_text, None);
}

#[test]
fn parked_call_to_dialogue_returns_past_the_call_site() {
    let a = r#"{
      "id": "A",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "A", "text": "go" } }],
      "exit": { "type": "call", "scene": "B" }
    }"#;
    let b = r#"{
      "id": "B",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "B", "text": "back" } }],
      "exit": { "type": "return" }
    }"#;
    let (project, scenes) = project_and_scenes(PROJECT, &[("A", a), ("B", b)]);
    let mut eng = Engine::parked(project, scenes, "A", 1).unwrap();
    eng.call_from_here("B", None).unwrap();
    assert_eq!(eng.scene_id(), "B");
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().say_text.as_deref(), Some("back"));
    eng.dismiss_say().unwrap();
    assert_eq!(eng.phase(), &Phase::Ended);
    assert_eq!(eng.scene_id(), "A");
    assert_eq!(eng.view().beat_index, 1);
    assert_eq!(eng.view().say_text, None);
}

#[test]
fn parked_return_with_empty_stack_is_an_error() {
    let talk = r#"{
      "id": "talk",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "n", "text": "bye" } }],
      "exit": { "type": "return" }
    }"#;
    let (project, scenes) = project_and_scenes(PROJECT, &[("talk", talk)]);
    let mut eng = Engine::parked(project, scenes, "talk", 1).unwrap();
    match eng.return_from_here(None) {
        Err(Error::EmptyReturn) => {}
        Ok(()) => panic!("empty return should fail"),
        Err(other) => panic!("expected EmptyReturn, got {other}"),
    }
    match eng.phase() {
        Phase::Error(msg) => assert!(msg.contains("return"), "{msg}"),
        other => panic!("expected error, got {other:?}"),
    }
    assert_ne!(eng.phase(), &Phase::Ended);
}

#[test]
fn parked_call_to_missing_scene_is_not_ended() {
    let talk = r#"{
      "id": "talk",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "n", "text": "go" } }],
      "exit": { "type": "call", "scene": "missing" }
    }"#;
    let (project, scenes) = project_and_scenes(PROJECT, &[("talk", talk)]);
    let mut eng = Engine::parked(project, scenes, "talk", 1).unwrap();
    match eng.call_from_here("missing", None) {
        Err(Error::MissingScene(_)) => {}
        Ok(()) => panic!("missing call target should fail"),
        Err(other) => panic!("expected MissingScene, got {other}"),
    }
    match eng.phase() {
        Phase::Error(msg) => assert!(msg.contains("missing"), "{msg}"),
        other => panic!("expected error, got {other:?}"),
    }
    assert_ne!(eng.phase(), &Phase::Ended);
}
