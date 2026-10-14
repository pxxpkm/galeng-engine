use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};

use galeng_schema::{
    validate_project_str, validate_scene_str, ChoiceOption, Condition, ConditionPred, Exit,
    ExploreAction, InteractionOn, ItemDef, Project, Scene, SceneKind, SetValue,
};
use serde::{Deserialize, Serialize};

use crate::hit::{hit_test, is_enabled, is_visible, preds_hold};
use crate::save::{override_key, parse_override_key, ExploreSave, PhaseSave};

pub const BUILTIN_FALLBACK: &str = "……";

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("schema: {0}")]
    Schema(#[from] galeng_schema::Error),
    #[error("missing scene `{0}`")]
    MissingScene(String),
    #[error("missing start scene `{0}`")]
    MissingStart(String),
    #[error("return with empty call stack")]
    EmptyReturn,
    #[error("save schema {got} does not match project {expected}")]
    SchemaMismatch { expected: u32, got: u32 },
    #[error("save game id `{got}` does not match `{expected}`")]
    GameMismatch { expected: String, got: String },
    #[error("invalid state: {0}")]
    InvalidState(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Phase {
    Explore,
    Saying,
    Dialogue,
    Choices,
    Ended,
    Error(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StackFrame {
    Explore {
        scene_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        selected_verb: Option<String>,
        #[serde(default)]
        inventory_open: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pending_item: Option<String>,
    },
    Dialogue {
        scene_id: String,
        beat_index: usize,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TraceLayer {
    Interaction,
    PerVerb,
    ItemOnHotspot,
    Global,
    Builtin,
    None,
}

#[derive(Debug, Clone, PartialEq)]
pub struct View {
    pub scene_id: String,
    pub phase: Phase,
    pub beat_index: usize,
    pub say_speaker: Option<String>,
    pub say_text: Option<String>,
    pub selected_verb: Option<String>,
    pub pending_item: Option<String>,
    pub inventory_open: bool,
    pub inventory: BTreeSet<String>,
    pub switches: BTreeMap<String, bool>,
    pub vars: BTreeMap<String, i32>,
    pub trace: TraceLayer,
    pub last_trans: Option<String>,
    pub pending_se: Vec<String>,
    pub bgm: Option<String>,
    pub call_depth: usize,
    pub choices: Vec<ChoiceOption>,
}

#[derive(Debug, Clone, Default)]
pub struct WorldState {
    pub switches: HashMap<String, bool>,
    pub vars: HashMap<String, i32>,
    pub inventory: BTreeSet<String>,
    pub hotspot_visible: HashMap<(String, String), bool>,
    pub hotspot_enabled: HashMap<(String, String), bool>,
}

#[derive(Debug, Clone, Copy)]
enum TransDefaultKind {
    ToDialogue,
    FromDialogue,
    GotoScene,
}

pub struct Engine {
    project: Project,
    scenes: HashMap<String, Scene>,
    scene_id: String,
    beat_index: usize,
    phase: Phase,
    selected_verb: Option<String>,
    pending_item: Option<String>,
    inventory_open: bool,
    world: WorldState,
    call_stack: Vec<StackFrame>,
    say_speaker: Option<String>,
    say_text: Option<String>,
    action_queue: VecDeque<ExploreAction>,
    last_trace: TraceLayer,
    last_trans: Option<String>,
    pending_se: Vec<String>,
    bgm: Option<String>,
}

impl Engine {
    pub fn new(project: Project, scenes: HashMap<String, Scene>) -> Result<Self, Error> {
        let start = project.start_scene.clone();
        if !scenes.contains_key(&start) {
            return Err(Error::MissingStart(start));
        }
        let mut world = WorldState::default();
        for sw in &project.switches {
            world.switches.insert(sw.id.clone(), sw.init);
        }
        let mut eng = Self {
            project,
            scenes,
            scene_id: start,
            beat_index: 0,
            phase: Phase::Explore,
            selected_verb: None,
            pending_item: None,
            inventory_open: false,
            world,
            call_stack: Vec::new(),
            say_speaker: None,
            say_text: None,
            action_queue: VecDeque::new(),
            last_trace: TraceLayer::None,
            last_trans: None,
            pending_se: Vec::new(),
            bgm: None,
        };
        eng.enter_scene_keep_stack()?;
        Ok(eng)
    }

    pub fn from_json(project_json: &str, scenes: &[(&str, &str)]) -> Result<Self, Error> {
        let project = validate_project_str(project_json)?;
        let mut map = HashMap::new();
        for (_name, text) in scenes {
            let scene = validate_scene_str(text)?;
            map.insert(scene.id.clone(), scene);
        }
        Self::new(project, map)
    }

    pub fn project(&self) -> &Project {
        &self.project
    }

    pub fn phase(&self) -> &Phase {
        &self.phase
    }

    pub fn scene_id(&self) -> &str {
        &self.scene_id
    }

    pub fn select_verb(&mut self, id: Option<&str>) {
        self.selected_verb = id.map(str::to_string);
        if id.is_some() {
            self.pending_item = None;
        }
    }

    pub fn select_item(&mut self, id: Option<&str>) {
        self.pending_item = id.map(str::to_string);
        if id.is_some() {
            self.selected_verb = None;
        }
    }

    pub fn set_inventory_open(&mut self, open: bool) {
        self.inventory_open = open;
    }

    pub fn give_item_for_test(&mut self, id: &str) {
        self.world.inventory.insert(id.to_string());
    }

    pub fn set_switch_for_test(&mut self, id: &str, value: bool) {
        self.world.switches.insert(id.to_string(), value);
    }

    pub fn hit_test(&self, x: i32, y: i32) -> Option<&str> {
        let scene = self.scenes.get(&self.scene_id)?;
        if scene.scene_kind != SceneKind::Explore {
            return None;
        }
        hit_test(scene, &self.world, x, y)
    }

    pub fn view(&self) -> View {
        View {
            scene_id: self.scene_id.clone(),
            phase: self.phase.clone(),
            beat_index: self.beat_index,
            say_speaker: self.say_speaker.clone(),
            say_text: self.say_text.clone(),
            selected_verb: self.selected_verb.clone(),
            pending_item: self.pending_item.clone(),
            inventory_open: self.inventory_open,
            inventory: self.world.inventory.clone(),
            switches: self.world.switches.iter().map(|(k, v)| (k.clone(), *v)).collect(),
            vars: self.world.vars.iter().map(|(k, v)| (k.clone(), *v)).collect(),
            trace: self.last_trace,
            last_trans: self.last_trans.clone(),
            pending_se: self.pending_se.clone(),
            bgm: self.bgm.clone(),
            call_depth: self.call_stack.len(),
            choices: self.current_choices(),
        }
    }

    pub fn click(&mut self, x: i32, y: i32) -> Result<(), Error> {
        match self.phase {
            Phase::Saying => return self.dismiss_say(),
            Phase::Dialogue => return self.advance(),
            Phase::Choices | Phase::Ended | Phase::Error(_) => return Ok(()),
            Phase::Explore => {}
        }
        let Some(id) = self.hit_test(x, y).map(str::to_string) else {
            return Ok(());
        };
        self.interact(&id)
    }

    pub fn interact(&mut self, hotspot_id: &str) -> Result<(), Error> {
        if self.phase != Phase::Explore {
            return Ok(());
        }
        let scene = self
            .scenes
            .get(&self.scene_id)
            .ok_or_else(|| Error::MissingScene(self.scene_id.clone()))?
            .clone();
        if scene.scene_kind != SceneKind::Explore {
            return Err(Error::InvalidState("interact only in explore".into()));
        }
        let Some(hs) = scene.hotspots.iter().find(|h| h.id == hotspot_id) else {
            return Ok(());
        };
        if !is_visible(&scene, hs, &self.world) || !is_enabled(&scene, hs, &self.world) {
            return Ok(());
        }

        let pending_item = self.pending_item.clone();
        let verb = if pending_item.is_none() {
            Some(
                self.selected_verb
                    .clone()
                    .or_else(|| hs.default_verb.clone())
                    .unwrap_or_else(|| "look".to_string()),
            )
        } else {
            None
        };

        let (actions, trace, consumed_item_attempt) =
            resolve_interaction(&scene, hotspot_id, verb.as_deref(), pending_item.as_deref(), &self.project, &self.world);

        self.last_trace = trace;
        // clear pending item after any click attempt
        let item_for_consume = pending_item.clone();
        self.pending_item = None;

        if matches!(trace, TraceLayer::Interaction) {
            if let Some(item_id) = item_for_consume {
                if item_def(&self.project, &item_id).is_some_and(|d| d.consume_on_use) {
                    self.world.inventory.remove(&item_id);
                }
            }
        }
        let _ = consumed_item_attempt;

        self.enqueue_and_run(actions)
    }

    pub fn dismiss_say(&mut self) -> Result<(), Error> {
        if self.phase != Phase::Saying {
            return Ok(());
        }
        self.say_speaker = None;
        self.say_text = None;
        // Resume queued explore actions, or advance dialogue beat.
        if !self.action_queue.is_empty() {
            self.phase = if self
                .scenes
                .get(&self.scene_id)
                .map(|s| s.scene_kind == SceneKind::Dialogue)
                .unwrap_or(false)
            {
                Phase::Dialogue
            } else {
                Phase::Explore
            };
            self.run_queue()?;
            return Ok(());
        }
        if self
            .scenes
            .get(&self.scene_id)
            .map(|s| s.scene_kind == SceneKind::Dialogue)
            .unwrap_or(false)
        {
            self.phase = Phase::Dialogue;
            self.beat_index += 1;
            self.settle_dialogue()?;
        } else {
            self.phase = Phase::Explore;
        }
        Ok(())
    }

    pub fn advance(&mut self) -> Result<(), Error> {
        match self.phase {
            Phase::Saying => self.dismiss_say(),
            Phase::Dialogue => {
                self.beat_index += 1;
                self.settle_dialogue()
            }
            _ => Ok(()),
        }
    }

    pub fn choose(&mut self, index: usize) -> Result<bool, Error> {
        if self.phase != Phase::Choices {
            return Ok(false);
        }
        let opts = self.current_choices();
        let Some(opt) = opts.get(index).cloned() else {
            return Ok(false);
        };
        if let Some(set) = &opt.set {
            apply_set(&mut self.world.vars, set);
        }
        // Choices navigate like Exit::Next: keep call stack so Call→…→Return still works.
        // Explicit ExploreAction::GotoScene is the clear-stack jump.
        self.last_trans = self.resolve_trans(None, TransDefaultKind::GotoScene);
        self.goto_scene_keep_stack(&opt.goto)?;
        Ok(true)
    }

    /// Save only at Explore idle / dialogue beat boundary / Choices / Ended.
    /// Rejects mid-Saying, non-empty action queue, or Error phase (does not serialize queue/say).
    pub fn try_to_save(&self) -> Result<ExploreSave, Error> {
        if matches!(self.phase, Phase::Saying) {
            return Err(Error::InvalidState(
                "cannot save while Saying (dismiss first)".into(),
            ));
        }
        if matches!(self.phase, Phase::Error(_)) {
            return Err(Error::InvalidState("cannot save in Error phase".into()));
        }
        if !self.action_queue.is_empty() {
            return Err(Error::InvalidState(
                "cannot save with pending action queue".into(),
            ));
        }
        Ok(self.build_save())
    }

    pub fn to_save(&self) -> Result<ExploreSave, Error> {
        self.try_to_save()
    }

    fn build_save(&self) -> ExploreSave {
        let mut hotspot_visible = BTreeMap::new();
        for ((s, h), v) in &self.world.hotspot_visible {
            hotspot_visible.insert(override_key(s, h), *v);
        }
        let mut hotspot_enabled = BTreeMap::new();
        for ((s, h), v) in &self.world.hotspot_enabled {
            hotspot_enabled.insert(override_key(s, h), *v);
        }
        ExploreSave {
            schema_version: self.project.schema_version,
            game_id: self.project.id.clone(),
            scene_id: self.scene_id.clone(),
            beat_index: self.beat_index,
            phase: PhaseSave::from(&self.phase),
            call_stack: self.call_stack.clone(),
            switches: self.world.switches.iter().map(|(k, v)| (k.clone(), *v)).collect(),
            vars: self.world.vars.iter().map(|(k, v)| (k.clone(), *v)).collect(),
            inventory: self.world.inventory.clone(),
            hotspot_visible,
            hotspot_enabled,
            selected_verb: self.selected_verb.clone(),
            pending_item: self.pending_item.clone(),
            inventory_open: self.inventory_open,
        }
    }

    pub fn load_save(&mut self, save: &ExploreSave) -> Result<(), Error> {
        if save.schema_version != self.project.schema_version {
            return Err(Error::SchemaMismatch {
                expected: self.project.schema_version,
                got: save.schema_version,
            });
        }
        if save.game_id != self.project.id {
            return Err(Error::GameMismatch {
                expected: self.project.id.clone(),
                got: save.game_id.clone(),
            });
        }
        if !self.scenes.contains_key(&save.scene_id) {
            return Err(Error::MissingScene(save.scene_id.clone()));
        }
        for frame in &save.call_stack {
            let sid = match frame {
                StackFrame::Explore { scene_id, .. } | StackFrame::Dialogue { scene_id, .. } => {
                    scene_id
                }
            };
            if !self.scenes.contains_key(sid) {
                return Err(Error::MissingScene(sid.clone()));
            }
        }

        self.scene_id = save.scene_id.clone();
        self.beat_index = save.beat_index;
        self.phase = Phase::from(&save.phase);
        self.call_stack = save.call_stack.clone();
        self.world.switches = save.switches.iter().map(|(k, v)| (k.clone(), *v)).collect();
        self.world.vars = save.vars.iter().map(|(k, v)| (k.clone(), *v)).collect();
        self.world.inventory = save.inventory.clone();
        self.world.hotspot_visible.clear();
        for (k, v) in &save.hotspot_visible {
            if let Some(pair) = parse_override_key(k) {
                self.world.hotspot_visible.insert(pair, *v);
            }
        }
        self.world.hotspot_enabled.clear();
        for (k, v) in &save.hotspot_enabled {
            if let Some(pair) = parse_override_key(k) {
                self.world.hotspot_enabled.insert(pair, *v);
            }
        }
        self.selected_verb = save.selected_verb.clone();
        self.pending_item = save.pending_item.clone();
        self.inventory_open = save.inventory_open;
        self.action_queue.clear();
        self.say_speaker = None;
        self.say_text = None;
        self.last_trace = TraceLayer::None;
        Ok(())
    }

    fn current_scene(&self) -> Result<&Scene, Error> {
        self.scenes
            .get(&self.scene_id)
            .ok_or_else(|| Error::MissingScene(self.scene_id.clone()))
    }

    fn current_choices(&self) -> Vec<ChoiceOption> {
        let Ok(scene) = self.current_scene() else {
            return Vec::new();
        };
        match &scene.exit {
            Some(Exit::Choices { options }) => options
                .iter()
                .filter(|opt| match &opt.if_cond {
                    None => true,
                    Some(cond) => condition_holds(&self.world.vars, cond),
                })
                .cloned()
                .collect(),
            _ => Vec::new(),
        }
    }

    fn enqueue_and_run(&mut self, actions: Vec<ExploreAction>) -> Result<(), Error> {
        self.action_queue.clear();
        self.action_queue.extend(actions);
        self.run_queue()
    }

    fn run_queue(&mut self) -> Result<(), Error> {
        while let Some(action) = self.action_queue.pop_front() {
            if self.apply_action(action)? {
                // paused on say
                return Ok(());
            }
        }
        Ok(())
    }

    /// Returns true if paused (Saying).
    fn apply_action(&mut self, action: ExploreAction) -> Result<bool, Error> {
        match action {
            ExploreAction::Say { text, speaker } => {
                self.say_speaker = speaker;
                self.say_text = Some(text);
                self.phase = Phase::Saying;
                Ok(true)
            }
            ExploreAction::SetSwitch { id, value } => {
                self.world.switches.insert(id, value);
                Ok(false)
            }
            ExploreAction::SetVar { id, value } => {
                self.world.vars.insert(id, value);
                Ok(false)
            }
            ExploreAction::AddVar { id, delta } => {
                let cur = self.world.vars.get(&id).copied().unwrap_or(0);
                self.world.vars.insert(id, cur + delta);
                Ok(false)
            }
            ExploreAction::GiveItem { id } => {
                self.world.inventory.insert(id);
                Ok(false)
            }
            ExploreAction::TakeItem { id } => {
                self.world.inventory.remove(&id);
                Ok(false)
            }
            ExploreAction::GotoScene { scene, trans } => {
                self.goto_scene_clear_stack(&scene, trans)?;
                Ok(false)
            }
            ExploreAction::Call { scene, trans } => {
                self.call_scene(&scene, trans)?;
                Ok(false)
            }
            ExploreAction::Return { trans } => {
                self.return_from_call(trans)?;
                Ok(false)
            }
            ExploreAction::PlaySe { asset } => {
                self.pending_se.push(asset);
                Ok(false)
            }
            ExploreAction::Bgm { asset, .. } => {
                self.bgm = asset;
                Ok(false)
            }
            ExploreAction::Fx { effect_ref, .. } => {
                self.last_trans = Some(effect_ref);
                Ok(false)
            }
            ExploreAction::ShowHotspot { id } => {
                self.world
                    .hotspot_visible
                    .insert((self.scene_id.clone(), id), true);
                Ok(false)
            }
            ExploreAction::HideHotspot { id } => {
                self.world
                    .hotspot_visible
                    .insert((self.scene_id.clone(), id), false);
                Ok(false)
            }
            ExploreAction::EnableHotspot { id } => {
                self.world
                    .hotspot_enabled
                    .insert((self.scene_id.clone(), id), true);
                Ok(false)
            }
            ExploreAction::DisableHotspot { id } => {
                self.world
                    .hotspot_enabled
                    .insert((self.scene_id.clone(), id), false);
                Ok(false)
            }
        }
    }

    fn push_explore_frame(&mut self) {
        self.call_stack.push(StackFrame::Explore {
            scene_id: self.scene_id.clone(),
            selected_verb: self.selected_verb.clone(),
            inventory_open: self.inventory_open,
            pending_item: self.pending_item.clone(),
        });
    }

    fn push_dialogue_frame(&mut self) {
        self.call_stack.push(StackFrame::Dialogue {
            scene_id: self.scene_id.clone(),
            beat_index: self.beat_index,
        });
    }

    fn resolve_trans(&self, explicit: Option<String>, kind: TransDefaultKind) -> Option<String> {
        if explicit.is_some() {
            return explicit;
        }
        let d = &self.project.transition_defaults;
        match kind {
            TransDefaultKind::ToDialogue => d.to_dialogue.clone(),
            TransDefaultKind::FromDialogue => d.from_dialogue.clone(),
            TransDefaultKind::GotoScene => d.goto_scene.clone(),
        }
    }

    fn call_scene(&mut self, scene: &str, trans: Option<String>) -> Result<(), Error> {
        let kind = self.current_scene()?.scene_kind;
        match kind {
            SceneKind::Explore => self.push_explore_frame(),
            SceneKind::Dialogue => self.push_dialogue_frame(),
        }
        self.last_trans = self.resolve_trans(trans, TransDefaultKind::ToDialogue);
        self.goto_scene_keep_stack(scene)?;
        Ok(())
    }

    fn return_from_call(&mut self, trans: Option<String>) -> Result<(), Error> {
        let Some(frame) = self.call_stack.pop() else {
            self.phase = Phase::Error("return with empty call stack".into());
            return Err(Error::EmptyReturn);
        };
        self.last_trans = self.resolve_trans(trans, TransDefaultKind::FromDialogue);
        self.action_queue.clear();
        self.say_speaker = None;
        self.say_text = None;
        match frame {
            StackFrame::Explore {
                scene_id,
                selected_verb,
                inventory_open,
                pending_item,
            } => {
                self.scene_id = scene_id;
                self.selected_verb = selected_verb;
                self.inventory_open = inventory_open;
                self.pending_item = pending_item;
                self.beat_index = 0;
                self.phase = Phase::Explore;
            }
            StackFrame::Dialogue {
                scene_id,
                beat_index,
            } => {
                self.scene_id = scene_id;
                self.beat_index = beat_index;
                self.phase = Phase::Dialogue;
                // Exit was already consumed when we left for the callee.
                // Re-entering Exit::Call here would loop forever.
                let len = self.current_scene()?.beats.len();
                if self.beat_index >= len {
                    // Finished dialogue frame: if we were ourselves called
                    // (stack still has Explore/parent), unwind again so
                    // Explore→Call→A→Call→B→Return resumes Explore.
                    // Empty stack → true end (no re-enter exit).
                    if !self.call_stack.is_empty() {
                        self.return_from_call(None)?;
                    } else {
                        self.phase = Phase::Ended;
                    }
                } else {
                    // Mid-dialogue Call (ExploreAction): advance past call site.
                    self.beat_index += 1;
                    self.settle_dialogue()?;
                }
            }
        }
        Ok(())
    }

    fn goto_scene_clear_stack(&mut self, id: &str, trans: Option<String>) -> Result<(), Error> {
        self.call_stack.clear();
        self.last_trans = self.resolve_trans(trans, TransDefaultKind::GotoScene);
        self.goto_scene_keep_stack(id)
    }

    fn goto_scene_keep_stack(&mut self, id: &str) -> Result<(), Error> {
        if !self.scenes.contains_key(id) {
            self.phase = Phase::Error(format!("missing scene {id}"));
            return Err(Error::MissingScene(id.to_string()));
        }
        self.scene_id = id.to_string();
        self.beat_index = 0;
        self.say_speaker = None;
        self.say_text = None;
        self.action_queue.clear();
        self.enter_scene_keep_stack()
    }

    fn enter_scene_keep_stack(&mut self) -> Result<(), Error> {
        let kind = self.current_scene()?.scene_kind;
        match kind {
            SceneKind::Explore => {
                self.phase = Phase::Explore;
                let on_enter = self.current_scene()?.on_enter.clone();
                self.enqueue_and_run(on_enter)?;
            }
            SceneKind::Dialogue => {
                self.phase = Phase::Dialogue;
                self.settle_dialogue()?;
            }
        }
        Ok(())
    }

    fn settle_dialogue(&mut self) -> Result<(), Error> {
        loop {
            if !matches!(self.phase, Phase::Dialogue) {
                return Ok(());
            }
            let scene = self.current_scene()?.clone();
            let len = scene.beats.len();
            if self.beat_index > len {
                self.beat_index = len;
            }
            if self.beat_index == len {
                self.enter_exit()?;
                return Ok(());
            }
            let beat = &scene.beats[self.beat_index];
            if let Some(set) = &beat.set {
                apply_set(&mut self.world.vars, set);
            }
            if let Some(say) = &beat.say {
                self.say_speaker = Some(say.speaker.clone());
                self.say_text = Some(say.text.clone());
                self.phase = Phase::Saying;
                return Ok(());
            }
            // no say — auto-skip wait-less beats
            self.beat_index += 1;
        }
    }

    fn enter_exit(&mut self) -> Result<(), Error> {
        let exit = self.current_scene()?.exit.clone();
        match exit {
            Some(Exit::Choices { .. }) => {
                self.phase = Phase::Choices;
                if self.current_choices().is_empty() {
                    self.phase = Phase::Ended;
                }
            }
            Some(Exit::Next { goto }) => {
                // Preserve call stack so nested dialogue chains can still Return to explore.
                self.last_trans = self.resolve_trans(None, TransDefaultKind::GotoScene);
                self.goto_scene_keep_stack(&goto)?;
            }
            Some(Exit::Branch {
                if_cond,
                then,
                else_goto,
            }) => {
                let target = if condition_holds(&self.world.vars, &if_cond) {
                    then
                } else {
                    else_goto
                };
                self.last_trans = self.resolve_trans(None, TransDefaultKind::GotoScene);
                self.goto_scene_keep_stack(&target)?;
            }
            Some(Exit::Call { scene, trans }) => {
                self.call_scene(&scene, trans)?;
            }
            Some(Exit::Return { trans }) => {
                self.return_from_call(trans)?;
            }
            None => self.phase = Phase::Ended,
        }
        Ok(())
    }
}

fn item_def<'a>(project: &'a Project, id: &str) -> Option<&'a ItemDef> {
    project.items.iter().find(|i| i.id == id)
}

fn resolve_interaction(
    scene: &Scene,
    hotspot_id: &str,
    verb: Option<&str>,
    item: Option<&str>,
    project: &Project,
    world: &WorldState,
) -> (Vec<ExploreAction>, TraceLayer, bool) {
    for inter in &scene.interactions {
        if inter.hotspot != hotspot_id {
            continue;
        }
        if !on_matches(&inter.on, verb, item) {
            continue;
        }
        for rule in &inter.rules {
            if preds_hold(&rule.when, world) {
                return (rule.actions.clone(), TraceLayer::Interaction, item.is_some());
            }
        }
    }

    // Fallback
    if let Some(v) = verb {
        if let Some(text) = project.fallback.per_verb.get(v) {
            return (
                vec![ExploreAction::Say {
                    text: text.clone(),
                    speaker: None,
                }],
                TraceLayer::PerVerb,
                false,
            );
        }
    }
    if item.is_some() {
        if let Some(text) = &project.fallback.item_on_hotspot {
            return (
                vec![ExploreAction::Say {
                    text: text.clone(),
                    speaker: None,
                }],
                TraceLayer::ItemOnHotspot,
                false,
            );
        }
    }
    if let Some(text) = &project.fallback.global {
        return (
            vec![ExploreAction::Say {
                text: text.clone(),
                speaker: None,
            }],
            TraceLayer::Global,
            false,
        );
    }
    (
        vec![ExploreAction::Say {
            text: BUILTIN_FALLBACK.to_string(),
            speaker: None,
        }],
        TraceLayer::Builtin,
        false,
    )
}

fn on_matches(on: &InteractionOn, verb: Option<&str>, item: Option<&str>) -> bool {
    match on {
        InteractionOn::Verb(v) => verb == Some(v.verb.as_str()),
        InteractionOn::Item(i) => item == Some(i.item.as_str()),
    }
}

fn apply_set(vars: &mut HashMap<String, i32>, set: &BTreeMap<String, SetValue>) {
    for (k, v) in set {
        let n = match v {
            SetValue::Int(i) => *i,
            SetValue::Bool(b) => {
                if *b {
                    1
                } else {
                    0
                }
            }
            SetValue::Text(_) => continue,
        };
        vars.insert(k.clone(), n);
    }
}

fn condition_holds(vars: &HashMap<String, i32>, cond: &Condition) -> bool {
    if cond.is_empty() {
        return true;
    }
    cond.iter().all(|(key, pred)| {
        let cur = vars.get(key).copied().unwrap_or(0);
        match pred {
            ConditionPred::Bool(b) => (cur != 0) == *b,
            ConditionPred::Int(i) => cur == *i,
            ConditionPred::Text(_) => false,
            ConditionPred::Cmp(cmp) => {
                if let Some(eq) = &cmp.eq {
                    if let Some(n) = eq.as_i64() {
                        return cur == n as i32;
                    }
                    if let Some(b) = eq.as_bool() {
                        return (cur != 0) == b;
                    }
                }
                if let Some(ne) = &cmp.ne {
                    if let Some(n) = ne.as_i64() {
                        return cur != n as i32;
                    }
                }
                if let Some(gte) = cmp.gte {
                    if cur < gte {
                        return false;
                    }
                }
                if let Some(lte) = cmp.lte {
                    if cur > lte {
                        return false;
                    }
                }
                if let Some(gt) = cmp.gt {
                    if cur <= gt {
                        return false;
                    }
                }
                if let Some(lt) = cmp.lt {
                    if cur >= lt {
                        return false;
                    }
                }
                true
            }
        }
    })
}

