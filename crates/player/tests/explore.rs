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
    assert!(rt
        .view()
        .say_text
        .as_deref()
        .unwrap_or("")
        .contains("抽屜"));
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
