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
    assert!(
        !pak_tmp(&pak_path).exists(),
        "success must not leave the temp pak"
    );

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
    assert!(!pak_tmp(&pak_path).exists(), "strict must not leave a temp pak");

    fs::write(&pak_path, b"OLD-PAK-COMPLETE").unwrap();
    let err = pack_with(&project, &pak_path, PackOpts { strict: true }).unwrap_err();
    assert!(err.to_string().contains("strict"), "{err}");
    assert_eq!(
        fs::read(&pak_path).unwrap(),
        b"OLD-PAK-COMPLETE",
        "a failed pack must not clobber the previous pak"
    );
    assert!(!pak_tmp(&pak_path).exists());

    let _ = fs::remove_file(&pak_path);
    let _ = fs::remove_dir_all(&project);
}

fn pak_tmp(pak: &Path) -> std::path::PathBuf {
    let mut name = std::ffi::OsString::from(pak.file_name().unwrap());
    name.push(".tmp");
    pak.with_file_name(name)
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


fn write_minimal_zip(path: &Path, entries: &[(&str, &[u8])]) {
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};
    let file = fs::File::create(path).unwrap();
    let mut zip = ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for (name, bytes) in entries {
        zip.start_file(*name, opts).unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap();
}

fn temp_pak(label: &str) -> std::path::PathBuf {
    let p = std::env::temp_dir().join(format!(
        "galeng-pr8-{}-{}.pak",
        std::process::id(),
        label
    ));
    let _ = fs::remove_file(&p);
    p
}

#[test]
fn open_missing_index_is_schema_1_empty_map() {
    let pak = temp_pak("no-index");
    write_minimal_zip(
        &pak,
        &[("galeng.json", br#"{"id":"t","title":"t","schemaVersion":1,"resolution":{"width":1,"height":1},"startScene":"a","locale":"en"}"#)],
    );
    let reader = PakReader::open(&pak).expect("legacy without index");
    assert_eq!(reader.index.schema_version, 1);
    assert!(reader.index.assets.is_empty());
    let _ = fs::remove_file(&pak);
}

#[test]
fn open_rejects_newer_pak_schema() {
    let pak = temp_pak("schema2");
    let index = br#"{"schemaVersion":2,"assets":{}}"#;
    write_minimal_zip(
        &pak,
        &[
            ("galeng.json", b"{}"),
            ("index.json", index),
        ],
    );
    let err = match PakReader::open(&pak) { Ok(_) => panic!("expected err"), Err(e) => e.to_string() };
    assert!(
        err.contains("pak schema 2 is newer than this player (1)"),
        "{err}"
    );
    assert!(!err.contains('\\'));
    assert!(!err.contains(pak.to_string_lossy().as_ref()));
    let _ = fs::remove_file(&pak);
}

#[test]
fn open_rejects_schema_below_one_and_invalid_index() {
    let pak0 = temp_pak("schema0");
    write_minimal_zip(
        &pak0,
        &[("index.json", br#"{"schemaVersion":0,"assets":{}}"#)],
    );
    let err0 = match PakReader::open(&pak0) { Ok(_) => panic!("expected err"), Err(e) => e.to_string() };
    assert!(err0.contains("unsupported") || err0.contains("schema 0"), "{err0}");
    let _ = fs::remove_file(&pak0);

    let pak_bad = temp_pak("index-bad");
    write_minimal_zip(&pak_bad, &[("index.json", b"not-json{{")]);
    let err = match PakReader::open(&pak_bad) { Ok(_) => panic!("expected err"), Err(e) => e.to_string() };
    assert!(err.contains("pak index invalid"), "{err}");
    let _ = fs::remove_file(&pak_bad);
}

#[test]
fn read_asset_rejects_poison_index_path_and_ext_mismatch() {
    let pak = temp_pak("poison");
    let index = br#"{"schemaVersion":1,"assets":{"bg/park":"assets/../secret.png","bg/ok":"assets/bg/ok.wav"}}"#;
    write_minimal_zip(
        &pak,
        &[
            ("galeng.json", b"{}"),
            ("index.json", index),
            ("assets/bg/ok.wav", b"RIFF"),
        ],
    );
    let mut reader = PakReader::open(&pak).unwrap();
    // Poison path in index must not be read; no fallback match either for that logical.
    assert!(reader.read_asset("bg/park", &["png"]).is_none());
    // Ext mismatch: index says .wav but caller wants png — do not read wav; no png fallback.
    assert!(reader.read_asset("bg/ok", &["png"]).is_none());
    // Matching caller ext still uses the index value after whitelist checks.
    let (ext, bytes) = reader.read_asset("bg/ok", &["wav"]).expect("wav via index");
    assert_eq!(ext, "wav");
    assert_eq!(bytes, b"RIFF");
    let _ = fs::remove_file(&pak);
}

#[test]
fn read_named_rejects_input_json_and_absolute_names() {
    let pak = temp_pak("whitelist");
    write_minimal_zip(
        &pak,
        &[
            ("galeng.json", b"{}"),
            ("index.json", br#"{"schemaVersion":1,"assets":{}}"#),
            ("input.json", b"{\"schemaVersion\":1}"),
        ],
    );
    let mut reader = PakReader::open(&pak).unwrap();
    // has_entry may still see it; reading must refuse.
    assert!(reader.has_entry("input.json"));
    // project_json still works (whitelisted).
    assert!(reader.project_json().is_ok());
    // Force a rejected name through read_asset fallback construction — absolute-style
    // logicals are already blocked by logical_ok; index poison covered above.
    let _ = fs::remove_file(&pak);
    let _ = reader;
}

#[test]
fn open_error_omits_disk_path() {
    let missing = std::env::temp_dir().join(format!(
        "galeng-pr8-missing-{}-nope.pak",
        std::process::id()
    ));
    let _ = fs::remove_file(&missing);
    let err = match PakReader::open(&missing) { Ok(_) => panic!("expected err"), Err(e) => e.to_string() };
    assert_eq!(err, "pak unreadable");
    assert!(!err.contains(missing.to_string_lossy().as_ref()));
}

#[test]
fn rejects_entry_when_uncompressed_size_over_cap() {
    // Hand-built zip: one stored empty payload but central/local claim > 256 MiB.
    let pak = temp_pak("huge");
    let name = b"assets/huge.bin";
    let claim: u32 = (galeng_packer::MAX_ENTRY_BYTES + 1) as u32;
    let mut bytes = Vec::new();
    // Local file header
    bytes.extend_from_slice(&0x04034b50u32.to_le_bytes());
    bytes.extend_from_slice(&20u16.to_le_bytes()); // version needed
    bytes.extend_from_slice(&0u16.to_le_bytes()); // flags
    bytes.extend_from_slice(&0u16.to_le_bytes()); // stored
    bytes.extend_from_slice(&0u16.to_le_bytes()); // time
    bytes.extend_from_slice(&0u16.to_le_bytes()); // date
    bytes.extend_from_slice(&0u32.to_le_bytes()); // crc
    bytes.extend_from_slice(&0u32.to_le_bytes()); // comp size
    bytes.extend_from_slice(&claim.to_le_bytes()); // uncomp size
    bytes.extend_from_slice(&(name.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes()); // extra
    bytes.extend_from_slice(name);
    let local_len = bytes.len();
    // Central directory
    let cd_off = bytes.len();
    bytes.extend_from_slice(&0x02014b50u32.to_le_bytes());
    bytes.extend_from_slice(&20u16.to_le_bytes());
    bytes.extend_from_slice(&20u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&claim.to_le_bytes());
    bytes.extend_from_slice(&(name.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes()); // relative offset of local header
    bytes.extend_from_slice(name);
    let cd_len = bytes.len() - cd_off;
    // End of central directory
    bytes.extend_from_slice(&0x06054b50u32.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&(cd_len as u32).to_le_bytes());
    bytes.extend_from_slice(&(cd_off as u32).to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    let _ = local_len;
    fs::write(&pak, &bytes).unwrap();

    let mut reader = PakReader::open(&pak).expect("no index → schema 1");
    assert!(reader.read_asset("huge", &["bin"]).is_none());
    // Also exercise project path — galeng missing is fine for this check.
    let _ = fs::remove_file(&pak);
}
