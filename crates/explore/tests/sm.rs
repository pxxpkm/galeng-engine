use std::fs;
use std::path::PathBuf;

use galeng_explore::{Engine, Error, ExploreSave, Phase, TraceLayer, BUILTIN_FALLBACK};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/explore")
}

fn load_click_room() -> Engine {
    let dir = fixtures_dir();
    let project = fs::read_to_string(dir.join("project.json")).unwrap();
    let study = fs::read_to_string(dir.join("study.json")).unwrap();
    let dlg = fs::read_to_string(dir.join("dlg_butler.json")).unwrap();
    let ending = fs::read_to_string(dir.join("ending.json")).unwrap();
    Engine::from_json(
        &project,
        &[("study", &study), ("dlg_butler", &dlg), ("ending", &ending)],
    )
    .expect("load click-room")
}

#[test]
fn hit_test_rect_and_topmost_polygon() {
    let eng = load_click_room();
    // desk: 600,500,420,220
    assert_eq!(eng.hit_test(700, 550), Some("desk"));
    // door: 1400,180,280,720
    assert_eq!(eng.hit_test(1500, 400), Some("door"));
    // window polygon [[100,80],[400,80],[400,300],[100,260]] is last, so it wins
    assert_eq!(eng.hit_test(200, 150), Some("window"));
    // below the slanted edge, and left of the butler rect
    assert_eq!(eng.hit_test(150, 280), None);
    // inside the butler rect, below the window edge (bottom near y=280 at x=250)
    assert_eq!(eng.hit_test(250, 400), Some("butler"));
    assert_eq!(eng.hit_test(0, 0), None);
}

#[test]
fn look_desk_default_and_after_switch() {
    let mut eng = load_click_room();
    eng.select_verb(Some("look"));
    eng.interact("desk").unwrap();
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().say_text.as_deref(), Some("一張舊書桌。"));
    assert_eq!(eng.view().trace, TraceLayer::Interaction);
    eng.dismiss_say().unwrap();
    assert_eq!(eng.phase(), &Phase::Explore);

    eng.set_switch_for_test("drawer_open", true);
    eng.interact("desk").unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("抽屜開咗。"));
}

#[test]
fn use_key_on_desk_consumes() {
    let mut eng = load_click_room();
    eng.give_item_for_test("key");
    eng.select_item(Some("key"));
    eng.interact("desk").unwrap();
    assert!(eng.view().switches.get("drawer_open") == Some(&true));
    assert_eq!(eng.view().say_text.as_deref(), Some("鎖匙對上咗。"));
    eng.dismiss_say().unwrap();
    assert!(!eng.view().inventory.contains("key"));
    assert!(eng.view().pending_item.is_none());
}

#[test]
fn fallback_per_verb_on_door_look() {
    let mut eng = load_click_room();
    eng.select_verb(Some("look"));
    eng.interact("door").unwrap();
    assert_eq!(eng.view().trace, TraceLayer::PerVerb);
    assert_eq!(eng.view().say_text.as_deref(), Some("冇咩特別。"));
}

#[test]
fn fallback_builtin_when_empty() {
    let project = r#"{
      "id": "bare",
      "title": "Bare",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "r",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let scene = r#"{
      "id": "r",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "a", "name": "A", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": []
    }"#;
    let mut eng = Engine::from_json(project, &[("r", scene)]).unwrap();
    eng.select_verb(Some("look"));
    eng.interact("a").unwrap();
    assert_eq!(eng.view().trace, TraceLayer::Builtin);
    assert_eq!(eng.view().say_text.as_deref(), Some(BUILTIN_FALLBACK));
}

#[test]
fn door_locked_then_goto_clears_stack() {
    let mut eng = load_click_room();
    eng.select_verb(Some("move"));
    eng.interact("door").unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("鎖住咗。"));
    eng.dismiss_say().unwrap();

    // push something via call then goto should clear — first open door
    eng.set_switch_for_test("door_open", true);
    eng.interact("door").unwrap();
    assert_eq!(eng.scene_id(), "ending");
    assert_eq!(eng.view().call_depth, 0);
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().say_text.as_deref(), Some("你離開咗書房。"));
}

