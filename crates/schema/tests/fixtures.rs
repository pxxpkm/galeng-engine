use std::fs;

use galeng_schema::{
    project_body_to_store, repo_root, validate_project_file, validate_project_str,
    validate_project_value, validate_scene_file, validate_scene_str, validate_scene_value, Exit,
    ExploreAction, HotspotShape, InteractionOn, ItemOn, ItemUseMode, Pred, SceneKind, SetValue,
    KNOWN_PROJECT_KEYS,
};

#[test]
fn prologue_project_ok() {
    let path = repo_root().join("examples/prologue/galeng.json");
    let project = validate_project_file(path).expect("project");
    assert!(!project.skip_title);
    assert_eq!(project.title_bgm.as_deref(), Some("bgm/park"));
    assert_eq!(project.title_bg.as_deref(), Some("bg/park_afternoon"));
}

#[test]
fn skip_title_true_is_accepted() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en","skipTitle":true
    }"#;
    let project = validate_project_str(text).expect("skipTitle");
    assert!(project.skip_title);
}

#[test]
fn title_bgm_optional() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en"
    }"#;
    let project = validate_project_str(text).expect("no titleBgm");
    assert!(project.title_bgm.is_none());
    assert!(project.title_bg.is_none());
    assert!(project.title_movie.is_none());
    assert!(project.font.is_none());
    assert!(project.msg_box.is_none());
}

#[test]
fn font_optional() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en","font":"fonts/mplus"
    }"#;
    let project = validate_project_str(text).expect("font");
    assert_eq!(project.font.as_deref(), Some("fonts/mplus"));
}

#[test]
fn icon_optional() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en","icon":"ui/icon"
    }"#;
    let project = validate_project_str(text).expect("icon");
    assert_eq!(project.icon.as_deref(), Some("ui/icon"));
}

#[test]
fn msg_box_optional() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en","msgBox":"ui/msgbox"
    }"#;
    let project = validate_project_str(text).expect("msgBox");
    assert_eq!(project.msg_box.as_deref(), Some("ui/msgbox"));
}

#[test]
fn character_text_rate_ok() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en",
      "characters":[{"id":"sora","textRate":80}]
    }"#;
    let project = validate_project_str(text).expect("textRate");
    assert_eq!(project.characters.as_ref().unwrap()[0].text_rate, Some(80));
}

#[test]
fn pause_buttons_optional() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en",
      "pauseButtons":{"continue":{"label":"","image":"ui/pause/cont","x":80}}
    }"#;
    let project = validate_project_str(text).expect("pauseButtons");
    let btn = project
        .pause_buttons
        .as_ref()
        .and_then(|set| set.continue_game.as_ref())
        .expect("continue");
    assert_eq!(btn.image.as_deref(), Some("ui/pause/cont"));
    assert_eq!(btn.x, Some(80));
}

#[test]
fn title_buttons_optional() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en",
      "hideGameTitle":true,
      "titleButtons":{
        "newGame":{"label":"","image":"ui/title/start","x":80,"y":720}
      }
    }"#;
    let project = validate_project_str(text).expect("titleButtons");
    assert!(project.hide_game_title);
    let btn = project
        .title_buttons
        .as_ref()
        .and_then(|set| set.new_game.as_ref())
        .expect("newGame");
    assert_eq!(btn.image.as_deref(), Some("ui/title/start"));
    assert_eq!(btn.label.as_deref(), Some(""));
    assert_eq!(btn.x, Some(80));
    assert!(project
        .title_buttons
        .as_ref()
        .unwrap()
        .continue_game
        .is_none());
}

#[test]
fn title_movie_optional() {
    let text = r#"{
      "id":"x","title":"x","schemaVersion":1,
      "resolution":{"width":1920,"height":1080},
      "startScene":"a","locale":"en","titleMovie":"movie/op"
    }"#;
    let project = validate_project_str(text).expect("titleMovie");
    assert_eq!(project.title_movie.as_deref(), Some("movie/op"));
}

