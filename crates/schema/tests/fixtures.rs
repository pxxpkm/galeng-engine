use std::fs;

use galeng_schema::{
    repo_root, validate_project_file, validate_project_str, validate_scene_file, validate_scene_str,
    Exit, SetValue,
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
