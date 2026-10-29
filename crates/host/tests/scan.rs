use std::fs;

use galeng_host::{player_exe, player_exe_in, ProjectDir};
use galeng_schema::repo_root;

#[test]
fn scans_prologue() {
    let dir = ProjectDir::open(repo_root().join("examples/prologue")).unwrap();
    let project = dir.project().unwrap();
    assert_eq!(project.id, "example-prologue");
    let scenes = dir.list_scenes().unwrap();
    let ids: Vec<_> = scenes.iter().map(|s| s.id.as_str()).collect();
    assert!(ids.contains(&"park_01"));
    assert!(ids.contains(&"home_01"));
    assert!(ids.contains(&"park_02"));
    let park_meta = scenes.iter().find(|s| s.id == "park_01").unwrap();
    assert!(matches!(
        park_meta.exit,
        Some(galeng_schema::Exit::Choices { .. })
    ));
    let park = dir.load_scene("park_01").unwrap();
    assert_eq!(park.beats.len(), 3);
    let assets = dir.list_assets().unwrap();
    assert!(assets.iter().any(|a| a.logical == "bg/park_afternoon"));
    assert!(assets.iter().any(|a| a.logical == "bgm/park"));
}

#[test]
fn webm_and_wmv_scan_as_movie() {
    let tmp = std::env::temp_dir().join(format!("galeng-part62-movie-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::create_dir_all(tmp.join("assets/movie")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    fs::write(tmp.join("assets/movie/op.webm"), b"x").unwrap();
    fs::write(tmp.join("assets/movie/ed.wmv"), b"x").unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let assets = dir.list_assets().unwrap();
    let webm = assets.iter().find(|a| a.logical == "movie/op").unwrap();
    let wmv = assets.iter().find(|a| a.logical == "movie/ed").unwrap();
    assert_eq!(webm.kind, "movie");
    assert_eq!(wmv.kind, "movie");
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn creates_scene_in_temp_and_refuses_overwrite() {
    let tmp = std::env::temp_dir().join(format!("galeng-part9-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let created = dir.create_scene("park_02", Some("Park 2")).unwrap();
    assert_eq!(created.id, "park_02");
    assert_eq!(created.beats.len(), 1);
    assert!(created.exit.is_none());
    assert!(tmp.join("scenario/park_02.json").is_file());
    let again = dir.create_scene("park_02", None);
    assert!(again.is_err());
    assert!(dir.create_scene("", None).is_err());
    assert!(dir.create_scene("../x", None).is_err());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn archives_then_restores_without_deleting() {
    let tmp = std::env::temp_dir().join(format!("galeng-part94-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    fs::copy(
        repo_root().join("examples/prologue/scenario/park_01.json"),
        tmp.join("scenario/park_01.json"),
    )
    .unwrap();
    fs::copy(
        repo_root().join("examples/prologue/scenario/home_01.json"),
        tmp.join("scenario/home_01.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    assert!(dir.archive_scene("park_01").is_err());
    dir.archive_scene("home_01").unwrap();
    let live: Vec<_> = dir.list_scenes().unwrap().into_iter().map(|s| s.id).collect();
    assert_eq!(live, vec!["park_01".to_string()]);
    assert!(!tmp.join("scenario/home_01.json").is_file());
    assert!(tmp.join("scenario/.archive/home_01.json").is_file());
    assert!(dir.load_scene("home_01").is_err());
    let hidden: Vec<_> = dir
        .list_archived()
        .unwrap()
        .into_iter()
        .map(|s| s.id)
        .collect();
    assert_eq!(hidden, vec!["home_01".to_string()]);
    assert!(dir.create_scene("home_01", None).is_err());
    let restored = dir.unarchive_scene("home_01").unwrap();
    assert_eq!(restored.id, "home_01");
    assert!(tmp.join("scenario/home_01.json").is_file());
    assert!(!tmp.join("scenario/.archive/home_01.json").is_file());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn deletes_live_and_archived_but_not_start() {
    let tmp = std::env::temp_dir().join(format!("galeng-part99-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    fs::copy(
        repo_root().join("examples/prologue/scenario/park_01.json"),
        tmp.join("scenario/park_01.json"),
    )
    .unwrap();
    fs::copy(
        repo_root().join("examples/prologue/scenario/home_01.json"),
        tmp.join("scenario/home_01.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    assert!(dir.delete_scene("park_01").is_err());
    assert!(tmp.join("scenario/park_01.json").is_file());
    dir.delete_scene("home_01").unwrap();
    assert!(!tmp.join("scenario/home_01.json").is_file());
    assert!(dir.load_scene("home_01").is_err());
    dir.create_scene("home_01", None).unwrap();
    assert!(tmp.join("scenario/home_01.json").is_file());
    dir.archive_scene("home_01").unwrap();
    assert!(tmp.join("scenario/.archive/home_01.json").is_file());
    dir.delete_archived("home_01").unwrap();
    assert!(!tmp.join("scenario/.archive/home_01.json").is_file());
    dir.create_scene("home_01", None).unwrap();
    assert!(tmp.join("scenario/home_01.json").is_file());
    assert!(dir.delete_archived("missing").is_err());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn writes_script_export_utf8_without_bom() {
    let tmp = std::env::temp_dir().join(format!("galeng-part19-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let rel = dir
        .write_script_export("park_01", "\u{feff}@scene park_01\n")
        .unwrap();
    assert_eq!(rel, "export/script/park_01.ks.txt");
    let bytes = fs::read(tmp.join(&rel)).unwrap();
    assert_ne!(bytes.get(0..3), Some(&[0xef, 0xbb, 0xbf][..]));
    assert_eq!(bytes, b"@scene park_01\n");
    assert!(dir.write_script_export("../x", "nope").is_err());
    assert!(dir.write_script_export("park_01", "").is_err());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn save_project_keeps_unknown_keys_and_does_not_restore_omitted_fields() {
    let tmp = std::env::temp_dir().join(format!("galeng-host-unknown-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let mut value = serde_json::to_value(dir.project().unwrap()).unwrap();
    assert!(value.get("titleBgm").is_some());
    value.as_object_mut().unwrap().remove("titleBgm");
    value["title"] = serde_json::json!("Kept unknown");
    value["pluginNote"] = serde_json::json!({ "keep": true });
    let saved = dir.save_project(&value).unwrap();
    assert_eq!(saved.title, "Kept unknown");
    assert!(saved.title_bgm.is_none());
    let disk: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(tmp.join("galeng.json")).unwrap()).unwrap();
    assert_eq!(disk["pluginNote"]["keep"], true);
    assert!(disk.get("titleBgm").is_none());
    assert_eq!(disk["title"], "Kept unknown");
    let again = ProjectDir::open(&tmp).unwrap();
    assert!(again.project().unwrap().title_bgm.is_none());
    assert_eq!(again.project_document().unwrap()["pluginNote"]["keep"], true);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn save_project_keeps_title_bgm_and_updates_cg() {
    let tmp = std::env::temp_dir().join(format!("galeng-part45-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let mut value = serde_json::to_value(dir.project().unwrap()).unwrap();
    value["cg"] = serde_json::json!([
        { "id": "op_still", "asset": "cg/op_still" },
        { "id": "extra", "asset": "cg/extra" }
    ]);
    let saved = dir.save_project(&value).unwrap();
    assert_eq!(saved.title_bgm.as_deref(), Some("bgm/park"));
    assert_eq!(saved.cg.as_ref().map(|v| v.len()), Some(2));
    assert_eq!(saved.cg.as_ref().unwrap()[1].id, "extra");
    let again = dir.project().unwrap();
    assert_eq!(again.title_bgm.as_deref(), Some("bgm/park"));
    assert_eq!(again.title_bg.as_deref(), Some("bg/park_afternoon"));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn resolve_media_png_and_rejects_dotdot() {
    let dir = ProjectDir::open(repo_root().join("examples/prologue")).unwrap();
    let park = dir.resolve_media("bg/park_afternoon").unwrap();
    assert!(park.ends_with("park_afternoon.png"));
    assert!(dir.resolve_media("../galeng.json").is_err());
    assert!(dir.resolve_media("bg/nope").is_err());
}

#[test]
fn resolve_media_audio_and_refuses_movie() {
    let tmp = std::env::temp_dir().join(format!("galeng-part83-media-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::create_dir_all(tmp.join("assets/se")).unwrap();
    fs::create_dir_all(tmp.join("assets/movie")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    fs::write(tmp.join("assets/se/click.ogg"), b"x").unwrap();
    fs::write(tmp.join("assets/movie/op.webm"), b"x").unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let se = dir.resolve_media("se/click").unwrap();
    assert!(se.ends_with("click.ogg"));
    assert_eq!(galeng_host::media_content_type(&se), "audio/ogg");
    assert!(dir.resolve_media("movie/op").is_err());
    let _ = fs::remove_dir_all(&tmp);
}

fn copy_dir(src: &std::path::Path, dst: &std::path::Path) {
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

#[test]
fn export_game_writes_pak_and_optional_exe() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part50-{}-pack",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    copy_dir(&repo_root().join("examples/prologue"), &tmp);
    fs::copy(
        tmp.join("assets/bg/park_afternoon.png"),
        tmp.join("assets/bg/unused.png"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let without = dir.export_game(None).unwrap();
    assert_eq!(without.pak, "export/game/game.pak");
    assert!(without.exe.is_none());
    let pak = tmp.join(&without.pak);
    assert!(pak.is_file());
    let reader = galeng_packer::PakReader::open(&pak).unwrap();
    assert!(reader.has_entry("galeng.json"));
    assert!(reader.has_entry("scenario/park_01.json"));
    assert!(!reader.has_entry("assets/bg/unused.png"));

    let fake = tmp.join("fake-player.exe");
    fs::write(&fake, b"not-a-real-exe").unwrap();
    let with = dir.export_game(Some(&fake)).unwrap();
    assert_eq!(with.exe.as_deref(), Some("export/game/player.exe"));
    assert!(tmp.join("export/game/player.exe").is_file());
    assert!(with.dll.is_none(), "dll only copies from the exe directory");
    assert!(
        !with.warnings.iter().any(|w| w.contains("not signed")),
        "unsigned must not land in warnings: {:?}",
        with.warnings
    );

    let fake_dir = tmp.join("bin");
    fs::create_dir_all(&fake_dir).unwrap();
    let fake2 = fake_dir.join("galeng-player.exe");
    fs::write(&fake2, b"exe").unwrap();
    fs::write(fake_dir.join("SDL2.dll"), b"dll").unwrap();
    let with_dll = dir.export_game(Some(&fake2)).unwrap();
    assert_eq!(with_dll.dll.as_deref(), Some("export/game/SDL2.dll"));
    assert_eq!(fs::read(tmp.join("export/game/SDL2.dll")).unwrap(), b"dll");

    let dest = tmp.join("dist-out");
    let chosen = dir
        .export_game_opts(Some(&fake2), false, Some(&dest))
        .unwrap();
    assert!(dest.join("game.pak").is_file());
    assert!(dest.join("player.exe").is_file());
    assert!(dest.join("SDL2.dll").is_file());
    assert!(chosen.pak.replace('\\', "/").ends_with("dist-out/game.pak") || chosen.pak.ends_with("dist-out\\game.pak"));

    let err = dir
        .export_game_opts(None, false, Some(std::path::Path::new("../outside")))
        .unwrap_err();
    assert!(err.to_string().contains(".."), "{err}");

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn export_game_opts_does_not_touch_userdata() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-pr5-export-ud-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    copy_dir(&repo_root().join("examples/prologue"), &tmp);
    let dest = tmp.join("dist-out");
    fs::create_dir_all(dest.join("UserData/save")).unwrap();
    fs::write(dest.join("UserData/config.json"), b"keep-me").unwrap();
    fs::write(dest.join("UserData/seen.json"), b"seen-keep").unwrap();
    fs::write(dest.join("UserData/save/slot-00.json"), b"slot-keep").unwrap();

    let dir = ProjectDir::open(&tmp).unwrap();
    let fake = tmp.join("fake-player.exe");
    fs::write(&fake, b"exe").unwrap();
    dir.export_game_opts(Some(&fake), false, Some(&dest))
        .expect("export");

    // Write set is create_dir_all + copy player/SDL2/game.pak/optional ico — not UserData.
    assert!(dest.join("game.pak").is_file());
    assert!(dest.join("player.exe").is_file());
    assert!(!dest.join("UserData").join("game.pak").exists());
    assert_eq!(
        fs::read(dest.join("UserData/config.json")).unwrap(),
        b"keep-me"
    );
    assert_eq!(
        fs::read(dest.join("UserData/seen.json")).unwrap(),
        b"seen-keep"
    );
    assert_eq!(
        fs::read(dest.join("UserData/save/slot-00.json")).unwrap(),
        b"slot-keep"
    );
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn export_game_strict_fails_on_missing_asset() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part68-{}-strict",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    copy_dir(&repo_root().join("examples/prologue"), &tmp);
    fs::remove_file(tmp.join("assets/voice/sora/001.wav")).unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let loose = dir.export_game(None).unwrap();
    assert!(
        loose
            .warnings
            .iter()
            .any(|w| w.contains("missing asset `voice/sora/001`")),
        "{:?}",
        loose.warnings
    );
    assert!(tmp.join(&loose.pak).is_file());
    fs::remove_file(tmp.join(&loose.pak)).unwrap();
    let err = dir.export_game_opts(None, true, None).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("strict"), "{msg}");
    assert!(!tmp.join("export/game/game.pak").exists());
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn player_exe_picks_newest() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part66-exe-{}-pref",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("target/debug")).unwrap();
    fs::create_dir_all(tmp.join("target/release")).unwrap();
    let debug = tmp.join("target/debug/galeng-player.exe");
    let release = tmp.join("target/release/galeng-player.exe");
    fs::write(&debug, b"debug").unwrap();
    let debug_only = player_exe(&tmp).unwrap();
    let debug_s = debug_only.to_string_lossy();
    assert!(debug_s.contains("debug"), "{debug_s}");
    fs::write(&release, b"rel").unwrap();
    let older = std::time::SystemTime::now() - std::time::Duration::from_secs(120);
    fs::OpenOptions::new()
        .write(true)
        .open(&release)
        .unwrap()
        .set_modified(older)
        .unwrap();
    let newest_debug = player_exe(&tmp).unwrap();
    assert!(
        newest_debug.to_string_lossy().contains("debug"),
        "stale release must not win: {}",
        newest_debug.display()
    );
    let newer = std::time::SystemTime::now() + std::time::Duration::from_secs(120);
    fs::OpenOptions::new()
        .write(true)
        .open(&release)
        .unwrap()
        .set_modified(newer)
        .unwrap();
    let newest_rel = player_exe(&tmp).unwrap();
    assert!(
        newest_rel.to_string_lossy().contains("release"),
        "{}",
        newest_rel.display()
    );
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn player_exe_in_finds_sibling() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part110-exe-{}-sib",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap();
    let sib = tmp.join("galeng-player.exe");
    fs::write(&sib, b"sib").unwrap();
    let found = player_exe_in(&[tmp.clone()]).unwrap();
    assert_eq!(found, sib);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn asset_root_override_scans_and_scaffolds() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part112-root-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let art = tmp.join("my-art");
    let (path, is_default) = dir.set_asset_root(Some(art.to_str().unwrap())).unwrap();
    assert!(!is_default);
    assert!(path.join("bg").is_dir());
    assert!(path.join("voice").is_dir());
    fs::write(path.join("bg/sky.png"), b"x").unwrap();
    let assets = dir.list_assets().unwrap();
    assert!(assets.iter().any(|a| a.logical == "bg/sky"));
    dir.set_asset_root(None).unwrap();
    assert!(galeng_schema::is_default_asset_dir(&tmp));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn logical_from_asset_file_inside_ok_outside_err() {
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part115-pick-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::create_dir_all(tmp.join("assets/ui/title")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let inside = tmp.join("assets/ui/title/start.png");
    fs::write(&inside, b"png").unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    assert_eq!(
        dir.logical_from_asset_file(&inside).unwrap(),
        "ui/title/start"
    );
    let outside = std::env::temp_dir().join(format!(
        "galeng-part115-out-{}.png",
        std::process::id()
    ));
    fs::write(&outside, b"png").unwrap();
    let err = dir.logical_from_asset_file(&outside).unwrap_err();
    assert!(
        err.to_string().contains("outside"),
        "{err}"
    );
    let _ = fs::remove_file(&outside);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn lists_scene_kind_from_raw_json_for_live_and_archive() {
    use galeng_schema::SceneKind;

    let tmp = std::env::temp_dir().join(format!("galeng-u02-kind-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let hotspot = r#"[{"id":"desk","name":"Desk","shape":{"type":"rect","x":0,"y":0,"w":10,"h":10}}]"#;
    fs::write(
        tmp.join("scenario/room.json"),
        r#"{"id":"room","sceneKind":"explore"}"#,
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/talk.json"),
        format!(r#"{{"id":"talk","sceneKind":"dialogue","hotspots":{hotspot}}}"#),
    )
    .unwrap();
    fs::write(
        tmp.join("scenario/study.json"),
        format!(r#"{{"id":"study","hotspots":{hotspot}}}"#),
    )
    .unwrap();
    fs::write(tmp.join("scenario/line.json"), r#"{"id":"line"}"#).unwrap();

    let dir = ProjectDir::open(&tmp).unwrap();
    let mut kinds: Vec<_> = dir
        .list_scenes()
        .unwrap()
        .into_iter()
        .map(|s| (s.id, s.scene_kind))
        .collect();
    kinds.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(
        kinds,
        vec![
            ("line".to_string(), SceneKind::Dialogue),
            ("room".to_string(), SceneKind::Explore),
            ("study".to_string(), SceneKind::Explore),
            ("talk".to_string(), SceneKind::Dialogue),
        ]
    );

    dir.archive_scene("study").unwrap();
    let hidden = dir.list_archived().unwrap();
    assert_eq!(hidden.len(), 1);
    assert_eq!(hidden[0].id, "study");
    assert_eq!(hidden[0].scene_kind, SceneKind::Explore);
    let live = dir.list_scenes().unwrap();
    assert!(live.iter().all(|s| s.id != "study"));
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn atomic_saves_read_back_and_dir_dest_keeps_original() {
    let tmp = std::env::temp_dir().join(format!("galeng-e01a-host-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("scenario")).unwrap();
    fs::copy(
        repo_root().join("examples/prologue/galeng.json"),
        tmp.join("galeng.json"),
    )
    .unwrap();
    let dir = ProjectDir::open(&tmp).unwrap();
    let created = dir.create_scene("atom", Some("Atom")).unwrap();
    let scene_path = dir.root.join("scenario/atom.json");
    assert_eq!(
        fs::read_to_string(&scene_path).unwrap(),
        serde_json::to_string_pretty(&created).unwrap()
    );
    assert!(!dir.root.join("scenario/atom.json.tmp").exists());

    let mut raw = serde_json::to_value(&created).unwrap();
    raw["title"] = serde_json::json!("Atom 2");
    let saved_scene = dir.save_scene("atom", &raw).unwrap();
    assert_eq!(saved_scene.title.as_deref(), Some("Atom 2"));
    assert_eq!(
        fs::read_to_string(&scene_path).unwrap(),
        serde_json::to_string_pretty(&saved_scene).unwrap()
    );

    let mut project = serde_json::to_value(dir.project().unwrap()).unwrap();
    project["title"] = serde_json::json!("Atomic title");
    let saved_project = dir.save_project(&project).unwrap();
    assert_eq!(saved_project.title, "Atomic title");
    let project_path = dir.root.join("galeng.json");
    assert_eq!(
        fs::read_to_string(&project_path).unwrap(),
        serde_json::to_string_pretty(&saved_project).unwrap()
    );
    assert!(!dir.root.join("galeng.json.tmp").exists());

    let project_before = fs::read(&project_path).unwrap();
    let scene_before = fs::read(&scene_path).unwrap();
    let root = dir.root.clone();
    let scenario = root.join("scenario");
    let other_path = scenario.join("other.json");
    let other_before = b"OTHER-ORIGINAL".as_slice();
    // Windows ignores the readonly bit on a directory, so a read-only parent
    // still accepts the temp file. A directory at the destination makes rename
    // and MoveFileEx fail. The marker keeps the original bytes.
    occupy_dest_dir(&project_path, &project_before);
    occupy_dest_dir(&scene_path, &scene_before);
    occupy_dest_dir(&other_path, other_before);
    assert!(dir.save_project(&project).is_err());
    assert!(dir.save_scene("atom", &raw).is_err());
    assert!(dir.create_scene("other", None).is_err());
    assert_eq!(fs::read(project_path.join("keep.txt")).unwrap(), project_before);
    assert_eq!(fs::read(scene_path.join("keep.txt")).unwrap(), scene_before);
    assert_eq!(fs::read(other_path.join("keep.txt")).unwrap(), other_before);
    assert!(project_path.is_dir());
    assert!(scene_path.is_dir());
    assert!(other_path.is_dir());
    assert!(!root.join("galeng.json.tmp").exists());
    assert!(!scenario.join("atom.json.tmp").exists());
    assert!(!scenario.join("other.json.tmp").exists());
    let _ = fs::remove_dir_all(&tmp);
}

/// Replace `path` with a directory whose `keep.txt` holds `marker`.
fn occupy_dest_dir(path: &std::path::Path, marker: &[u8]) {
    if path.is_dir() {
        fs::remove_dir_all(path).unwrap();
    } else if path.exists() {
        fs::remove_file(path).unwrap();
    }
    fs::create_dir(path).unwrap();
    fs::write(path.join("keep.txt"), marker).unwrap();
}