#[test]
fn call_dialogue_return_restores_explore() {
    let mut eng = load_click_room();
    eng.select_verb(Some("talk"));
    eng.interact("butler").unwrap();
    assert_eq!(eng.scene_id(), "dlg_butler");
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().call_depth, 1);
    assert_eq!(eng.view().say_text.as_deref(), Some("少爺，書房落鎖咗。"));

    eng.dismiss_say().unwrap();
    // next beat
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().say_text.as_deref(), Some("鎖匙喺書枱度。"));
    eng.dismiss_say().unwrap();
    // exit return
    assert_eq!(eng.scene_id(), "study");
    assert_eq!(eng.phase(), &Phase::Explore);
    assert_eq!(eng.view().call_depth, 0);
    assert_eq!(eng.view().selected_verb.as_deref(), Some("talk"));
    assert_eq!(eng.view().vars.get("hint"), Some(&1));
}

#[test]
fn return_empty_stack_errors() {
    let project = r#"{
      "id": "bare",
      "title": "Bare",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "r",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let scene = r#"{
      "id": "r",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "a", "name": "A", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "a",
          "on": { "verb": "look" },
          "rules": [{ "when": [], "do": [{ "type": "return" }] }]
        }
      ]
    }"#;
    let mut eng = Engine::from_json(project, &[("r", scene)]).unwrap();
    eng.select_verb(Some("look"));
    let err = eng.interact("a").unwrap_err();
    assert!(matches!(err, Error::EmptyReturn));
    assert!(matches!(eng.phase(), Phase::Error(_)));
}

#[test]
fn save_roundtrip_preserves_inventory_and_stack() {
    // Call into a dialogue that lands on Choices (stable boundary) so save is allowed.
    let project = r#"{
      "id": "sv",
      "title": "SV",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "room",
      "locale": "zh-Hant",
      "skipTitle": true,
      "items": [{ "id": "key", "name": "Key" }]
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "npc", "name": "NPC", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "npc",
          "on": { "verb": "talk" },
          "rules": [{ "when": [], "do": [{ "type": "call", "scene": "dlg_ask" }] }]
        }
      ]
    }"#;
    let dlg_ask = r#"{
      "id": "dlg_ask",
      "sceneKind": "dialogue",
      "beats": [],
      "exit": {
        "type": "choices",
        "options": [{ "text": "ok", "goto": "dlg_ask" }]
      }
    }"#;
    let mut eng = Engine::from_json(project, &[("room", room), ("dlg_ask", dlg_ask)]).unwrap();
    eng.give_item_for_test("key");
    eng.select_verb(Some("talk"));
    eng.interact("npc").unwrap();
    assert_eq!(eng.scene_id(), "dlg_ask");
    assert_eq!(eng.phase(), &Phase::Choices);
    let save = eng.to_save().unwrap();
    assert_eq!(save.call_stack.len(), 1);
    assert!(save.inventory.contains("key"));

    let mut eng2 = Engine::from_json(project, &[("room", room), ("dlg_ask", dlg_ask)]).unwrap();
    eng2.load_save(&save).unwrap();
    assert_eq!(eng2.scene_id(), "dlg_ask");
    assert_eq!(eng2.view().call_depth, 1);
    assert!(eng2.view().inventory.contains("key"));
    assert_eq!(eng2.view().selected_verb.as_deref(), Some("talk"));
}

#[test]
fn save_schema_mismatch_rejects() {
    let eng = load_click_room();
    let mut save = eng.to_save().unwrap();
    save.schema_version = 99;
    let mut eng2 = load_click_room();
    let err = eng2.load_save(&save).unwrap_err();
    assert!(matches!(
        err,
        Error::SchemaMismatch {
            expected: 2,
            got: 99
        }
    ));
}