#[test]
fn park_01_chinese_ok() {
    let path = repo_root().join("examples/prologue/scenario/park_01.json");
    let text = fs::read_to_string(&path).unwrap();
    assert!(text.contains("今天風真好。"));
    let scene = validate_scene_str(&text).expect("park_01");
    let Exit::Choices { options } = scene.exit.expect("choices") else {
        panic!("expected choices");
    };
    match options[0].set.as_ref().unwrap().get("sora_affection") {
        Some(SetValue::Text(value)) => assert_eq!(value, "+1"),
        other => panic!("expected +1, got {other:?}"),
    }
    assert_eq!(scene.beats[0].cg, None);
    assert_eq!(
        scene.beats[2].cg.as_ref(),
        Some(&Some("cg/op_still".into()))
    );
}

#[test]
fn beat_cg_null_closes() {
    let scene = validate_scene_str(
        r#"{
          "id": "x",
          "beats": [
            { "cg": "cg/op_still", "say": { "speaker": "n", "text": "圖" } },
            { "cg": null, "say": { "speaker": "n", "text": "關" } }
          ]
        }"#,
    )
    .expect("cg null");
    assert_eq!(scene.beats[0].cg, Some(Some("cg/op_still".into())));
    assert_eq!(scene.beats[1].cg, Some(None));
}

#[test]
fn beat_amb_null_closes() {
    let scene = validate_scene_str(
        r#"{
          "id": "x",
          "beats": [
            { "amb": "amb/rain", "say": { "speaker": "n", "text": "雨" } },
            { "amb": null, "say": { "speaker": "n", "text": "停" } }
          ]
        }"#,
    )
    .expect("amb null");
    assert_eq!(scene.beats[0].amb, Some(Some("amb/rain".into())));
    assert_eq!(scene.beats[1].amb, Some(None));
}

#[test]
fn beat_char_offset_ok() {
    let scene = validate_scene_str(
        r#"{
          "id": "x",
          "beats": [
            { "chars": [{ "id": "sora", "face": "smile", "slot": "left", "x": 80, "y": -20 }] }
          ]
        }"#,
    )
    .expect("offset");
    let ch = &scene.beats[0].chars.as_ref().unwrap()[0];
    assert_eq!(ch.x, 80);
    assert_eq!(ch.y, -20);
}

#[test]
fn beat_flash_ok() {
    let scene = validate_scene_str(
        r#"{
          "id": "x",
          "beats": [
            { "fx": { "type": "flash" } },
            { "fx": { "type": "flash", "ms": 120 }, "say": { "speaker": "n", "text": "閃" } }
          ]
        }"#,
    )
    .expect("flash");
    assert!(matches!(
        scene.beats[0].fx,
        Some(galeng_schema::Fx::Flash { ms: None })
    ));
    assert!(matches!(
        scene.beats[1].fx,
        Some(galeng_schema::Fx::Flash { ms: Some(120) })
    ));
}

#[test]
fn beat_camera_null_resets() {
    let scene = validate_scene_str(
        r#"{
          "id": "x",
          "beats": [
            { "camera": { "x": 80, "zoom": 160 }, "say": { "speaker": "n", "text": "近" } },
            { "camera": null, "say": { "speaker": "n", "text": "遠" } }
          ]
        }"#,
    )
    .expect("camera null");
    let cam = scene.beats[0].camera.as_ref().unwrap().as_ref().unwrap();
    assert_eq!(cam.x, 80);
    assert_eq!(cam.y, 0);
    assert_eq!(cam.zoom, 160);
    assert_eq!(scene.beats[1].camera, Some(None));
}

#[test]
fn home_01_without_exit_ok() {
    let scene =
        validate_scene_file(repo_root().join("examples/prologue/scenario/home_01.json")).unwrap();
    assert!(scene.exit.is_none());
}

#[test]
fn park_02_without_exit_ok() {
    let scene =
        validate_scene_file(repo_root().join("examples/prologue/scenario/park_02.json")).unwrap();
    assert_eq!(scene.id, "park_02");
    assert!(scene.exit.is_none());
    assert!(scene.beats[0]
        .say
        .as_ref()
        .unwrap()
        .text
        .contains("那就走吧"));
}

#[test]
fn english_fixture_ok() {
    let scene =
        validate_scene_file(repo_root().join("fixtures/valid/scene-english-say.json")).unwrap();
    assert_eq!(
        scene.beats[0].say.as_ref().unwrap().text,
        "The wind feels nice today."
    );
}

