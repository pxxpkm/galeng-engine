use std::fs;

use galeng_packer::pack;
use galeng_player::assets::{Bank, Source};
use galeng_player::cli::{parse_args, Launch};
use galeng_player::Runtime;
use galeng_schema::repo_root;

fn pack_prologue(label: &str) -> std::path::PathBuf {
    let pak = std::env::temp_dir().join(format!(
        "galeng-part49-player-{}-{}.pak",
        std::process::id(),
        label
    ));
    let _ = fs::remove_file(&pak);
    pack(repo_root().join("examples/prologue"), &pak).expect("pack prologue");
    pak
}

#[test]
fn load_pak_matches_load_dir_start() {
    let dir = repo_root().join("examples/prologue");
    let pak = pack_prologue("start");
    let from_dir = Runtime::load_dir(&dir).unwrap();
    let from_pak = Runtime::load_pak(&pak).unwrap();
    assert_eq!(from_dir.view().scene_id, from_pak.view().scene_id);
    assert_eq!(from_dir.view().say_text, from_pak.view().say_text);
    assert_eq!(from_dir.view().bgm, from_pak.view().bgm);
    assert!(matches!(from_pak.source, Source::Pak(_)));
    assert!(matches!(from_dir.source, Source::Dir(_)));
    let _ = fs::remove_file(&pak);
}

#[test]
fn bank_reads_png_from_pak() {
    let pak = pack_prologue("bank");
    let mut bank = Bank::from_source(Source::Pak(pak.clone()));
    let pic = bank.get("bg/park_afternoon").expect("park from pak");
    assert!(pic.width > 0 && pic.height > 0);
    assert!(bank.get("bg/does_not_exist").is_none());
    let _ = fs::remove_file(&pak);
}

#[test]
fn restart_stays_on_pak() {
    let pak = pack_prologue("restart");
    let mut rt = Runtime::load_pak(&pak).unwrap();
    rt.click_advance();
    rt.restart().unwrap();
    assert!(matches!(rt.source, Source::Pak(_)));
    assert_eq!(rt.view().scene_id, "park_01");
    let _ = fs::remove_file(&pak);
}

#[test]
fn parse_args_project_and_pak() {
    let dir = parse_args(&[
        "--project".into(),
        "examples/prologue".into(),
        "--scene".into(),
        "park_01".into(),
    ])
    .unwrap();
    match dir {
        Launch::Dir { project, scene, beat } => {
            assert_eq!(project, std::path::PathBuf::from("examples/prologue"));
            assert_eq!(scene.as_deref(), Some("park_01"));
            assert_eq!(beat, 0);
        }
        Launch::Pak { .. } => panic!("expected dir"),
    }

    let pak = parse_args(&["--pak".into(), "game.pak".into(), "--beat".into(), "2".into()]).unwrap();
    match pak {
        Launch::Pak { pak, beat, .. } => {
            assert_eq!(pak, std::path::PathBuf::from("game.pak"));
            assert_eq!(beat, 2);
        }
        Launch::Dir { .. } => panic!("expected pak"),
    }

    assert!(parse_args(&[
        "--project".into(),
        "a".into(),
        "--pak".into(),
        "b".into()
    ])
    .is_err());
    assert!(parse_args(&[]).is_err());
}

#[test]
fn resolve_launch_empty_uses_sibling_pak() {
    use galeng_player::cli::resolve_launch;
    let tmp = std::env::temp_dir().join(format!(
        "galeng-part116-launch-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap();
    assert!(resolve_launch(&[], &tmp).is_err());
    fs::write(tmp.join("game.pak"), b"not-a-real-pak").unwrap();
    match resolve_launch(&[], &tmp).unwrap() {
        Launch::Pak { pak, scene, beat } => {
            assert_eq!(pak, tmp.join("game.pak"));
            assert!(scene.is_none());
            assert_eq!(beat, 0);
        }
        Launch::Dir { .. } => panic!("expected pak"),
    }
    let explicit = resolve_launch(&["--pak".into(), "other.pak".into()], &tmp).unwrap();
    match explicit {
        Launch::Pak { pak, .. } => assert_eq!(pak, std::path::PathBuf::from("other.pak")),
        Launch::Dir { .. } => panic!("expected pak"),
    }
    let _ = fs::remove_dir_all(&tmp);
}


#[test]
fn user_paths_sibling_game_pak_uses_userdata() {
    use galeng_player::cli::{resolve_launch, Launch};
    use galeng_player::user_paths::user_paths;

    let exe = std::env::temp_dir().join(format!(
        "galeng-pr5-pak-sib-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&exe);
    fs::create_dir_all(&exe).unwrap();
    fs::write(exe.join("game.pak"), b"x").unwrap();

    let launch = resolve_launch(&[], &exe).unwrap();
    match &launch {
        Launch::Pak { pak, .. } => assert_eq!(pak, &exe.join("game.pak")),
        Launch::Dir { .. } => panic!("expected pak"),
    }
    let paths = user_paths(&launch, &exe, "example-prologue", &exe);
    assert_eq!(paths.config, exe.join("UserData").join("config.json"));
    assert_eq!(paths.seen, exe.join("UserData").join("seen.json"));
    assert_eq!(paths.save_dir, exe.join("UserData").join("save"));
    assert!(!paths.save_dir.to_string_lossy().contains("example-prologue"));

    // Non-sibling absolute pak beside a *different* dir → APPDATA helpers.
    let other = std::env::temp_dir().join(format!(
        "galeng-pr5-pak-other-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&other);
    fs::create_dir_all(&other).unwrap();
    fs::write(other.join("game.pak"), b"x").unwrap();
    let prev = std::env::var_os("APPDATA");
    let fake = std::env::temp_dir().join(format!(
        "galeng-pr5-pak-app-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&fake);
    fs::create_dir_all(&fake).unwrap();
    std::env::set_var("APPDATA", &fake);
    let launch2 = Launch::Pak {
        pak: other.join("game.pak"),
        scene: None,
        beat: 0,
    };
    let paths2 = user_paths(&launch2, &exe, "gid", &other);
    assert_eq!(
        paths2.save_dir,
        fake.join("Galeng").join("gid").join("save")
    );
    match prev {
        Some(v) => std::env::set_var("APPDATA", v),
        None => std::env::remove_var("APPDATA"),
    }
    let _ = fs::remove_dir_all(&exe);
    let _ = fs::remove_dir_all(&other);
    let _ = fs::remove_dir_all(&fake);
}

#[test]
fn is_sibling_rejects_relative_game_pak() {
    use galeng_player::cli::is_sibling_game_pak;
    let exe = std::env::temp_dir().join(format!(
        "galeng-pr5-pak-rel-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&exe);
    fs::create_dir_all(&exe).unwrap();
    assert!(!is_sibling_game_pak(std::path::Path::new("game.pak"), &exe));
    let _ = fs::remove_dir_all(&exe);
}
