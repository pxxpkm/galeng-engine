import { clearBackup } from "./backup";
import { useEffect, useMemo, useRef, useState } from "react";
import en from "../../../packages/i18n/locales/en.json";
import zhHans from "../../../packages/i18n/locales/zh-Hans.json";
import zhHant from "../../../packages/i18n/locales/zh-Hant.json";
import { deleteJson, getJson, postJson, putJson } from "./api";
import { addStageChar, adjustIndexAfterMoveBeats, ambDisplay, applyAssetAt, beatSummary, cgDisplay, closeAmb, closeCg, duplicateBeat, encodeAssetDrag, encodeBeatDrag, ensureGalleryItem, fallbackStageCharId, inheritCamera, insertBeatAfter, MAX_STAGE_CHARS, moveBeats, normalizeIndices, parseAssetDrag, parseBeatDragSet, patchSay, patchStageChar, rangeIndices, removeBeatAt, removeBeatsAt, removeStageChar, resetCamera, seDisplay, selectionAfterMoveBeats, setAmb, setAutoAdvance, setBeatLabel, setBg, setBgMs, setBgTrans, setCameraField, setCharOffset, setCharSlideMs, setCg, setFx, setMovie, setSayVoice, setSe, toggleIndex } from "./beats";
import { emptyHistory, push, redo, undo } from "./history";
import {
  emptyChoice,
  exitKind,
  formatSet,
  parseSet,
  patchChoiceIf,
  readBranch,
  readCond,
  setExitKind,
  writeBranch,
  type BranchForm,
  type ExitKind,
} from "./exit";
import {
  commitSceneOpen,
  dialogueStartupDecision,
  listedKindOf,
  navigateToExploreEditor,
} from "./editorRoute";
import { parseSceneId } from "./goto";
import { canArchiveScene, canDeleteScene, duplicateScene, nextSceneAfterArchive } from "./scene";
import {
  departedSceneForLoad,
  departureTicket,
  planSceneLoad,
  sceneDocumentHasLeft,
} from "./sceneLoadGuard";
import { formatSaveIssues, projectSaveIssues, sceneSaveIssues } from "./saveIssues";
import { GotoSelect } from "./GotoSelect";
import {
  flushThenAllowLeave,
  LEAVE_CANCELLED_MESSAGE,
  sceneLeaveBlocked,
  shouldWarnUnload,
} from "./dirty";
import { registerShellSession } from "./shellGate";
import { addMusicItem, setOptionalPath, setSkipTitle } from "./project";
import { launchPlay, playFromHereDecision, playFromStartBody, playNoticeKey, runPlayFromHere } from "./play";
import { formatPackNote, packWarningsOf, type PackResult } from "./pack";
import { exportAllScenes, exportScene, joinExportTexts, type ScriptFile } from "./exportScript";
import { AuditionButton } from "./AuditionButton";
import { playAudition, isAudibleLogical } from "./audition";
import { AssetField } from "./AssetField";
import { ASSET_GROUP_I18N, assetLists, charAssetPath, groupAssets, isMissingAsset } from "./assets";
import { AffectionRow, RosterPanel, SpeakerSelect } from "./RosterUi";
import { rosterOf } from "./roster";
import { buildRouteTree, overlayCurrent, upsertSceneMeta } from "./route";
import { RouteTree, SceneExitHint } from "./RouteTree";
import { AssetOverview } from "./AssetOverview";
import { SearchPalette } from "./SearchPalette";
import { VarList } from "./VarList";
import type { CiteSite } from "./overview";
import type { VarSite } from "./vars";
import { clampBeatIndex, loadScenesForSearch, type SearchHit } from "./search";
import { mergeSaveResponse } from "./saveGeneration";
import { Preview } from "./Preview";
import { switchUiVersion } from "./v2/uiVersion";
import type { AssetMeta, AssetRootInfo, Beat, ChoiceOption, GalleryItem, Locale, Project, Scene, SceneMeta } from "./types";

const TABLES: Record<Locale, Record<string, string>> = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
};

const EMPTY_BEATS: Beat[] = [];

const TRACKS = ["bg", "char", "text", "bgm", "voice", "se", "amb", "cg"] as const;
const TRACK_I18N: Record<(typeof TRACKS)[number], string> = {
  bg: "editor.trackBg",
  char: "editor.trackChar",
  text: "editor.trackText",
  bgm: "editor.trackBgm",
  voice: "editor.trackVoice",
  se: "editor.trackSe",
  amb: "editor.trackAmb",
  cg: "editor.trackCg",
};

