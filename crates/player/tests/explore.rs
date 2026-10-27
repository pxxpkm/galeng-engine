//! Player ↔ galeng-explore wiring: click-room clearance without SDL.

use galeng_player::{Phase, Runtime};
use galeng_schema::repo_root;

fn load_click_room() -> Runtime {
    Runtime::load_dir(repo_root().join("examples/click-room")).expect("load click-room")
}

fn dismiss_say(rt: &mut Runtime) {
    assert_eq!(rt.view().phase, Phase::Dialogue);
    assert!(rt.view().say_text.is_some());
    rt.click_advance();
}

#[test]
fn click_room_boots_explore_engine() {
    let rt = load_click_room();
    assert!(rt.uses_explore());
    assert_eq!(rt.view().phase, Phase::Dialogue);
    assert_eq!(rt.view().say_text.as_deref(), Some("你走進書房。"));
    assert_eq!(rt.view().scene_id, "study");
    assert_eq!(rt.view().bg.as_deref(), Some("bg/study"));
}

#[test]
fn click_room_clearance_path() {
    let mut rt = load_click_room();
    dismiss_say(&mut rt);
    assert_eq!(rt.view().phase, Phase::Explore);

    rt.select_verb(Some("open"));
    rt.interact_hotspot("desk");
    assert!(rt.view().say_text.as_deref().unwrap_or("").contains("抽屜"));
    dismiss_say(&mut rt);

    rt.select_verb(Some("take"));
    rt.interact_hotspot("desk");
    assert_eq!(rt.view().say_text.as_deref(), Some("拎到黃銅鎖匙。"));
    dismiss_say(&mut rt);
    assert!(rt.explore_inventory().iter().any(|i| i == "key"));

    rt.select_verb(Some("talk"));
    rt.interact_hotspot("butler");
    assert_eq!(rt.view().scene_id, "dlg_butler");
    assert_eq!(rt.view().phase, Phase::Dialogue);
    // BG should stay study while in called dialogue
    assert_eq!(rt.view().bg.as_deref(), Some("bg/study"));
    dismiss_say(&mut rt);
    dismiss_say(&mut rt);
    dismiss_say(&mut rt);
    assert_eq!(rt.view().scene_id, "study");
    assert_eq!(rt.view().phase, Phase::Explore);

    rt.select_item(Some("key"));
    rt.interact_hotspot("door");
    assert_eq!(rt.view().say_text.as_deref(), Some("鎖匙對上，門開咗。"));
    dismiss_say(&mut rt);
    assert!(!rt.explore_inventory().iter().any(|i| i == "key"));

    rt.select_verb(Some("move"));
    rt.interact_hotspot("door");
    assert_eq!(rt.view().scene_id, "ending");
    assert_eq!(
        rt.view().say_text.as_deref(),
        Some("你離開咗書房。— 結局 —")
    );
    dismiss_say(&mut rt);
    assert_eq!(rt.view().phase, Phase::Explore);
}

#[test]
fn dialogue_only_project_skips_explore() {
    let rt = Runtime::load_dir(repo_root().join("examples/prologue")).expect("prologue");
    assert!(!rt.uses_explore());
    assert_eq!(rt.view().phase, Phase::Dialogue);
}

#[test]
fn desk_primary_via_runtime() {
    let mut rt = load_click_room();
    dismiss_say(&mut rt);
    let a = rt.explore_primary_action("desk").expect("desk");
    assert_eq!(a.verb.as_deref(), Some("open"));

    rt.select_verb(Some("open"));
    rt.interact_hotspot("desk");
    dismiss_say(&mut rt);

    let a = rt.explore_primary_action("desk").expect("desk2");
    assert_eq!(a.verb.as_deref(), Some("take"));
}

#[test]
fn empty_click_via_runtime() {
    let mut rt = load_click_room();
    dismiss_say(&mut rt);
    let a = rt.explore_empty_action().expect("empty");
    assert!(a.label.contains("看"));
    rt.interact_empty();
    assert!(
        rt.view().say_text.as_deref().unwrap_or("").contains("書房")
            || rt.view().say_text.as_deref().unwrap_or("").contains("靜謐")
    );
}