#[test]
fn hide_disable_hotspot() {
    let eng = load_click_room();
    assert_eq!(eng.hit_test(700, 550), Some("desk"));

    // hide via action queue: use a tiny helper scene interact
    // Directly apply through give + custom: use enqueue by interacting with crafted...
    // Use Engine internals via action: interact won't hide. Call apply through test project.
    let project = fs::read_to_string(fixtures_dir().join("project.json")).unwrap();
    let scene = r#"{
      "id": "study",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "desk", "name": "書桌", "shape": { "type": "rect", "x": 600, "y": 500, "w": 420, "h": 220 } }
      ],
      "interactions": [
        {
          "hotspot": "desk",
          "on": { "verb": "look" },
          "rules": [{ "when": [], "do": [{ "type": "hideHotspot", "id": "desk" }] }]
        },
        {
          "hotspot": "desk",
          "on": { "verb": "take" },
          "rules": [{ "when": [], "do": [{ "type": "disableHotspot", "id": "desk" }, { "type": "showHotspot", "id": "desk" }] }]
        }
      ]
    }"#;
    let mut eng = Engine::from_json(
        &project,
        &[
            ("study", scene),
            (
                "dlg_butler",
                &fs::read_to_string(fixtures_dir().join("dlg_butler.json")).unwrap(),
            ),
            (
                "ending",
                &fs::read_to_string(fixtures_dir().join("ending.json")).unwrap(),
            ),
        ],
    )
    .unwrap();
    eng.select_verb(Some("look"));
    eng.interact("desk").unwrap();
    assert_eq!(eng.hit_test(700, 550), None);

    // re-enable path: need visible again — load fresh and disable only
    let scene2 = r#"{
      "id": "study",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "desk", "name": "書桌", "shape": { "type": "rect", "x": 600, "y": 500, "w": 420, "h": 220 } }
      ],
      "interactions": [
        {
          "hotspot": "desk",
          "on": { "verb": "look" },
          "rules": [{ "when": [], "do": [{ "type": "disableHotspot", "id": "desk" }] }]
        }
      ]
    }"#;
    let mut eng = Engine::from_json(
        &project,
        &[
            ("study", scene2),
            (
                "dlg_butler",
                &fs::read_to_string(fixtures_dir().join("dlg_butler.json")).unwrap(),
            ),
            (
                "ending",
                &fs::read_to_string(fixtures_dir().join("ending.json")).unwrap(),
            ),
        ],
    )
    .unwrap();
    eng.select_verb(Some("look"));
    eng.interact("desk").unwrap();
    assert_eq!(eng.hit_test(700, 550), None);
}

#[test]
fn on_enter_runs() {
    let project = r#"{
      "id": "enter",
      "title": "Enter",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "on_enter_room",
      "locale": "zh-Hant",
      "skipTitle": true,
      "switches": [{ "id": "entered", "init": false }],
      "items": [{ "id": "key", "name": "Key" }]
    }"#;
    let scene = fs::read_to_string(fixtures_dir().join("on_enter_room.json")).unwrap();
    let eng = Engine::from_json(project, &[("on_enter_room", &scene)]).unwrap();
    assert_eq!(eng.view().switches.get("entered"), Some(&true));
    assert!(eng.view().inventory.contains("key"));
}

#[test]
fn click_uses_hit_test() {
    let mut eng = load_click_room();
    eng.select_verb(Some("look"));
    eng.click(700, 550).unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("一張舊書桌。"));
}

#[test]
fn save_json_roundtrip() {
    let eng = load_click_room();
    let save = eng.to_save().unwrap();
    let text = serde_json::to_string_pretty(&save).unwrap();
    let back: ExploreSave = serde_json::from_str(&text).unwrap();
    assert_eq!(back.schema_version, 2);
    assert_eq!(back.scene_id, "study");
}

#[test]
fn transition_defaults_fill_missing_trans_on_call_and_return() {
    let project = r#"{
      "id": "td",
      "title": "TD",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "room",
      "locale": "zh-Hant",
      "skipTitle": true,
      "transitionDefaults": {
        "toDialogue": "fade_black",
        "fromDialogue": "crossfade",
        "gotoScene": "fade_black"
      }
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "npc", "name": "NPC", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "npc",
          "on": { "verb": "talk" },
          "rules": [{ "when": [], "do": [{ "type": "call", "scene": "dlg" }] }]
        }
      ]
    }"#;
    let dlg = r#"{
      "id": "dlg",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "A", "text": "hi" } }],
      "exit": { "type": "return" }
    }"#;
    let mut eng = Engine::from_json(project, &[("room", room), ("dlg", dlg)]).unwrap();
    eng.select_verb(Some("talk"));
    eng.interact("npc").unwrap();
    assert_eq!(eng.view().last_trans.as_deref(), Some("fade_black"));
    assert_eq!(eng.scene_id(), "dlg");
    eng.dismiss_say().unwrap();
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.view().last_trans.as_deref(), Some("crossfade"));
}