export function App() {
  const [locale, setLocale] = useState<Locale>("zh-Hant");
  const t = (key: string) => TABLES[locale][key] ?? key;
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<SceneMeta[]>([]);
  const [archived, setArchived] = useState<SceneMeta[]>([]);
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [assetRoot, setAssetRoot] = useState<AssetRootInfo | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([0]);
  const [anchor, setAnchor] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [projectDirty, setProjectDirty] = useState(false);
  const [history, setHistory] = useState(emptyHistory);
  const [scriptText, setScriptText] = useState<string | null>(null);
  const [exportFiles, setExportFiles] = useState<ScriptFile[]>([]);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);
  const [packWarnings, setPackWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [draggingBeat, setDraggingBeat] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const [focusChoice, setFocusChoice] = useState<number | null>(null);
  const pendingBeatRef = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const projectRef = useRef(project);
  const dirtyRef = useRef(dirty);
  const projectDirtyRef = useRef(projectDirty);
  const sceneRev = useRef(0);
  const deletingSceneRef = useRef<string | null>(null);
  const projectRev = useRef(0);
  const sceneIdRef = useRef(sceneId);
  const scenesRef = useRef(scenes);
  const departedSceneRef = useRef<{ from: string; to: string } | null>(null);
  sceneIdRef.current = sceneId;
  scenesRef.current = scenes;
  sceneRef.current = scene;
  projectRef.current = project;
  dirtyRef.current = dirty;
  projectDirtyRef.current = projectDirty;

  function stillDirty() {
    return sceneLeaveBlocked(dirtyRef.current, projectDirtyRef.current);
  }

  const beat = scene?.beats[beatIndex];
  const lists = assetLists(assets);
  const routeScenes = useMemo(() => overlayCurrent(scenes, scene), [scenes, scene]);
  const routeIds = useMemo(() => new Set(routeScenes.map((item) => item.id)), [routeScenes]);
  const routeView = useMemo(
    () => buildRouteTree(project?.startScene ?? "", routeScenes),
    [project?.startScene, routeScenes],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, s, a, hidden, root] = await Promise.all([
          getJson<Project>("/api/project"),
          getJson<SceneMeta[]>("/api/scenes"),
          getJson<AssetMeta[]>("/api/assets"),
          getJson<SceneMeta[]>("/api/archived"),
          getJson<AssetRootInfo>("/api/asset-root"),
        ]);
        if (cancelled) return;
        projectRev.current += 1;
        projectRef.current = p;
        projectDirtyRef.current = false;
        classicDirtyRef.current = dirtyRef.current;
        setProject(p);
        setScenes(s);
        setAssets(a);
        setArchived(hidden);
        setAssetRoot(root);
        const hash = typeof location !== "undefined" ? location.hash : "";
        const decision = dialogueStartupDecision(hash, s, p.startScene, false);
        if (decision?.surface === "explore") {
          try {
            await flushThenAllowLeave(stillDirty(), save, stillDirty);
          } catch (err) {
            if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            return;
          }
          if (cancelled) return;
          navigateToExploreEditor({ sceneId: decision.sceneId });
          return;
        }
        setSceneId(decision?.sceneId ?? p.startScene);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(t("editor.hostDown"));
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sceneId || sceneRef.current?.id === sceneId) return;
    let cancelled = false;
    const loadedSceneRev = sceneRev.current;
    let plan: ReturnType<typeof planSceneLoad> | null = null;
    const decide = () => {
      if (plan) return plan;
      const departedSceneId = departedSceneForLoad(departedSceneRef.current, sceneId);
      departedSceneRef.current = null;
      plan = planSceneLoad({
        openSceneId: sceneRef.current?.id ?? null,
        loadedSceneRev,
        sceneRev: sceneRev.current,
        sceneDirty: dirtyRef.current,
        liveSceneIds: scenesRef.current.map((row) => row.id),
        departedSceneId,
      });
      return plan;
    };
    const restoreSelection = () => {
      pendingBeatRef.current = null;
      setSceneId(sceneRef.current?.id ?? null);
    };
    const abandonLeftScene = () => {
      sceneRev.current += 1;
      sceneRef.current = null;
      dirtyRef.current = false;
      classicDirtyRef.current = projectDirtyRef.current;
      pendingBeatRef.current = null;
      setScene(null);
      setSceneId(null);
      setDirty(false);
      setHistory(emptyHistory());
      setBeatIndex(0);
      setSelected([]);
      setAnchor(0);
    };
    getJson<Scene>(`/api/scenes/${sceneId}`)
      .then((s) => {
        if (cancelled) return;
        if (!decide().apply) {
          restoreSelection();
          throw new Error(LEAVE_CANCELLED_MESSAGE);
        }
        const idx = clampBeatIndex(pendingBeatRef.current, s.beats.length);
        pendingBeatRef.current = null;
        sceneRev.current += 1;
        sceneRef.current = s;
        dirtyRef.current = false;
        classicDirtyRef.current = projectDirtyRef.current;
        setScene(s);
        setBeatIndex(idx);
        setSelected([idx]);
        setAnchor(idx);
        setDirty(false);
        setHistory(emptyHistory());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (decide().restoreOpen) restoreSelection();
        else abandonLeftScene();
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [sceneId]);

  function commit(next: Scene, nextBeat = beatIndex, nextSelected?: number[]) {
    if (!scene) return;
    setHistory((h) => push(h, { scene, beatIndex }));
    sceneRev.current += 1;
    sceneRef.current = next;
    dirtyRef.current = true;
    classicDirtyRef.current = true;
    setScene(next);
    setBeatIndex(nextBeat);
    setSelected(nextSelected && nextSelected.length > 0 ? nextSelected : [nextBeat]);
    if (!nextSelected) {
      setAnchor(nextBeat);
    }
    setDirty(true);
  }

  function pickBeat(i: number, event?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
    if (!scene) return;
    const clamped = Math.max(0, Math.min(i, scene.beats.length - 1));
    if (event?.shiftKey) {
      setSelected(rangeIndices(anchor, clamped).filter((n) => n < scene.beats.length));
      setBeatIndex(clamped);
      return;
    }
    if (event?.ctrlKey || event?.metaKey) {
      const next = toggleIndex(selected, clamped);
      setSelected(next);
      setBeatIndex(clamped);
      if (!next.includes(anchor)) {
        setAnchor(clamped);
      }
      return;
    }
    setSelected([clamped]);
    setAnchor(clamped);
    setBeatIndex(clamped);
  }

  function updateBeat(mutator: (beat: Beat) => Beat) {
    if (!scene) return;
    const next = structuredClone(scene);
    const current = next.beats[beatIndex] ?? {};
    next.beats[beatIndex] = mutator(current);
    commit(next);
  }

  function applyMedia(asset: AssetMeta, index = beatIndex) {
    if (!scene) return;
    const next = structuredClone(scene);
    next.beats = applyAssetAt(next.beats, index, asset);
    commit(next, index);
    if (asset.logical.startsWith("cg/") && project) {
      replaceProject({ ...project, cg: ensureGalleryItem(project.cg, asset.logical) });
    }
  }

  function applyUndo() {
    if (!scene) return;
    const result = undo(history, { scene, beatIndex });
    if (!result) return;
    setHistory(result.history);
    sceneRev.current += 1;
    sceneRef.current = result.snap.scene;
    dirtyRef.current = true;
    classicDirtyRef.current = true;
    setScene(result.snap.scene);
    setBeatIndex(result.snap.beatIndex);
    setSelected([result.snap.beatIndex]);
    setAnchor(result.snap.beatIndex);
    setDirty(true);
  }

  function applyRedo() {
    if (!scene) return;
    const result = redo(history, { scene, beatIndex });
    if (!result) return;
    setHistory(result.history);
    sceneRev.current += 1;
    sceneRef.current = result.snap.scene;
    dirtyRef.current = true;
    classicDirtyRef.current = true;
    setScene(result.snap.scene);
    setBeatIndex(result.snap.beatIndex);
    setSelected([result.snap.beatIndex]);
    setAnchor(result.snap.beatIndex);
    setDirty(true);
  }

  function replaceProject(next: Project) {
    projectRev.current += 1;
    projectRef.current = next;
    projectDirtyRef.current = true;
    classicDirtyRef.current = true;
    setProject(next);
    setProjectDirty(true);
  }

  function patchSayFields(partial: { speaker?: string; text?: string }) {
    updateBeat((current) => patchSay(current, partial));
  }

  async function save() {
    const projectNow = projectRef.current;
    const sceneNow = sceneRef.current;
    const issues = [
      ...(projectNow && projectDirtyRef.current ? projectSaveIssues(projectNow) : []),
      ...(sceneNow && dirtyRef.current ? sceneSaveIssues(sceneNow) : []),
    ];
    if (issues.length > 0) {
      throw new Error(formatSaveIssues(issues, t));
    }
    if (projectNow && projectDirtyRef.current) {
      const requestRev = projectRev.current;
      const body = projectRef.current;
      if (body) {
        const savedProject = await putJson<Project>("/api/project", body);
        const current = projectRef.current ?? savedProject;
        const merged = mergeSaveResponse({
          requestRev,
          currentRev: projectRev.current,
          saved: savedProject,
          current,
        });
        if (merged.clearDirty) {
          projectRef.current = merged.value;
          projectDirtyRef.current = false;
          classicDirtyRef.current = dirtyRef.current;
          setProject(merged.value);
          setProjectDirty(false);
        }
      }
    }
    const sceneForKind = sceneRef.current;
    if (sceneForKind && deletingSceneRef.current === sceneForKind.id) return;
    if (
      sceneForKind &&
      sceneDocumentHasLeft({
        sceneId: sceneForKind.id,
        liveSceneIds: scenesRef.current.map((row) => row.id),
        departedSceneId: departedSceneRef.current?.from ?? null,
      })
    ) {
      // The file already left the live set. Do not PUT it back into scenario/.
      dirtyRef.current = false;
      classicDirtyRef.current = projectDirtyRef.current;
      setDirty(false);
      if (sceneIdRef.current === sceneForKind.id) {
        sceneRev.current += 1;
        sceneRef.current = null;
        pendingBeatRef.current = null;
        setScene(null);
        setHistory(emptyHistory());
        setBeatIndex(0);
        setSelected([]);
        setAnchor(0);
        setSceneId(null);
      }
      return;
    }
    if (!sceneForKind || !dirtyRef.current) {
      return;
    }
    if (sceneForKind.sceneKind === "explore") {
      const ok = window.confirm(t("editor.warnSaveExploreFromDialogue"));
      if (!ok) {
        throw new Error(t("editor.saveCancelled"));
      }
    }
    const body = sceneRef.current;
    if (!body || !dirtyRef.current) {
      return;
    }
    const requestRev = sceneRev.current;
    const saved = await putJson<Scene>(`/api/scenes/${body.id}`, body);
    const current = sceneRef.current;
    if (!current) return;
    const merged = mergeSaveResponse({
      requestRev,
      currentRev: sceneRev.current,
      saved,
      current,
    });
    if (merged.clearDirty) {
      sceneRef.current = merged.value;
      dirtyRef.current = false;
      classicDirtyRef.current = projectDirtyRef.current;
      setScene(merged.value);
      setScenes((list) => upsertSceneMeta(list, merged.value));
      setDirty(false);
    }
  }

  async function play() {
    if (!scene || !project) return;
    const decision = playFromHereDecision({
      sceneId: scene.id,
      beat: beatIndex,
      sceneKind: scene.sceneKind,
      hotspots: scene.hotspots,
      startScene: project.startScene,
    });
    try {
      const outcome = await runPlayFromHere({
        decision,
        launch: () => {
          if (decision.action !== "spawn") return Promise.resolve();
          return launchPlay({
            dirty: dirty || projectDirty,
            save,
            play: () => postJson("/api/play", decision.body),
          });
        },
      });
      if (outcome === "refused") {
        setError(t("editor.playExploreRefused"));
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function playFromStart() {
    if (!project) return;
    try {
      await launchPlay({
        dirty: dirty || projectDirty,
        save,
        play: () => postJson("/api/play", playFromStartBody(project.startScene)),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyAssetRoot(path: string | null) {
    const info = await putJson<AssetRootInfo>("/api/asset-root", { path });
    setAssetRoot(info);
    setAssets(await getJson<AssetMeta[]>("/api/assets"));
  }

  async function browseAssetRoot() {
    try {
      const picked = await postJson<{ path: string | null }>("/api/pick-dir", {});
      if (picked.path) {
        await applyAssetRoot(picked.path);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function resetAssetRoot() {
    try {
      await applyAssetRoot(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function packGame() {
    try {
      const picked = await postJson<{ path: string | null }>("/api/pick-dir", {});
      if (!picked.path) {
        return;
      }
      let packed: PackResult | undefined;
      await launchPlay({
        dirty: dirty || projectDirty,
        save,
        play: async () => {
          packed = await postJson<PackResult>("/api/pack", { out: picked.path });
        },
      });
      setPackNote(packed ? formatPackNote(packed, t) : t("editor.packWrote"));
      setPackWarnings(packed ? packWarningsOf(packed) : []);
      setError(null);
    } catch (err) {
      setPackNote(null);
      setPackWarnings([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createSceneFile(raw: string): Promise<Scene | null> {
    const id = parseSceneId(raw);
    if (!id) {
      setError(t("editor.badSceneId"));
      return null;
    }
    try {
      const created = await postJson<Scene>("/api/scenes", { id });
      setScenes((list) => upsertSceneMeta(list, created));
      setError(null);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async function selectScene(id: string) {
    const surface = listedKindOf(scenes, id);
    if (surface === "dialogue" && id === sceneId) return;
    const opened = await commitSceneOpen({
      surface,
      id,
      flush: () => flushThenAllowLeave(stillDirty(), save, stillDirty),
      openDialogue: (next) => setSceneId(next),
      openExplore: (next) => navigateToExploreEditor({ sceneId: next }),
      fail: (err) => setError(err instanceof Error ? err.message : String(err)),
    });
    if (opened !== "cancelled") setError(null);
  }

  async function dupScene() {
    if (!scene) return;
    try {
      await flushThenAllowLeave(stillDirty(), save, stillDirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const raw = window.prompt(t("editor.dupSceneId"));
    if (!raw) return;
    const copy = duplicateScene(scene, raw);
    if (!copy) {
      setError(t("editor.badSceneId"));
      return;
    }
    try {
      await postJson<Scene>("/api/scenes", { id: copy.id });
      const saved = await putJson<Scene>(`/api/scenes/${copy.id}`, copy);
      setScenes((list) => upsertSceneMeta(list, saved));
      if (sceneLeaveBlocked(dirtyRef.current, projectDirtyRef.current)) {
        throw new Error(LEAVE_CANCELLED_MESSAGE);
      }
      departedSceneRef.current = departureTicket(sceneRef.current?.id, saved.id);
      setSceneId(saved.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function archiveScene() {
    if (!scene || !project) return;
    if (!canArchiveScene(scene.id, project.startScene)) {
      setError(t("editor.cannotArchiveStart"));
      return;
    }
    try {
      await flushThenAllowLeave(stillDirty(), save, stillDirty);
      await postJson(`/api/scenes/${scene.id}/archive`, {});
      const [live, hidden] = await Promise.all([
        getJson<SceneMeta[]>("/api/scenes"),
        getJson<SceneMeta[]>("/api/archived"),
      ]);
      setScenes(live);
      setArchived(hidden);
      if (sceneLeaveBlocked(dirtyRef.current, projectDirtyRef.current)) {
        throw new Error(LEAVE_CANCELLED_MESSAGE);
      }
      const nextId = nextSceneAfterArchive(
        scene.id,
        scene.id,
        project.startScene,
        live.map((item) => item.id),
      );
      departedSceneRef.current = departureTicket(scene.id, nextId);
      if (listedKindOf(live, nextId) === "explore") {
        navigateToExploreEditor({ sceneId: nextId });
      } else {
        setSceneId(nextId);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteScene() {
    if (!scene || !project) return;
    if (!canDeleteScene(scene.id, project.startScene)) {
      setError(t("editor.cannotDeleteStart"));
      return;
    }
    if (!window.confirm(t("editor.deleteSceneConfirm").replaceAll("{id}", scene.id))) {
      return;
    }
    const removed = scene.id;
    if (deletingSceneRef.current) return;
    deletingSceneRef.current = removed;
    // Ignore responses from saves that were already in flight.
    sceneRev.current += 1;
    try {
      await deleteJson(`/api/scenes/${removed}`);
      if (sceneRef.current?.id === removed) {
        sceneRev.current += 1;
        sceneRef.current = null;
        dirtyRef.current = false;
        classicDirtyRef.current = projectDirtyRef.current;
        pendingBeatRef.current = null;
        setScene(null);
        setSceneId(null);
        setDirty(false);
        setHistory(emptyHistory());
        setBeatIndex(0);
        setSelected([]);
        setAnchor(0);
      }
      clearBackup(globalThis.localStorage, removed);
      setScenes((list) => list.filter((item) => item.id !== removed));
      const live = await getJson<SceneMeta[]>("/api/scenes");
      setScenes(live);
      // Do not replace a different scene the user opened during deletion.
      if (!sceneRef.current) {
        const nextId = nextSceneAfterArchive(
          removed,
          removed,
          project.startScene,
          live.map((item) => item.id),
        );
        if (listedKindOf(live, nextId) === "explore") {
          navigateToExploreEditor({ sceneId: nextId });
        } else {
          setSceneId(nextId);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      deletingSceneRef.current = null;
    }
  }

  async function deleteArchivedScene(id: string) {
    if (!window.confirm(t("editor.deleteArchivedConfirm").replaceAll("{id}", id))) {
      return;
    }
    try {
      await deleteJson(`/api/archived/${id}`);
      setArchived((list) => list.filter((item) => item.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function restoreScene(id: string) {
    try {
      const restored = await postJson<Scene>(`/api/scenes/${id}/unarchive`, {});
      setScenes((list) => upsertSceneMeta(list, restored));
      setArchived((list) => list.filter((item) => item.id !== restored.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function newScene() {
    try {
      await flushThenAllowLeave(stillDirty(), save, stillDirty);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const raw = window.prompt(t("editor.newSceneId"));
    if (!raw) return;
    const created = await createSceneFile(raw);
    if (created) {
      if (sceneLeaveBlocked(dirtyRef.current, projectDirtyRef.current)) {
        setError(LEAVE_CANCELLED_MESSAGE);
        return;
      }
      departedSceneRef.current = departureTicket(sceneRef.current?.id, created.id);
      setSceneId(created.id);
    }
  }

  async function newSceneForGoto(assign: (id: string) => void) {
    const raw = window.prompt(t("editor.newSceneId"));
    if (!raw) return;
    const created = await createSceneFile(raw);
    if (created) {
      assign(created.id);
    }
  }

  function showExport(files: ScriptFile[]) {
    setExportFiles(files);
    setExportPath(null);
    setScriptText(joinExportTexts(files));
  }

  async function exportEveryScene() {
    try {
      const loaded = await Promise.all(
        scenes.map((meta) =>
          scene && meta.id === scene.id
            ? Promise.resolve(scene)
            : getJson<Scene>(`/api/scenes/${meta.id}`),
        ),
      );
      showExport(exportAllScenes(loaded));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function writeExportFiles() {
    try {
      const paths: string[] = [];
      for (const file of exportFiles) {
        const res = await postJson<{ path: string }>("/api/export", {
          id: file.id,
          text: file.text,
        });
        paths.push(res.path);
      }
      setExportPath(paths.join(", "));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function addBeat() {
    if (!scene) return;
    const beats = insertBeatAfter(scene.beats, beatIndex);
    commit({ ...scene, beats }, beatIndex + 1);
  }

  async function goToBeat(id: string, beat: number | null) {
    const surface = listedKindOf(scenes, id);
    if (surface === "dialogue" && id === sceneId) {
      pickBeat(beat ?? 0);
      return;
    }
    const opened = await commitSceneOpen({
      surface,
      id,
      flush: () => flushThenAllowLeave(stillDirty(), save, stillDirty),
      openDialogue: (next) => {
        pendingBeatRef.current = beat ?? 0;
        setSceneId(next);
      },
      openExplore: (next) => navigateToExploreEditor({ sceneId: next }),
      fail: (err) => setError(err instanceof Error ? err.message : String(err)),
    });
    if (opened !== "cancelled") setError(null);
  }

  async function goToSearchHit(hit: SearchHit) {
    setSearchOpen(false);
    if (!hit.sceneId) {
      return;
    }
    await goToBeat(hit.sceneId, hit.beatIndex);
  }

  async function goToCite(site: CiteSite) {
    setOverviewOpen(false);
    if (!site.sceneId) {
      return;
    }
    await goToBeat(site.sceneId, site.beatIndex ?? 0);
  }

  async function goToVar(site: VarSite) {
    setVarsOpen(false);
    if (site.where === "beat") {
      setFocusChoice(null);
      await goToBeat(site.sceneId, site.beatIndex ?? 0);
      return;
    }
    setFocusChoice(site.where === "choice" ? (site.choiceIndex ?? null) : null);
    await goToBeat(site.sceneId, 0);
  }

  function dupBeat() {
    if (!scene) return;
    const beats = duplicateBeat(scene.beats, beatIndex);
    if (beats === scene.beats) return;
    commit({ ...scene, beats }, beatIndex + 1);
  }

  function delBeat() {
    if (!scene) return;
    const group = selected.length > 1 ? selected : [beatIndex];
    const from = normalizeIndices(group, scene.beats.length);
    const beats = removeBeatsAt(scene.beats, from);
    if (beats === scene.beats) {
      const one = removeBeatAt(scene.beats, beatIndex);
      commit({ ...scene, beats: one }, Math.min(beatIndex, one.length - 1));
      return;
    }
    commit({ ...scene, beats }, Math.min(from[0] ?? beatIndex, beats.length - 1));
  }

  function moveBeatColumn(indices: number[], to: number) {
    if (!scene) return;
    const beats = moveBeats(scene.beats, indices, to);
    if (beats === scene.beats) return;
    const nextIndex = adjustIndexAfterMoveBeats(indices, to, beatIndex, scene.beats.length);
    commit({ ...scene, beats }, nextIndex, selectionAfterMoveBeats(indices, to, scene.beats.length));
  }

  function patchChoice(index: number, opt: ChoiceOption) {
    if (!scene || scene.exit?.type !== "choices") return;
    const options = scene.exit.options.slice();
    options[index] = opt;
    commit({ ...scene, exit: { type: "choices", options } });
  }

  function addChoice() {
    if (!scene || scene.exit?.type !== "choices") return;
    commit({
      ...scene,
      exit: { type: "choices", options: [...scene.exit.options, emptyChoice()] },
    });
  }

  function patchGallery(index: number, item: GalleryItem) {
    if (!project) return;
    const cg = (project.cg ?? []).slice();
    cg[index] = item;
    replaceProject({ ...project, cg });
  }

  function addGallery() {
    if (!project) return;
    const n = (project.cg?.length ?? 0) + 1;
    replaceProject({
      ...project,
      cg: [...(project.cg ?? []), { id: `cg_${n}`, asset: "cg/still" }],
    });
  }

  function delGallery(index: number) {
    if (!project) return;
    replaceProject({
      ...project,
      cg: (project.cg ?? []).filter((_, i) => i !== index),
    });
  }

  function patchProjectField(next: Project) {
    replaceProject(next);
  }

  function patchSceneTitle(raw: string) {
    if (!scene) return;
    const title = raw.trim() || undefined;
    commit({ ...scene, title });
    setScenes((list) =>
      list.map((s) => (s.id === scene.id ? { ...s, title } : s)),
    );
  }

  function patchMusic(index: number, item: GalleryItem) {
    if (!project) return;
    const musicGallery = (project.musicGallery ?? []).slice();
    musicGallery[index] = item;
    patchProjectField({ ...project, musicGallery });
  }

  function delMusic(index: number) {
    if (!project) return;
    patchProjectField({
      ...project,
      musicGallery: (project.musicGallery ?? []).filter((_, i) => i !== index),
    });
  }

  function delChoice(index: number) {
    if (!scene || scene.exit?.type !== "choices") return;
    const options = scene.exit.options.filter((_, i) => i !== index);
    commit({ ...scene, exit: { type: "choices", options: options.length ? options : [emptyChoice()] } });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void save().catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        });
        return;
      }
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        applyRedo();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        applyUndo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        applyRedo();
        return;
      }
      if (key === "d") {
        event.preventDefault();
        if (!searchOpen) {
          dupBeat();
        }
        return;
      }
      if (key === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const classicDirtyRef = useRef(false);
  classicDirtyRef.current = dirty || projectDirty;
  const classicSaveRef = useRef(save);
  classicSaveRef.current = save;
  useEffect(() => {
    return registerShellSession({
      getDirty: () => classicDirtyRef.current,
      save: () => classicSaveRef.current(),
    });
  }, []);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!shouldWarnUnload(dirty || projectDirty)) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, projectDirty]);

  const playDecision =
    scene && project
      ? playFromHereDecision({
          sceneId: scene.id,
          beat: beatIndex,
          sceneKind: scene.sceneKind,
          hotspots: scene.hotspots,
          startScene: project.startScene,
        })
      : null;

  return (
    <div className="app">
      <header className="top">
        <h1>{t("app.name")}</h1>
        <span>{project?.title ?? ""}</span>
        <button type="button" onClick={applyUndo} disabled={history.past.length === 0}>
          {t("editor.undo")}
        </button>
        <button type="button" onClick={applyRedo} disabled={history.future.length === 0}>
          {t("editor.redo")}
        </button>
        <button type="button" onClick={() => setSearchOpen(true)} title={t("editor.searchTitle")}>
          {t("editor.search")}
        </button>
        <button type="button" onClick={() => setOverviewOpen(true)} title={t("editor.overviewTitle")}>
          {t("editor.overview")}
        </button>
        <button type="button" onClick={() => setVarsOpen(true)} title={t("editor.varsTitle")}>
          {t("editor.vars")}
        </button>
        <button
          type="button"
          onClick={() =>
            void save().catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err));
            })
          }
          disabled={!dirty && !projectDirty}
        >
          {t("menu.save")}
        </button>
        <button
          type="button"
          onClick={() => void play()}
          title={playDecision ? t(playNoticeKey(playDecision.notice)) : undefined}
        >
          {t("menu.playFromHere")}
        </button>
        {playDecision?.action === "refuse" ? (
          <button type="button" onClick={() => void playFromStart()}>
            {t("editor.playFromStart")}
          </button>
        ) : null}
        <button type="button" onClick={addBeat}>
          {t("editor.addBeat")}
        </button>
        <button type="button" onClick={dupBeat} disabled={!scene} title={t("editor.dupBeatTitle")}>
          {t("editor.dupBeat")}
        </button>
        <button type="button" onClick={delBeat} disabled={(scene?.beats.length ?? 0) <= 1}>
          {t("editor.delBeat")}
        </button>
        <button type="button" onClick={() => void newScene()}>
          {t("editor.newScene")}
        </button>
        <button type="button" onClick={() => void dupScene()} disabled={!scene} title={t("editor.dupSceneTitle")}>
          {t("editor.dupScene")}
        </button>
        <button
          type="button"
          onClick={() => void archiveScene()}
          disabled={!canArchiveScene(sceneId ?? "", project?.startScene)}
          title={t("editor.archiveTitle")}
        >
          {t("editor.archive")}
        </button>
        <button
          type="button"
          onClick={() => void deleteScene()}
          disabled={!canDeleteScene(sceneId ?? "", project?.startScene)}
          title={t("editor.deleteSceneTitle")}
        >
          {t("editor.deleteScene")}
        </button>
        <button
          type="button"
          onClick={() => scene && showExport([{ id: scene.id, text: exportScene(scene) }])}
          disabled={!scene}
        >
          {t("menu.exportScript")}
        </button>
        <button type="button" onClick={() => void exportEveryScene()} disabled={scenes.length === 0}>
          {t("editor.exportAll")}
        </button>
        <button type="button" onClick={() => void packGame()}>
          {t("menu.exportGame")}
        </button>
        <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          <option value="zh-Hant">{t("locale.zhHant")}</option>
          <option value="zh-Hans">{t("locale.zhHans")}</option>
          <option value="en">{t("locale.en")}</option>
        </select>
        <button type="button" onClick={() => switchUiVersion("v2")}>
          {t("editor.uiBeta")}
        </button>
        {dirty || projectDirty ? <span className="status">{t("editor.dirty")}</span> : null}
        {packNote && packWarnings.length === 0 ? <span className="status">{packNote}</span> : null}
      </header>
      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        loadScenes={() =>
          loadScenesForSearch(scenes, scene, (id) => getJson<Scene>(`/api/scenes/${id}`))
        }
        assets={assets}
        onPick={(hit) => void goToSearchHit(hit)}
        t={t}
        tone="classic"
      />
      <AssetOverview
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        loadScenes={() =>
          loadScenesForSearch(scenes, scene, (id) => getJson<Scene>(`/api/scenes/${id}`))
        }
        project={project}
        assets={assets}
        onJump={(site) => void goToCite(site)}
        t={t}
        tone="classic"
      />
      <VarList
        open={varsOpen}
        onClose={() => setVarsOpen(false)}
        loadScenes={() =>
          loadScenesForSearch(scenes, scene, (id) => getJson<Scene>(`/api/scenes/${id}`))
        }
        onJump={(site) => void goToVar(site)}
        t={t}
        tone="classic"
      />
      {error ? <div className="error">{error}</div> : null}
      {packNote && packWarnings.length > 0 ? (
        <div className="pack-warnings" role="status">
          {packNote}
        </div>
      ) : null}
      {scriptText !== null ? (
        <div className="export-overlay">
          <div className="export-panel">
            <h2>{t("menu.exportScript")}</h2>
            <p className="hint">{t("editor.exportReadonly")}</p>
            <textarea readOnly value={scriptText} spellCheck={false} />
            {exportPath ? <p className="hint">{t("editor.exportWrote")}: {exportPath}</p> : null}
            <div className="export-actions">
              <button type="button" onClick={() => void writeExportFiles()} disabled={exportFiles.length === 0}>
                {t("editor.exportWrite")}
              </button>
              <button type="button" onClick={() => setScriptText(null)}>
                {t("common.ok")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="grid">
        <aside className="pane">
          <h2>{t("editor.scenes")}</h2>
          {routeScenes.map((s) => (
            <div
              key={s.id}
              className={`list-item${s.id === sceneId ? " active" : ""}`}
              onClick={() => void selectScene(s.id)}
            >
              <span className="list-item-title">{s.title ?? s.id}</span>
              {s.sceneKind ? (
                <span className="hint">
                  {s.sceneKind === "explore"
                    ? t("editor.scriptsKindExplore")
                    : t("editor.scriptsKindDialogue")}
                </span>
              ) : null}
              <SceneExitHint exit={s.exit} ids={routeIds} t={t} />
            </div>
          ))}
          {archived.length > 0 ? (
            <>
              <h2>{t("editor.archived")}</h2>
              {archived.map((item) => (
                <div key={item.id} className="list-item">
                  <span className="list-item-title">{item.title ?? item.id}</span>
                  <button type="button" onClick={() => void restoreScene(item.id)}>
                    {t("editor.unarchive")}
                  </button>
                  <button type="button" onClick={() => void deleteArchivedScene(item.id)}>
                    {t("editor.deleteArchived")}
                  </button>
                </div>
              ))}
            </>
          ) : null}
          <button type="button" className="route-toggle" onClick={() => setShowRoute((open) => !open)}>
            {t("editor.route")}
          </button>
          {showRoute ? (
            <RouteTree
              view={routeView}
              currentId={sceneId ?? ""}
              onSelect={(id) => void selectScene(id)}
              t={t}
            />
          ) : null}
          <h2>{t("editor.media")}</h2>
          <p className="hint" title={assetRoot?.path}>
            {assetRoot?.path}
          </p>
          <button type="button" onClick={() => void browseAssetRoot()}>
            {t("editor.assetBrowse")}
          </button>
          <button
            type="button"
            disabled={!assetRoot || assetRoot.isDefault}
            onClick={() => void resetAssetRoot()}
          >
            {t("editor.assetDefault")}
          </button>
          <p className="hint">{t("editor.assetHint")}</p>
          <p className="hint">{t("editor.applyHint")}</p>
          {groupAssets(assets).map((bucket) => (
            <div key={bucket.group} className="asset-group">
              <div className="asset-group-title">{t(ASSET_GROUP_I18N[bucket.group])}</div>
              {bucket.items.map((a) => (
                <div
                  key={a.logical}
                  className="list-item"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", encodeAssetDrag(a));
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    applyMedia(a);
                    if (isAudibleLogical(a.logical)) {
                      playAudition(a.logical);
                    }
                  }}
                >
                  <div className="list-item-row">
                    <span>{a.logical}</span>
                    <AuditionButton logical={a.logical} t={t} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </aside>
        <section className="preview" aria-label={t("editor.preview")}>
          <Preview
            sceneId={scene?.id ?? ""}
            beats={scene?.beats ?? EMPTY_BEATS}
            beatIndex={beatIndex}
            msgBox={project?.msgBox}
            dialogueFont={project?.fonts?.dialogue || project?.font}
            onCharOffset={(index, x, y) => updateBeat((cur) => setCharOffset(cur, index, x, y))}
          />
        </section>
        <aside className="pane inspector">
          <h2>{t("editor.inspector")}</h2>
          <div className="media">#{beatIndex}</div>
          <label>{t("editor.beatLabel")}</label>
          <input
            type="text"
            value={beat?.label ?? ""}
            onChange={(e) => updateBeat((current) => setBeatLabel(current, e.target.value))}
          />
          <label>{t("editor.speaker")}</label>
          <SpeakerSelect
            value={beat?.say?.speaker ?? ""}
            characters={rosterOf(project)}
            t={t}
            onChange={(speaker) => patchSayFields({ speaker })}
          />
          <label>{t("editor.line")}</label>
          <textarea
            value={beat?.say?.text ?? ""}
            onChange={(e) => patchSayFields({ text: e.target.value })}
          />
          <label>{t("editor.voice")}</label>
          <AssetField
            value={beat?.say?.voice ?? ""}
            options={lists.voice}
            t={t}
            disabled={!beat?.say}
            placeholder="voice/sora/001"
            onChange={(value) => updateBeat((current) => setSayVoice(current, value))}
          />
          <label>{t("editor.autoAdvance")}</label>
          <select
            value={
              beat?.say?.autoAdvance?.type === "voice"
                ? "voice"
                : beat?.say?.autoAdvance?.type === "ms"
                  ? "ms"
                  : "none"
            }
            disabled={!beat?.say}
            onChange={(e) => {
              const kind = e.target.value as "none" | "voice" | "ms";
              updateBeat((current) => setAutoAdvance(current, kind, current.say?.autoAdvance && "ms" in current.say.autoAdvance ? current.say.autoAdvance.ms : 3000));
            }}
          >
            <option value="none">{t("editor.autoNone")}</option>
            <option value="voice">{t("editor.autoVoice")}</option>
            <option value="ms">{t("editor.autoMs")}</option>
          </select>
          {beat?.say?.autoAdvance?.type === "ms" ? (
            <input
              type="number"
              min={0}
              value={beat.say.autoAdvance.ms}
              onChange={(e) =>
                updateBeat((current) => setAutoAdvance(current, "ms", Number(e.target.value) || 0))
              }
            />
          ) : null}
          <label>{t("editor.trackBg")}</label>
          <AssetField
            value={beat?.bg?.asset ?? ""}
            options={lists.bg}
            t={t}
            onChange={(value) => updateBeat((current) => setBg(current, value))}
          />
          <label>{t("editor.bgTrans")}</label>
          <select
            value={beat?.bg?.trans ?? "none"}
            disabled={!beat?.bg}
            onChange={(e) => updateBeat((current) => setBgTrans(current, e.target.value))}
          >
            <option value="none">{t("editor.transNone")}</option>
            <option value="fade">{t("editor.transFade")}</option>
            <option value="crossfade">{t("editor.transCrossfade")}</option>
          </select>
          <label>{t("editor.bgMs")}</label>
          <input
            type="number"
            min={0}
            value={beat?.bg?.ms ?? ""}
            disabled={!beat?.bg}
            onChange={(e) => updateBeat((current) => setBgMs(current, e.target.value))}
          />
          <label>{t("editor.trackChar")}</label>
          {(beat?.chars ?? []).map((ch, i) => (
            <div key={`${i}-${ch.slot}`} className="stage-row">
              <AssetField
                value={ch.id}
                options={lists.charIds}
                t={t}
                warn={false}
                placeholder="id"
                onChange={(value) => updateBeat((cur) => patchStageChar(cur, i, { id: value }))}
              />
              <AssetField
                value={ch.face}
                options={lists.facesFor(ch.id)}
                t={t}
                warn={false}
                placeholder={t("editor.face")}
                onChange={(value) => updateBeat((cur) => patchStageChar(cur, i, { face: value }))}
              />
              <select
                value={ch.slot ?? "center"}
                onChange={(e) =>
                  updateBeat((cur) =>
                    patchStageChar(cur, i, { slot: e.target.value as "left" | "center" | "right" }),
                  )
                }
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
              <label>{t("editor.charX")}</label>
              <input
                type="number"
                value={ch.x ?? 0}
                onChange={(e) =>
                  updateBeat((cur) => setCharOffset(cur, i, Number(e.target.value) || 0, ch.y ?? 0))
                }
              />
              <label>{t("editor.charY")}</label>
              <input
                type="number"
                value={ch.y ?? 0}
                onChange={(e) =>
                  updateBeat((cur) => setCharOffset(cur, i, ch.x ?? 0, Number(e.target.value) || 0))
                }
              />
              <label>{t("editor.charSlide")}</label>
              <input
                type="number"
                min={0}
                value={ch.slideMs ?? ""}
                placeholder="0"
                onChange={(e) => updateBeat((cur) => setCharSlideMs(cur, i, e.target.value))}
              />
              <button type="button" onClick={() => updateBeat((cur) => removeStageChar(cur, i))}>
                {t("editor.delChar")}
              </button>
              {isMissingAsset(charAssetPath(ch.id, ch.face), lists.known) ? (
                <div className="asset-missing">{t("editor.assetMissing")}</div>
              ) : null}
            </div>
          ))}
          {(beat?.chars?.length ?? 0) < MAX_STAGE_CHARS ? (
            <button
              type="button"
              onClick={() =>
                updateBeat((cur) =>
                  addStageChar(
                    cur,
                    fallbackStageCharId(
                      [...rosterOf(project).map((ch) => ch.id), ...lists.charIds],
                      cur.chars,
                    ),
                  ),
                )
              }
            >
              {t("editor.addChar")}
            </button>
          ) : null}
          <label>{t("editor.trackBgm")}</label>
          <AssetField
            value={beat?.bgm?.asset ?? ""}
            options={lists.bgm}
            t={t}
            onChange={(value) =>
              updateBeat((current) => ({
                ...current,
                bgm: value ? { asset: value, fadeMs: current.bgm?.fadeMs } : undefined,
              }))
            }
          />
          <label>{t("editor.bgmFade")}</label>
          <input
            type="number"
            min={0}
            value={beat?.bgm?.fadeMs ?? ""}
            disabled={!beat?.bgm}
            onChange={(e) =>
              updateBeat((current) => {
                if (!current.bgm) return current;
                const raw = e.target.value;
                const fadeMs = raw === "" ? undefined : Number(raw);
                return {
                  ...current,
                  bgm: {
                    ...current.bgm,
                    fadeMs: fadeMs !== undefined && Number.isFinite(fadeMs) ? fadeMs : undefined,
                  },
                };
              })
            }
          />
          <label>{t("editor.se")}</label>
          <AssetField
            value={seDisplay(beat)}
            options={lists.se}
            t={t}
            placeholder="se/breeze"
            onChange={(value) => updateBeat((current) => setSe(current, value))}
          />
          <label>{t("editor.amb")}</label>
          <AssetField
            value={ambDisplay(beat)}
            options={lists.amb}
            t={t}
            placeholder="amb/rain"
            onChange={(value) => updateBeat((current) => setAmb(current, value))}
          />
          <button
            type="button"
            onClick={() =>
              updateBeat((current) => (current.amb === null ? setAmb(current, "") : closeAmb(current)))
            }
          >
            {beat?.amb === null ? t("editor.ambInherit") : t("editor.ambOff")}
          </button>
          <label>{t("editor.cg")}</label>
          <AssetField
            value={cgDisplay(beat)}
            options={lists.cg}
            t={t}
            placeholder="cg/op_still"
            onChange={(value) => updateBeat((current) => setCg(current, value))}
          />
          <button
            type="button"
            onClick={() =>
              updateBeat((current) => (current.cg === null ? setCg(current, "") : closeCg(current)))
            }
          >
            {beat?.cg === null ? t("editor.cgInherit") : t("editor.cgOff")}
          </button>
          <label>{t("editor.movie")}</label>
          <AssetField
            value={beat?.movie?.asset ?? ""}
            options={lists.movie}
            t={t}
            placeholder="movie/op"
            onChange={(value) => updateBeat((current) => setMovie(current, value))}
          />
          <label>{t("editor.camera")}</label>
          <input
            type="number"
            placeholder="x"
            value={beat?.camera === undefined ? "" : (beat.camera?.x ?? 0)}
            onChange={(e) => updateBeat((current) => setCameraField(current, "x", e.target.value))}
          />
          <input
            type="number"
            placeholder="y"
            value={beat?.camera === undefined ? "" : (beat.camera?.y ?? 0)}
            onChange={(e) => updateBeat((current) => setCameraField(current, "y", e.target.value))}
          />
          <input
            type="number"
            min={50}
            max={400}
            placeholder="zoom"
            value={beat?.camera === undefined ? "" : (beat.camera?.zoom ?? 100)}
            onChange={(e) => updateBeat((current) => setCameraField(current, "zoom", e.target.value))}
          />
          <button
            type="button"
            onClick={() =>
              updateBeat((current) =>
                current.camera === null ? inheritCamera(current) : resetCamera(current),
              )
            }
          >
            {beat?.camera === null ? t("editor.cameraInherit") : t("editor.cameraReset")}
          </button>
          <label>{t("editor.fx")}</label>
          <select
            value={beat?.fx?.type ?? "none"}
            onChange={(e) =>
              updateBeat((current) =>
                setFx(current, e.target.value as "none" | "wait" | "shake" | "flash", current.fx?.ms),
              )
            }
          >
            <option value="none">{t("editor.fxNone")}</option>
            <option value="wait">{t("editor.fxWait")}</option>
            <option value="shake">{t("editor.fxShake")}</option>
            <option value="flash">{t("editor.fxFlash")}</option>
          </select>
          <label>{t("editor.fxMs")}</label>
          <input
            type="number"
            min={0}
            value={beat?.fx?.ms ?? ""}
            disabled={!beat?.fx}
            onChange={(e) => {
              const kind =
                beat?.fx?.type === "wait" || beat?.fx?.type === "flash" || beat?.fx?.type === "shake"
                  ? beat.fx.type
                  : "shake";
              const raw = e.target.value;
              updateBeat((current) =>
                setFx(current, kind, raw === "" ? undefined : Number(raw)),
              );
            }}
          />
          <details className="inspector-more">
          <summary>{t("editor.inspectorMore")}</summary>
          <h2>{t("editor.cgGallery")}</h2>
          {(project?.cg ?? []).map((item, i) => (
            <div key={i} className="choice">
              <label>{t("editor.cgId")}</label>
              <input
                type="text"
                value={item.id}
                onChange={(e) => patchGallery(i, { ...item, id: e.target.value })}
              />
              <label>{t("editor.cgAsset")}</label>
              <AssetField
                value={item.asset}
                options={lists.cg}
                t={t}
                onChange={(value) => patchGallery(i, { ...item, asset: value })}
              />
              <button type="button" onClick={() => delGallery(i)}>
                {t("editor.delCg")}
              </button>
            </div>
          ))}
          <button type="button" onClick={addGallery} disabled={!project}>
            {t("editor.addCg")}
          </button>
          <h2>{t("editor.project")}</h2>
          <label>{t("editor.sceneTitle")}</label>
          <input
            type="text"
            value={scene?.title ?? ""}
            disabled={!scene}
            onChange={(e) => patchSceneTitle(e.target.value)}
          />
          <label>{t("editor.projectTitle")}</label>
          <input
            type="text"
            value={project?.title ?? ""}
            disabled={!project}
            onChange={(e) => project && patchProjectField({ ...project, title: e.target.value })}
          />
          <label>{t("editor.startScene")}</label>
          <select
            value={project?.startScene ?? ""}
            disabled={!project}
            onChange={(e) => project && patchProjectField({ ...project, startScene: e.target.value })}
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title ?? s.id}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={project?.skipTitle ?? false}
              disabled={!project}
              onChange={(e) => project && patchProjectField(setSkipTitle(project, e.target.checked))}
            />{" "}
            {t("editor.skipTitle")}
          </label>
          <h2>{t("editor.roster")}</h2>
          <RosterPanel project={project} onChange={patchProjectField} t={t} />
          <label>{t("editor.titleBgm")}</label>
          <AssetField
            value={project?.titleBgm ?? ""}
            options={lists.bgm}
            t={t}
            disabled={!project}
            placeholder="bgm/park"
            onChange={(value) => project && patchProjectField(setOptionalPath(project, "titleBgm", value))}
          />
          <label>{t("editor.titleBg")}</label>
          <AssetField
            value={project?.titleBg ?? ""}
            options={lists.bg}
            t={t}
            disabled={!project}
            placeholder="bg/park_afternoon"
            onChange={(value) => project && patchProjectField(setOptionalPath(project, "titleBg", value))}
          />
          <label>{t("editor.titleMovie")}</label>
          <AssetField
            value={project?.titleMovie ?? ""}
            options={lists.movie}
            t={t}
            disabled={!project}
            placeholder="movie/op"
            onChange={(value) => project && patchProjectField(setOptionalPath(project, "titleMovie", value))}
          />
          <label>{t("editor.font")}</label>
          <AssetField
            value={project?.font ?? ""}
            options={lists.fonts}
            t={t}
            disabled={!project}
            placeholder="fonts/mplus"
            onChange={(value) => project && patchProjectField(setOptionalPath(project, "font", value))}
          />
          <label>{t("editor.msgBox")}</label>
          <AssetField
            value={project?.msgBox ?? ""}
            options={lists.ui.length > 0 ? lists.ui : lists.images}
            t={t}
            disabled={!project}
            placeholder="ui/msgbox"
            onChange={(value) => project && patchProjectField(setOptionalPath(project, "msgBox", value))}
          />
          <label>{t("editor.icon")}</label>
          <AssetField
            value={project?.icon ?? ""}
            options={lists.ui.length > 0 ? lists.ui : lists.images}
            t={t}
            disabled={!project}
            placeholder="ui/icon"
            onChange={(value) => project && patchProjectField(setOptionalPath(project, "icon", value))}
          />
          <h2>{t("editor.musicGallery")}</h2>
          {(project?.musicGallery ?? []).map((item, i) => (
            <div key={i} className="choice">
              <label>{t("editor.musicId")}</label>
              <input
                type="text"
                value={item.id}
                onChange={(e) => patchMusic(i, { ...item, id: e.target.value })}
              />
              <label>{t("editor.musicAsset")}</label>
              <AssetField
                value={item.asset}
                options={lists.bgm}
                t={t}
                onChange={(value) => patchMusic(i, { ...item, asset: value })}
              />
              <button type="button" onClick={() => delMusic(i)}>
                {t("editor.delMusic")}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => project && patchProjectField(addMusicItem(project))}
            disabled={!project}
          >
            {t("editor.addMusic")}
          </button>
          </details>
          <h2>{t("editor.exit")}</h2>
          <select
            value={exitKind(scene?.exit)}
            onChange={(e) => {
              if (!scene) return;
              commit({ ...scene, exit: setExitKind(scene.exit, e.target.value as ExitKind) });
            }}
          >
            <option value="none">{t("editor.exitNone")}</option>
            <option value="next">{t("editor.exitNext")}</option>
            <option value="choices">{t("editor.exitChoices")}</option>
            <option value="branch">{t("editor.exitBranch")}</option>
            <option value="return">{t("editor.exitReturn")}</option>
          </select>
          {scene?.exit?.type === "next" ? (
            <GotoSelect
              label={t("editor.goto")}
              scenes={scenes}
              value={scene.exit.goto}
              onChange={(goto) => commit({ ...scene, exit: { type: "next", goto } })}
              newLabel={t("editor.gotoNew")}
              onNew={() =>
                void newSceneForGoto((goto) => commit({ ...scene, exit: { type: "next", goto } }))
              }
            />
          ) : null}
          {scene?.exit?.type === "choices" ? (
            <>
              {scene.exit.options.map((opt, i) => (
                <div key={i} className={`choice${focusChoice === i ? " choice-focus" : ""}`}>
                  <label>{t("editor.choiceText")}</label>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => patchChoice(i, { ...opt, text: e.target.value })}
                  />
                  <GotoSelect
                    label={t("editor.goto")}
                    scenes={scenes}
                    value={opt.goto}
                    onChange={(goto) => patchChoice(i, { ...opt, goto })}
                    newLabel={t("editor.gotoNew")}
                    onNew={() => void newSceneForGoto((goto) => patchChoice(i, { ...opt, goto }))}
                  />
                  <label>{t("editor.affection")}</label>
                  <AffectionRow
                    characters={rosterOf(project)}
                    set={opt.set}
                    t={t}
                    onChange={(set) => patchChoice(i, { ...opt, set })}
                  />
                  <label>{t("editor.choiceSet")}</label>
                  <input
                    type="text"
                    value={formatSet(opt.set)}
                    onChange={(e) => patchChoice(i, { ...opt, set: parseSet(e.target.value) })}
                  />
                  <label>{t("editor.choiceIf")}</label>
                  {(() => {
                    const cond = readCond(opt.if);
                    return (
                      <>
                        <input
                          type="text"
                          placeholder={t("editor.branchVar")}
                          value={cond.name}
                          onChange={(e) => patchChoice(i, patchChoiceIf(opt, { ...cond, name: e.target.value }))}
                        />
                        <select
                          value={cond.op}
                          onChange={(e) =>
                            patchChoice(i, patchChoiceIf(opt, { ...cond, op: e.target.value as typeof cond.op }))
                          }
                        >
                          <option value="gte">gte</option>
                          <option value="lte">lte</option>
                          <option value="gt">gt</option>
                          <option value="lt">lt</option>
                          <option value="eq">eq</option>
                        </select>
                        <input
                          type="number"
                          value={cond.n}
                          onChange={(e) =>
                            patchChoice(i, patchChoiceIf(opt, { ...cond, n: Number(e.target.value) || 0 }))
                          }
                        />
                      </>
                    );
                  })()}
                  <button type="button" onClick={() => delChoice(i)}>
                    {t("editor.delChoice")}
                  </button>
                </div>
              ))}
              <button type="button" onClick={addChoice}>
                {t("editor.addChoice")}
              </button>
            </>
          ) : null}
          {scene?.exit?.type === "branch"
            ? (() => {
                const form = readBranch(scene.exit);
                const patch = (partial: Partial<BranchForm>) =>
                  commit({ ...scene, exit: writeBranch({ ...form, ...partial }) });
                return (
                  <>
                    <label>{t("editor.branchVar")}</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                    <label>{t("editor.branchOp")}</label>
                    <select value={form.op} onChange={(e) => patch({ op: e.target.value as BranchForm["op"] })}>
                      <option value="gte">gte</option>
                      <option value="lte">lte</option>
                      <option value="gt">gt</option>
                      <option value="lt">lt</option>
                      <option value="eq">eq</option>
                    </select>
                    <label>{t("editor.branchN")}</label>
                    <input
                      type="number"
                      value={form.n}
                      onChange={(e) => patch({ n: Number(e.target.value) || 0 })}
                    />
                    <GotoSelect
                      label={t("editor.branchThen")}
                      scenes={scenes}
                      value={form.then}
                      onChange={(then) => patch({ then })}
                      newLabel={t("editor.gotoNew")}
                      onNew={() => void newSceneForGoto((then) => patch({ then }))}
                    />
                    <GotoSelect
                      label={t("editor.branchElse")}
                      scenes={scenes}
                      value={form.else}
                      onChange={(elseGoto) => patch({ else: elseGoto })}
                      newLabel={t("editor.gotoNew")}
                      onNew={() => void newSceneForGoto((elseGoto) => patch({ else: elseGoto }))}
                    />
                  </>
                );
              })()
            : null}
        </aside>
        <footer className="tracks" aria-label={t("editor.beats")}>
          <div className="track-labels">
            <div className="track-head-spacer" aria-hidden />
            {TRACKS.map((name) => (
              <div key={name} className="track-label">
                {t(TRACK_I18N[name])}
              </div>
            ))}
          </div>
          <div className="track-cols">
            {scene?.beats.map((b, i) => {
              const s = beatSummary(b);
              return (
                <button
                  key={i}
                  type="button"
                  draggable
                  title={t("editor.multiSelect")}
                  className={`track-col${i === beatIndex ? " active" : ""}${selected.includes(i) ? " selected" : ""}${dragOver === i ? " drag-over" : ""}${draggingBeat !== null && (selected.includes(draggingBeat) ? selected.includes(i) : draggingBeat === i) ? " dragging" : ""}`}
                  onClick={(event) => pickBeat(i, event)}
                  onDragStart={(event) => {
                    const group = selected.includes(i) ? selected : [i];
                    event.dataTransfer.setData("text/plain", encodeBeatDrag(i, group));
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingBeat(i);
                  }}
                  onDragEnd={() => {
                    setDraggingBeat(null);
                    setDragOver(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = draggingBeat !== null ? "move" : "copy";
                    setDragOver(i);
                  }}
                  onDragLeave={() => {
                    setDragOver((cur) => (cur === i ? null : cur));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(null);
                    const raw = event.dataTransfer.getData("text/plain");
                    const from = parseBeatDragSet(raw);
                    if (from !== null) {
                      moveBeatColumn(from, i);
                      setDraggingBeat(null);
                      return;
                    }
                    const asset = parseAssetDrag(raw);
                    if (asset) {
                      applyMedia(asset, i);
                    }
                    setDraggingBeat(null);
                  }}
                >
                  <div className="track-col-note">
                    #{i}
                    {s.label ? ` ${s.label}` : ""}
                  </div>
                  <div className="cell">{s.bg}</div>
                  <div className="cell">{s.char}</div>
                  <div className="cell">{s.text}</div>
                  <div className="cell">{s.bgm}</div>
                  <div className="cell">{s.voice}</div>
                  <div className="cell">{s.se}</div>
                  <div className="cell">{s.amb}</div>
                  <div className="cell">{s.cg}</div>
                </button>
              );
            })}
          </div>
        </footer>
      </div>
    </div>
  );
}