#[test]
fn door_available_actions_multi() {
    let mut rt = load_click_room();
    dismiss_say(&mut rt);
    let actions = rt.explore_available_actions("door");
    assert!(actions.len() > 1, "{:?}", actions);
}

#[test]
fn drag_key_window_via_runtime() {
    use galeng_player::ItemUseMode;
    let mut rt = load_click_room();
    dismiss_say(&mut rt);
    // give key without opening desk
    rt.select_verb(Some("open"));
    rt.interact_hotspot("desk");
    dismiss_say(&mut rt);
    rt.select_verb(Some("take"));
    rt.interact_hotspot("desk");
    dismiss_say(&mut rt);
    assert!(rt.explore_inventory().iter().any(|i| i == "key"));
    rt.interact_with_item("window", "key", ItemUseMode::Drag);
    assert!(
        rt.view().say_text.as_deref().unwrap_or("").contains("窗"),
        "{:?}",
        rt.view().say_text
    );
}

#[test]
fn click_room_save_restores_key_switch_and_call() {
    let mut rt = load_click_room();
    dismiss_say(&mut rt);
    rt.select_verb(Some("open"));
    rt.interact_hotspot("desk");
    dismiss_say(&mut rt);
    rt.select_verb(Some("take"));
    rt.interact_hotspot("desk");
    dismiss_say(&mut rt);
    rt.select_verb(Some("talk"));
    rt.interact_hotspot("butler");
    assert_eq!(rt.view().scene_id, "dlg_butler");
    assert_eq!(rt.view().say_text.as_deref(), Some("少爺，書房落鎖咗。"));

    let save = rt.try_to_save().expect("butler line is saveable");
    assert_eq!(save.save_format, galeng_player::save::SAVE_FORMAT);
    let explore = save.explore.as_ref().expect("explore blob");
    assert_eq!(explore.scene_id, "dlg_butler");
    assert_eq!(explore.call_stack.len(), 1);
    assert!(explore.inventory.contains("key"));
    assert_eq!(explore.switches.get("drawer_open"), Some(&true));
    assert_eq!(explore.say_text.as_deref(), Some("少爺，書房落鎖咗。"));

    let tmp = std::env::temp_dir().join(format!("galeng-k1-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    galeng_player::save::write_slot(&tmp, 1, &save).unwrap();
    let from_disk = galeng_player::save::read_slot(&tmp, 1).unwrap();

    let mut loaded = load_click_room();
    assert_eq!(loaded.view().say_text.as_deref(), Some("你走進書房。"));
    loaded.apply_save(&from_disk).unwrap();
    assert_eq!(loaded.view().scene_id, "dlg_butler");
    assert_eq!(
        loaded.view().say_text.as_deref(),
        Some("少爺，書房落鎖咗。")
    );
    assert!(loaded.explore_inventory().iter().any(|id| id == "key"));
    dismiss_say(&mut loaded);
    assert_eq!(
        loaded.view().say_text.as_deref(),
        Some("鎖匙應該喺書枱抽屜度。")
    );
    dismiss_say(&mut loaded);
    dismiss_say(&mut loaded);
    assert_eq!(loaded.view().scene_id, "study");
    assert_eq!(loaded.view().phase, Phase::Explore);
    assert!(loaded.explore_inventory().iter().any(|id| id == "key"));

    let mut legacy = serde_json::to_value(&save).unwrap();
    legacy.as_object_mut().unwrap().remove("explore");
    let legacy: galeng_player::save::SaveGame = serde_json::from_value(legacy).unwrap();
    let mut fresh = load_click_room();
    let before = fresh.view().say_text.clone();
    assert!(fresh.apply_save(&legacy).is_err());
    assert_eq!(fresh.view().say_text, before);
    let _ = std::fs::remove_dir_all(&tmp);
}

#[test]
fn explore_save_restores_room_var_hotspot_and_choices() {
    let root = std::env::temp_dir().join(format!("galeng-k1-fix-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("scenario")).unwrap();
    std::fs::write(
        root.join("galeng.json"),
        r#"{
          "id": "savefix",
          "title": "Save",
          "schemaVersion": 2,
          "resolution": { "width": 1920, "height": 1080 },
          "startScene": "room",
          "locale": "zh-Hant",
          "skipTitle": true,
          "items": [{ "id": "key", "name": "Key" }],
          "switches": [{ "id": "got", "name": "Got", "init": false }]
        }"#,
    )
    .unwrap();
    std::fs::write(
        root.join("scenario/room.json"),
        r#"{
          "id": "room",
          "title": "房",
          "sceneKind": "explore",
          "hotspots": [
            { "id": "chest", "name": "箱", "shape": { "type": "rect", "x": 0, "y": 0, "w": 40, "h": 40 } },
            { "id": "npc", "name": "人", "shape": { "type": "rect", "x": 100, "y": 0, "w": 40, "h": 40 } }
          ],
          "interactions": [
            {
              "hotspot": "chest",
              "on": { "verb": "look" },
              "rules": [{ "when": [], "do": [
                { "type": "setSwitch", "id": "got", "value": true },
                { "type": "setVar", "id": "score", "value": 4 },
                { "type": "hideHotspot", "id": "chest" },
                { "type": "giveItem", "id": "key" },
                { "type": "say", "text": "got" }
              ]}]
            },
            {
              "hotspot": "npc",
              "on": { "verb": "talk" },
              "rules": [{ "when": [], "do": [{ "type": "call", "scene": "ask" }] }]
            }
          ]
        }"#,
    )
    .unwrap();
    std::fs::write(
        root.join("scenario/hall.json"),
        r#"{ "id": "hall", "title": "走廊", "sceneKind": "explore" }"#,
    )
    .unwrap();
    std::fs::write(
        root.join("scenario/ask.json"),
        r#"{
          "id": "ask",
          "title": "問",
          "sceneKind": "dialogue",
          "beats": [],
          "exit": { "type": "choices", "options": [{ "text": "走", "goto": "hall" }] }
        }"#,
    )
    .unwrap();

    let mut rt = Runtime::load_dir(&root).unwrap();
    assert_eq!(rt.view().phase, Phase::Explore);
    assert_eq!(rt.explore_hit(10, 10).as_deref(), Some("chest"));
    rt.select_verb(Some("look"));
    rt.interact_hotspot("chest");
    assert_eq!(rt.view().say_text.as_deref(), Some("got"));
    dismiss_say(&mut rt);
    assert!(rt.explore_hit(10, 10).is_none());

    rt.select_verb(Some("talk"));
    rt.interact_hotspot("npc");
    assert_eq!(rt.view().phase, Phase::Choices);
    assert_eq!(rt.view().scene_id, "ask");
    let save = rt.try_to_save().unwrap();
    let explore = save.explore.as_ref().unwrap();
    assert_eq!(explore.call_stack.len(), 1);
    assert_eq!(explore.vars.get("score"), Some(&4));
    assert_eq!(explore.switches.get("got"), Some(&true));
    assert!(explore.inventory.contains("key"));
    assert_eq!(explore.hotspot_visible.get("room\tchest"), Some(&false));

    let mut loaded = Runtime::load_dir(&root).unwrap();
    loaded.apply_save(&save).unwrap();
    assert_eq!(loaded.view().phase, Phase::Choices);
    assert_eq!(loaded.view().scene_id, "ask");
    assert!(loaded.explore_inventory().iter().any(|id| id == "key"));
    let round = loaded.try_to_save().unwrap();
    let round_ex = round.explore.as_ref().unwrap();
    assert_eq!(round_ex.call_stack, explore.call_stack);
    assert_eq!(round_ex.hotspot_visible, explore.hotspot_visible);
    assert_eq!(round_ex.vars, explore.vars);
    assert!(loaded.choose(0));
    assert_eq!(loaded.view().scene_id, "hall");
    let hall = loaded.try_to_save().unwrap();
    let hall_ex = hall.explore.as_ref().unwrap();
    assert_eq!(hall_ex.scene_id, "hall");
    assert!(hall_ex.inventory.contains("key"));
    assert_eq!(hall_ex.vars.get("score"), Some(&4));
    assert_eq!(hall_ex.hotspot_visible.get("room\tchest"), Some(&false));

    let mut again = Runtime::load_dir(&root).unwrap();
    again.apply_save(&hall).unwrap();
    assert_eq!(again.view().scene_id, "hall");
    assert!(again.explore_inventory().iter().any(|id| id == "key"));
    let _ = std::fs::remove_dir_all(&root);
}