#[test]
fn all_invalid_fixtures_rejected() {
    let dir = repo_root().join("fixtures/invalid");
    let mut count = 0;
    for entry in fs::read_dir(&dir).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".json") {
            continue;
        }
        count += 1;
        let result = if name.starts_with("project-") {
            validate_project_file(entry.path()).map(|_| ())
        } else {
            validate_scene_file(entry.path()).map(|_| ())
        };
        assert!(result.is_err(), "{name} should be rejected: {result:?}");
    }
    assert!(count > 0, "expected invalid fixtures");
}

#[test]
fn set_integer_overwrite_ok_relative_bare_plus_not() {
    let overwrite = r#"{"id":"ok","beats":[{"set":{"sora_affection":1}}]}"#;
    validate_scene_str(overwrite).unwrap();

    let relative = r#"{"id":"ok","beats":[{"set":{"sora_affection":"+1"}}]}"#;
    validate_scene_str(relative).unwrap();

    let bare = r#"{"id":"bad","beats":[{"set":{"sora_affection":"+"}}]}"#;
    assert!(validate_scene_str(bare).is_err());

    let flag = r#"{"id":"ok","beats":[{"set":{"met_sora":true}}]}"#;
    validate_scene_str(flag).unwrap();

    let name = r#"{"id":"bad","beats":[{"set":{"name":"sora"}}]}"#;
    assert!(validate_scene_str(name).is_err());

    let text_if = r#"{"id":"bad","beats":[{}],"exit":{"type":"branch","if":{"flag":"yes"},"then":"a","else":"b"}}"#;
    assert!(validate_scene_str(text_if).is_err());
}

#[test]
fn empty_required_string_error_includes_pointer() {
    let err = validate_scene_str(
        r#"{"id":"x","beats":[{"say":{"speaker":"sora","text":""},"chars":[{"id":"","face":"smile"}]}]}"#,
    )
    .unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("/beats/0/say/text"),
        "missing say.text pointer: {msg}"
    );
    assert!(
        msg.contains("/beats/0/chars/0/id"),
        "missing char id pointer: {msg}"
    );
}

fn value_roundtrip_project(text: &str) {
    let original: serde_json::Value = serde_json::from_str(text).unwrap();
    let project = validate_project_value(&original).expect("project");
    let back = serde_json::to_value(&project).unwrap();
    assert_eq!(original, back);
}

fn value_roundtrip_scene(text: &str) {
    let original: serde_json::Value = serde_json::from_str(text).unwrap();
    let scene = validate_scene_value(&original).expect("scene");
    let back = serde_json::to_value(&scene).unwrap();
    assert_eq!(original, back);
}

#[test]
fn prologue_project_value_roundtrip() {
    let path = repo_root().join("examples/prologue/galeng.json");
    let text = fs::read_to_string(path).unwrap();
    value_roundtrip_project(&text);
}

#[test]
fn prologue_scenes_value_roundtrip() {
    let dir = repo_root().join("examples/prologue/scenario");
    for name in ["home_01.json", "park_01.json", "park_02.json"] {
        let text = fs::read_to_string(dir.join(name)).unwrap();
        let original: serde_json::Value = serde_json::from_str(&text).unwrap();
        let scene = validate_scene_value(&original).unwrap_or_else(|err| panic!("{name}: {err}"));
        let back = serde_json::to_value(&scene).unwrap();
        assert_eq!(original, back, "{name}");
    }
}