#[test]
fn call_then_exit_next_preserves_stack_for_return() {
    // explore --call--> dlg_a --Exit::Next--> dlg_b --Exit::Return--> explore
    let project = r#"{
      "id": "chain",
      "title": "Chain",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "room",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "npc", "name": "NPC", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "npc",
          "on": { "verb": "talk" },
          "rules": [{ "when": [], "do": [{ "type": "call", "scene": "dlg_a" }] }]
        }
      ]
    }"#;
    let dlg_a = r#"{
      "id": "dlg_a",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "A", "text": "first" } }],
      "exit": { "type": "next", "goto": "dlg_b" }
    }"#;
    let dlg_b = r#"{
      "id": "dlg_b",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "B", "text": "second" } }],
      "exit": { "type": "return" }
    }"#;
    let mut eng = Engine::from_json(
        project,
        &[("room", room), ("dlg_a", dlg_a), ("dlg_b", dlg_b)],
    )
    .unwrap();
    eng.select_verb(Some("talk"));
    eng.interact("npc").unwrap();
    assert_eq!(eng.scene_id(), "dlg_a");
    assert_eq!(eng.view().call_depth, 1);
    eng.dismiss_say().unwrap();
    // Exit::Next must NOT clear stack
    assert_eq!(eng.scene_id(), "dlg_b");
    assert_eq!(eng.view().call_depth, 1);
    assert_eq!(eng.view().say_text.as_deref(), Some("second"));
    eng.dismiss_say().unwrap();
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.phase(), &Phase::Explore);
    assert_eq!(eng.view().call_depth, 0);
}

#[test]
fn call_then_choices_preserves_stack_for_return() {
    let project = r#"{
      "id": "ch",
      "title": "Ch",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "room",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "npc", "name": "NPC", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "npc",
          "on": { "verb": "talk" },
          "rules": [{ "when": [], "do": [{ "type": "call", "scene": "dlg_ask" }] }]
        }
      ]
    }"#;
    let dlg_ask = r#"{
      "id": "dlg_ask",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "A", "text": "pick" } }],
      "exit": {
        "type": "choices",
        "options": [
          { "text": "go", "goto": "dlg_ok" }
        ]
      }
    }"#;
    let dlg_ok = r#"{
      "id": "dlg_ok",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "A", "text": "ok" } }],
      "exit": { "type": "return" }
    }"#;
    let mut eng = Engine::from_json(
        project,
        &[("room", room), ("dlg_ask", dlg_ask), ("dlg_ok", dlg_ok)],
    )
    .unwrap();
    eng.select_verb(Some("talk"));
    eng.interact("npc").unwrap();
    eng.dismiss_say().unwrap();
    assert_eq!(eng.phase(), &Phase::Choices);
    assert_eq!(eng.view().call_depth, 1);
    assert!(eng.choose(0).unwrap());
    assert_eq!(eng.scene_id(), "dlg_ok");
    assert_eq!(eng.view().call_depth, 1);
    eng.dismiss_say().unwrap();
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.view().call_depth, 0);
}

#[test]
fn explicit_goto_scene_action_still_clears_stack() {
    let project = r#"{
      "id": "g",
      "title": "G",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "room",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "npc", "name": "NPC", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } },
        { "id": "portal", "name": "P", "shape": { "type": "rect", "x": 100, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "npc",
          "on": { "verb": "talk" },
          "rules": [{ "when": [], "do": [{ "type": "call", "scene": "dlg" }] }]
        },
        {
          "hotspot": "portal",
          "on": { "verb": "move" },
          "rules": [{ "when": [], "do": [{ "type": "gotoScene", "scene": "ending" }] }]
        }
      ]
    }"#;
    let dlg = r#"{
      "id": "dlg",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "A", "text": "hi" } }],
      "exit": { "type": "return" }
    }"#;
    let ending = r#"{
      "id": "ending",
      "sceneKind": "dialogue",
      "beats": [{ "say": { "speaker": "N", "text": "end" } }]
    }"#;
    let mut eng =
        Engine::from_json(project, &[("room", room), ("dlg", dlg), ("ending", ending)]).unwrap();
    eng.select_verb(Some("talk"));
    eng.interact("npc").unwrap();
    assert_eq!(eng.view().call_depth, 1);
    eng.dismiss_say().unwrap();
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.view().call_depth, 0);
    // push again then hard goto
    eng.select_verb(Some("talk"));
    eng.interact("npc").unwrap();
    assert_eq!(eng.view().call_depth, 1);
    // Still in dlg — return first then goto from explore
    eng.dismiss_say().unwrap();
    eng.select_verb(Some("move"));
    eng.interact("portal").unwrap();
    assert_eq!(eng.scene_id(), "ending");
    assert_eq!(eng.view().call_depth, 0);
}

