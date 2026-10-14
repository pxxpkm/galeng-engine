use std::fs;
use std::path::Path;

use galeng_packer::{pack, pack_with, PackOpts, PakReader};
use galeng_schema::repo_root;

fn copy_dir(src: &Path, dst: &Path) {
    fs::create_dir_all(dst).unwrap();
    for entry in fs::read_dir(src).unwrap() {
        let entry = entry.unwrap();
        let to = dst.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &to);
        } else {
            fs::copy(entry.path(), to).unwrap();
        }
    }
}

fn temp_project(label: &str) -> std::path::PathBuf {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part49-proj-{}-{}",
        std::process::id(),
        label
    ));
    let _ = fs::remove_dir_all(&tmp);
    copy_dir(&repo_root().join("examples/prologue"), &tmp);
    fs::copy(
        tmp.join("assets/bg/park_afternoon.png"),
        tmp.join("assets/bg/unused.png"),
    )
    .unwrap();
    tmp
}

#[test]
fn pack_prologue_has_referenced_and_skips_unref() {
    let project = temp_project("unref");
    let pak_path = std::env::temp_dir().join(format!(
        "galeng-part49-{}-unref.pak",
        std::process::id()
    ));
    let _ = fs::remove_file(&pak_path);
    let report = pack(&project, &pak_path).expect("pack");
    assert!(report.scenes.iter().any(|id| id == "park_01"));
    assert!(report.assets.contains_key("bg/park_afternoon"));
    assert!(report.assets.contains_key("char/sora/smile"));
    assert!(report.assets.contains_key("cg/op_still"));
    assert!(report.assets.contains_key("bgm/park"));
    assert!(report.assets.contains_key("voice/sora/001"));
    assert!(report.assets.contains_key("se/breeze"));
    assert!(!report.assets.contains_key("bg/unused"));

    let reader = PakReader::open(&pak_path).expect("open pak");
    assert!(reader.has_entry("galeng.json"));
    assert!(reader.has_entry("scenario/park_01.json"));
    assert!(reader.has_entry("index.json"));
    assert!(reader.has_entry("assets/bg/park_afternoon.png"));
    assert!(!reader.has_entry("assets/bg/unused.png"));
    assert!(!reader.names().iter().any(|n| n.contains("unused")));

    let _ = fs::remove_file(&pak_path);
    let _ = fs::remove_dir_all(&project);
}

#[test]
fn collect_refs_includes_title_button_images() {
    let project = galeng_schema::validate_project_str(
        r#"{
          "id":"x","title":"x","schemaVersion":1,
          "resolution":{"width":1920,"height":1080},
          "startScene":"a","locale":"en",
          "titleButtons":{
            "newGame":{"image":"ui/title/start","hover":"ui/title/start_h"}
          }
        }"#,
    )
    .unwrap();
    let refs = galeng_packer::collect_refs(&project, &[]);
    assert!(refs.contains("ui/title/start"), "{refs:?}");
    assert!(refs.contains("ui/title/start_h"), "{refs:?}");
}

#[test]
fn collect_refs_includes_pause_button_images() {
    let project = galeng_schema::validate_project_str(
        r#"{
          "id":"x","title":"x","schemaVersion":1,
          "resolution":{"width":1920,"height":1080},
          "startScene":"a","locale":"en",
          "pauseButtons":{"continue":{"image":"ui/pause/cont"}}
        }"#,
    )
    .unwrap();
    let refs = galeng_packer::collect_refs(&project, &[]);
    assert!(refs.contains("ui/pause/cont"), "{refs:?}");
}

#[test]
fn pack_reads_back_project_id() {
    let project = temp_project("id");
    let pak_path = std::env::temp_dir().join(format!(
        "galeng-part49-{}-id.pak",
        std::process::id()
    ));
    let _ = fs::remove_file(&pak_path);
    pack(&project, &pak_path).unwrap();
    let mut reader = PakReader::open(&pak_path).unwrap();
    let text = reader.project_json().unwrap();
    assert!(text.contains("example-prologue"));
    let scenes = reader.scene_texts().unwrap();
    assert!(scenes.iter().any(|(name, _)| name == "scenario/park_01.json"));
    let (ext, bytes) = reader
        .read_asset("bg/park_afternoon", &["png"])
        .expect("bg bytes");
    assert_eq!(ext, "png");
    assert!(bytes.len() > 8);
    assert!(reader.read_asset("bg/unused", &["png"]).is_none());

    let _ = fs::remove_file(&pak_path);
    let _ = fs::remove_dir_all(&project);
}

#[test]
fn missing_asset_warns_and_strict_does_not_write() {
    let project = temp_project("missing");
    fs::remove_file(project.join("assets/voice/sora/001.wav")).unwrap();
    let pak_path = std::env::temp_dir().join(format!(
        "galeng-part68-{}-missing.pak",
        std::process::id()
    ));
    let _ = fs::remove_file(&pak_path);

    let report = pack(&project, &pak_path).expect("default pack still writes");
    assert!(
        report
            .warnings
            .iter()
            .any(|w| w.contains("missing asset `voice/sora/001`")),
        "{:?}",
        report.warnings
    );
    assert!(pak_path.is_file(), "default pack writes despite warnings");
    let _ = fs::remove_file(&pak_path);

    let err = pack_with(&project, &pak_path, PackOpts { strict: true }).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("strict"), "{msg}");
    assert!(msg.contains("voice/sora/001"), "{msg}");
    assert!(!pak_path.exists(), "strict must not write the pak");

    let _ = fs::remove_dir_all(&project);
}

