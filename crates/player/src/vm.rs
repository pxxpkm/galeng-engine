use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::assets::Source;
use galeng_explore::ItemUseMode;
use galeng_schema::{
    apply_set, condition_holds, validate_project_file, validate_scene_str, AutoAdvance, Beat,
    Camera, CharOnStage, ChoiceOption, Exit, HotspotShape, Project, Scene, SceneKind, Trans,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum VmError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("schema: {0}")]
    Schema(#[from] galeng_schema::Error),
    #[error("missing start scene `{0}`")]
    MissingStart(String),
    #[error("save: {0}")]
    Save(#[from] crate::save::SaveError),
    #[error("pak: {0}")]
    Pak(#[from] galeng_packer::Error),
    #[error("explore: {0}")]
    Explore(#[from] galeng_explore::Error),
    #[error("beat not found in scene `{0}`")]
    BeatNotFound(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Phase {
    /// Point-and-click explore (driven by galeng-explore).
    Explore,
    Dialogue,
    Choices,
    Ended,
    MissingScene(String),
}

#[derive(Debug, Clone)]
pub struct View {
    pub bg: Option<String>,
    pub chars: Vec<CharOnStage>,
    pub prev_chars: Vec<CharOnStage>,
    pub char_slide_ms: Option<u32>,
    pub cg: Option<String>,
    pub say_speaker: Option<String>,
    pub say_text: Option<String>,
    pub bgm: Option<String>,
    pub bgm_fade_ms: u32,
    pub auto_advance_ms: Option<u32>,
    pub voice: Option<String>,
    pub choices: Vec<ChoiceOption>,
    pub phase: Phase,
    pub scene_id: String,
    pub beat_index: usize,
    pub fx_wait_ms: Option<u32>,
    pub fx_shake_ms: Option<u32>,
    pub fx_flash_ms: Option<u32>,
    pub movie: Option<String>,
    pub amb: Option<String>,
    pub camera: Camera,
}

pub struct Runtime {
    pub project: Project,
    scenes: HashMap<String, Scene>,
    pub source: Source,
    pub project_dir: PathBuf,
    scene_id: String,
    beat_index: usize,
    vars: HashMap<String, i32>,
    last_say: Option<(String, String)>,
    phase: Phase,
    pending_fade_ms: Option<u32>,
    pending_se: Vec<String>,
    carried_bgm: Option<String>,
    backlog: Vec<crate::backlog::BacklogLine>,
    /// When set, galeng-explore owns the scene: the start room was explore,
    /// or dialogue gameplay handed off via next/goto/Call/Return.
    explore: Option<galeng_explore::Engine>,
    /// Beat whose `set` was already applied. Load marks the restored beat so
    /// settle does not add it again. A later beat, or the same index in another
    /// scene, still applies.
    set_applied: Option<(String, usize)>,
}

fn load_dir_project(dir: &Path) -> Result<(Project, HashMap<String, Scene>), VmError> {
    let project = validate_project_file(dir.join("galeng.json"))?;
    let mut scenes = HashMap::new();
    let scenario_dir = dir.join("scenario");
    if scenario_dir.is_dir() {
        for entry in fs::read_dir(&scenario_dir)? {
            let entry = entry?;
            if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let text = fs::read_to_string(entry.path())?;
            let scene = validate_scene_str(&text)?;
            scenes.insert(scene.id.clone(), scene);
        }
    }
    Ok((project, scenes))
}

fn load_pak_project(path: &Path) -> Result<(Project, HashMap<String, Scene>), VmError> {
    let mut pak = galeng_packer::PakReader::open(path)?;
    let project = galeng_schema::validate_project_str(&pak.project_json()?)?;
    let mut scenes = HashMap::new();
    for (_name, text) in pak.scene_texts()? {
        let scene = validate_scene_str(&text)?;
        scenes.insert(scene.id.clone(), scene);
    }
    Ok((project, scenes))
}

impl Runtime {
    pub fn load_dir(dir: impl AsRef<Path>) -> Result<Self, VmError> {
        Self::load_dir_at(dir, None, 0)
    }

    pub fn load_dir_at(
        dir: impl AsRef<Path>,
        scene: Option<&str>,
        beat: usize,
    ) -> Result<Self, VmError> {
        Self::load_from(Source::Dir(dir.as_ref().to_path_buf()), scene, beat)
    }

    pub fn load_pak(path: impl AsRef<Path>) -> Result<Self, VmError> {
        Self::load_pak_at(path, None, 0)
    }

    pub fn load_pak_at(
        path: impl AsRef<Path>,
        scene: Option<&str>,
        beat: usize,
    ) -> Result<Self, VmError> {
        Self::load_from(Source::Pak(path.as_ref().to_path_buf()), scene, beat)
    }

    fn load_from(source: Source, scene: Option<&str>, beat: usize) -> Result<Self, VmError> {
        let project_dir = source.project_dir();
        let (project, scenes) = match &source {
            Source::Dir(dir) => load_dir_project(dir)?,
            Source::Pak(path) => load_pak_project(path)?,
        };

        let start = scene
            .map(str::to_string)
            .unwrap_or_else(|| project.start_scene.clone());
        if !scenes.contains_key(&start) {
            return Err(VmError::MissingStart(start));
        }

        let start_explore = scenes
            .get(&start)
            .is_some_and(|s| s.scene_kind == SceneKind::Explore);

        let explore = if start_explore {
            // Engine enters start_scene (runs onEnter). Scene/beat CLI jump into
            // explore is not supported yet — always boots at project.start_scene.
            Some(galeng_explore::Engine::new(
                project.clone(),
                scenes.clone(),
            )?)
        } else {
            None
        };

        let mut rt = Self {
            project,
            scenes,
            source,
            project_dir,
            scene_id: start,
            beat_index: beat,
            vars: HashMap::new(),
            last_say: None,
            phase: Phase::Dialogue,
            pending_fade_ms: None,
            pending_se: Vec::new(),
            carried_bgm: None,
            backlog: Vec::new(),
            explore,
            set_applied: None,
        };
        if rt.explore.is_none() {
            rt.settle();
        }
        Ok(rt)
    }

    pub fn take_transition(&mut self) -> Option<u32> {
        self.pending_fade_ms.take()
    }

    pub fn take_se(&mut self) -> Vec<String> {
        let mut out = std::mem::take(&mut self.pending_se);
        if let Some(eng) = &mut self.explore {
            out.extend(eng.take_pending_se());
        }
        out
    }

    pub fn uses_explore(&self) -> bool {
        self.explore.is_some()
    }

    pub fn select_verb(&mut self, id: Option<&str>) {
        if let Some(eng) = &mut self.explore {
            eng.select_verb(id);
        }
    }

    pub fn select_item(&mut self, id: Option<&str>) {
        if let Some(eng) = &mut self.explore {
            eng.select_item(id);
        }
    }

    /// Explore hit-test click (or dismiss say / advance dialogue via Engine).
    pub fn click_at(&mut self, x: i32, y: i32) {
        if let Some(eng) = &mut self.explore {
            let _ = eng.click(x, y);
        }
    }

    /// Direct hotspot interact (tests / tools). No-op outside explore.
    pub fn interact_hotspot(&mut self, hotspot_id: &str) {
        if let Some(eng) = &mut self.explore {
            let _ = eng.interact(hotspot_id);
        }
    }

    /// Use inventory item on hotspot with Aim or Drag gesture.
    pub fn interact_with_item(&mut self, hotspot_id: &str, item_id: &str, mode: ItemUseMode) {
        if let Some(eng) = &mut self.explore {
            let _ = eng.interact_with_item(hotspot_id, item_id, mode);
        }
    }

    /// Visible hotspot shapes for minimal overlay.
    pub fn explore_hotspots(&self) -> Vec<(String, HotspotShape)> {
        match &self.explore {
            Some(eng) => eng.hotspot_overlay(),
            None => Vec::new(),
        }
    }

    pub fn explore_selected_verb(&self) -> Option<String> {
        self.explore.as_ref().and_then(|e| e.view().selected_verb)
    }

    pub fn explore_pending_item(&self) -> Option<String> {
        self.explore.as_ref().and_then(|e| e.view().pending_item)
    }

    pub fn explore_inventory(&self) -> Vec<String> {
        match &self.explore {
            Some(eng) => eng.view().inventory.into_iter().collect(),
            None => Vec::new(),
        }
    }

    /// Switch value owned by the explore engine, if a handoff has happened.
    pub fn explore_switch(&self, id: &str) -> Option<bool> {
        self.explore
            .as_ref()
            .and_then(|eng| eng.view().switches.get(id).copied())
    }

    pub fn explore_hit(&self, x: i32, y: i32) -> Option<String> {
        self.explore
            .as_ref()
            .and_then(|e| e.hit_test(x, y).map(str::to_string))
    }

    pub fn explore_primary_action(
        &self,
        hotspot_id: &str,
    ) -> Option<galeng_explore::AvailableAction> {
        self.explore
            .as_ref()
            .and_then(|e| e.primary_action(hotspot_id))
    }

    pub fn explore_available_actions(
        &self,
        hotspot_id: &str,
    ) -> Vec<galeng_explore::AvailableAction> {
        match &self.explore {
            Some(eng) => eng.available_actions(hotspot_id),
            None => Vec::new(),
        }
    }

    pub fn explore_empty_action(&self) -> Option<galeng_explore::AvailableAction> {
        self.explore.as_ref().map(|e| e.empty_click_action())
    }

    pub fn interact_empty(&mut self) {
        if let Some(eng) = &mut self.explore {
            let _ = eng.interact_empty();
        }
    }

    pub fn vars(&self) -> &HashMap<String, i32> {
        &self.vars
    }

    pub fn backlog(&self) -> &[crate::backlog::BacklogLine] {
        &self.backlog
    }

    pub fn restart(&mut self) -> Result<(), VmError> {
        let source = self.source.clone();
        *self = Self::load_from(source, None, 0)?;
        Ok(())
    }

    /// Jump to a previously shown say. May change scene. Does not rewind vars.
    pub fn jump_back(&mut self, scene: &str, beat: usize) -> bool {
        let Some(scene_data) = self.scenes.get(scene) else {
            return false;
        };
        let Some(beat_data) = scene_data.beats.get(beat).cloned() else {
            return false;
        };
        if beat_data.say.is_none() {
            return false;
        }
        self.scene_id = scene.to_string();
        self.beat_index = beat;
        self.phase = Phase::Dialogue;
        self.last_say = None;
        self.pending_fade_ms = None;
        self.pending_se.clear();
        let visuals = self.visuals_until(beat);
        self.carried_bgm = match visuals.bgm {
            Some(asset) => asset,
            None => None,
        };
        self.set_applied = Some((self.scene_id.clone(), self.beat_index));
        self.note_say(&beat_data);
        true
    }

    /// Snapshot the running session. Explore refuses while an action queue is
    /// still pending; callers must not write a dialogue-only file in that case.
    pub fn try_to_save(&self) -> Result<crate::save::SaveGame, VmError> {
        let explore = if let Some(eng) = &self.explore {
            Some(eng.try_to_save()?)
        } else {
            None
        };
        let saved_at = unix_now();
        let scene_id = explore
            .as_ref()
            .map(|ex| ex.scene_id.clone())
            .unwrap_or_else(|| self.scene_id.clone());
        let beat_index = explore
            .as_ref()
            .map(|ex| ex.beat_index)
            .unwrap_or(self.beat_index);
        let title = self
            .scenes
            .get(&scene_id)
            .and_then(|s| s.title.as_deref())
            .filter(|t| !t.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| scene_id.clone());
        let looked_up = self
            .scenes
            .get(&scene_id)
            .and_then(|s| s.beats.get(beat_index))
            .and_then(|b| b.id.clone());
        // Explore snapshot and the outer slot must name the same beat.
        let beat_id = match explore.as_ref().and_then(|ex| ex.beat_id.clone()) {
            Some(id) => Some(id),
            None => looked_up,
        };
        let vars = if let Some(ex) = &explore {
            ex.vars.clone()
        } else {
            self.vars.iter().map(|(k, v)| (k.clone(), *v)).collect()
        };
        Ok(crate::save::SaveGame {
            schema_version: self.project.schema_version,
            game_id: self.project.id.clone(),
            scene: scene_id,
            beat_index,
            beat_id,
            save_format: crate::save::SAVE_FORMAT,
            vars,
            carried_bgm: self.view().bgm,
            saved_at,
            label: Some(crate::save::format_slot_label(&title, saved_at)),
            explore,
        })
    }

    /// Dialogue tests and autosave call this only at a legal boundary.
    pub fn to_save(&self) -> crate::save::SaveGame {
        self.try_to_save()
            .expect("to_save requires a saveable phase")
    }

    pub fn apply_save(&mut self, save: &crate::save::SaveGame) -> Result<(), VmError> {
        crate::save::check_save(save, &self.project.id, self.project.schema_version)?;
        if let Some(explore_save) = &save.explore {
            let explore_save = galeng_explore::align_explore_beat_id(
                explore_save.clone(),
                &save.scene,
                save.beat_id.as_deref(),
            )
            .map_err(|err| {
                VmError::Explore(galeng_explore::Error::InvalidState(err.to_string()))
            })?;
            if let Some(eng) = self.explore.as_mut() {
                eng.load_save(&explore_save)?;
            } else {
                let mut eng =
                    galeng_explore::Engine::new(self.project.clone(), self.scenes.clone())?;
                eng.load_save(&explore_save)?;
                self.explore = Some(eng);
            }
            let resolved_beat = self
                .explore
                .as_ref()
                .map(|eng| eng.view().beat_index)
                .unwrap_or(explore_save.beat_index);
            self.scene_id = explore_save.scene_id.clone();
            self.beat_index = resolved_beat;
            self.vars = explore_save
                .vars
                .iter()
                .map(|(k, v)| (k.clone(), *v))
                .collect();
            self.carried_bgm = save.carried_bgm.clone();
            self.last_say = None;
            self.phase = Phase::Explore;
            self.pending_fade_ms = None;
            self.pending_se.clear();
            return Ok(());
        }
        if self.explore.is_some() {
            return Err(VmError::Save(crate::save::SaveError::MissingExplore));
        }
        if !self.scenes.contains_key(&save.scene) {
            self.phase = Phase::MissingScene(save.scene.clone());
            return Ok(());
        }
        let resume = {
            let scene = &self.scenes[&save.scene];
            crate::save::resolve_beat(&scene.beats, save.beat_id.as_deref(), save.beat_index)
        };
        let crate::save::Resume::At(beat_index) = resume else {
            return Err(VmError::BeatNotFound(save.scene.clone()));
        };
        self.scene_id = save.scene.clone();
        self.beat_index = beat_index;
        self.vars = save.vars.iter().map(|(k, v)| (k.clone(), *v)).collect();
        self.carried_bgm = save.carried_bgm.clone();
        self.last_say = None;
        self.phase = Phase::Dialogue;
        self.pending_fade_ms = None;
        self.pending_se.clear();
        self.set_applied = Some((self.scene_id.clone(), self.beat_index));
        self.settle();
        Ok(())
    }

    /// Id of the beat at the current index, if any.
    pub fn current_beat_id(&self) -> Option<&str> {
        self.scenes
            .get(&self.scene_id)
            .and_then(|s| s.beats.get(self.beat_index))
            .and_then(|b| b.id.as_deref())
    }

    pub fn view(&self) -> View {
        if let Some(eng) = &self.explore {
            return self.view_from_explore(eng);
        }
        let visuals = self.visuals_until(self.beat_index);
        let (say_speaker, say_text) = match &self.last_say {
            Some((s, t)) => (Some(s.clone()), Some(t.clone())),
            None => (None, None),
        };
        let choices = if self.phase == Phase::Choices {
            self.current_choices()
        } else {
            Vec::new()
        };
        View {
            bg: visuals.bg,
            chars: visuals.chars,
            prev_chars: self.prev_chars(),
            char_slide_ms: self.current_char_slide_ms(),
            cg: visuals.cg.clone().flatten(),
            say_speaker,
            say_text,
            bgm: visuals.bgm.unwrap_or_else(|| self.carried_bgm.clone()),
            bgm_fade_ms: visuals.bgm_fade_ms.unwrap_or(0),
            auto_advance_ms: self.current_auto_advance_ms(),
            voice: self.current_voice(),
            choices,
            phase: self.phase.clone(),
            scene_id: self.scene_id.clone(),
            beat_index: self.beat_index,
            fx_wait_ms: self.current_fx_wait_ms(),
            fx_shake_ms: self.current_fx_shake_ms(),
            fx_flash_ms: self.current_fx_flash_ms(),
            movie: self.current_movie(),
            amb: visuals.amb.clone().flatten(),
            camera: visuals.camera.clone().flatten().unwrap_or_default(),
        }
    }

    fn view_from_explore(&self, eng: &galeng_explore::Engine) -> View {
        let ev = eng.view();
        let phase = map_explore_phase(&ev.phase);
        // Room plate: scene `bg`, else the nearest caller. Beat `bg` is separate.
        let room_bg = eng.display_bg_asset();
        let bgm = ev.bgm.clone().or_else(|| self.carried_bgm.clone());
        let mut view = View {
            bg: room_bg.clone(),
            chars: Vec::new(),
            prev_chars: Vec::new(),
            char_slide_ms: None,
            cg: None,
            say_speaker: ev.say_speaker.clone(),
            say_text: ev.say_text.clone(),
            bgm,
            bgm_fade_ms: 0,
            auto_advance_ms: None,
            voice: None,
            choices: ev.choices.clone(),
            phase,
            scene_id: ev.scene_id.clone(),
            beat_index: ev.beat_index,
            // Explore settle still does not hold on fx. Timing stays out of this view.
            fx_wait_ms: None,
            fx_shake_ms: None,
            fx_flash_ms: None,
            movie: None,
            amb: None,
            camera: Camera::default(),
        };
        // Active scene, not the saved caller frame. A called dialogue is the
        // current scene; a hotspot line stays on the explore room.
        let Some(scene) = self.scenes.get(&ev.scene_id) else {
            return view;
        };
        if scene.scene_kind != SceneKind::Dialogue {
            return view;
        }
        let visuals = accumulate_visuals(scene, ev.beat_index);
        let showing = matches!(
            ev.phase,
            galeng_explore::Phase::Saying | galeng_explore::Phase::Dialogue
        );
        view.bg = visuals.bg.clone().or(room_bg);
        view.chars = visuals.chars;
        view.cg = visuals.cg.clone().flatten();
        view.amb = visuals.amb.clone().flatten();
        view.camera = visuals.camera.clone().flatten().unwrap_or_default();
        if let Some(command) = visuals.bgm.clone() {
            view.bgm = command;
            view.bgm_fade_ms = visuals.bgm_fade_ms.unwrap_or(0);
        }
        if showing {
            view.prev_chars = accumulated_prev_chars(scene, ev.beat_index);
            view.char_slide_ms = char_slide_ms_at(scene, ev.beat_index);
            if let Some(beat) = scene.beats.get(ev.beat_index) {
                view.voice = beat.say.as_ref().and_then(|say| say.voice.clone());
                view.movie = beat.movie.as_ref().map(|movie| movie.asset.clone());
            }
        }
        view
    }

    pub fn speaker_display(&self, speaker: &str) -> String {
        let locale = &self.project.locale;
        if let Some(chars) = &self.project.characters {
            if let Some(ch) = chars.iter().find(|c| c.id == speaker) {
                if let Some(map) = &ch.display {
                    if let Some(label) = map.get(locale).or_else(|| map.get("en")) {
                        return label.clone();
                    }
                }
            }
        }
        speaker.to_string()
    }

    pub fn click_advance(&mut self) {
        if let Some(eng) = &mut self.explore {
            let _ = eng.advance();
            return;
        }
        if self.phase != Phase::Dialogue {
            return;
        }
        self.beat_index += 1;
        self.settle();
    }

    pub fn choose(&mut self, index: usize) -> bool {
        if let Some(eng) = &mut self.explore {
            return eng.choose(index).unwrap_or(false);
        }
        if self.phase != Phase::Choices {
            return false;
        }
        let Some(opt) = self.current_choices().get(index).cloned() else {
            return false;
        };
        if let Some(set) = &opt.set {
            apply_set(&mut self.vars, set);
        }
        self.goto_scene(&opt.goto);
        true
    }

    fn current_scene(&self) -> &Scene {
        self.scenes
            .get(&self.scene_id)
            .expect("current scene missing")
    }

    fn current_choices(&self) -> Vec<ChoiceOption> {
        match &self.current_scene().exit {
            Some(Exit::Choices { options }) => options
                .iter()
                .filter(|opt| match &opt.if_cond {
                    None => true,
                    Some(cond) => condition_holds(&self.vars, cond),
                })
                .cloned()
                .collect(),
            _ => Vec::new(),
        }
    }

    fn settle(&mut self) {
        loop {
            match self.phase {
                Phase::Ended | Phase::MissingScene(_) | Phase::Choices | Phase::Explore => return,
                Phase::Dialogue => {}
            }
            let beat_len = self.current_scene().beats.len();
            if self.beat_index > beat_len {
                self.beat_index = beat_len;
            }
            if self.beat_index == beat_len {
                self.enter_exit();
                return;
            }
            let beat = self.current_scene().beats[self.beat_index].clone();
            if let Some(ms) = fade_ms(&beat) {
                self.pending_fade_ms = Some(ms);
            }
            self.apply_current_beat_set(&beat);
            self.note_say(&beat);
            self.queue_se(&beat);
            if beat_waits(&beat) {
                return;
            }
            self.beat_index += 1;
        }
    }

    fn apply_current_beat_set(&mut self, beat: &Beat) {
        let here = (self.scene_id.clone(), self.beat_index);
        if self.set_applied.as_ref() == Some(&here) {
            return;
        }
        if let Some(set) = &beat.set {
            apply_set(&mut self.vars, set);
        }
        self.set_applied = Some(here);
    }

    fn note_say(&mut self, beat: &Beat) {
        if let Some(say) = &beat.say {
            let text = crate::interp::interpolate_text(&say.text, &self.vars);
            self.last_say = Some((say.speaker.clone(), text.clone()));
            self.push_backlog(&say.speaker, &text);
        }
    }

    fn push_backlog(&mut self, speaker: &str, text: &str) {
        use crate::backlog::{BacklogLine, MAX_LINES};
        if self
            .backlog
            .iter()
            .any(|line| line.scene == self.scene_id && line.beat_index == self.beat_index)
        {
            return;
        }
        self.backlog.push(BacklogLine {
            scene: self.scene_id.clone(),
            beat_index: self.beat_index,
            speaker: speaker.to_string(),
            text: text.to_string(),
        });
        if self.backlog.len() > MAX_LINES {
            let extra = self.backlog.len() - MAX_LINES;
            self.backlog.drain(0..extra);
        }
    }

    fn queue_se(&mut self, beat: &Beat) {
        if let Some(list) = &beat.se {
            for se in list {
                self.pending_se.push(se.asset.clone());
            }
        }
    }

    fn current_fx_wait_ms(&self) -> Option<u32> {
        if self.phase != Phase::Dialogue {
            return None;
        }
        match self
            .current_scene()
            .beats
            .get(self.beat_index)?
            .fx
            .as_ref()?
        {
            galeng_schema::Fx::Wait { ms } => Some(*ms),
            _ => None,
        }
    }

    fn current_fx_shake_ms(&self) -> Option<u32> {
        if self.phase != Phase::Dialogue {
            return None;
        }
        match self
            .current_scene()
            .beats
            .get(self.beat_index)?
            .fx
            .as_ref()?
        {
            galeng_schema::Fx::Shake { ms } => Some(ms.unwrap_or(crate::fx::SHAKE_DEFAULT_MS)),
            _ => None,
        }
    }

    fn prev_chars(&self) -> Vec<CharOnStage> {
        if self.phase != Phase::Dialogue {
            return Vec::new();
        }
        accumulated_prev_chars(self.current_scene(), self.beat_index)
    }

    fn current_char_slide_ms(&self) -> Option<u32> {
        if self.phase != Phase::Dialogue {
            return None;
        }
        char_slide_ms_at(self.current_scene(), self.beat_index)
    }

    fn current_fx_flash_ms(&self) -> Option<u32> {
        if self.phase != Phase::Dialogue {
            return None;
        }
        match self
            .current_scene()
            .beats
            .get(self.beat_index)?
            .fx
            .as_ref()?
        {
            galeng_schema::Fx::Flash { ms } => Some(ms.unwrap_or(crate::fx::FLASH_DEFAULT_MS)),
            _ => None,
        }
    }

    fn current_beat_has_say(&self) -> bool {
        self.phase == Phase::Dialogue
            && self
                .current_scene()
                .beats
                .get(self.beat_index)
                .is_some_and(|b| b.say.is_some())
    }

    /// Wait, or shake with no say on this beat: hold until timer / click.
    pub fn fx_holds(&self) -> bool {
        self.current_fx_wait_ms().is_some()
            || (self.current_fx_shake_ms().is_some() && !self.current_beat_has_say())
            || (self.current_fx_flash_ms().is_some() && !self.current_beat_has_say())
            || (self.current_char_slide_ms().is_some() && !self.current_beat_has_say())
    }

    pub fn movie_holds(&self) -> bool {
        self.phase == Phase::Dialogue && self.current_movie().is_some()
    }

    fn current_movie(&self) -> Option<String> {
        if self.phase != Phase::Dialogue {
            return None;
        }
        self.current_scene()
            .beats
            .get(self.beat_index)?
            .movie
            .as_ref()
            .map(|m| m.asset.clone())
    }

    fn current_voice(&self) -> Option<String> {
        if self.phase != Phase::Dialogue {
            return None;
        }
        let beat = self.current_scene().beats.get(self.beat_index)?;
        beat.say.as_ref()?.voice.clone()
    }

    fn current_auto_advance_ms(&self) -> Option<u32> {
        if self.phase != Phase::Dialogue {
            return None;
        }
        let beat = self.current_scene().beats.get(self.beat_index)?;
        let say = beat.say.as_ref()?;
        match say.auto_advance.as_ref()? {
            AutoAdvance::Ms { ms } => Some(*ms),
            AutoAdvance::Voice => {
                let logical = say.voice.as_deref()?;
                crate::assets::audio_duration_from_source(&self.source, logical)
            }
        }
    }

    fn enter_exit(&mut self) {
        match self.current_scene().exit.clone() {
            Some(Exit::Choices { .. }) => {
                self.phase = Phase::Choices;
                if self.current_choices().is_empty() {
                    self.phase = Phase::Ended;
                }
            }
            Some(Exit::Next { goto }) => self.goto_scene(&goto),
            Some(Exit::Branch {
                if_cond,
                then,
                else_goto,
            }) => {
                if condition_holds(&self.vars, &if_cond) {
                    self.goto_scene(&then);
                } else {
                    self.goto_scene(&else_goto);
                }
            }
            Some(Exit::Call { scene, trans }) => self.hand_off_exit(|eng| {
                // beat_index is already `beats.len()`: the exit was consumed.
                eng.call_from_here(&scene, trans)
            }),
            Some(Exit::Return { trans }) => {
                self.hand_off_exit(|eng| eng.return_from_here(trans));
            }
            None => self.phase = Phase::Ended,
        }
    }

    /// Park the current dialogue frame and let the explore engine take Call/Return.
    /// On failure the engine's error phase is kept. This does not pretend the story ended.
    fn hand_off_exit(
        &mut self,
        op: impl FnOnce(&mut galeng_explore::Engine) -> Result<(), galeng_explore::Error>,
    ) {
        let mut eng = match galeng_explore::Engine::parked(
            self.project.clone(),
            self.scenes.clone(),
            &self.scene_id,
            self.beat_index,
        ) {
            Ok(eng) => eng,
            Err(err) => {
                self.phase = Phase::MissingScene(err.to_string());
                return;
            }
        };
        let _ = op(&mut eng);
        self.adopt_engine(eng);
    }

    fn adopt_engine(&mut self, eng: galeng_explore::Engine) {
        let ev = eng.view();
        self.scene_id = ev.scene_id.clone();
        self.beat_index = ev.beat_index;
        self.phase = map_explore_phase(&ev.phase);
        self.last_say = None;
        self.explore = Some(eng);
    }

    fn goto_scene(&mut self, id: &str) {
        if !self.scenes.contains_key(id) {
            self.phase = Phase::MissingScene(id.to_string());
            return;
        }
        self.carried_bgm = self.view().bgm;
        if self
            .scenes
            .get(id)
            .is_some_and(|scene| scene.scene_kind == SceneKind::Explore)
        {
            // Story next/goto enters THIS room (onEnter once). Not project.start_scene.
            // Editor "Play from here" does not use this path; see load_from.
            match galeng_explore::Engine::boot_at(self.project.clone(), self.scenes.clone(), id) {
                Ok(eng) => self.adopt_engine(eng),
                Err(err) => self.phase = Phase::MissingScene(err.to_string()),
            }
            return;
        }
        self.scene_id = id.to_string();
        self.beat_index = 0;
        self.last_say = None;
        self.phase = Phase::Dialogue;
        self.settle();
    }

    fn visuals_until(&self, beat_index: usize) -> Visuals {
        accumulate_visuals(self.current_scene(), beat_index)
    }
}

fn map_explore_phase(phase: &galeng_explore::Phase) -> Phase {
    match phase {
        galeng_explore::Phase::Explore => Phase::Explore,
        galeng_explore::Phase::Saying | galeng_explore::Phase::Dialogue => Phase::Dialogue,
        galeng_explore::Phase::Choices => Phase::Choices,
        galeng_explore::Phase::Ended => Phase::Ended,
        galeng_explore::Phase::Error(msg) => Phase::MissingScene(msg.clone()),
    }
}

/// Editor / player shared visible state at the end of `beat_index`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSnap {
    pub scene: String,
    pub beat_index: usize,
    pub bg: Option<String>,
    pub chars: Vec<CharOnStage>,
    pub cg: Option<String>,
    pub bgm: Option<String>,
    pub say_speaker: Option<String>,
    pub say_text: Option<String>,
    pub voice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amb: Option<String>,
    #[serde(default, skip_serializing_if = "Camera::is_identity")]
    pub camera: Camera,
}

pub fn preview_snapshot(scene: &Scene, beat_index: usize) -> PreviewSnap {
    let visuals = accumulate_visuals(scene, beat_index);
    let say = scene.beats.get(beat_index).and_then(|b| b.say.as_ref());
    PreviewSnap {
        scene: scene.id.clone(),
        beat_index,
        bg: visuals.bg,
        chars: visuals.chars,
        cg: visuals.cg.flatten(),
        bgm: match visuals.bgm {
            Some(asset) => asset,
            None => None,
        },
        say_speaker: say.map(|s| s.speaker.clone()),
        say_text: say.map(|s| s.text.clone()),
        voice: say.and_then(|s| s.voice.clone()),
        amb: visuals.amb.flatten(),
        camera: visuals.camera.flatten().unwrap_or_default(),
    }
}

fn accumulated_prev_chars(scene: &Scene, beat_index: usize) -> Vec<CharOnStage> {
    if beat_index == 0 {
        Vec::new()
    } else {
        accumulate_visuals(scene, beat_index - 1).chars
    }
}

fn char_slide_ms_at(scene: &Scene, beat_index: usize) -> Option<u32> {
    let curr = scene.beats.get(beat_index)?;
    let list = curr.chars.as_ref()?;
    let prev = accumulated_prev_chars(scene, beat_index);
    let mut max = 0u32;
    for ch in list {
        let Some(ms) = ch.slide_ms.filter(|n| *n > 0) else {
            continue;
        };
        let Some(old) = prev.iter().find(|p| p.id == ch.id) else {
            continue;
        };
        if old.slot != ch.slot || old.x != ch.x || old.y != ch.y {
            max = max.max(ms);
        }
    }
    if max == 0 {
        None
    } else {
        Some(max)
    }
}

fn accumulate_visuals(scene: &Scene, beat_index: usize) -> Visuals {
    let mut visuals = Visuals::default();
    let count = if beat_index >= scene.beats.len() {
        scene.beats.len()
    } else {
        beat_index + 1
    };
    for beat in scene.beats.iter().take(count) {
        if let Some(bg) = &beat.bg {
            visuals.bg = Some(bg.asset.clone());
        }
        if let Some(chars) = &beat.chars {
            visuals.chars = chars.clone();
        }
        if let Some(bgm) = &beat.bgm {
            visuals.bgm = Some(bgm.asset.clone());
            visuals.bgm_fade_ms = Some(bgm.fade_ms.unwrap_or(0));
        }
        if let Some(cg) = &beat.cg {
            visuals.cg = Some(cg.clone());
        }
        if let Some(amb) = &beat.amb {
            visuals.amb = Some(amb.clone());
        }
        if let Some(camera) = &beat.camera {
            visuals.camera = Some(*camera);
        }
    }
    visuals
}

#[derive(Default)]
struct Visuals {
    bg: Option<String>,
    chars: Vec<CharOnStage>,
    /// None = no BGM command in this range; Some(asset) = last command (`asset` may be None = stop).
    bgm: Option<Option<String>>,
    bgm_fade_ms: Option<u32>,
    /// None = no CG command yet; Some(None) = closed; Some(Some(path)) = showing.
    cg: Option<Option<String>>,
    /// None = no amb command; Some(None) = stop; Some(Some(path)) = looping.
    amb: Option<Option<String>>,
    /// None = no camera command; Some(None) = identity; Some(Some(cam)) = set.
    camera: Option<Option<Camera>>,
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn fade_ms(beat: &Beat) -> Option<u32> {
    let bg = beat.bg.as_ref()?;
    match bg.trans {
        Some(Trans::Fade) | Some(Trans::Crossfade) => Some(bg.ms.unwrap_or(300)),
        _ => None,
    }
}

fn beat_waits(beat: &Beat) -> bool {
    if beat.say.is_some() || beat.movie.is_some() {
        return true;
    }
    if matches!(
        &beat.fx,
        Some(
            galeng_schema::Fx::Wait { .. }
                | galeng_schema::Fx::Shake { .. }
                | galeng_schema::Fx::Flash { .. }
        )
    ) {
        return true;
    }
    beat.chars
        .as_ref()
        .is_some_and(|list| list.iter().any(|ch| ch.slide_ms.is_some_and(|ms| ms > 0)))
}

#[cfg(test)]
mod cond_tests {
    use super::*;
    use galeng_schema::{Cmp, Condition, ConditionPred};
    use std::collections::BTreeMap;

    fn gte(name: &str, n: i32) -> Condition {
        let mut cond = BTreeMap::new();
        cond.insert(
            name.to_string(),
            ConditionPred::Cmp(Cmp {
                gte: Some(n),
                lte: None,
                gt: None,
                lt: None,
                eq: None,
                ne: None,
            }),
        );
        cond
    }

    #[test]
    fn affection_gte_three() {
        let mut vars = HashMap::new();
        vars.insert("sora_affection".into(), 3);
        assert!(condition_holds(&vars, &gte("sora_affection", 3)));
        vars.insert("sora_affection".into(), 2);
        assert!(!condition_holds(&vars, &gte("sora_affection", 3)));
        assert!(!condition_holds(&HashMap::new(), &gte("sora_affection", 3)));
    }
}