#[test]
fn missing_scene_kind_is_dialogue() {
    let scene = validate_scene_str(r#"{"id":"only"}"#).expect("defaults");
    assert_eq!(scene.scene_kind, SceneKind::Dialogue);
    assert!(scene.beats.is_empty());
    assert!(scene.hotspots.is_empty());
    assert!(scene.on_enter.is_empty());
    let back = serde_json::to_value(&scene).unwrap();
    assert!(back.get("sceneKind").is_none());
    assert!(back.get("hotspots").is_none());
    assert!(back.get("onEnter").is_none());
    assert_eq!(back["beats"], serde_json::json!([]));
}

#[test]
fn explore_fixture_deserializes() {
    let scene = validate_scene_file(repo_root().join("fixtures/valid/scene-explore-study.json"))
        .expect("study");
    assert_eq!(scene.id, "study");
    assert_eq!(scene.scene_kind, SceneKind::Explore);
    assert!(scene.beats.is_empty());
    assert_eq!(scene.bg.as_ref().unwrap().asset, "bg/study");
    assert!(scene.on_enter.is_empty());

    let desk = scene.hotspots.iter().find(|h| h.id == "desk").unwrap();
    assert_eq!(desk.visible_if, Some(None));
    assert_eq!(desk.enabled_if, Some(None));
    assert!(matches!(
        desk.shape,
        HotspotShape::Rect {
            x: 600,
            y: 500,
            w: 420,
            h: 220
        }
    ));

    let window = scene.hotspots.iter().find(|h| h.id == "window").unwrap();
    match &window.shape {
        HotspotShape::Polygon { points } => {
            assert_eq!(points.len(), 4);
            assert_eq!(points[0], [100, 80]);
        }
        other => panic!("expected polygon, got {other:?}"),
    }
    assert_eq!(
        scene
            .hotspots
            .iter()
            .find(|h| h.id == "door")
            .unwrap()
            .default_verb
            .as_deref(),
        Some("move")
    );

    assert!(matches!(
        &scene.interactions[0].on,
        InteractionOn::Verb(on) if on.verb == "look"
    ));
    assert!(matches!(
        &scene.interactions[0].rules[0].when[0],
        Pred::Switch(pred) if pred.switch == "drawer_open" && pred.is
    ));
    assert!(scene.interactions[0].rules[1].when.is_empty());
    assert!(matches!(
        &scene.interactions[0].rules[1].actions[0],
        ExploreAction::Say { text, speaker: None } if text == "一張舊書桌。"
    ));

    assert!(matches!(
        &scene.interactions[1].on,
        InteractionOn::Item(on) if on.item == "key"
    ));
    assert!(matches!(
        &scene.interactions[1].rules[0].actions[0],
        ExploreAction::SetSwitch { id, value: true } if id == "drawer_open"
    ));

    assert!(matches!(
        &scene.interactions[2].rules[0].actions[0],
        ExploreAction::GotoScene { scene, trans } if scene == "ending" && trans.as_deref() == Some("fade_black")
    ));
    assert!(matches!(
        &scene.interactions[3].rules[0].actions[0],
        ExploreAction::Call { scene, trans } if scene == "dlg_butler" && trans.as_deref() == Some("fade_black")
    ));
}

#[test]
fn explore_actions_and_exit_roundtrip() {
    value_roundtrip_scene(
        r##"{
          "id": "ops",
          "beats": [],
          "exit": { "type": "call", "scene": "dlg", "trans": "fade_black" },
          "onEnter": [
            { "type": "say", "text": "hi", "speaker": "sora" },
            { "type": "say", "text": "旁白" },
            { "type": "setSwitch", "id": "door_open", "value": true },
            { "type": "setVar", "id": "n", "value": 2 },
            { "type": "addVar", "id": "n", "delta": -1 },
            { "type": "giveItem", "id": "key" },
            { "type": "takeItem", "id": "key" },
            { "type": "gotoScene", "scene": "ending", "trans": "fade_black" },
            { "type": "call", "scene": "dlg" },
            { "type": "return" },
            { "type": "return", "trans": "fade_black" },
            { "type": "playSe", "asset": "se/breeze" },
            { "type": "bgm", "asset": null, "fadeMs": 200 },
            { "type": "bgm", "asset": "bgm/park" },
            { "type": "fx", "ref": "fade_black", "override": { "ms": 300, "color": "#000000" } },
            { "type": "fx", "ref": "crossfade" },
            { "type": "showHotspot", "id": "desk" },
            { "type": "hideHotspot", "id": "desk" },
            { "type": "enableHotspot", "id": "desk" },
            { "type": "disableHotspot", "id": "desk" }
          ]
        }"##,
    );
    value_roundtrip_scene(r#"{"id":"x","beats":[],"exit":{"type":"return"}}"#);
    value_roundtrip_scene(r#"{"id":"x","beats":[],"exit":{"type":"return","trans":"fade_black"}}"#);
    let returned = validate_scene_str(r#"{"id":"x","exit":{"type":"return"}}"#).unwrap();
    assert!(matches!(returned.exit, Some(Exit::Return { trans: None })));
    assert_eq!(returned.scene_kind, SceneKind::Dialogue);
}

#[test]
fn explore_predicates_roundtrip() {
    value_roundtrip_scene(
        r#"{
          "id": "preds",
          "beats": [],
          "hotspots": [
            {
              "id": "drawer",
              "name": "抽屜",
              "shape": { "type": "rect", "x": 1, "y": -2, "w": 3, "h": 4 },
              "visibleIf": [
                { "switch": "drawer_open", "is": false },
                { "var": "clues", "eq": 1 },
                { "hasItem": "key" }
              ],
              "enabledIf": null
            }
          ]
        }"#,
    );
}

#[test]
fn explore_project_fields_roundtrip() {
    value_roundtrip_project(
        r##"{
          "id": "room",
          "title": "書房",
          "schemaVersion": 2,
          "resolution": { "width": 1920, "height": 1080 },
          "startScene": "study",
          "locale": "zh-Hant",
          "skipTitle": false,
          "verbs": [
            { "id": "look", "label": "看", "builtin": true },
            { "id": "use", "label": "用" }
          ],
          "items": [
            { "id": "key", "name": "黃銅鎖匙", "icon": "items/key", "desc": "一把鎖匙" }
          ],
          "switches": [
            { "id": "door_open", "name": "門已開" },
            { "id": "drawer_open", "init": true }
          ],
          "fallback": {
            "perVerb": { "look": "冇咩特別。", "use": "咁樣用唔到。" },
            "itemOnHotspot": "用呢樣嘢冇效果。",
            "global": "……"
          },
          "effectLibrary": [
            { "id": "fade_black", "kind": "fade", "params": { "ms": 400, "color": "#000000" } },
            { "id": "crossfade", "kind": "crossfade", "params": { "ms": 500 } }
          ],
          "transitionDefaults": {
            "toDialogue": "fade_black",
            "fromDialogue": "crossfade",
            "gotoScene": "fade_black"
          }
        }"##,
    );
    assert!(validate_project_str(
        r#"{
          "id":"x","title":"x","schemaVersion":3,
          "resolution":{"width":1920,"height":1080},
          "startScene":"a","locale":"en"
        }"#
    )
    .is_err());
    assert!(validate_project_str(
        r#"{
          "id":"x","title":"x","schemaVersion":2,
          "resolution":{"width":1920,"height":1080},
          "startScene":"a","locale":"en",
          "effectLibrary":[{ "id":"wipe_out","kind":"wipe" }]
        }"#
    )
    .is_err());
}