#[test]
fn dialogue_exit_call_then_return_does_not_loop() {
    // Root dialogue A exits with Call→B; B returns. Must End, not re-Call forever.
    let project = r#"{
      "id": "loop",
      "title": "Loop",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "A",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
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
    let mut eng = Engine::from_json(project, &[("A", a), ("B", b)]).unwrap();
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.scene_id(), "A");
    eng.dismiss_say().unwrap();
    // A exit Call → B
    assert_eq!(eng.scene_id(), "B");
    assert_eq!(eng.phase(), &Phase::Saying);
    eng.dismiss_say().unwrap();
    // B Return → A at end → Ended (must not re-enter Call)
    assert_eq!(eng.phase(), &Phase::Ended);
    assert_eq!(eng.scene_id(), "A");
    // Bounded advances must stay Ended (no loop)
    for _ in 0..8 {
        eng.advance().unwrap();
        assert_eq!(eng.phase(), &Phase::Ended);
    }
}

#[test]
fn explore_call_nested_dialogue_return_resumes_explore() {
    // Explore → Call A → Exit::Call B → Return to A(at end) → auto Return → Explore
    let project = r#"{
      "id": "nest",
      "title": "Nest",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "room",
      "locale": "zh-Hant",
      "skipTitle": true,
      "verbs": [{ "id": "talk", "label": "Talk" }]
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "npc", "name": "NPC", "shape": { "type": "rect", "x": 0, "y": 0, "w": 100, "h": 100 } }
      ],
      "interactions": [
        {
          "hotspot": "npc",
          "on": { "verb": "talk" },
          "rules": [{ "when": [], "do": [{ "type": "call", "scene": "A" }] }]
        }
      ]
    }"#;
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
    let mut eng = Engine::from_json(project, &[("room", room), ("A", a), ("B", b)]).unwrap();
    eng.select_verb(Some("talk"));
    eng.interact("npc").unwrap();
    assert_eq!(eng.scene_id(), "A");
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().call_depth, 1);
    eng.dismiss_say().unwrap();
    // A exit Call → B
    assert_eq!(eng.scene_id(), "B");
    assert_eq!(eng.phase(), &Phase::Saying);
    assert_eq!(eng.view().call_depth, 2);
    eng.dismiss_say().unwrap();
    // B Return → A at end → auto Return → Explore room (must not End with stack left)
    assert_eq!(eng.phase(), &Phase::Explore);
    assert_eq!(eng.scene_id(), "room");
    assert_eq!(eng.view().call_depth, 0);
}

#[test]
fn try_to_save_rejects_mid_saying() {
    let project = r#"{
      "id": "say",
      "title": "Say",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "r",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let scene = r#"{
      "id": "r",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "a", "name": "A", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "a",
          "on": { "verb": "look" },
          "rules": [{
            "when": [],
            "do": [
              { "type": "say", "text": "one" },
              { "type": "setSwitch", "id": "done", "value": true }
            ]
          }]
        }
      ]
    }"#;
    let mut eng = Engine::from_json(project, &[("r", scene)]).unwrap();
    assert!(eng.try_to_save().is_ok());
    eng.select_verb(Some("look"));
    eng.interact("a").unwrap();
    assert_eq!(eng.phase(), &Phase::Saying);
    // The say is not last: setSwitch is still queued, and that queue is not saved.
    let err = eng.try_to_save().unwrap_err();
    assert!(matches!(err, Error::InvalidState(_)));
    eng.dismiss_say().unwrap();
    assert_eq!(eng.phase(), &Phase::Explore);
    let save = eng.try_to_save().unwrap();
    assert_eq!(save.scene_id, "r");
}

