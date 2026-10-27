//! Author-default key → action table, with optional player `input.json` override.
//!
//! Mouse L/R and wheel stay in `window.rs` (not in this table).
//! Skip is held (`is_skip_held`), not a KeyDown. The chord still uses the same
//! modifier test as every other action, so `Ctrl+K` is not "K is down".

use std::fs;
use std::path::Path;

use sdl2::keyboard::{Keycode, Mod};
use serde::Deserialize;

/// Virtual actions wired from today's `window.rs` keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Action {
    Fullscreen,
    Cancel,
    Save,
    Load,
    Slot(u8),
    Up,
    Down,
    Left,
    Right,
    Skip,
    Advance,
}

impl Action {
    /// Higher wins alone when two bindings share a chord.
    fn priority(self) -> u8 {
        match self {
            Self::Fullscreen => 90,
            Self::Cancel => 80,
            Self::Save => 70,
            Self::Load => 60,
            Self::Slot(_) => 50,
            Self::Up | Self::Down | Self::Left | Self::Right => 40,
            Self::Skip => 30,
            Self::Advance => 20,
        }
    }

    fn from_name(name: &str) -> Option<Action> {
        match name {
            "advance" => Some(Self::Advance),
            "cancel" => Some(Self::Cancel),
            "up" => Some(Self::Up),
            "down" => Some(Self::Down),
            "left" => Some(Self::Left),
            "right" => Some(Self::Right),
            "save" => Some(Self::Save),
            "load" => Some(Self::Load),
            "fullscreen" => Some(Self::Fullscreen),
            "skip" => Some(Self::Skip),
            "slot1" => Some(Self::Slot(1)),
            "slot2" => Some(Self::Slot(2)),
            "slot3" => Some(Self::Slot(3)),
            "slot4" => Some(Self::Slot(4)),
            "slot5" => Some(Self::Slot(5)),
            "slot6" => Some(Self::Slot(6)),
            "slot7" => Some(Self::Slot(7)),
            "slot8" => Some(Self::Slot(8)),
            "slot9" => Some(Self::Slot(9)),
            _ => None,
        }
    }
}

/// One chord: exact Alt/Ctrl/Shift presence; Gui must be up to hit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Chord {
    key: Keycode,
    alt: bool,
    ctrl: bool,
    shift: bool,
}

const MAX_INPUT_BYTES: u64 = 64 * 1024;

/// Modifier keys currently down. Built from scancodes in the player loop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HeldMods {
    pub alt: bool,
    pub ctrl: bool,
    pub shift: bool,
    pub gui: bool,
}

#[derive(Debug, Clone, Copy)]
struct ModFlags {
    alt: bool,
    ctrl: bool,
    shift: bool,
    gui: bool,
}

#[derive(Debug, Clone)]
pub struct InputMap {
    /// Parallel to priority walk order; each action owns its chord list.
    bindings: Vec<(Action, Vec<Chord>)>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputFile {
    schema_version: u32,
    #[serde(default)]
    bindings: serde_json::Map<String, serde_json::Value>,
}

/// Context for `apply_action_gate` (not part of the binding table).
#[derive(Debug, Clone, Copy)]
pub struct ActionGateCtx {
    pub fade_active: bool,
    /// Caller should set only when Explore would receive a bare advance (no UI overlay).
    pub explore: bool,
    pub slot_pick: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateResult {
    /// Fade consumed the advance; clear fade, do not advance the VM.
    ClearFade,
    /// Key does nothing.
    Ignore,
    /// Dispatch this action.
    Dispatch(Action),
}

impl InputMap {
    pub fn defaults() -> Self {
        let mut map = Self {
            bindings: Vec::new(),
        };
        map.set(
            Action::Advance,
            vec![
                chord(Keycode::Return, false, false, false),
                chord(Keycode::Space, false, false, false),
                chord(Keycode::KpEnter, false, false, false),
            ],
        );
        map.set(
            Action::Cancel,
            vec![chord(Keycode::Escape, false, false, false)],
        );
        map.set(Action::Up, vec![chord(Keycode::Up, false, false, false)]);
        map.set(
            Action::Down,
            vec![chord(Keycode::Down, false, false, false)],
        );
        map.set(
            Action::Left,
            vec![chord(Keycode::Left, false, false, false)],
        );
        map.set(
            Action::Right,
            vec![chord(Keycode::Right, false, false, false)],
        );
        map.set(Action::Save, vec![chord(Keycode::F5, false, false, false)]);
        map.set(Action::Load, vec![chord(Keycode::F9, false, false, false)]);
        map.set(
            Action::Fullscreen,
            vec![
                chord(Keycode::Return, true, false, false),
                chord(Keycode::KpEnter, true, false, false),
            ],
        );
        map.set(
            Action::Skip,
            vec![
                chord(Keycode::LCtrl, false, false, false),
                chord(Keycode::RCtrl, false, false, false),
            ],
        );
        for d in 1u8..=9 {
            let (num, kp) = num_keys(d);
            map.set(
                Action::Slot(d),
                vec![
                    chord(num, false, false, false),
                    chord(kp, false, false, false),
                ],
            );
        }
        map
    }

