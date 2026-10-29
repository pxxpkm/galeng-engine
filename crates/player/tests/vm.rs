use std::fs;

use galeng_player::save::{read_slot, write_slot, AUTO_SLOT};
use galeng_player::seen::Seen;
use galeng_player::{Phase, Runtime};
use galeng_schema::repo_root;

#[test]
fn save_round_trip_restores_vars_and_scene() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("要不要一起走走？"));
    let mid = rt.to_save();
    rt.click_advance();
    rt.choose(0);
    assert_eq!(rt.vars().get("sora_affection"), Some(&1));
    let with_var = rt.to_save();
    let tmp = std::env::temp_dir().join(format!("galeng-part26-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    write_slot(&tmp, 1, &mid).unwrap();
    write_slot(&tmp, 0, &with_var).unwrap();

    let mut rt2 = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt2.apply_save(&read_slot(&tmp, 1).unwrap()).unwrap();
    assert_eq!(rt2.view().say_text.as_deref(), Some("要不要一起走走？"));
    assert_eq!(rt2.view().scene_id, "park_01");

    let mut rt3 = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt3.apply_save(&read_slot(&tmp, 0).unwrap()).unwrap();
    assert_eq!(rt3.vars().get("sora_affection"), Some(&1));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn choose_autosave_writes_slot_99_not_00() {
    let tmp = std::env::temp_dir().join(format!("galeng-part44-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap();
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    assert!(!rt.choose(0));
    assert!(read_slot(&tmp, AUTO_SLOT).is_err());
    rt.click_advance();
    rt.click_advance();
    assert!(rt.choose(1));
    write_slot(&tmp, AUTO_SLOT, &rt.to_save()).unwrap();
    let save = read_slot(&tmp, AUTO_SLOT).unwrap();
    assert_eq!(save.scene, "home_01");
    assert!(read_slot(&tmp, 0).is_err());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn fx_wait_and_solo_shake_hold() {
    let tmp = std::env::temp_dir().join(format!("galeng-part47-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("fx");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/fx.json"),
        r#"{
          "id": "fx",
          "beats": [
            { "fx": { "type": "wait", "ms": 250 } },
            { "fx": { "type": "shake" }, "say": { "speaker": "n", "text": "抖" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().fx_wait_ms, Some(250));
    assert!(rt.fx_holds());
    assert_eq!(rt.view().say_text, None);
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("抖"));
    assert_eq!(rt.view().fx_shake_ms, Some(400));
    assert!(!rt.fx_holds());

    fs::write(
        tmp.join("scenario/fx.json"),
        r#"{
          "id": "fx",
          "beats": [
            { "fx": { "type": "shake", "ms": 180 } },
            { "say": { "speaker": "n", "text": "後" } }
          ]
        }"#,
    )
    .unwrap();
    let rt2 = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt2.view().fx_shake_ms, Some(180));
    assert!(rt2.fx_holds());
    assert_eq!(rt2.view().say_text, None);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn leaving_first_line_marks_it_read() {
    let tmp = std::env::temp_dir().join(format!("galeng-part46-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap();
    let mut seen = Seen::load(tmp.join("seen.json"));
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    let scene = rt.view().scene_id.clone();
    let beat = rt.view().beat_index;
    assert!(!seen.is_read(&scene, beat, None));
    seen.note_read(&scene, beat, None);
    rt.click_advance();
    assert!(seen.is_read(&scene, beat, None));
    assert!(!seen.is_read(&rt.view().scene_id, rt.view().beat_index, None));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn save_label_uses_scene_title() {
    let rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    let save = rt.to_save();
    let label = save.label.expect("label");
    assert!(label.contains("公園"), "got {label}");
}

#[test]
fn first_line_is_chinese() {
    let rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    let view = rt.view();
    assert_eq!(view.say_text.as_deref(), Some("今天風真好。"));
    assert_eq!(view.phase, Phase::Dialogue);
    assert_eq!(view.scene_id, "park_01");
    assert_eq!(view.cg, None);
}

#[test]
fn two_clicks_reach_choices_then_home() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("要不要一起走走？"));
    assert_eq!(rt.view().cg.as_deref(), Some("cg/op_still"));
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Choices);
    assert_eq!(rt.view().cg.as_deref(), Some("cg/op_still"));
    assert_eq!(rt.view().choices.len(), 2);

    rt.choose(1);
    let view = rt.view();
    assert_eq!(view.scene_id, "home_01");
    assert_eq!(view.say_text.as_deref(), Some("那就下次再出來吧。"));
    assert_eq!(view.cg, None);
}

#[test]
fn jump_back_same_scene_from_choices() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.click_advance();
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Choices);
    let first = rt.backlog()[0].clone();
    assert!(rt.jump_back(&first.scene, first.beat_index));
    assert_eq!(rt.view().phase, Phase::Dialogue);
    assert_eq!(rt.view().say_text.as_deref(), Some("今天風真好。"));
    assert_eq!(rt.view().beat_index, first.beat_index);
    assert_eq!(rt.view().cg, None);
}

#[test]
fn jump_back_other_scene_restores_line_and_bgm() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.click_advance();
    rt.click_advance();
    rt.choose(1);
    assert_eq!(rt.view().scene_id, "home_01");
    let affection_before = rt.vars().get("sora_affection").copied();
    let park = rt
        .backlog()
        .iter()
        .find(|line| line.scene == "park_01" && line.text == "今天風真好。")
        .unwrap()
        .clone();
    assert!(rt.jump_back(&park.scene, park.beat_index));
    let view = rt.view();
    assert_eq!(view.scene_id, "park_01");
    assert_eq!(view.phase, Phase::Dialogue);
    assert_eq!(view.say_text.as_deref(), Some("今天風真好。"));
    assert_eq!(view.bgm.as_deref(), Some("bgm/park"));
    assert_eq!(view.cg, None);
    assert_eq!(rt.vars().get("sora_affection").copied(), affection_before);
}

#[test]
fn restart_returns_to_first_line() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.click_advance();
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Choices);
    rt.restart().unwrap();
    assert_eq!(rt.view().say_text.as_deref(), Some("今天風真好。"));
    assert_eq!(rt.view().scene_id, "park_01");
    assert_eq!(rt.backlog().len(), 1);
}

#[test]
fn backlog_keeps_shown_lines() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    assert_eq!(rt.backlog().len(), 1);
    assert_eq!(rt.backlog()[0].text, "今天風真好。");
    rt.click_advance();
    assert_eq!(rt.backlog().len(), 2);
    assert_eq!(rt.backlog()[1].text, "要不要一起走走？");
    let mid = rt.to_save();
    rt.click_advance();
    rt.choose(1);
    assert_eq!(rt.backlog().len(), 3);
    assert_eq!(rt.backlog()[2].text, "那就下次再出來吧。");
    assert_eq!(rt.backlog()[0].scene, "park_01");
    assert_eq!(rt.backlog()[2].scene, "home_01");

    rt.apply_save(&mid).unwrap();
    assert_eq!(rt.backlog().len(), 3);
    assert_eq!(rt.view().say_text.as_deref(), Some("要不要一起走走？"));
}