#[test]
fn unknown_exit_type_rejected() {
    let err = validate_scene_file(repo_root().join("fixtures/invalid/scene-unknown-exit.json"))
        .unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("exit") || msg.contains("teleport") || msg.contains("oneOf"),
        "{msg}"
    );
    assert!(validate_scene_str(
        r#"{"id":"bad","beats":[],"exit":{"type":"teleport","goto":"home_01"}}"#
    )
    .is_err());
}

#[test]
fn unknown_explore_action_rejected() {
    let err = validate_scene_file(repo_root().join("fixtures/invalid/scene-unknown-action.json"))
        .unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("onEnter") || msg.contains("explode") || msg.contains("oneOf"),
        "{msg}"
    );
    assert!(validate_scene_str(
        r#"{"id":"bad","interactions":[{"hotspot":"desk","on":{"verb":"look"},"rules":[{"when":[],"do":[{"type":"eval","text":"no"}]}]}]}"#
    )
    .is_err());
    assert!(validate_scene_str(
        r#"{"id":"bad","hotspots":[{"id":"d","name":"桌","shape":{"type":"circle","x":1,"y":2}}]}"#
    )
    .is_err());
}

#[test]
fn project_rejects_wrong_resolution() {
    assert!(validate_project_str(
        r#"{
          "id":"x","title":"x","schemaVersion":1,
          "resolution":{"width":800,"height":600},
          "startScene":"a","locale":"en"
        }"#
    )
    .is_err());
}