    /// Built-in defaults, then optional player override at `path`.
    /// When `log` is set, warnings are also appended to `galeng.log`.
    pub fn load(path: &Path, log: Option<&Path>) -> Self {
        let mut map = Self::defaults();
        let mut warnings = Vec::new();
        map.merge_path(path, &mut warnings);
        for w in &warnings {
            emit_input_line(w);
            if let Some(log_path) = log {
                crate::diag::append_log_line(log_path, w);
            }
        }
        map
    }

    fn set(&mut self, action: Action, chords: Vec<Chord>) {
        if let Some(slot) = self.bindings.iter_mut().find(|(a, _)| *a == action) {
            slot.1 = chords;
        } else {
            self.bindings.push((action, chords));
        }
    }

    pub fn merge_path(&mut self, path: &Path, warnings: &mut Vec<String>) {
        let meta = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => return, // absent → keep defaults
        };
        if meta.len() > MAX_INPUT_BYTES {
            warnings.push("input: ignored size".into());
            return;
        }
        let raw = match fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => return,
        };
        self.merge_json(&raw, warnings);
    }

    pub fn merge_json(&mut self, raw: &str, warnings: &mut Vec<String>) {
        let file: InputFile = match serde_json::from_str(raw) {
            Ok(f) => f,
            Err(_) => {
                warnings.push("input: ignored schema".into());
                return;
            }
        };
        if file.schema_version != 1 {
            warnings.push("input: ignored schema".into());
            return;
        }
        for (name, value) in &file.bindings {
            let Some(action) = Action::from_name(name) else {
                continue; // unknown action name: ignore
            };
            let tokens = match value.as_array() {
                Some(arr) => arr,
                None => continue,
            };
            let mut chords = Vec::new();
            for tok in tokens {
                let Some(s) = tok.as_str() else { continue };
                match parse_chord(s) {
                    Some(c) => chords.push(c),
                    None => {
                        let safe = sanitize_key_token(s);
                        warnings.push(format!("input: unknown key {safe}"));
                    }
                }
            }
            // Present key (even []) replaces previous layer for this action.
            self.set(action, chords);
        }
    }

    /// At most one action; higher priority wins alone.
    pub fn action_for(&self, key: Keycode, keymod: Mod) -> Option<Action> {
        let flags = flags_from_mod(keymod);
        self.best_action(key, flags)
    }

    /// True while a skip chord is held and no higher-priority action owns that same chord.
    pub fn is_skip_held(&self, key_down: impl Fn(Keycode) -> bool, held: HeldMods) -> bool {
        let flags = flags_from_held(held);
        if flags.gui {
            return false;
        }
        let Some((_, chords)) = self.bindings.iter().find(|(a, _)| *a == Action::Skip) else {
            return false;
        };
        chords.iter().any(|c| {
            key_down(c.key)
                && chord_hit(c, flags)
                && self.best_action(c.key, flags) == Some(Action::Skip)
        })
    }

    fn best_action(&self, key: Keycode, flags: ModFlags) -> Option<Action> {
        if flags.gui {
            return None;
        }
        let mut best: Option<(u8, Action)> = None;
        for (action, chords) in &self.bindings {
            for c in chords {
                if chord_hit(c, flags) && c.key == key {
                    let p = action.priority();
                    match best {
                        Some((bp, _)) if bp >= p => {}
                        _ => best = Some((p, *action)),
                    }
                }
            }
        }
        best.map(|(_, a)| a)
    }

    #[cfg(test)]
    fn chords_for(&self, action: Action) -> &[Chord] {
        self.bindings
            .iter()
            .find(|(a, _)| *a == action)
            .map(|(_, c)| c.as_slice())
            .unwrap_or(&[])
    }
}

fn chord(key: Keycode, alt: bool, ctrl: bool, shift: bool) -> Chord {
    Chord {
        key,
        alt,
        ctrl,
        shift,
    }
}