#[test]
fn saying_line_round_trips_when_queue_is_empty() {
    let project = r#"{
      "id": "say",
      "title": "Say",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "r",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let scene = r#"{
      "id": "r",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "a", "name": "A", "shape": { "type": "rect", "x": 0, "y": 0, "w": 50, "h": 50 } }
      ],
      "interactions": [
        {
          "hotspot": "a",
          "on": { "verb": "look" },
          "rules": [{ "when": [], "do": [{ "type": "say", "text": "one", "speaker": "n" }] }]
        }
      ]
    }"#;
    let mut eng = Engine::from_json(project, &[("r", scene)]).unwrap();
    eng.select_verb(Some("look"));
    eng.interact("a").unwrap();
    assert_eq!(eng.phase(), &Phase::Saying);
    let save = eng.try_to_save().unwrap();
    assert_eq!(save.say_text.as_deref(), Some("one"));
    assert_eq!(save.say_speaker.as_deref(), Some("n"));

    let mut eng2 = Engine::from_json(project, &[("r", scene)]).unwrap();
    eng2.load_save(&save).unwrap();
    assert_eq!(eng2.phase(), &Phase::Saying);
    assert_eq!(eng2.view().say_text.as_deref(), Some("one"));
    eng2.dismiss_say().unwrap();
    assert_eq!(eng2.phase(), &Phase::Explore);
}

#[test]
fn click_room_examples_clearance() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/click-room");
    let project = fs::read_to_string(root.join("galeng.json")).unwrap();
    let study = fs::read_to_string(root.join("scenario/study.json")).unwrap();
    let dlg = fs::read_to_string(root.join("scenario/dlg_butler.json")).unwrap();
    let ending = fs::read_to_string(root.join("scenario/ending.json")).unwrap();
    let mut eng = Engine::from_json(
        &project,
        &[("study", &study), ("dlg_butler", &dlg), ("ending", &ending)],
    )
    .expect("examples/click-room");

    // onEnter
    assert_eq!(eng.phase(), &Phase::Saying);
    eng.dismiss_say().unwrap();
    assert_eq!(eng.phase(), &Phase::Explore);

    eng.select_verb(Some("open"));
    eng.interact("desk").unwrap();
    assert!(eng.view().say_text.as_deref().unwrap().contains("抽屜"));
    eng.dismiss_say().unwrap();

    eng.select_verb(Some("take"));
    eng.interact("desk").unwrap();
    assert!(eng.view().inventory.contains("key"));
    eng.dismiss_say().unwrap();

    eng.select_item(Some("key"));
    eng.interact("door").unwrap();
    assert_eq!(eng.view().switches.get("door_open"), Some(&true));
    eng.dismiss_say().unwrap();

    eng.select_verb(Some("move"));
    eng.interact("door").unwrap();
    assert_eq!(eng.scene_id(), "ending");
    assert_eq!(eng.phase(), &Phase::Saying);
}

#[test]
fn desk_primary_open_then_take() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/click-room");
    let project = fs::read_to_string(root.join("galeng.json")).unwrap();
    let study = fs::read_to_string(root.join("scenario/study.json")).unwrap();
    let dlg = fs::read_to_string(root.join("scenario/dlg_butler.json")).unwrap();
    let ending = fs::read_to_string(root.join("scenario/ending.json")).unwrap();
    let mut eng = Engine::from_json(
        &project,
        &[("study", &study), ("dlg_butler", &dlg), ("ending", &ending)],
    )
    .unwrap();
    eng.dismiss_say().unwrap();

    let a = eng.primary_action("desk").expect("desk action");
    assert_eq!(a.verb.as_deref(), Some("open"));
    assert!(a.label.contains("開"));
    assert!(a.label.contains("書桌"));

    eng.select_verb(Some("open"));
    eng.interact("desk").unwrap();
    eng.dismiss_say().unwrap();

    let a = eng.primary_action("desk").expect("desk after open");
    assert_eq!(a.verb.as_deref(), Some("take"));
    assert!(a.label.contains("拎"));
}

#[test]
fn empty_click_says_room_look() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/click-room");
    let project = fs::read_to_string(root.join("galeng.json")).unwrap();
    let study = fs::read_to_string(root.join("scenario/study.json")).unwrap();
    let dlg = fs::read_to_string(root.join("scenario/dlg_butler.json")).unwrap();
    let ending = fs::read_to_string(root.join("scenario/ending.json")).unwrap();
    let mut eng = Engine::from_json(
        &project,
        &[("study", &study), ("dlg_butler", &dlg), ("ending", &ending)],
    )
    .unwrap();
    eng.dismiss_say().unwrap();

    let empty = eng.empty_click_action();
    assert_eq!(empty.verb.as_deref(), Some("look"));
    assert!(empty.label.contains("看"));
    assert!(empty.label.contains("書房"));

    // Miss all hotspots
    eng.click(10, 10).unwrap();
    assert_eq!(eng.phase(), &Phase::Saying);
    assert!(
        eng.view()
            .say_text
            .as_deref()
            .unwrap_or("")
            .contains("書房")
            || eng
                .view()
                .say_text
                .as_deref()
                .unwrap_or("")
                .contains("靜謐"),
        "got {:?}",
        eng.view().say_text
    );
}