#[test]
fn affection_choice_reaches_park_02() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    rt.click_advance();
    rt.click_advance();
    rt.choose(0);
    assert_eq!(rt.vars().get("sora_affection"), Some(&1));
    assert_eq!(rt.view().scene_id, "park_02");
    assert_eq!(
        rt.view().say_text.as_deref(),
        Some("那就走吧。風還會再吹一會兒。")
    );
}

#[test]
fn missing_goto_is_missing_scene() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part59-missing-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("gone");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/gone.json"),
        r#"{
          "id": "gone",
          "beats": [{}],
          "exit": { "type": "next", "goto": "nowhere" }
        }"#,
    )
    .unwrap();
    let rt = Runtime::load_dir(&tmp).unwrap();
    match rt.view().phase {
        Phase::MissingScene(id) => assert_eq!(id, "nowhere"),
        other => panic!("expected missing nowhere, got {other:?}"),
    }
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn auto_advance_ms_is_reported() {
    let tmp = std::env::temp_dir().join(format!("galeng-part24-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("auto");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/auto.json"),
        r#"{
          "id": "auto",
          "beats": [{
            "say": {
              "speaker": "n",
              "text": "等",
              "voice": "voice/sora/001",
              "autoAdvance": { "type": "ms", "ms": 2500 }
            }
          }]
        }"#,
    )
    .unwrap();
    let rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().auto_advance_ms, Some(2500));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn seeing_second_line_unlocks_by_asset_path() {
    let tmp = std::env::temp_dir().join(format!("galeng-part42-play-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap();
    let path = tmp.join("seen.json");
    let mut seen = Seen::load(path);
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    if let Some(cg) = rt.view().cg.as_deref() {
        seen.note(cg);
    }
    assert!(!seen.has("cg/op_still"));
    rt.click_advance();
    if let Some(cg) = rt.view().cg.as_deref() {
        seen.note(cg);
    }
    assert!(seen.has("cg/op_still"));
    assert!(!seen.has("op_still"));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn cg_null_closes_within_scene() {
    let tmp = std::env::temp_dir().join(format!("galeng-part41-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("still");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/still.json"),
        r#"{
          "id": "still",
          "beats": [
            { "cg": "cg/op_still", "say": { "speaker": "n", "text": "圖" } },
            { "cg": null, "say": { "speaker": "n", "text": "關" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().cg.as_deref(), Some("cg/op_still"));
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("關"));
    assert_eq!(rt.view().cg, None);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn amb_inherits_stops_and_does_not_cross_scene() {
    let tmp = std::env::temp_dir().join(format!("galeng-part91-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("rain");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/rain.json"),
        r#"{
          "id": "rain",
          "beats": [
            { "amb": "se/breeze", "say": { "speaker": "n", "text": "雨" } },
            { "say": { "speaker": "n", "text": "還在" } },
            { "amb": null, "say": { "speaker": "n", "text": "停" } }
          ],
          "exit": { "type": "next", "goto": "dry" }
        }"#,
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/dry.json"),
        r#"{
          "id": "dry",
          "beats": [
            { "say": { "speaker": "n", "text": "靜" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().amb.as_deref(), Some("se/breeze"));
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("還在"));
    assert_eq!(rt.view().amb.as_deref(), Some("se/breeze"));
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("停"));
    assert_eq!(rt.view().amb, None);
    rt.click_advance();
    assert_eq!(rt.view().scene_id, "dry");
    assert_eq!(rt.view().say_text.as_deref(), Some("靜"));
    assert_eq!(rt.view().amb, None);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn say_interpolates_ident_and_missing_zero() {
    let tmp = std::env::temp_dir().join(format!("galeng-part92-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("ask");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/ask.json"),
        r#"{
          "id": "ask",
          "beats": [
            { "say": { "speaker": "n", "text": "無 {gone}、式 {sora_affection+1}" } }
          ],
          "exit": {
            "type": "choices",
            "options": [
              { "text": "加", "goto": "told", "set": { "sora_affection": "+1" } }
            ]
          }
        }"#,
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/told.json"),
        r#"{
          "id": "told",
          "beats": [
            { "say": { "speaker": "n", "text": "好感 {sora_affection}" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(
        rt.view().say_text.as_deref(),
        Some("無 0、式 {sora_affection+1}")
    );
    rt.click_advance();
    assert!(rt.choose(0));
    assert_eq!(rt.view().scene_id, "told");
    assert_eq!(rt.view().say_text.as_deref(), Some("好感 1"));
    assert_eq!(rt.vars().get("sora_affection"), Some(&1));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn char_slide_without_say_holds() {
    let tmp = std::env::temp_dir().join(format!("galeng-part98-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("walk");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/walk.json"),
        r#"{
          "id": "walk",
          "beats": [
            { "chars": [{ "id": "sora", "face": "smile", "slot": "left" }], "say": { "speaker": "n", "text": "走" } },
            { "chars": [{ "id": "sora", "face": "smile", "slot": "center", "slideMs": 300 }] },
            { "say": { "speaker": "n", "text": "到了" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().say_text.as_deref(), Some("走"));
    assert_eq!(rt.view().chars[0].slot, galeng_schema::Slot::Left);
    assert_eq!(rt.view().char_slide_ms, None);
    rt.click_advance();
    assert_eq!(rt.view().chars[0].slot, galeng_schema::Slot::Center);
    assert_eq!(rt.view().char_slide_ms, Some(300));
    assert!(rt.fx_holds());
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("到了"));
    assert_eq!(rt.view().char_slide_ms, None);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn flash_without_say_holds_then_advances() {
    let tmp = std::env::temp_dir().join(format!("galeng-part96-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("zap");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/zap.json"),
        r#"{
          "id": "zap",
          "beats": [
            { "fx": { "type": "flash", "ms": 80 } },
            { "say": { "speaker": "n", "text": "過了" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().fx_flash_ms, Some(80));
    assert!(rt.fx_holds());
    assert_eq!(rt.view().say_text, None);
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("過了"));
    assert_eq!(rt.view().fx_flash_ms, None);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn beat_set_applies_once_on_advance_and_load() {
    let tmp = std::env::temp_dir().join(format!("galeng-k4-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::write(
        tmp.join("galeng.json"),
        r#"{
          "id": "k4",
          "title": "K4",
          "schemaVersion": 2,
          "resolution": { "width": 1920, "height": 1080 },
          "startScene": "a",
          "locale": "zh-Hant",
          "skipTitle": true
        }"#,
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/a.json"),
        r#"{
          "id": "a",
          "beats": [
            { "say": { "speaker": "n", "text": "one {score}" }, "set": { "score": "+1" } },
            { "say": { "speaker": "n", "text": "two {score}" }, "set": { "score": "+1" } }
          ],
          "exit": {
            "type": "branch",
            "if": { "score": { "eq": 1, "gt": 10 } },
            "then": "yes",
            "else": "no"
          }
        }"#,
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/yes.json"),
        r#"{ "id": "yes", "beats": [{ "say": { "speaker": "n", "text": "yes" } }] }"#,
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/no.json"),
        r#"{ "id": "no", "beats": [{ "say": { "speaker": "n", "text": "no" } }] }"#,
    )
    .unwrap();

    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.vars().get("score"), Some(&1));
    assert_eq!(rt.view().say_text.as_deref(), Some("one 1"));
    let mid = rt.to_save();
    rt.apply_save(&mid).unwrap();
    assert_eq!(rt.vars().get("score"), Some(&1));
    assert_eq!(rt.view().say_text.as_deref(), Some("one 1"));

    rt.click_advance();
    assert_eq!(rt.vars().get("score"), Some(&2));
    assert_eq!(rt.view().say_text.as_deref(), Some("two 2"));
    rt.apply_save(&rt.to_save()).unwrap();
    assert_eq!(rt.vars().get("score"), Some(&2));

    rt.click_advance();
    assert_eq!(rt.view().scene_id, "no");
    assert_eq!(rt.vars().get("score"), Some(&2));

    let landed = rt.backlog()[0].clone();
    assert!(rt.jump_back(&landed.scene, landed.beat_index));
    assert_eq!(rt.view().say_text.as_deref(), Some("one 2"));
    assert_eq!(rt.vars().get("score"), Some(&2));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn camera_inherits_resets_and_does_not_cross_scene() {
    let tmp = std::env::temp_dir().join(format!("galeng-part93-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("near");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/near.json"),
        r#"{
          "id": "near",
          "beats": [
            { "camera": { "x": 80, "zoom": 160 }, "say": { "speaker": "n", "text": "近" } },
            { "say": { "speaker": "n", "text": "仍近" } },
            { "camera": null, "say": { "speaker": "n", "text": "遠" } }
          ],
          "exit": { "type": "next", "goto": "wide" }
        }"#,
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/wide.json"),
        r#"{
          "id": "wide",
          "beats": [
            { "say": { "speaker": "n", "text": "原點" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().camera.x, 80);
    assert_eq!(rt.view().camera.zoom, 160);
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("仍近"));
    assert_eq!(rt.view().camera.x, 80);
    assert_eq!(rt.view().camera.zoom, 160);
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("遠"));
    assert!(rt.view().camera.is_identity());
    rt.click_advance();
    assert_eq!(rt.view().scene_id, "wide");
    assert!(rt.view().camera.is_identity());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn choice_if_hides_unmet_option() {
    let tmp = std::env::temp_dir().join(format!("galeng-part22-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("gate");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/gate.json"),
        r#"{
          "id": "gate",
          "beats": [{ "say": { "speaker": "n", "text": "選" } }],
          "exit": {
            "type": "choices",
            "options": [
              { "text": "hidden", "goto": "a", "if": { "flag": { "gte": 1 } } },
              { "text": "visible", "goto": "b" }
            ]
          }
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().say_text.as_deref(), Some("選"));
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Choices);
    assert_eq!(rt.view().choices.len(), 1);
    assert_eq!(rt.view().choices[0].text, "visible");
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn movie_beat_holds_and_skip_advances() {
    let tmp = std::env::temp_dir().join(format!("galeng-part52-{}-vm", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    let mut project: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("examples/prologue/galeng.json")).unwrap(),
    )
    .unwrap();
    project["startScene"] = serde_json::json!("op");
    fs::write(tmp.join("galeng.json"), project.to_string()).unwrap();
    fs::write(
        tmp.join("scenario/op.json"),
        r#"{
          "id": "op",
          "beats": [
            { "movie": { "asset": "movie/missing_clip" } },
            { "say": { "speaker": "n", "text": "後" } }
          ]
        }"#,
    )
    .unwrap();
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().movie.as_deref(), Some("movie/missing_clip"));
    assert!(rt.movie_holds());
    assert_eq!(rt.view().say_text, None);
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("後"));
    assert!(!rt.movie_holds());
    assert_eq!(rt.view().movie, None);
    let _ = fs::remove_dir_all(&tmp);
}

fn write_k2_project(tmp: &std::path::Path, start: &str, scenes: &[(&str, &str)]) {
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::write(
        tmp.join("galeng.json"),
        format!(
            r#"{{
              "id": "k2",
              "title": "K2",
              "schemaVersion": 2,
              "resolution": {{ "width": 1920, "height": 1080 }},
              "startScene": "{start}",
              "locale": "zh-Hant",
              "skipTitle": true
            }}"#
        ),
    )
    .unwrap();
    for (id, body) in scenes {
        fs::write(tmp.join(format!("scenario/{id}.json")), body).unwrap();
    }
}

#[test]
fn k2_dialogue_next_enters_that_explore_room() {
    let tmp = std::env::temp_dir().join(format!("galeng-k2-next-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let talk = r#"{
      "id": "talk",
      "beats": [{ "say": { "speaker": "n", "text": "go" } }],
      "exit": { "type": "next", "goto": "room" }
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "hotspots": [
        { "id": "desk", "name": "Desk", "shape": { "type": "rect", "x": 0, "y": 0, "w": 40, "h": 40 } }
      ],
      "onEnter": [
        { "type": "say", "text": "entered" },
        { "type": "setSwitch", "id": "entered", "value": true }
      ]
    }"#;
    write_k2_project(&tmp, "talk", &[("talk", talk), ("room", room)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert!(!rt.uses_explore());
    assert_eq!(rt.view().say_text.as_deref(), Some("go"));
    assert_eq!(rt.project.start_scene, "talk");
    rt.click_advance();
    assert_eq!(rt.view().scene_id, "room");
    assert_eq!(rt.view().phase, Phase::Dialogue);
    assert_eq!(rt.view().say_text.as_deref(), Some("entered"));
    assert_ne!(rt.explore_switch("entered"), Some(true));
    assert!(rt.uses_explore());
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Explore);
    assert_eq!(rt.view().scene_id, "room");
    assert!(!rt.explore_hotspots().is_empty());
    assert_eq!(rt.explore_switch("entered"), Some(true));
    assert_eq!(rt.view().say_text, None);
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Explore);
    assert_eq!(rt.view().say_text, None);
    assert_eq!(rt.explore_switch("entered"), Some(true));
    assert_eq!(rt.project.start_scene, "talk");
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn k2_dialogue_call_explore_returns_to_caller_end() {
    let tmp = std::env::temp_dir().join(format!("galeng-k2-call-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let talk = r#"{
      "id": "talk",
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
    write_k2_project(&tmp, "talk", &[("talk", talk), ("room", room)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().say_text.as_deref(), Some("go"));
    rt.click_advance();
    assert_ne!(rt.view().phase, Phase::Ended);
    assert_eq!(rt.view().scene_id, "room");
    assert_eq!(rt.view().say_text.as_deref(), Some("entered"));
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Explore);
    assert!(!rt.explore_hotspots().is_empty());
    assert_eq!(rt.explore_switch("entered"), Some(true));
    rt.select_verb(Some("look"));
    rt.interact_hotspot("door");
    assert_eq!(rt.view().phase, Phase::Ended);
    assert_eq!(rt.view().scene_id, "talk");
    assert_eq!(rt.view().beat_index, 1);
    assert_eq!(rt.view().say_text, None);
    assert_eq!(rt.explore_switch("entered"), Some(true));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn k2_dialogue_call_dialogue_returns_past_the_call_site() {
    let tmp = std::env::temp_dir().join(format!("galeng-k2-dlg-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let a = r#"{
      "id": "A",
      "beats": [{ "say": { "speaker": "A", "text": "go" } }],
      "exit": { "type": "call", "scene": "B" }
    }"#;
    let b = r#"{
      "id": "B",
      "beats": [{ "say": { "speaker": "B", "text": "back" } }],
      "exit": { "type": "return" }
    }"#;
    write_k2_project(&tmp, "A", &[("A", a), ("B", b)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    rt.click_advance();
    assert_ne!(rt.view().phase, Phase::Ended);
    assert_eq!(rt.view().scene_id, "B");
    assert_eq!(rt.view().say_text.as_deref(), Some("back"));
    rt.click_advance();
    assert_eq!(rt.view().phase, Phase::Ended);
    assert_eq!(rt.view().scene_id, "A");
    assert_eq!(rt.view().beat_index, 1);
    assert_eq!(rt.view().say_text, None);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn k2_top_level_return_is_an_error_not_ended() {
    let tmp = std::env::temp_dir().join(format!("galeng-k2-ret-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let talk = r#"{
      "id": "talk",
      "beats": [{ "say": { "speaker": "n", "text": "bye" } }],
      "exit": { "type": "return" }
    }"#;
    write_k2_project(&tmp, "talk", &[("talk", talk)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().say_text.as_deref(), Some("bye"));
    rt.click_advance();
    match rt.view().phase {
        Phase::MissingScene(msg) => assert!(msg.contains("return"), "{msg}"),
        other => panic!("expected return error, got {other:?}"),
    }
    let _ = fs::remove_dir_all(&tmp);
}

/// K3: a dialogue called from an explore room uses dialogue accumulation.
/// A hotspot line in the room keeps the room plate and empty portraits.
#[test]
fn k3_called_dialogue_uses_dialogue_view() {
    let tmp = std::env::temp_dir().join(format!("galeng-k3-call-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "bg": { "asset": "bg/room" },
      "hotspots": [
        { "id": "npc", "name": "Npc", "shape": { "type": "rect", "x": 0, "y": 0, "w": 20, "h": 20 }, "defaultVerb": "talk" }
      ],
      "interactions": [{
        "hotspot": "npc",
        "on": { "verb": "talk" },
        "rules": [{ "when": [], "do": [{ "type": "call", "scene": "talk" }] }]
      }]
    }"#;
    let talk = r#"{
      "id": "talk",
      "sceneKind": "dialogue",
      "beats": [
        {
          "bg": { "asset": "bg/dlg" },
          "chars": [{ "id": "sora", "face": "smile", "slot": "left" }],
          "cg": "cg/still",
          "amb": "amb/room",
          "bgm": { "asset": "bgm/talk", "fadeMs": 200 },
          "camera": { "x": 12, "y": -4, "zoom": 110 },
          "movie": { "asset": "movie/op" },
          "say": { "speaker": "sora", "text": "line-a", "voice": "voice/sora/1" }
        },
        {
          "chars": [{ "id": "sora", "face": "smile", "slot": "center", "slideMs": 300 }],
          "cg": null,
          "say": { "speaker": "sora", "text": "line-b", "voice": "voice/sora/2" }
        }
      ],
      "exit": { "type": "return" }
    }"#;
    write_k2_project(&tmp, "room", &[("room", room), ("talk", talk)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().scene_id, "room");
    assert!(rt.view().chars.is_empty());
    rt.interact_hotspot("npc");
    let view = rt.view();
    assert_eq!(view.scene_id, "talk");
    assert_eq!(view.phase, Phase::Dialogue);
    assert_eq!(view.say_text.as_deref(), Some("line-a"));
    assert_eq!(view.say_speaker.as_deref(), Some("sora"));
    assert_eq!(view.bg.as_deref(), Some("bg/dlg"));
    assert_eq!(view.chars.len(), 1);
    assert_eq!(view.chars[0].id, "sora");
    assert_eq!(view.chars[0].slot, galeng_schema::Slot::Left);
    assert!(view.prev_chars.is_empty());
    assert_eq!(view.voice.as_deref(), Some("voice/sora/1"));
    assert_eq!(view.cg.as_deref(), Some("cg/still"));
    assert_eq!(view.amb.as_deref(), Some("amb/room"));
    assert_eq!(view.movie.as_deref(), Some("movie/op"));
    assert_eq!(view.bgm.as_deref(), Some("bgm/talk"));
    assert_eq!(view.bgm_fade_ms, 200);
    assert_eq!(view.camera.x, 12);
    assert_eq!(view.camera.zoom, 110);
    rt.click_advance();
    let view = rt.view();
    assert_eq!(view.say_text.as_deref(), Some("line-b"));
    assert_eq!(view.chars[0].slot, galeng_schema::Slot::Center);
    assert_eq!(view.prev_chars[0].slot, galeng_schema::Slot::Left);
    assert_eq!(view.char_slide_ms, Some(300));
    assert_eq!(view.voice.as_deref(), Some("voice/sora/2"));
    assert_eq!(view.cg, None);
    assert_eq!(view.amb.as_deref(), Some("amb/room"));
    assert_eq!(view.movie, None);
    assert_eq!(view.bg.as_deref(), Some("bg/dlg"));
    rt.click_advance();
    let view = rt.view();
    assert_eq!(view.scene_id, "room");
    assert_eq!(view.phase, Phase::Explore);
    assert!(view.chars.is_empty());
    assert_eq!(view.voice, None);
    assert_eq!(view.cg, None);
    assert_eq!(view.amb, None);
    assert_eq!(view.bg.as_deref(), Some("bg/room"));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn k3_hotspot_say_keeps_room_plate_and_empty_portraits() {
    let tmp = std::env::temp_dir().join(format!("galeng-k3-hot-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "bg": { "asset": "bg/room" },
      "beats": [
        {
          "chars": [{ "id": "sora", "face": "smile", "slot": "left" }],
          "cg": "cg/should-not-show",
          "amb": "amb/should-not-show",
          "say": { "speaker": "sora", "text": "not a hotspot line", "voice": "voice/nope" }
        }
      ],
      "hotspots": [
        { "id": "desk", "name": "Desk", "shape": { "type": "rect", "x": 0, "y": 0, "w": 20, "h": 20 }, "defaultVerb": "look" }
      ],
      "interactions": [{
        "hotspot": "desk",
        "on": { "verb": "look" },
        "rules": [{ "when": [], "do": [{ "type": "say", "speaker": "n", "text": "a desk" }] }]
      }]
    }"#;
    write_k2_project(&tmp, "room", &[("room", room)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert!(rt.view().chars.is_empty());
    assert_eq!(rt.view().bg.as_deref(), Some("bg/room"));
    rt.interact_hotspot("desk");
    let view = rt.view();
    assert_eq!(view.scene_id, "room");
    assert_eq!(view.phase, Phase::Dialogue);
    assert_eq!(view.say_text.as_deref(), Some("a desk"));
    assert_eq!(view.say_speaker.as_deref(), Some("n"));
    assert_eq!(view.bg.as_deref(), Some("bg/room"));
    assert!(view.chars.is_empty(), "hotspot lines do not take beat portraits");
    assert!(view.prev_chars.is_empty());
    assert_eq!(view.char_slide_ms, None);
    assert_eq!(view.voice, None);
    assert_eq!(view.cg, None);
    assert_eq!(view.amb, None);
    assert_eq!(view.movie, None);
    assert_eq!(view.camera, galeng_schema::Camera::default());
    let _ = fs::remove_dir_all(&tmp);
}

/// E03 case table. No shared executor. The JS preview reads the same inherit rows
/// and compares only bg, chars, bgm, cg, and the say text. Fades and audio timing are out.
/// 1. inherit + explicit clear — `e03_inherit_matches_preview_rows`
/// 2. dialogue `resolve_beat` — `e03_resolve_beat_keeps_the_line_after_an_insert`
/// 3. explore beat id (R4) — `crates/explore/tests/sm.rs` `e03_explore_beat_id_not_index`
/// 4. dialogue `goto_scene` into explore (K2) — `e03_goto_scene_enters_the_named_room`
/// 5. K3 views — `k3_called_dialogue_uses_dialogue_view` and `k3_hotspot_say_keeps_room_plate_and_empty_portraits`
#[test]
fn e03_inherit_matches_preview_rows() {
    let fixture: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(repo_root().join("fixtures/e03/inherit.json")).unwrap(),
    )
    .unwrap();
    let tmp = std::env::temp_dir().join(format!("galeng-e03-inherit-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let scene = serde_json::to_string(&fixture["scene"]).unwrap();
    write_k2_project(&tmp, "inherit", &[("inherit", &scene)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    let rows = fixture["rows"].as_array().unwrap();
    for (i, row) in rows.iter().enumerate() {
        let view = rt.view();
        assert_eq!(view.bg.as_deref(), row["bg"].as_str(), "beat {i} bg");
        assert_eq!(view.bgm.as_deref(), row["bgm"].as_str(), "beat {i} bgm");
        assert_eq!(view.cg.as_deref(), row["cg"].as_str(), "beat {i} cg");
        assert_eq!(
            view.say_text.as_deref(),
            row["say"].as_str(),
            "beat {i} say"
        );
        let expect_chars = row["chars"].as_array().unwrap();
        assert_eq!(view.chars.len(), expect_chars.len(), "beat {i} char count");
        for (ch, expect) in view.chars.iter().zip(expect_chars) {
            assert_eq!(ch.id, expect["id"].as_str().unwrap());
            assert_eq!(ch.face, expect["face"].as_str().unwrap());
            let slot = match ch.slot {
                galeng_schema::Slot::Left => "left",
                galeng_schema::Slot::Center => "center",
                galeng_schema::Slot::Right => "right",
            };
            assert_eq!(slot, expect["slot"].as_str().unwrap());
        }
        if i + 1 < rows.len() {
            rt.click_advance();
        }
    }
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn e03_resolve_beat_keeps_the_line_after_an_insert() {
    let tmp = std::env::temp_dir().join(format!("galeng-e03-beat-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let original = r#"{
      "id": "talk",
      "beats": [
        { "id": "b0000000000000001", "say": { "speaker": "甲", "text": "一" } },
        { "id": "b0000000000000002", "say": { "speaker": "甲", "text": "二" } }
      ]
    }"#;
    write_k2_project(&tmp, "talk", &[("talk", original)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().say_text.as_deref(), Some("一"));
    rt.click_advance();
    assert_eq!(rt.view().say_text.as_deref(), Some("二"));
    let save = rt.to_save();
    assert_eq!(save.beat_id.as_deref(), Some("b0000000000000002"));
    assert_eq!(save.beat_index, 1);

    let inserted = r#"{
      "id": "talk",
      "beats": [
        { "id": "b0000000000000009", "say": { "speaker": "甲", "text": "新" } },
        { "id": "b0000000000000001", "say": { "speaker": "甲", "text": "一" } },
        { "id": "b0000000000000002", "say": { "speaker": "甲", "text": "二" } }
      ]
    }"#;
    fs::write(tmp.join("scenario/talk.json"), inserted).unwrap();
    let mut resumed = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(resumed.view().say_text.as_deref(), Some("新"));
    resumed.apply_save(&save).unwrap();
    assert_eq!(resumed.view().say_text.as_deref(), Some("二"));
    assert_eq!(resumed.view().beat_index, 2);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn e03_goto_scene_enters_the_named_room() {
    let tmp = std::env::temp_dir().join(format!("galeng-e03-goto-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let talk = r#"{
      "id": "talk",
      "beats": [{ "say": { "speaker": "n", "text": "去" } }],
      "exit": { "type": "next", "goto": "room" }
    }"#;
    let room = r#"{
      "id": "room",
      "sceneKind": "explore",
      "bg": { "asset": "bg/room" }
    }"#;
    write_k2_project(&tmp, "talk", &[("talk", talk), ("room", room)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    assert_eq!(rt.view().scene_id, "talk");
    assert_eq!(rt.view().say_text.as_deref(), Some("去"));
    rt.click_advance();
    assert_eq!(rt.view().scene_id, "room");
    assert_eq!(rt.view().phase, Phase::Explore);
    assert_eq!(rt.view().bg.as_deref(), Some("bg/room"));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn k2_call_missing_scene_is_not_ended() {
    let tmp = std::env::temp_dir().join(format!("galeng-k2-miss-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    let talk = r#"{
      "id": "talk",
      "beats": [{ "say": { "speaker": "n", "text": "go" } }],
      "exit": { "type": "call", "scene": "missing" }
    }"#;
    write_k2_project(&tmp, "talk", &[("talk", talk)]);
    let mut rt = Runtime::load_dir(&tmp).unwrap();
    rt.click_advance();
    match rt.view().phase {
        Phase::MissingScene(msg) => assert!(msg.contains("missing"), "{msg}"),
        other => panic!("expected missing scene, got {other:?}"),
    }
    let _ = fs::remove_dir_all(&tmp);
}