fn num_keys(d: u8) -> (Keycode, Keycode) {
    match d {
        1 => (Keycode::Num1, Keycode::Kp1),
        2 => (Keycode::Num2, Keycode::Kp2),
        3 => (Keycode::Num3, Keycode::Kp3),
        4 => (Keycode::Num4, Keycode::Kp4),
        5 => (Keycode::Num5, Keycode::Kp5),
        6 => (Keycode::Num6, Keycode::Kp6),
        7 => (Keycode::Num7, Keycode::Kp7),
        8 => (Keycode::Num8, Keycode::Kp8),
        _ => (Keycode::Num9, Keycode::Kp9),
    }
}

/// Author-facing key tokens (spec names), not raw SDL_GetKeyName strings.
fn keycode_from_token(name: &str) -> Option<Keycode> {
    match name {
        "Return" | "Enter" => Some(Keycode::Return),
        "Space" => Some(Keycode::Space),
        "Escape" | "Esc" => Some(Keycode::Escape),
        "Up" => Some(Keycode::Up),
        "Down" => Some(Keycode::Down),
        "Left" => Some(Keycode::Left),
        "Right" => Some(Keycode::Right),
        "F5" => Some(Keycode::F5),
        "F9" => Some(Keycode::F9),
        "KpEnter" => Some(Keycode::KpEnter),
        "LCtrl" => Some(Keycode::LCtrl),
        "RCtrl" => Some(Keycode::RCtrl),
        "LShift" => Some(Keycode::LShift),
        "RShift" => Some(Keycode::RShift),
        "LAlt" => Some(Keycode::LAlt),
        "RAlt" => Some(Keycode::RAlt),
        "Num0" => Some(Keycode::Num0),
        "Num1" => Some(Keycode::Num1),
        "Num2" => Some(Keycode::Num2),
        "Num3" => Some(Keycode::Num3),
        "Num4" => Some(Keycode::Num4),
        "Num5" => Some(Keycode::Num5),
        "Num6" => Some(Keycode::Num6),
        "Num7" => Some(Keycode::Num7),
        "Num8" => Some(Keycode::Num8),
        "Num9" => Some(Keycode::Num9),
        "Kp0" => Some(Keycode::Kp0),
        "Kp1" => Some(Keycode::Kp1),
        "Kp2" => Some(Keycode::Kp2),
        "Kp3" => Some(Keycode::Kp3),
        "Kp4" => Some(Keycode::Kp4),
        "Kp5" => Some(Keycode::Kp5),
        "Kp6" => Some(Keycode::Kp6),
        "Kp7" => Some(Keycode::Kp7),
        "Kp8" => Some(Keycode::Kp8),
        "Kp9" => Some(Keycode::Kp9),
        // SDL name fallback when available (may need SDL init on some builds).
        other => Keycode::from_name(other),
    }
}

/// Grammar: optional `Alt+` / `Ctrl+` / `Shift+` in that order, then key name.
/// No `LAlt+` prefixes. Bare key ⇒ Alt/Ctrl/Shift all up.
fn parse_chord(token: &str) -> Option<Chord> {
    let mut rest = token.trim();
    let mut alt = false;
    let mut ctrl = false;
    let mut shift = false;

    if let Some(r) = rest.strip_prefix("Alt+") {
        alt = true;
        rest = r;
    }
    if let Some(r) = rest.strip_prefix("Ctrl+") {
        ctrl = true;
        rest = r;
    }
    if let Some(r) = rest.strip_prefix("Shift+") {
        shift = true;
        rest = r;
    }
    // Reject leftover modifier-style prefixes (e.g. LAlt+, wrong order).
    if rest.contains('+') {
        return None;
    }
    let key = keycode_from_token(rest)?;
    Some(chord(key, alt, ctrl, shift))
}

/// Fade / explore / slot gates — not part of the binding table.
pub fn apply_action_gate(action: Action, ctx: ActionGateCtx) -> GateResult {
    match action {
        Action::Advance if ctx.fade_active => GateResult::ClearFade,
        Action::Advance if ctx.explore => GateResult::Ignore,
        Action::Slot(_) if !ctx.slot_pick => GateResult::Ignore,
        other => GateResult::Dispatch(other),
    }
}

fn sanitize_key_token(tok: &str) -> String {
    if tok.contains('\\') || tok.contains('/') || looks_like_drive(tok) {
        return "?".into();
    }
    tok.chars().take(64).collect()
}

