import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isPolygon,
  isRect,
  nudgePolygonPoints,
  nudgeRect,
  type Rect,
} from "./canvas";
import {
  canRedo,
  canUndo,
  dispatch,
  emptyBus,
  patchUi,
  redo,
  undo,
  type Command,
  type CommandBusState,
} from "./commandBus";
import {
  addCharacter,
  addHotspot,
  addItem,
  addSwitch,
  convertHotspotToPolygon,
  convertHotspotToRect,
  getInteractionRules,
  pasteInteraction,
  removeCharacter,
  removeHotspot,
  removeItem,
  removeSwitch,
  setHotspotPolygonPoints,
  setHotspotRect,
  setInteraction,
  setOnEmptyClick,
  setOnEnter,
  updateCharacter,
  updateHotspot,
  updateItem,
  updateProject,
  updateScene,
  updateSwitch,
} from "./commands";
import {
  defaultQuadAround,
  rectCenteredAt,
  type CtxMenuActionId,
  type CtxMenuTarget,
} from "./ctxMenuModel";
import { mergeSaveResponse } from "../saveGeneration";
import { DatabaseStub } from "./DatabaseStub";
import { ExploreCanvas } from "./ExploreCanvas";
import { HierarchyPanel } from "./HierarchyPanel";
import {
  CellInspector,
  HotspotInspector,
  OnEmptyClickInspector,
  OnEnterInspector,
} from "./InspectorPanels";
import {
  adoptSavedProjectRaw,
  loadExploreDoc,
  loadSiblingExploreScenes,
  saveExploreDoc,
  type ExplorePersistApi,
} from "./persist";
import { loadSceneCatalog } from "./sceneCatalog";
import { exploreNewSceneIdError, parseNewExploreSceneId } from "./sceneId";
import { navigateToDialogueEditor } from "../editorRoute";
import {
  ExploreSettingsButton,
  ExploreSettingsDialog,
} from "./ExploreSettings";
import "./explore.css";
import { ProblemsPanel } from "./ProblemsPanel";
import { TracePanel } from "./TracePanel";
import { resolveTrace } from "./trace";
import {
  buildProblemHotspotIds,
  buildProblemMatrixKeys,
  collectExploreProblems,
  collectExploreProblemsForScenes,
  countErrorProblemsInGroups,
  flattenSceneProblemGroups,
  formatPackProblemReport,
  formatProblemsBadge,
  problemNavTarget,
  type ExploreProblem,
} from "./problems";
import { PresetBrowser } from "./PresetBrowser";
import { applyPreset, setTransitionDefaults } from "./presets";
import { blankExploreDoc } from "./fixture";
import {
  createHttpPackApi,
  formatExplorePackStatus,
  type ExplorePackApi,
} from "./packClient";
import type {
  ExploreDoc,
  InteractionOn,
  InteractionRule,
  SceneCatalogEntry,
} from "./types";
import {
  confirmDeleteHotspotMessage,
  countHotspotDeleteImpact,
  defaultConfirmFn,
} from "./refCounts";
import {
  selectionAfterCellPick,
  selectionAfterHotspotPick,
} from "./selection";
import { VerbMatrix } from "./VerbMatrix";
import { getJson } from "../api";
import { confirmDiscardIfDirty, shouldWarnUnload } from "../dirty";
import { registerShellSession } from "../shellGate";
import type { AssetMeta } from "../types";
import { assetLists } from "../assets";


/** Pure mod-key routing for Explore shortcuts (Ctrl/Cmd). */
export function exploreModShortcut(
  key: string,
  opts: { inEditableField: boolean; hasPersist: boolean; shiftKey?: boolean },
): "save" | "copy" | "paste" | "undo" | "redo" | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  // Ctrl/Cmd+S always saves — even inside INPUT/TEXTAREA (avoid browser Save Page).
  if (k === "s") return opts.hasPersist ? "save" : null;
  if (opts.inEditableField) return null;
  if (k === "c") return "copy";
  if (k === "v") return "paste";
  if (k === "z") return opts.shiftKey ? "redo" : "undo";
  return null;
}

export type ExploreCanvasKeyAction =
  | { type: "delete" }
  | { type: "nudge"; dx: number; dy: number };

/**
 * Pure routing for canvas Delete / Backspace / Arrow when a hotspot is selected.
 * Does not steal keys from INPUT / TEXTAREA / contenteditable.
 */
export function exploreCanvasKeyAction(
  key: string,
  opts: {
    inEditableField: boolean;
    hasHotspotSelection: boolean;
    shiftKey?: boolean;
  },
): ExploreCanvasKeyAction | null {
  if (opts.inEditableField || !opts.hasHotspotSelection) return null;
  if (key === "Delete" || key === "Backspace") return { type: "delete" };
  const step = opts.shiftKey ? 10 : 1;
  switch (key) {
    case "ArrowLeft":
      return { type: "nudge", dx: -step, dy: 0 };
    case "ArrowRight":
      return { type: "nudge", dx: step, dy: 0 };
    case "ArrowUp":
      return { type: "nudge", dx: 0, dy: -step };
    case "ArrowDown":
      return { type: "nudge", dx: 0, dy: step };
    default:
      return null;
  }
}

/**
 * True when a load that started at `seenGen` must not replace the workspace.
 * Reloading may discard dirty state the user already confirmed (`discardedBeforeLoad`);
 * an edit during the await bumps `docGen` or sets dirty from a clean baseline.
 */