fn write_project_font(project: &Path, font: &str) {
    let path = project.join("galeng.json");
    let mut value: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    value["font"] = serde_json::Value::String(font.to_string());
    fs::write(path, serde_json::to_string_pretty(&value).unwrap()).unwrap();
}

#[test]
fn pack_includes_project_font_and_rejects_microsoft() {
    let project = temp_project("font-ok");
    fs::create_dir_all(project.join("assets/fonts")).unwrap();
    fs::write(project.join("assets/fonts/ok.ttf"), b"not-a-real-font").unwrap();
    write_project_font(&project, "fonts/ok");
    let pak_path = std::env::temp_dir().join(format!(
        "galeng-part71-{}-font-ok.pak",
        std::process::id()
    ));
    let _ = fs::remove_file(&pak_path);
    let report = pack(&project, &pak_path).expect("pack ofl font");
    assert_eq!(
        report.assets.get("fonts/ok").map(String::as_str),
        Some("assets/fonts/ok.ttf")
    );
    let reader = PakReader::open(&pak_path).unwrap();
    assert!(reader.has_entry("assets/fonts/ok.ttf"));
    let _ = fs::remove_file(&pak_path);
    let _ = fs::remove_dir_all(&project);

    let blocked = temp_project("font-ms");
    fs::create_dir_all(blocked.join("assets/fonts")).unwrap();
    fs::write(blocked.join("assets/fonts/msjh.ttc"), b"stolen").unwrap();
    write_project_font(&blocked, "fonts/msjh");
    let blocked_pak = std::env::temp_dir().join(format!(
        "galeng-part71-{}-font-ms.pak",
        std::process::id()
    ));
    let _ = fs::remove_file(&blocked_pak);
    let err = pack(&blocked, &blocked_pak).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("Microsoft"), "{msg}");
    assert!(!blocked_pak.exists());
    let _ = fs::remove_dir_all(&blocked);
}

#[test]
fn blocked_system_font_names() {
    assert!(galeng_packer::is_blocked_system_font("fonts/msjh"));
    assert!(galeng_packer::is_blocked_system_font("msyhbd.ttc"));
    assert!(galeng_packer::is_blocked_system_font(r"C:\Windows\Fonts\segoeui.ttf"));
    assert!(!galeng_packer::is_blocked_system_font("fonts/mplus"));
    assert!(!galeng_packer::is_blocked_system_font("fonts/source-han-sans"));
}

#[test]
fn pack_click_room_includes_explore_bg_and_item_icon() {
    let root = repo_root().join("examples/click-room");
    assert!(root.join("galeng.json").is_file(), "click-room example missing");
    let pak_path = std::env::temp_dir().join(format!(
        "galeng-click-room-{}.pak",
        std::process::id()
    ));
    let _ = fs::remove_file(&pak_path);
    let report = pack(&root, &pak_path).expect("pack click-room");
    assert!(
        report.scenes.iter().any(|id| id == "study"),
        "scenes={:?}",
        report.scenes
    );
    assert!(
        report.scenes.iter().any(|id| id == "dlg_butler"),
        "scenes={:?}",
        report.scenes
    );
    assert!(
        report.scenes.iter().any(|id| id == "ending"),
        "scenes={:?}",
        report.scenes
    );
    assert!(
        report.assets.contains_key("bg/study"),
        "assets={:?}",
        report.assets
    );
    assert!(
        report.assets.contains_key("bg/ending"),
        "assets={:?}",
        report.assets
    );
    assert!(
        report.assets.contains_key("items/key"),
        "assets={:?}",
        report.assets
    );
    assert!(
        report.warnings.is_empty(),
        "unexpected warnings: {:?}",
        report.warnings
    );
    let reader = PakReader::open(&pak_path).expect("open pak");
    assert!(reader.has_entry("galeng.json"));
    assert!(reader.has_entry("scenario/study.json"));
    assert!(reader.has_entry("scenario/dlg_butler.json"));
    assert!(reader.has_entry("assets/bg/study.png"));
    assert!(reader.has_entry("assets/items/key.png"));
    let _ = fs::remove_file(&pak_path);
}

#[test]
fn collect_refs_includes_explore_scene_bg_and_item_icons() {
    let project = galeng_schema::validate_project_file(
        repo_root().join("examples/click-room/galeng.json"),
    )
    .expect("project");
    let study = galeng_schema::validate_scene_file(
        repo_root().join("examples/click-room/scenario/study.json"),
    )
    .expect("study");
    let ending = galeng_schema::validate_scene_file(
        repo_root().join("examples/click-room/scenario/ending.json"),
    )
    .expect("ending");
    let refs = galeng_packer::collect_refs(&project, &[study, ending]);
    assert!(refs.contains("bg/study"), "{refs:?}");
    assert!(refs.contains("bg/ending"), "{refs:?}");
    assert!(refs.contains("items/key"), "{refs:?}");
}