fn looks_like_drive(tok: &str) -> bool {
    let b = tok.as_bytes();
    b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':'
}

fn flags_from_mod(keymod: Mod) -> ModFlags {
    ModFlags {
        alt: keymod.intersects(Mod::LALTMOD | Mod::RALTMOD),
        ctrl: keymod.intersects(Mod::LCTRLMOD | Mod::RCTRLMOD),
        shift: keymod.intersects(Mod::LSHIFTMOD | Mod::RSHIFTMOD),
        gui: keymod.intersects(Mod::LGUIMOD | Mod::RGUIMOD),
    }
}

fn flags_from_held(held: HeldMods) -> ModFlags {
    ModFlags {
        alt: held.alt,
        ctrl: held.ctrl,
        shift: held.shift,
        gui: held.gui,
    }
}

/// A modifier key sets its own bit in the OS mod state. The chord `LCtrl`
/// means that key, not "Ctrl plus another key", so that bit is not required.
fn chord_hit(c: &Chord, mut flags: ModFlags) -> bool {
    if matches!(c.key, Keycode::LAlt | Keycode::RAlt) {
        flags.alt = false;
    }
    if matches!(c.key, Keycode::LCtrl | Keycode::RCtrl) {
        flags.ctrl = false;
    }
    if matches!(c.key, Keycode::LShift | Keycode::RShift) {
        flags.shift = false;
    }
    !flags.gui && c.alt == flags.alt && c.ctrl == flags.ctrl && c.shift == flags.shift
}