export function exploreLoadRaced(input: {
  seenGen: number;
  docGen: number;
  dirty: boolean;
  discardedBeforeLoad: boolean;
}): boolean {
  if (input.docGen !== input.seenGen) return true;
  if (input.dirty && !input.discardedBeforeLoad) return true;
  return false;
}

export interface ExploreWorkspaceProps {
  initial: ExploreDoc;
  knownSceneIds?: Set<string>;
  /** Preferred over knownSceneIds for Call picker + dead-end Problems. */
  sceneCatalog?: SceneCatalogEntry[];
  /** When set, Save/Reload hit real project/scene JSON (HTTP or FS). */
  persist?: ExplorePersistApi;
  /**
   * Pack via host POST /api/pack. Default: HTTP pack API.
   * Pass a stub in tests; omit to use createHttpPackApi().
   */
  packApi?: ExplorePackApi | null;
}

interface WorkspaceState {
  doc: ExploreDoc;
  bus: CommandBusState;
  dirty: boolean;
}

type BottomTab = "problems" | "database" | "trace";

/**
 * Self-contained Explore editor shell for M2.
 * All document mutations go through the command bus.
 */
export function ExploreWorkspace({
  initial,
  knownSceneIds,
  sceneCatalog,
  persist,
  packApi,
}: ExploreWorkspaceProps) {
  const [state, setState] = useState<WorkspaceState>(() => ({
    doc: initial,
    bus: emptyBus(),
    dirty: false,
  }));
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [bottomTab, setBottomTab] = useState<BottomTab>("problems");
  /** Multi-scene pack gate problems (L4); cleared when doc changes. */
  const [packScanProblems, setPackScanProblems] = useState<ExploreProblem[] | null>(null);
  const [bgAssetOptions, setBgAssetOptions] = useState<string[]>([]);
  const [knownAssets, setKnownAssets] = useState<Set<string> | undefined>(undefined);
  const [localCatalog, setLocalCatalog] = useState<SceneCatalogEntry[]>(
    () => sceneCatalog ?? [],
  );
  const [creatingScene, setCreatingScene] = useState(false);
  const [newSceneIdDraft, setNewSceneIdDraft] = useState("room_2");
  const [createSceneError, setCreateSceneError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { doc, bus, dirty } = state;
  const stateRef = useRef(state);
  stateRef.current = state;
  const docGen = useRef(0);
  const exploreDirtyRef = useRef(dirty);
  exploreDirtyRef.current = dirty;
  const commitWs = useCallback((next: WorkspaceState, bump: boolean) => {
    if (bump) docGen.current += 1;
    stateRef.current = next;
    exploreDirtyRef.current = next.dirty;
    setState(next);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    function onDown(event: MouseEvent) {
      const el = event.target as Element | null;
      if (el?.closest?.('[data-testid="explore-topbar-more"]')) return;
      setMoreOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  useEffect(() => {
    if (sceneCatalog && sceneCatalog.length > 0) {
      setLocalCatalog(sceneCatalog);
    }
  }, [sceneCatalog]);

  const refreshCatalog = useCallback(async () => {
    if (!persist) return;
    try {
      const next = await loadSceneCatalog(persist);
      if (next.length > 0) {
        setLocalCatalog(next);
      }
    } catch {
      // keep prior catalog on transient host errors
    }
  }, [persist]);

  useEffect(() => {
    if (!persist) return;
    const onFocus = () => {
      void refreshCatalog();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshCatalog();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persist, refreshCatalog]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const assets = await getJson<AssetMeta[]>("/api/assets");
        if (cancelled) return;
        const lists = assetLists(assets);
        setBgAssetOptions(lists.bg);
        setKnownAssets(lists.known);
      } catch {
        // Host without /api/assets — text field still works; skip knownAssets checks.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!shouldWarnUnload(dirty)) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const applyCmd = useCallback((cmd: Command) => {
    const s = stateRef.current;
    const r = dispatch(s.bus, s.doc, cmd);
    if (r.skipped) {
      // ui-only / no content change — still adopt next doc if apply touched ui
      commitWs({ ...s, doc: r.doc }, false);
      return;
    }
    commitWs({ doc: r.doc, bus: r.bus, dirty: true }, true);
  }, [commitWs]);

  const doUndo = useCallback(() => {
    const s = stateRef.current;
    const r = undo(s.bus, s.doc);
    if (!r) return;
    commitWs({ doc: r.doc, bus: r.bus, dirty: true }, true);
  }, [commitWs]);

  const doRedo = useCallback(() => {
    const s = stateRef.current;
    const r = redo(s.bus, s.doc);
    if (!r) return;
    commitWs({ doc: r.doc, bus: r.bus, dirty: true }, true);
  }, [commitWs]);

  const setUi = useCallback((patch: Partial<ExploreDoc["ui"]>) => {
    const s = stateRef.current;
    commitWs({ ...s, doc: patchUi(s.doc, patch) }, false);
  }, [commitWs]);

  /** Canvas / hierarchy / matrix row: pick hotspot; rebind cell `on` if any. */
  const selectHotspot = useCallback(
    (id: string | null) => {
      const s = stateRef.current;
      commitWs(
        { ...s, doc: patchUi(s.doc, selectionAfterHotspotPick(s.doc.ui, id)) },
        false,
      );
    },
    [commitWs],
  );

  const handleCanvasContextAction = useCallback(
    (action: CtxMenuActionId, target: CtxMenuTarget) => {
      const res = state.doc.project.resolution;
      if (action === "addRect" && target.kind === "blank") {
        const rect = rectCenteredAt(target.stageX, target.stageY, undefined, res);
        applyCmd(addHotspot({ shape: { type: "rect", ...rect } }));
        return;
      }
      if (action === "addPolygon" && target.kind === "blank") {
        const points = defaultQuadAround(target.stageX, target.stageY, undefined, res);
        applyCmd(
          addHotspot({
            name: "多邊形",
            shape: { type: "polygon", points },
          }),
        );
        return;
      }
      if (action === "toPolygon" && target.kind === "rect") {
        applyCmd(convertHotspotToPolygon(target.hotspotId));
        selectHotspot(target.hotspotId);
        return;
      }
      if (action === "toRect" && target.kind === "polygon") {
        applyCmd(convertHotspotToRect(target.hotspotId));
        selectHotspot(target.hotspotId);
        return;
      }
      if (action === "delete" && (target.kind === "rect" || target.kind === "polygon")) {
        const id = target.hotspotId;
        const impact = countHotspotDeleteImpact(state.doc, id);
        if (!defaultConfirmFn(confirmDeleteHotspotMessage(id, impact))) return;
        applyCmd(removeHotspot(id));
      }
    },
    [applyCmd, selectHotspot, state.doc],
  );

  const effectiveCatalog = useMemo(() => {
    if (localCatalog.length > 0) {
      const byId = new Map(localCatalog.map((e) => [e.id, e]));
      if (!byId.has(doc.scene.id)) {
        byId.set(doc.scene.id, {
          id: doc.scene.id,
          kind: "explore",
          title: doc.scene.title,
        });
      }
      return [...byId.values()];
    }
    if (knownSceneIds && knownSceneIds.size > 0) {
      return [...knownSceneIds].map(
        (id): SceneCatalogEntry => ({ id, kind: "explore" }),
      );
    }
    return [{ id: doc.scene.id, kind: "explore" as const, title: doc.scene.title }];
  }, [localCatalog, knownSceneIds, doc.scene.id, doc.scene.title]);

  const doSave = useCallback(async () => {
    if (!persist) {
      setSaveStatus("未接 persist");
      return;
    }
    const errs = collectExploreProblems(state.doc, {
      sceneCatalog: effectiveCatalog,
      knownSceneIds,
    }).filter((p) => p.severity === "error");
    if (errs.length > 0) {
      setSaveStatus(`無法儲存：${errs.length} 個錯誤（見 Problems）`);
      setBottomTab("problems");
      return;
    }
    setSaveStatus("儲存中…");
    const requestRev = docGen.current;
    try {
      const saved = await saveExploreDoc(persist, stateRef.current.doc);
      const current = stateRef.current;
      const nextDoc = {
        ...current.doc,
        project: saved.project,
        scene: saved.scene,
        _rawProject: saved._rawProject,
        _rawScene: saved._rawScene,
      };
      const merged = mergeSaveResponse({
        requestRev,
        currentRev: docGen.current,
        saved: nextDoc,
        current: current.doc,
      });
      if (!merged.clearDirty) {
        setSaveStatus("仍有未儲存修改");
        return;
      }
      commitWs({ ...current, dirty: false, doc: merged.value }, false);
      setSaveStatus("已儲存");
      void refreshCatalog();
    } catch (e) {
      setSaveStatus(`錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [persist, state.doc, effectiveCatalog, knownSceneIds, refreshCatalog, commitWs]);

  const exploreSaveRef = useRef(doSave);
  exploreSaveRef.current = doSave;
  useEffect(() => {
    return registerShellSession({
      getDirty: () => exploreDirtyRef.current,
      save: () => exploreSaveRef.current(),
    });
  }, []);

  const doReload = useCallback(async () => {
    if (!persist) {
      setSaveStatus("未接 persist");
      return;
    }
    const discardedBeforeLoad = exploreDirtyRef.current;
    if (!confirmDiscardIfDirty(discardedBeforeLoad)) {
      setSaveStatus("已取消重載");
      return;
    }
    const seenGen = docGen.current;
    const sceneId = stateRef.current.doc.scene.id;
    setSaveStatus("重載中…");
    try {
      const next = await loadExploreDoc(persist, sceneId);
      if (
        exploreLoadRaced({
          seenGen,
          docGen: docGen.current,
          dirty: exploreDirtyRef.current,
          discardedBeforeLoad,
        })
      ) {
        setSaveStatus("已取消重載：載入期間有新編輯");
        return;
      }
      commitWs({ doc: next, bus: emptyBus(), dirty: false }, true);
      setSaveStatus("已重載");
    } catch (e) {
      setSaveStatus(`錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [persist, dirty, commitWs]);

  const doSwitchScene = useCallback(
    async (sceneId: string) => {
      if (!sceneId || sceneId === state.doc.scene.id) return;
      if (dirty || exploreDirtyRef.current) {
        setSaveStatus("請先存檔再切換場景");
        return;
      }
      if (!persist) {
        setSaveStatus("未接 persist，無法切換場景");
        return;
      }
      const seenGen = docGen.current;
      setSaveStatus("切換中…");
      try {
        const next = await loadExploreDoc(persist, sceneId);
        if (
          exploreLoadRaced({
            seenGen,
            docGen: docGen.current,
            dirty: exploreDirtyRef.current,
            discardedBeforeLoad: false,
          })
        ) {
          setSaveStatus("已取消切換：載入期間有新編輯");
          return;
        }
        commitWs({ doc: next, bus: emptyBus(), dirty: false }, true);
        setSaveStatus(`已切換：${sceneId}`);
        void refreshCatalog();
      } catch (e) {
        setSaveStatus(
          `無法切換「${sceneId}」：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [persist, state.doc.scene.id, dirty, refreshCatalog, commitWs],
  );

  const deleteSelectedHotspot = useCallback(() => {
    const id = doc.ui.selectedHotspotId;
    if (!id) return;
    const impact = countHotspotDeleteImpact(doc, id);
    if (!defaultConfirmFn(confirmDeleteHotspotMessage(id, impact))) return;
    applyCmd(removeHotspot(id));
  }, [doc, applyCmd]);

  const nudgeSelectedHotspot = useCallback(
    (dx: number, dy: number) => {
      const id = doc.ui.selectedHotspotId;
      if (!id) return;
      const hs = doc.scene.hotspots.find((h) => h.id === id);
      if (!hs) return;
      const bounds = doc.project.resolution;
      const coalesceKey = `explore.nudge:${id}`;
      if (isRect(hs.shape)) {
        const next = nudgeRect(hs.shape, dx, dy, bounds);
        applyCmd(setHotspotRect(id, next, coalesceKey));
        return;
      }
      if (isPolygon(hs.shape)) {
        const next = nudgePolygonPoints(hs.shape.points, dx, dy, bounds);
        applyCmd(setHotspotPolygonPoints(id, next, coalesceKey));
      }
    },
    [doc, applyCmd],
  );

  const copySelected = useCallback(() => {
    const cell = doc.ui.selectedCell;
    if (!cell) return;
    const rules = getInteractionRules(doc, cell.hotspotId, cell.on);
    setUi({ clipboardRules: rules });
  }, [doc, setUi]);

  const pasteSelected = useCallback(() => {
    const cell = doc.ui.selectedCell;
    if (!cell || !doc.ui.clipboardRules) return;
    applyCmd(pasteInteraction(cell.hotspotId, cell.on));
  }, [doc, applyCmd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inEditableField = !!(
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      );

      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const action = exploreModShortcut(e.key, {
          inEditableField,
          hasPersist: !!persist,
          shiftKey: e.shiftKey,
        });
        if (!action) return;
        if (action === "save") {
          e.preventDefault();
          void doSave();
          return;
        }
        if (action === "copy") {
          if (doc.ui.selectedCell) {
            e.preventDefault();
            copySelected();
          }
          return;
        }
        if (action === "paste") {
          if (doc.ui.selectedCell && doc.ui.clipboardRules) {
            e.preventDefault();
            pasteSelected();
          }
          return;
        }
        if (action === "undo") {
          e.preventDefault();
          doUndo();
          return;
        }
        if (action === "redo") {
          e.preventDefault();
          doRedo();
        }
        return;
      }

      // Canvas Delete / Arrow nudge (no mod). Vertex Delete uses capture in ExploreCanvas.
      if (e.defaultPrevented) return;
      const canvasAction = exploreCanvasKeyAction(e.key, {
        inEditableField,
        hasHotspotSelection: !!doc.ui.selectedHotspotId,
        shiftKey: e.shiftKey,
      });
      if (!canvasAction) return;
      e.preventDefault();
      if (canvasAction.type === "delete") {
        deleteSelectedHotspot();
        return;
      }
      nudgeSelectedHotspot(canvasAction.dx, canvasAction.dy);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    copySelected,
    pasteSelected,
    doUndo,
    doRedo,
    doSave,
    persist,
    doc.ui,
    deleteSelectedHotspot,
    nudgeSelectedHotspot,
  ]);

  const openCreateSceneForm = useCallback(() => {
    setCreatingScene(true);
    setNewSceneIdDraft("room_2");
    setCreateSceneError(null);
  }, []);

  const cancelCreateScene = useCallback(() => {
    setCreatingScene(false);
    setCreateSceneError(null);
  }, []);

  const doCreateScene = useCallback(async () => {
    if (!persist) {
      setCreateSceneError("未接 persist");
      setSaveStatus("未接 persist");
      return;
    }
    const existing = effectiveCatalog.map((c) => c.id);
    const err = exploreNewSceneIdError(newSceneIdDraft, existing);
    if (err) {
      setCreateSceneError(err);
      setSaveStatus(err);
      return;
    }
    const id = parseNewExploreSceneId(newSceneIdDraft, existing)!;
    if (dirty) {
      setCreateSceneError("請先存檔再建新場景");
      setSaveStatus("請先存檔再建新場景");
      return;
    }
    const blank = blankExploreDoc(id);
    const nextDoc: ExploreDoc = {
      ...blank,
      project: structuredClone(state.doc.project),
      _rawProject: state.doc._rawProject,
      scene: { ...blank.scene, title: id },
    };
    setSaveStatus("建立中…");
    setCreateSceneError(null);
    try {
      const saved = await saveExploreDoc(persist, nextDoc);
      const loaded: ExploreDoc = {
        ...nextDoc,
        project: saved.project,
        scene: saved.scene,
        _rawProject: saved._rawProject,
        _rawScene: saved._rawScene,
        ui: blank.ui,
      };
      setLocalCatalog((prev) => {
        if (prev.some((c) => c.id === id)) return prev;
        return [...prev, { id, kind: "explore", title: loaded.scene.title }];
      });
      commitWs({ doc: loaded, bus: emptyBus(), dirty: false }, true);
      setCreatingScene(false);
      setSaveStatus(`已建立並切換：${id}`);
      void refreshCatalog();
    } catch (e) {
      const msg = `建立失敗：${e instanceof Error ? e.message : String(e)}`;
      setCreateSceneError(msg);
      setSaveStatus(msg);
    }
  }, [
    persist,
    dirty,
    state.doc.project,
    state.doc._rawProject,
    effectiveCatalog,
    newSceneIdDraft,
    refreshCatalog,
    commitWs,
  ]);

  const resolvedPackApi = useMemo(
    () => (packApi === null ? null : packApi ?? createHttpPackApi()),
    [packApi],
  );

  const doPack = useCallback(async () => {
    if (!resolvedPackApi) {
      setSaveStatus("未接出包 API（需要 host /api/pack）");
      return;
    }
    // L4: Problems on all explore scenes in catalog (current in-memory + siblings from disk)
    setSaveStatus("出包前檢查全部場景…");
    let scenesToCheck = [state.doc.scene];
    if (persist) {
      try {
        scenesToCheck = await loadSiblingExploreScenes(
          persist,
          effectiveCatalog,
          state.doc,
        );
      } catch (e) {
        setSaveStatus(
          `無法載入場景做檢查：${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }
    }
    const groups = collectExploreProblemsForScenes(
      state.doc.project,
      scenesToCheck,
      {
        sceneCatalog: effectiveCatalog,
        knownSceneIds,
      },
    );
    const errCount = countErrorProblemsInGroups(groups);
    if (errCount > 0) {
      setPackScanProblems(flattenSceneProblemGroups(groups));
      const report = formatPackProblemReport(groups);
      setSaveStatus(`無法出包：${report || `${errCount} 個錯誤`}`);
      setBottomTab("problems");
      return;
    }
    setPackScanProblems(null);

    if (stateRef.current.dirty) {
      if (!persist) {
        setSaveStatus("請先存檔再出包（未接 persist）");
        return;
      }
      setSaveStatus("存檔後出包…");
      const requestRev = docGen.current;
      try {
        const saved = await saveExploreDoc(persist, stateRef.current.doc);
        const current = stateRef.current;
        const nextDoc = {
          ...current.doc,
          project: saved.project,
          scene: saved.scene,
          _rawProject: saved._rawProject,
          _rawScene: saved._rawScene,
        };
        const merged = mergeSaveResponse({
          requestRev,
          currentRev: docGen.current,
          saved: nextDoc,
          current: current.doc,
        });
        if (!merged.clearDirty) {
          setSaveStatus("仍有未儲存修改，未出包");
          return;
        }
        commitWs({ ...current, dirty: false, doc: merged.value }, false);
      } catch (e) {
        setSaveStatus(`存檔失敗，未出包：${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    setSaveStatus("出包中…");
    try {
      const result = await resolvedPackApi.pack({});
      const warn = result.warnings?.length ?? 0;
      setSaveStatus(
        warn > 0
          ? `${formatExplorePackStatus(result)}：${result.warnings!.slice(0, 2).join("；")}`
          : formatExplorePackStatus(result),
      );
    } catch (e) {
      setSaveStatus(`出包失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [
    resolvedPackApi,
    dirty,
    persist,
    state.doc,
    effectiveCatalog,
    knownSceneIds,
    commitWs,
  ]);

  const problems = useMemo(
    () =>
      collectExploreProblems(doc, {
        sceneCatalog: effectiveCatalog,
        knownSceneIds,
        knownAssets,
      }),
    [doc, effectiveCatalog, knownSceneIds, knownAssets],
  );

  useEffect(() => {
    setPackScanProblems(null);
  }, [doc]);
  const problemHs = useMemo(() => buildProblemHotspotIds(problems), [problems]);
  const problemKeys = useMemo(() => buildProblemMatrixKeys(problems), [problems]);

  const navigateProblem = useCallback(
    (p: ExploreProblem) => {
      const target = problemNavTarget(p);
      if (target.kind === "cell") {
        setUi(selectionAfterCellPick(target.hotspotId, target.on));
      } else if (target.kind === "hotspot") {
        selectHotspot(target.hotspotId);
      } else if (target.kind === "onEnter") {
        const el = document.querySelector('[data-testid="on-enter-inspector"]');
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else if (target.kind === "onEmptyClick") {
        const el = document.querySelector('[data-testid="on-empty-click-inspector"]');
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    },
    [setUi, selectHotspot],
  );

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warnCount = problems.filter((p) => p.severity === "warn").length;

  const traceResolution = useMemo(() => {
    const cell = doc.ui.selectedCell;
    if (!cell) return null;
    return resolveTrace(doc, cell.hotspotId, cell.on);
  }, [doc]);

  const selectedHotspot = doc.ui.selectedHotspotId
    ? doc.scene.hotspots.find((h) => h.id === doc.ui.selectedHotspotId)
    : undefined;

  const undoLabel = bus.past.length ? bus.past[bus.past.length - 1]!.label : "";
  const redoLabel = bus.future.length ? bus.future[bus.future.length - 1]!.label : "";

  return (
    <div className="explore-workspace" data-testid="explore-workspace">
      {/* 頂欄：chrome 分組 + 畫布工具列 */}
      <div className="explore-topbar" data-testid="explore-topbar">
        <div className="explore-topbar-chrome">
          <div className="explore-topbar-group explore-brand">
            <span
              className="explore-dirty"
              data-testid="explore-dirty"
              data-dirty={dirty ? "1" : "0"}
            >
              {dirty ? "未儲存 *" : "已同步"}
            </span>
            <span title={doc.scene.id}>探險 · {doc.scene.id}</span>
          </div>

          <span className="explore-topbar-sep" aria-hidden="true" />

          <div className="explore-topbar-group" data-testid="explore-topbar-edit">
            <button
              type="button"
              className="explore-btn"
              data-testid="undo"
              title={undoLabel ? `復原：${undoLabel}` : "復原"}
              disabled={!canUndo(bus)}
              onClick={doUndo}
            >
              復原
            </button>
            <button
              type="button"
              className="explore-btn"
              data-testid="redo"
              title={redoLabel ? `重做：${redoLabel}` : "重做"}
              disabled={!canRedo(bus)}
              onClick={doRedo}
            >
              重做
            </button>
          </div>

          <span className="explore-topbar-sep" aria-hidden="true" />

          <div className="explore-topbar-group" data-testid="explore-topbar-scene">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              場景
              <select
                data-testid="scene-switch"
                value={doc.scene.id}
                onChange={(e) => {
                  const id = e.target.value;
                  const entry = effectiveCatalog.find((s) => s.id === id);
                  if (entry?.kind === "dialogue") {
                    if (dirty || exploreDirtyRef.current) {
                      setSaveStatus("請先存檔再切換場景");
                      e.target.value = doc.scene.id;
                      return;
                    }
                    navigateToDialogueEditor({ sceneId: id });
                    return;
                  }
                  void doSwitchScene(id);
                }}
                title="切換場景（請先存檔）"
              >
                {effectiveCatalog.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title ? `${s.title} (${s.id})` : s.id}
                    {s.kind === "dialogue" ? " ·對話（請用對話編輯器）" : ""}
                  </option>
                ))}
                {!effectiveCatalog.some((s) => s.id === doc.scene.id) ? (
                  <option value={doc.scene.id}>{doc.scene.id}</option>
                ) : null}
              </select>
            </label>
            {creatingScene ? (
              <span
                data-testid="scene-create-form"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}
              >
                <input
                  data-testid="scene-create-id"
                  type="text"
                  value={newSceneIdDraft}
                  placeholder="新場景 ID"
                  title="僅可含英數、底線與連字號"
                  onChange={(e) => {
                    setNewSceneIdDraft(e.target.value);
                    setCreateSceneError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void doCreateScene();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelCreateScene();
                    }
                  }}
                  style={{ width: 120, fontSize: 12 }}
                  autoFocus
                />
                <button
                  type="button"
                  className="explore-btn"
                  data-testid="scene-create-confirm"
                  onClick={() => void doCreateScene()}
                  disabled={!persist}
                >
                  建立
                </button>
                <button
                  type="button"
                  className="explore-btn"
                  data-testid="scene-create-cancel"
                  onClick={cancelCreateScene}
                >
                  取消
                </button>
                {createSceneError ? (
                  <span data-testid="scene-create-error" style={{ fontSize: 12, color: "#f88" }}>
                    {createSceneError}
                  </span>
                ) : null}
              </span>
            ) : (
              <button
                type="button"
                className="explore-btn"
                data-testid="scene-create"
                onClick={openCreateSceneForm}
                disabled={!persist}
                title={persist ? "新建空白探險場景" : "未接 persist"}
              >
                ＋場景
              </button>
            )}
          </div>

          <span className="explore-topbar-sep" aria-hidden="true" />

          <div className="explore-topbar-group" data-testid="explore-topbar-file">
            {persist ? (
              <>
                <button
                  type="button"
                  className={`explore-btn${dirty ? " explore-btn-primary" : ""}`}
                  data-testid="explore-save"
                  onClick={() => void doSave()}
                >
                  存檔{dirty ? " *" : ""}
                </button>
                <button
                  type="button"
                  className="explore-btn"
                  data-testid="explore-reload"
                  onClick={() => void doReload()}
                >
                  重載
                </button>
                <span className="explore-save-status" data-testid="explore-save-status">
                  {saveStatus}
                </span>
              </>
            ) : (
              <button
                type="button"
                className="explore-btn"
                data-testid="explore-save"
                disabled
                title="未接 persist"
              >
                存檔
              </button>
            )}
          </div>

          <span className="explore-topbar-sep" aria-hidden="true" />

          <div className="explore-topbar-group explore-menu" data-testid="explore-topbar-more">
            <button
              type="button"
              className="explore-btn"
              data-testid="explore-more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              更多 ▾
            </button>
            {moreOpen ? (
              <div className="explore-menu-pop" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="explore-pack"
                  onClick={() => {
                    setMoreOpen(false);
                    void doPack();
                  }}
                  disabled={resolvedPackApi === null}
                  title={
                    resolvedPackApi === null
                      ? "未接出包 API"
                      : "呼叫 host POST /api/pack（預設 export/game）"
                  }
                >
                  出包
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="play-placeholder"
                  disabled
                  title="需要 SDL／galeng-player（本環境可缺）"
                >
                  ▶ 播放
                </button>
              </div>
            ) : null}
          </div>

          <div className="explore-topbar-spacer" />

          <div className="explore-topbar-group" data-testid="explore-topbar-shell">
            <button
              type="button"
              className="explore-btn"
              data-testid="open-dialogue-editor"
              title="開啟對話編輯器（離開 #explore）"
              onClick={() => navigateToDialogueEditor()}
            >
              對話
            </button>
            <ExploreSettingsButton onClick={() => setSettingsOpen(true)} />
          </div>
        </div>

        <div className="explore-topbar-tools" data-testid="explore-topbar-tools">
          <button
            type="button"
            className="explore-btn"
            data-testid="tool-select"
            data-active={doc.ui.canvasTool === "select" ? "1" : "0"}
            aria-pressed={doc.ui.canvasTool === "select"}
            title="選取／移動／調整熱區"
            onClick={() => setUi({ canvasTool: "select" })}
          >
            選取
          </button>
          <button
            type="button"
            className="explore-btn"
            data-testid="tool-draw"
            data-active={doc.ui.canvasTool === "drawRect" ? "1" : "0"}
            aria-pressed={doc.ui.canvasTool === "drawRect"}
            title="繪製矩形熱區（Shift 維持連續繪製）"
            onClick={() => setUi({ canvasTool: "drawRect" })}
          >
            畫熱區
          </button>
          <button
            type="button"
            className="explore-btn"
            data-testid="tool-draw-polygon"
            data-active={doc.ui.canvasTool === "drawPolygon" ? "1" : "0"}
            aria-pressed={doc.ui.canvasTool === "drawPolygon"}
            title="逐點繪製多邊形熱區（雙擊或 Enter 完成；Esc 取消；右鍵撤銷上一點）"
            onClick={() => {
              setUi({ canvasTool: "drawPolygon", selectedHotspotId: null, selectedCell: null });
            }}
          >
            畫多邊形
          </button>
          <button
            type="button"
            className="explore-btn"
            data-testid="add-hotspot"
            onClick={() => applyCmd(addHotspot())}
          >
            ＋熱區
          </button>
          {doc.ui.selectedHotspotId ? (
            <button
              type="button"
              className="explore-btn"
              data-testid="remove-hotspot"
              onClick={() => deleteSelectedHotspot()}
            >
              刪熱區
            </button>
          ) : null}
          <button
            type="button"
            className="explore-btn"
            data-testid="matrix-copy"
            disabled={!doc.ui.selectedCell}
            onClick={copySelected}
          >
            複製格
          </button>
          <button
            type="button"
            className="explore-btn"
            data-testid="matrix-paste"
            disabled={!doc.ui.selectedCell || !doc.ui.clipboardRules}
            onClick={pasteSelected}
          >
            貼上格
          </button>
        </div>
      </div>

      <ExploreSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(project) => {
          const s = stateRef.current;
          commitWs({ ...s, doc: adoptSavedProjectRaw(s.doc, project) }, true);
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr 300px",
          gap: 12,
          minHeight: 420,
        }}
      >
        <HierarchyPanel
          doc={doc}
          sceneCatalog={effectiveCatalog}
          bgAssetOptions={bgAssetOptions}
          onSelectHotspot={selectHotspot}
          onUpdateScene={(patch, coalesceKey) =>
            applyCmd(updateScene(patch, coalesceKey))
          }
          onUpdateProject={(patch, coalesceKey) =>
            applyCmd(updateProject(patch, coalesceKey))
          }
        />

        <div>
          <ExploreCanvas
            doc={doc}
            onSelectHotspot={selectHotspot}
            onCommitRect={(id, rect) => applyCmd(setHotspotRect(id, rect))}
            onCommitPolygonPoints={(id, points) =>
              applyCmd(setHotspotPolygonPoints(id, points))
            }
            onCreateRect={(rect: Rect, opts) => {
              applyCmd(addHotspot({ shape: { type: "rect", ...rect } }));
              if (!opts?.keepDrawTool) setUi({ canvasTool: "select" });
            }}
            onCreatePolygon={(points, opts) => {
              applyCmd(
                addHotspot({
                  name: "多邊形",
                  shape: { type: "polygon", points },
                }),
              );
              if (!opts?.keepDrawTool) setUi({ canvasTool: "select" });
            }}
            onCancelPolygonDraw={() => setUi({ canvasTool: "select" })}
            onContextAction={handleCanvasContextAction}
          />
          <div style={{ marginTop: 8 }}>
            <VerbMatrix
              doc={doc}
              onSelectCell={(hotspotId, on) => setUi(selectionAfterCellPick(hotspotId, on))}
              onSelectHotspot={(hotspotId) => selectHotspot(hotspotId)}
              problemHotspotIds={problemHs}
              problemKeys={problemKeys}
            />
          </div>
        </div>

        <div data-testid="inspector-column">
          <h4 style={{ margin: "0 0 8px" }}>屬性</h4>
          {!selectedHotspot && !doc.ui.selectedCell ? (
            <div style={{ fontSize: 12, opacity: 0.6 }} data-testid="inspector-empty">
              請選擇熱區或矩陣格
            </div>
          ) : null}
          {selectedHotspot ? (
            <div data-testid="inspector-hotspot-section">
              <HotspotInspector
                doc={doc}
                hotspot={selectedHotspot}
                onUpdate={(patch, coalesceKey) =>
                  applyCmd(updateHotspot(selectedHotspot.id, patch, coalesceKey))
                }
              />
            </div>
          ) : null}
          {doc.ui.selectedCell ? (
            <div
              data-testid="inspector-cell-section"
              style={
                selectedHotspot
                  ? {
                      marginTop: 12,
                      paddingTop: 8,
                      borderTop: "1px solid #333",
                    }
                  : undefined
              }
            >
              <CellInspector
                doc={doc}
                sceneCatalog={effectiveCatalog}
                onChangeRules={(rules: InteractionRule[], coalesceKey?: string) =>
                  applyCmd(
                    setInteraction(
                      doc.ui.selectedCell!.hotspotId,
                      doc.ui.selectedCell!.on,
                      rules,
                      coalesceKey,
                    ),
                  )
                }
              />
            </div>
          ) : null}
          <div
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: "1px solid #333",
            }}
          >
            <OnEnterInspector
              doc={doc}
              sceneCatalog={effectiveCatalog}
              onChange={(actions, coalesceKey) =>
                applyCmd(setOnEnter(actions, coalesceKey))
              }
            />
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: "1px solid #333",
            }}
          >
            <OnEmptyClickInspector
              doc={doc}
              sceneCatalog={effectiveCatalog}
              onChange={(actions, coalesceKey) =>
                applyCmd(setOnEmptyClick(actions, coalesceKey))
              }
            />
          </div>
          <div
            data-testid="transition-defaults"
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: "1px solid #333",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>轉場預設</div>
            {(
              [
                ["toDialogue", "呼叫場景至對話"],
                ["fromDialogue", "返回"],
                ["gotoScene", "切換場景"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} style={{ display: "block", marginBottom: 4 }}>
                {label}
                <select
                  data-testid={`trans-default-${key}`}
                  style={{ width: "100%", display: "block" }}
                  value={doc.project.transitionDefaults?.[key] ?? ""}
                  onChange={(e) =>
                    applyCmd(
                      setTransitionDefaults({
                        ...doc.project.transitionDefaults,
                        [key]: e.target.value || undefined,
                      }),
                    )
                  }
                >
                  <option value="">（無）</option>
                  {(doc.project.effectLibrary ?? []).map((ef) => (
                    <option key={ef.id} value={ef.id}>
                      {ef.id}
                    </option>
                  ))}
                  {doc.project.transitionDefaults?.[key] &&
                  !(doc.project.effectLibrary ?? []).some(
                    (ef) => ef.id === doc.project.transitionDefaults?.[key],
                  ) ? (
                    <option value={doc.project.transitionDefaults[key]}>
                      {doc.project.transitionDefaults[key]}（未知）
                    </option>
                  ) : null}
                </select>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #333" }}>
            <PresetBrowser
              onApply={(id) => applyCmd(applyPreset(id, effectiveCatalog))}
              canApply={(p) => {
                if (p.id === "trans.fadeDefaults") return true;
                if (p.id === "hotspot.pickup")
                  return !!(doc.ui.selectedHotspotId || doc.ui.selectedCell);
                if (p.id === "action.callTalk") {
                  return (
                    !!doc.ui.selectedCell &&
                    effectiveCatalog.some((c) => c.kind === "dialogue" && c.hasReturn === true)
                  );
                }
                if (p.id === "action.return") return !!doc.ui.selectedCell;
                return true;
              }}
            />
          </div>
        </div>
      </div>

      {/* 底部 tab：Problems｜資料庫｜Trace */}
      <div style={{ marginTop: 12, borderTop: "1px solid #333", paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <button
            type="button"
            data-testid="tab-problems"
            data-active={bottomTab === "problems" ? "1" : "0"}
            onClick={() => setBottomTab("problems")}
            style={{
              background: bottomTab === "problems" ? "#234" : "transparent",
              border: "1px solid #445",
              color: "inherit",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            問題
            {problems.length ? (
              <span data-testid="problems-badge" style={{ marginLeft: 6, opacity: 0.85 }}>
                {formatProblemsBadge(errorCount, warnCount)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            data-testid="tab-database"
            data-active={bottomTab === "database" ? "1" : "0"}
            onClick={() => setBottomTab("database")}
            style={{
              background: bottomTab === "database" ? "#234" : "transparent",
              border: "1px solid #445",
              color: "inherit",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            資料庫
          </button>
          <button
            type="button"
            data-testid="tab-trace"
            data-active={bottomTab === "trace" ? "1" : "0"}
            onClick={() => setBottomTab("trace")}
            style={{
              background: bottomTab === "trace" ? "#234" : "transparent",
              border: "1px solid #445",
              color: "inherit",
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Trace
            {traceResolution ? (
              <span data-testid="trace-badge" style={{ marginLeft: 6, opacity: 0.85 }}>
                {traceResolution.winningLayer}
              </span>
            ) : null}
          </button>
        </div>
        {bottomTab === "problems" ? (
          <ProblemsPanel problems={packScanProblems ?? problems} onNavigate={navigateProblem} />
        ) : bottomTab === "trace" ? (
          <TracePanel resolution={traceResolution} />
        ) : (
          <DatabaseStub
            doc={doc}
            onAddCharacter={(id, name) =>
              applyCmd(
                addCharacter({
                  id,
                  display: { [doc.project.locale || "zh-Hant"]: name },
                }),
              )
            }
            onAddSwitch={(id, name) => applyCmd(addSwitch({ id, name, init: false }))}
            onAddItem={(id, name) => applyCmd(addItem({ id, name }))}
            onRemoveCharacter={(id) => applyCmd(removeCharacter(id))}
            onRemoveSwitch={(id) => applyCmd(removeSwitch(id))}
            onRemoveItem={(id) => applyCmd(removeItem(id))}
            onUpdateCharacter={(id, name) => {
              const locale = doc.project.locale || "zh-Hant";
              const prev = doc.project.characters.find((c) => c.id === id);
              applyCmd(
                updateCharacter(
                  id,
                  { display: { ...(prev?.display ?? {}), [locale]: name } },
                  `db-char-name:${id}`,
                ),
              );
            }}
            onUpdateSwitch={(id, name) =>
              applyCmd(updateSwitch(id, { name }, `db-sw-name:${id}`))
            }
            onUpdateItem={(id, patch) => {
              const field = "name" in patch ? "name" : "icon" in patch ? "icon" : "consume";
              applyCmd(updateItem(id, patch, `db-item:${id}:${field}`));
            }}
          />
        )}
      </div>
    </div>
  );
}

export type { InteractionOn };