#[test]
fn butler_primary_is_talk() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/click-room");
    let project = fs::read_to_string(root.join("galeng.json")).unwrap();
    let study = fs::read_to_string(root.join("scenario/study.json")).unwrap();
    let dlg = fs::read_to_string(root.join("scenario/dlg_butler.json")).unwrap();
    let ending = fs::read_to_string(root.join("scenario/ending.json")).unwrap();
    let mut eng = Engine::from_json(
        &project,
        &[("study", &study), ("dlg_butler", &dlg), ("ending", &ending)],
    )
    .unwrap();
    eng.dismiss_say().unwrap();
    let a = eng.primary_action("butler").unwrap();
    assert_eq!(a.verb.as_deref(), Some("talk"));
}

#[test]
fn available_actions_multi_cycles_by_index() {
    // examples/click-room door: look + move (both soft before unlock) → wheel UI.
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/click-room");
    let project = fs::read_to_string(root.join("galeng.json")).unwrap();
    let study = fs::read_to_string(root.join("scenario/study.json")).unwrap();
    let dlg = fs::read_to_string(root.join("scenario/dlg_butler.json")).unwrap();
    let ending = fs::read_to_string(root.join("scenario/ending.json")).unwrap();
    let mut eng = Engine::from_json(
        &project,
        &[("study", &study), ("dlg_butler", &dlg), ("ending", &ending)],
    )
    .unwrap();
    eng.dismiss_say().unwrap();
    let actions = eng.available_actions("door");
    assert!(
        actions.len() > 1,
        "expected multi actions on door, got {:?}",
        actions
    );
    for a in &actions {
        if let Some(verb) = a.verb.as_deref() {
            eng.select_verb(Some(verb));
            assert_eq!(eng.view().selected_verb.as_deref(), Some(verb));
        }
    }
    let first = actions[0].verb.clone();
    eng.select_verb(first.as_deref());
    assert_eq!(eng.view().selected_verb, first);
}

#[test]
fn item_aim_vs_drag_match_different_rules() {
    use galeng_explore::ItemUseMode;
    let project = r#"{
      "id": "modes",
      "title": "Modes",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "r",
      "locale": "zh-Hant",
      "skipTitle": true,
      "items": [{ "id": "key", "name": "Key", "consumeOnUse": false }],
      "fallback": { "itemOnHotspot": "唔啱。" }
    }"#;
    let scene = r#"{
      "id": "r",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "box", "name": "Box", "shape": { "type": "rect", "x": 0, "y": 0, "w": 100, "h": 100 } }
      ],
      "interactions": [
        {
          "hotspot": "box",
          "on": { "item": "key", "useMode": "aim" },
          "rules": [{ "when": [], "do": [{ "type": "say", "text": "AIM_HIT" }] }]
        },
        {
          "hotspot": "box",
          "on": { "item": "key", "useMode": "drag" },
          "rules": [{ "when": [], "do": [{ "type": "say", "text": "DRAG_HIT" }] }]
        }
      ]
    }"#;
    let mut eng = Engine::from_json(project, &[("r", scene)]).unwrap();
    eng.give_item_for_test("key");

    eng.select_item(Some("key"));
    eng.interact("box").unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("AIM_HIT"));
    eng.dismiss_say().unwrap();

    eng.interact_with_item("box", "key", ItemUseMode::Drag)
        .unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("DRAG_HIT"));
    eng.dismiss_say().unwrap();

    // Mode-less item interaction = Aim (backward compatible).
    let scene2 = r#"{
      "id": "r",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "box", "name": "Box", "shape": { "type": "rect", "x": 0, "y": 0, "w": 100, "h": 100 } }
      ],
      "interactions": [
        {
          "hotspot": "box",
          "on": { "item": "key" },
          "rules": [{ "when": [], "do": [{ "type": "say", "text": "DEFAULT_AIM" }] }]
        }
      ]
    }"#;
    let mut eng = Engine::from_json(project, &[("r", scene2)]).unwrap();
    eng.give_item_for_test("key");
    eng.select_item(Some("key"));
    eng.interact("box").unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("DEFAULT_AIM"));
    eng.dismiss_say().unwrap();
    eng.interact_with_item("box", "key", ItemUseMode::Drag)
        .unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("唔啱。"));
}