fn emit_input_line(line: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new(&format!("{line}\n"))
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            windows::Win32::System::Diagnostics::Debug::OutputDebugStringW(windows::core::PCWSTR(
                wide.as_ptr(),
            ));
        }
    }
    #[cfg(not(windows))]
    {
        eprintln!("{line}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mods(alt: bool, ctrl: bool, shift: bool) -> Mod {
        let mut m = Mod::NOMOD;
        if alt {
            m |= Mod::LALTMOD;
        }
        if ctrl {
            m |= Mod::LCTRLMOD;
        }
        if shift {
            m |= Mod::LSHIFTMOD;
        }
        m
    }

    #[test]
    fn fade_swallows_advance() {
        let r = apply_action_gate(
            Action::Advance,
            ActionGateCtx {
                fade_active: true,
                explore: false,
                slot_pick: false,
            },
        );
        assert_eq!(r, GateResult::ClearFade);
    }

    #[test]
    fn explore_advance_is_noop() {
        let r = apply_action_gate(
            Action::Advance,
            ActionGateCtx {
                fade_active: false,
                explore: true,
                slot_pick: false,
            },
        );
        assert_eq!(r, GateResult::Ignore);
    }

    #[test]
    fn slot_digits_outside_slot_pick_do_not_become_advance() {
        let r = apply_action_gate(
            Action::Slot(3),
            ActionGateCtx {
                fade_active: false,
                explore: false,
                slot_pick: false,
            },
        );
        assert_eq!(r, GateResult::Ignore);
        // And action_for still yields Slot, never Advance, for digit keys.
        let map = InputMap::defaults();
        assert_eq!(
            map.action_for(Keycode::Num3, mods(false, false, false)),
            Some(Action::Slot(3))
        );
        assert_ne!(
            map.action_for(Keycode::Num3, mods(false, false, false)),
            Some(Action::Advance)
        );
    }

    #[test]
    fn unknown_key_does_nothing() {
        let map = InputMap::defaults();
        // F1 is not bound in defaults.
        assert_eq!(map.action_for(Keycode::F1, mods(false, false, false)), None);
    }

    #[test]
    fn empty_array_unbinds() {
        let mut map = InputMap::defaults();
        let mut w = Vec::new();
        map.merge_json(r#"{"schemaVersion":1,"bindings":{"cancel":[]}}"#, &mut w);
        assert!(map.chords_for(Action::Cancel).is_empty());
        assert_eq!(
            map.action_for(Keycode::Escape, mods(false, false, false)),
            None
        );
        // Advance still present (absent key keeps previous layer).
        assert_eq!(
            map.action_for(Keycode::Space, mods(false, false, false)),
            Some(Action::Advance)
        );
    }

    #[test]
    fn absent_action_keeps_previous_layer() {
        let mut map = InputMap::defaults();
        let mut w = Vec::new();
        map.merge_json(r#"{"schemaVersion":1,"bindings":{"save":["F6"]}}"#, &mut w);
        // cancel not in file → still Escape
        assert_eq!(
            map.action_for(Keycode::Escape, mods(false, false, false)),
            Some(Action::Cancel)
        );
        assert_eq!(map.action_for(Keycode::F5, mods(false, false, false)), None);
        assert_eq!(
            map.action_for(Keycode::F6, mods(false, false, false)),
            Some(Action::Save)
        );
    }

    #[test]
    fn schema_version_not_1_ignores_whole_file() {
        let mut map = InputMap::defaults();
        let mut w = Vec::new();
        map.merge_json(r#"{"schemaVersion":2,"bindings":{"cancel":[]}}"#, &mut w);
        assert!(w.iter().any(|s| s.contains("ignored schema")));
        assert_eq!(
            map.action_for(Keycode::Escape, mods(false, false, false)),
            Some(Action::Cancel)
        );
    }

    #[test]
    fn alt_return_only_fullscreen() {
        let map = InputMap::defaults();
        assert_eq!(
            map.action_for(Keycode::Return, mods(true, false, false)),
            Some(Action::Fullscreen)
        );
        assert_ne!(
            map.action_for(Keycode::Return, mods(true, false, false)),
            Some(Action::Advance)
        );
        // Bare Return is still advance.
        assert_eq!(
            map.action_for(Keycode::Return, mods(false, false, false)),
            Some(Action::Advance)
        );
    }

    #[test]
    fn unknown_key_token_warns_and_keeps_siblings() {
        let mut map = InputMap::defaults();
        let mut w = Vec::new();
        map.merge_json(
            r#"{"schemaVersion":1,"bindings":{"advance":["Return","NotAKey","Space"]}}"#,
            &mut w,
        );
        assert!(w.iter().any(|s| s.contains("unknown key NotAKey")));
        assert_eq!(
            map.action_for(Keycode::Return, mods(false, false, false)),
            Some(Action::Advance)
        );
        assert_eq!(
            map.action_for(Keycode::Space, mods(false, false, false)),
            Some(Action::Advance)
        );
    }

    #[test]
    fn gui_blocks_all_actions() {
        let map = InputMap::defaults();
        let mut m = mods(false, false, false);
        m |= Mod::LGUIMOD;
        assert_eq!(map.action_for(Keycode::Escape, m), None);
    }

    fn held(ctrl: bool) -> HeldMods {
        HeldMods {
            alt: false,
            ctrl,
            shift: false,
            gui: false,
        }
    }

    #[test]
    fn default_ctrl_stays_skip_while_ctrl_mod_is_down() {
        let map = InputMap::defaults();
        assert!(map.is_skip_held(|k| k == Keycode::LCtrl, held(true)));
        assert!(!map.is_skip_held(|k| k == Keycode::K, held(true)));
        assert_eq!(
            map.action_for(Keycode::LCtrl, mods(false, true, false)),
            Some(Action::Skip)
        );
    }

    #[test]
    fn ctrl_k_skip_requires_ctrl_and_not_bare_k() {
        let mut map = InputMap::defaults();
        let mut w = Vec::new();
        map.merge_json(
            r#"{"schemaVersion":1,"bindings":{"skip":["Ctrl+F6"]}}"#,
            &mut w,
        );
        assert!(map.is_skip_held(|k| k == Keycode::F6, held(true)));
        assert!(!map.is_skip_held(|k| k == Keycode::F6, held(false)));
        assert_eq!(
            map.action_for(Keycode::F6, mods(false, true, false)),
            Some(Action::Skip)
        );
        assert_eq!(map.action_for(Keycode::F6, mods(false, false, false)), None);
    }

    #[test]
    fn skip_on_space_wins_over_advance() {
        let mut map = InputMap::defaults();
        let mut w = Vec::new();
        map.merge_json(
            r#"{"schemaVersion":1,"bindings":{"skip":["Space"]}}"#,
            &mut w,
        );
        assert_eq!(
            map.action_for(Keycode::Space, mods(false, false, false)),
            Some(Action::Skip)
        );
        assert!(map.is_skip_held(|k| k == Keycode::Space, held(false)));
        assert!(!map.is_skip_held(|k| k == Keycode::Return, held(false)));
    }

    #[test]
    fn right_and_wheel_not_in_action_table() {
        // Documented by absence: no Action variant for mouse buttons or wheel.
        // Action::from_name rejects mouse-ish names.
        assert!(Action::from_name("mouseRight").is_none());
        assert!(Action::from_name("wheel").is_none());
        assert!(Action::from_name("click").is_none());
    }
}
