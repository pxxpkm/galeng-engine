use galeng_player::assets::{fit_bottom_center, resolve_movie, resolve_png, Bank};
use galeng_player::fb::{mix_rgba, Framebuffer};
use galeng_player::Runtime;
use galeng_schema::repo_root;

#[test]
fn resolve_and_load_prologue_png() {
    let dir = repo_root().join("examples/prologue");
    let path = resolve_png(&dir.join("assets"), "bg/park_afternoon").expect("png path");
    assert!(path.ends_with("park_afternoon.png"));
    let mut bank = Bank::new(&dir);
    let pic = bank.get("bg/park_afternoon").expect("load park");
    assert!(pic.width > 0 && pic.height > 0);
}

#[test]
fn resolve_prologue_cg() {
    let mut bank = Bank::new(repo_root().join("examples/prologue"));
    let pic = bank.get("cg/op_still").expect("op_still");
    assert!(pic.width > 0 && pic.height > 0);
}

#[test]
fn character_png_has_alpha_path() {
    let mut bank = Bank::new(repo_root().join("examples/prologue"));
    let smile = bank.character("sora", "smile").expect("smile");
    assert!(smile.rgba.len() == (smile.width * smile.height * 4) as usize);
}

#[test]
fn missing_png_falls_back() {
    let mut bank = Bank::new(repo_root().join("examples/prologue"));
    assert!(bank.get("bg/does_not_exist").is_none());
}

#[test]
fn mix_midpoint_is_between() {
    let a = [0u8, 0, 0, 255];
    let b = [200u8, 0, 0, 255];
    let m = mix_rgba(&a, &b, 0.5);
    assert!(m[0] > 80 && m[0] < 120, "got {}", m[0]);
}

#[test]
fn blit_changes_pixels() {
    let mut fb = Framebuffer::new();
    let src = [255u8, 0, 0, 255];
    fb.blit_nearest(1, 1, &src, 10, 10, 4, 4);
    assert!(fb.count_nonblack_in(10, 10, 4, 4) > 0);
}

#[test]
fn fit_bottom_center_keeps_aspect() {
    let (x, y, w, h) = fit_bottom_center(10, 20, 0, 0, 100, 100);
    assert_eq!(w, 50);
    assert_eq!(h, 100);
    assert_eq!(x, 25);
    assert_eq!(y, 0);
}

#[test]
fn prologue_reports_opening_fade() {
    let mut rt = Runtime::load_dir(repo_root().join("examples/prologue")).unwrap();
    assert_eq!(rt.take_transition(), Some(500));
    assert_eq!(rt.take_transition(), None);
}

#[test]
fn over_budget_evicts_previous_frame() {
    let dir = repo_root().join("examples/prologue");
    let mut bank = Bank::new(&dir);
    bank.begin_frame();
    let cap = bank.get("bg/park_afternoon").expect("park").rgba.len();
    bank.set_budget(cap);
    assert!(bank.contains("bg/park_afternoon"));
    bank.begin_frame();
    assert!(bank.get("bg/home").expect("home").rgba.len() > 0);
    assert!(bank.contains("bg/home"));
    assert!(
        !bank.contains("bg/park_afternoon"),
        "old bg should leave when the next frame exceeds the cap"
    );
}

#[test]
fn same_frame_keeps_both_even_over_budget() {
    let dir = repo_root().join("examples/prologue");
    let mut bank = Bank::new(&dir);
    bank.begin_frame();
    let park_len = bank.get("bg/park_afternoon").expect("park").rgba.len();
    bank.set_budget(park_len);
    let home_len = bank.get("bg/home").expect("home").rgba.len();
    assert!(home_len > 0);
    assert!(bank.contains("bg/park_afternoon"));
    assert!(bank.contains("bg/home"));
    assert_eq!(bank.bytes_used(), park_len + home_len);
}

#[test]
fn resolve_movie_missing_is_none() {
    let dir = repo_root().join("examples/prologue/assets");
    assert!(resolve_movie(&dir, "movie/does_not_exist").is_none());
}

#[test]
fn default_budget_is_320_mib() {
    assert_eq!(
        galeng_player::assets::BUDGET_BYTES,
        320 * 1024 * 1024
    );
}
