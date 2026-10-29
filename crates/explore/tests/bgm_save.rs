//! `load_save` restores the engine BGM captured in the save, including a stop.
//! A fresh engine has already run onEnter, so the loaded track must replace it.

use galeng_explore::{Engine, ExploreSave};

fn project() -> &'static str {
    r#"{
      "id": "bgm",
      "title": "BGM",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "room",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#
}

fn room(action_asset: &str) -> String {
    format!(
        r#"{{
      "id": "room",
      "sceneKind": "explore",
      "onEnter": [{{ "type": "bgm", "asset": "bgm/room" }}],
      "hotspots": [
        {{ "id": "radio", "name": "Radio", "shape": {{ "type": "rect", "x": 0, "y": 0, "w": 10, "h": 10 }} }}
      ],
      "interactions": [{{
        "hotspot": "radio",
        "on": {{ "verb": "look" }},
        "rules": [{{ "when": [], "do": [{{ "type": "bgm", "asset": {action_asset} }}] }}]
      }}]
    }}"#
    )
}

fn play(action_asset: &str) -> Engine {
    let room = room(action_asset);
    let mut eng = Engine::from_json(project(), &[("room", room.as_str())]).unwrap();
    assert_eq!(eng.view().bgm.as_deref(), Some("bgm/room"));
    eng.select_verb(Some("look"));
    eng.interact("radio").unwrap();
    eng
}

#[test]
fn load_save_restores_the_engine_track_over_on_enter() {
    let mut eng = play("\"bgm/night\"");
    assert_eq!(eng.view().bgm.as_deref(), Some("bgm/night"));
    let save = eng.to_save().unwrap();
    assert_eq!(save.bgm.as_deref(), Some("bgm/night"));

    let room = room("\"bgm/night\"");
    let mut loaded = Engine::from_json(project(), &[("room", room.as_str())]).unwrap();
    assert_eq!(loaded.view().bgm.as_deref(), Some("bgm/room"));
    loaded.load_save(&save).unwrap();
    assert_eq!(loaded.view().bgm.as_deref(), Some("bgm/night"));
}

#[test]
fn load_save_restores_a_stopped_bgm() {
    let mut eng = play("null");
    assert_eq!(eng.view().bgm, None);
    let save = eng.to_save().unwrap();
    assert_eq!(save.bgm, None);

    let room = room("null");
    let mut loaded = Engine::from_json(project(), &[("room", room.as_str())]).unwrap();
    assert_eq!(loaded.view().bgm.as_deref(), Some("bgm/room"));
    loaded.load_save(&save).unwrap();
    assert_eq!(loaded.view().bgm, None);
}

#[test]
fn load_save_without_a_bgm_field_clears_the_preloaded_track() {
    let eng = play("\"bgm/night\"");
    let save = eng.to_save().unwrap();
    let mut value = serde_json::to_value(&save).unwrap();
    value.as_object_mut().unwrap().remove("bgm");
    let stripped: ExploreSave = serde_json::from_value(value).unwrap();
    assert_eq!(stripped.bgm, None);

    let room = room("\"bgm/night\"");
    let mut loaded = Engine::from_json(project(), &[("room", room.as_str())]).unwrap();
    loaded.load_save(&stripped).unwrap();
    assert_eq!(loaded.view().bgm, None);
}