#[test]
fn item_use_mode_defaults_aim_and_parses_drag() {
    let aim: ItemOn = serde_json::from_str(r#"{"item":"key"}"#).unwrap();
    assert_eq!(aim.item, "key");
    assert_eq!(aim.use_mode, ItemUseMode::Aim);
    let drag: ItemOn = serde_json::from_str(r#"{"item":"key","useMode":"drag"}"#).unwrap();
    assert_eq!(drag.use_mode, ItemUseMode::Drag);
    let on: InteractionOn = serde_json::from_str(r#"{"item":"key","useMode":"drag"}"#).unwrap();
    assert!(matches!(on, InteractionOn::Item(i) if i.use_mode == ItemUseMode::Drag));
    // serialize skips default aim
    let s = serde_json::to_string(&aim).unwrap();
    assert!(!s.contains("useMode"), "{s}");
    let s = serde_json::to_string(&drag).unwrap();
    assert!(s.contains("useMode"), "{s}");
}

#[test]
fn duplicate_beat_id_rejected() {
    let text = r#"{
      "id": "x",
      "beats": [
        { "id": "b0123456789abcdef" },
        { "id": "b0123456789abcdef" }
      ]
    }"#;
    let err = validate_scene_str(text).expect_err("dup id");
    let msg = err.to_string();
    assert!(msg.contains("duplicate beat id"), "got {msg}");
}

#[test]
fn beat_id_round_trips() {
    let text = r#"{
      "id": "x",
      "beats": [{ "id": "b0123456789abcdef", "label": "a" }]
    }"#;
    let scene = validate_scene_str(text).expect("ok");
    assert_eq!(scene.beats[0].id.as_deref(), Some("b0123456789abcdef"));
}

#[test]
fn illegal_beat_id_rejected() {
    let text = r#"{
      "id": "x",
      "beats": [{ "id": "" }]
    }"#;
    assert!(validate_scene_str(text).is_err());
}

#[test]
fn known_project_keys_match_schema_properties() {
    let schema: serde_json::Value = serde_json::from_str(include_str!(
        "../../../packages/schema/schema/galeng.project.schema.json"
    ))
    .unwrap();
    let mut from_schema: Vec<&str> = schema["properties"]
        .as_object()
        .unwrap()
        .keys()
        .map(|key| key.as_str())
        .collect();
    let mut known = KNOWN_PROJECT_KEYS.to_vec();
    from_schema.sort_unstable();
    known.sort_unstable();
    assert_eq!(from_schema, known);
}

#[test]
fn project_store_keeps_unknown_keys_and_omitted_known_fields() {
    let raw = serde_json::json!({
        "id": "x",
        "title": "x",
        "schemaVersion": 1,
        "resolution": { "width": 1920, "height": 1080 },
        "startScene": "a",
        "locale": "en",
        "titleBgm": "bgm/park",
        "pluginNote": { "keep": true }
    });
    let (project, body) = project_body_to_store(&raw).unwrap();
    assert_eq!(project.title_bgm.as_deref(), Some("bgm/park"));
    let stored: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(stored["pluginNote"]["keep"], true);
    assert_eq!(stored["titleBgm"], "bgm/park");
    assert!(body.contains("\"title\": \"x\""));
    assert!(body.contains("\"pluginNote\""));
    assert!(validate_project_value(&stored).is_ok());
    let typed = serde_json::to_value(&project).unwrap();
    let (again, typed_body) = project_body_to_store(&typed).unwrap();
    assert_eq!(typed_body, serde_json::to_string_pretty(&again).unwrap());

    let mut dropped = raw.clone();
    dropped.as_object_mut().unwrap().remove("titleBgm");
    let (project, body) = project_body_to_store(&dropped).unwrap();
    let stored: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert!(project.title_bgm.is_none());
    assert!(stored.get("titleBgm").is_none());
    assert_eq!(stored["pluginNote"]["keep"], true);

    let mut bad = dropped.clone();
    bad["schemaVersion"] = serde_json::json!(9);
    assert!(project_body_to_store(&bad).is_err());
}