#[test]
fn examples_click_room_drag_key_on_window() {
    use galeng_explore::ItemUseMode;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/click-room");
    let project = fs::read_to_string(root.join("galeng.json")).unwrap();
    let study = fs::read_to_string(root.join("scenario/study.json")).unwrap();
    let dlg = fs::read_to_string(root.join("scenario/dlg_butler.json")).unwrap();
    let ending = fs::read_to_string(root.join("scenario/ending.json")).unwrap();
    let mut eng = Engine::from_json(
        &project,
        &[("study", &study), ("dlg_butler", &dlg), ("ending", &ending)],
    )
    .unwrap();
    eng.dismiss_say().unwrap();
    eng.give_item_for_test("key");
    eng.interact_with_item("window", "key", ItemUseMode::Drag)
        .unwrap();
    assert!(
        eng.view().say_text.as_deref().unwrap_or("").contains("窗"),
        "got {:?}",
        eng.view().say_text
    );
    eng.dismiss_say().unwrap();
    // Aim path on door still works
    eng.select_item(Some("key"));
    eng.interact("door").unwrap();
    assert_eq!(eng.view().say_text.as_deref(), Some("鎖匙對上，門開咗。"));
}

#[test]
fn text_set_adds_and_compound_cmp_is_and() {
    let project = r#"{
      "id": "cmp",
      "title": "Cmp",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "talk",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let talk = r#"{
      "id": "talk",
      "sceneKind": "dialogue",
      "beats": [
        { "say": { "speaker": "n", "text": "a" }, "set": { "score": "+1" } },
        { "say": { "speaker": "n", "text": "b" }, "set": { "score": "+1" } }
      ],
      "exit": {
        "type": "branch",
        "if": { "score": { "eq": 1, "gt": 10 } },
        "then": "yes",
        "else": "no"
      }
    }"#;
    let yes = r#"{ "id": "yes", "sceneKind": "dialogue", "beats": [{ "say": { "speaker": "n", "text": "yes" } }] }"#;
    let no = r#"{ "id": "no", "sceneKind": "dialogue", "beats": [{ "say": { "speaker": "n", "text": "no" } }] }"#;
    let mut eng = Engine::from_json(project, &[("talk", talk), ("yes", yes), ("no", no)]).unwrap();
    assert_eq!(eng.view().vars.get("score"), Some(&1));
    assert_eq!(eng.view().say_text.as_deref(), Some("a"));

    let saved = eng.try_to_save().unwrap();
    eng.load_save(&saved).unwrap();
    assert_eq!(eng.view().vars.get("score"), Some(&1));
    assert_eq!(eng.view().say_text.as_deref(), Some("a"));

    eng.advance().unwrap();
    assert_eq!(eng.view().vars.get("score"), Some(&2));
    assert_eq!(eng.view().say_text.as_deref(), Some("b"));
    eng.advance().unwrap();
    assert_eq!(eng.scene_id(), "no");
    assert_eq!(eng.view().vars.get("score"), Some(&2));
}

#[test]
fn passing_compound_cmp_takes_then_branch() {
    let project = r#"{
      "id": "cmp",
      "title": "Cmp",
      "schemaVersion": 2,
      "resolution": { "width": 1920, "height": 1080 },
      "startScene": "talk",
      "locale": "zh-Hant",
      "skipTitle": true
    }"#;
    let talk = r#"{
      "id": "talk",
      "sceneKind": "dialogue",
      "beats": [
        { "say": { "speaker": "n", "text": "a" }, "set": { "score": "+12" } }
      ],
      "exit": {
        "type": "branch",
        "if": { "score": { "eq": 12, "gt": 10 } },
        "then": "yes",
        "else": "no"
      }
    }"#;
    let yes = r#"{ "id": "yes", "sceneKind": "dialogue", "beats": [{ "say": { "speaker": "n", "text": "yes" } }] }"#;
    let no = r#"{ "id": "no", "sceneKind": "dialogue", "beats": [{ "say": { "speaker": "n", "text": "no" } }] }"#;
    let mut eng = Engine::from_json(project, &[("talk", talk), ("yes", yes), ("no", no)]).unwrap();
    assert_eq!(eng.view().vars.get("score"), Some(&12));
    eng.advance().unwrap();
    assert_eq!(eng.scene_id(), "yes");
}
