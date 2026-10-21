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

#[test]
fn resolve_invocation_allows_diag_alone_and_with_pak() {
    use galeng_player::cli::resolve_invocation;

    let tmp = std::env::temp_dir().join(format!(
        "galeng-pr7-inv-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap();

    let alone = resolve_invocation(&["--diag".into()], &tmp).unwrap();
    assert!(alone.diag);
    assert!(alone.launch.is_none());

    fs::write(tmp.join("game.pak"), b"x").unwrap();
    let with_pak = resolve_invocation(
        &["--diag".into(), "--pak".into(), tmp.join("game.pak").to_string_lossy().into()],
        &tmp,
    )
    .unwrap();
    assert!(with_pak.diag);
    assert!(matches!(with_pak.launch, Some(Launch::Pak { .. })));

    let both = resolve_invocation(
        &[
            "--diag".into(),
            "--project".into(),
            "a".into(),
            "--pak".into(),
            "b".into(),
        ],
        &tmp,
    )
    .unwrap();
    assert!(both.diag);
    assert!(both.diag_note.is_some());

    let _ = fs::remove_dir_all(&tmp);
}


fn write_stored_zip(path: &std::path::Path, entries: &[(&str, &[u8])]) {
    // Minimal ZIP (stored) so player tests need no zip dev-dep.
    let mut out = Vec::new();
    let mut central = Vec::new();
    let mut count = 0u16;
    for (name, data) in entries {
        let name_b = name.as_bytes();
        let local_off = out.len() as u32;
        let crc = crc32(data);
        out.extend_from_slice(&0x04034b50u32.to_le_bytes());
        out.extend_from_slice(&20u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&crc.to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(name_b.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(name_b);
        out.extend_from_slice(data);

        central.extend_from_slice(&0x02014b50u32.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&crc.to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(name_b.len() as u16).to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&local_off.to_le_bytes());
        central.extend_from_slice(name_b);
        count += 1;
    }
    let cd_off = out.len() as u32;
    let cd_len = central.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x06054b50u32.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&cd_len.to_le_bytes());
    out.extend_from_slice(&cd_off.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    fs::write(path, out).unwrap();
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            let mask = (!(crc & 1)).wrapping_add(1); // 0 or 0xFFFF_FFFF
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

#[test]
fn load_pak_rejects_newer_schema() {
    let pak = std::env::temp_dir().join(format!(
        "galeng-pr8-player-schema2-{}",
        std::process::id()
    ));
    let _ = fs::remove_file(&pak);
    write_stored_zip(
        &pak,
        &[
            ("galeng.json", b"{}"),
            ("index.json", br#"{"schemaVersion":2,"assets":{}}"#),
        ],
    );
    let err = match Runtime::load_pak(&pak) { Ok(_) => panic!("expected err"), Err(e) => e.to_string() };
    assert!(
        err.contains("pak schema 2 is newer than this player (1)"),
        "{err}"
    );
    assert!(!err.contains(pak.to_string_lossy().as_ref()));
    let _ = fs::remove_file(&pak);
}

#[test]
fn pak_reader_missing_index_stays_schema_1() {
    let pak = std::env::temp_dir().join(format!(
        "galeng-pr8-player-noindex-{}",
        std::process::id()
    ));
    let _ = fs::remove_file(&pak);
    write_stored_zip(&pak, &[("galeng.json", b"{}")]);
    let reader = galeng_packer::PakReader::open(&pak).expect("legacy open");
    assert_eq!(reader.index.schema_version, galeng_packer::PAK_SCHEMA);
    assert!(reader.index.assets.is_empty());
    let _ = fs::remove_file(&pak);
}
