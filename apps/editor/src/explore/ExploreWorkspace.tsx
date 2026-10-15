import { useCallback, useEffect, useMemo, useState } from "react";
import type { Rect } from "./canvas";
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
  getInteractionRules,
  pasteInteraction,
  removeCharacter,
  removeHotspot,
  removeItem,
  removeSwitch,
  setHotspotRect,
  setInteraction,
  setOnEnter,
  updateCharacter,
  updateHotspot,
  updateItem,
  updateProject,
  updateScene,
  updateSwitch,
} from "./commands";
import { DatabaseStub } from "./DatabaseStub";
import { ExploreCanvas } from "./ExploreCanvas";
import { HierarchyPanel } from "./HierarchyPanel";
import { CellInspector, HotspotInspector, OnEnterInspector } from "./InspectorPanels";
import {
  loadExploreDoc,
  loadSiblingExploreScenes,
  saveExploreDoc,
  type ExplorePersistApi,
} from "./persist";
import { loadSceneCatalog } from "./sceneCatalog";
import { exploreNewSceneIdError, parseNewExploreSceneId } from "./sceneId";
import { navigateToDialogueEditor } from "../editorRoute";
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
  const { doc, bus, dirty } = state;

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
    setState((s) => {
      const r = dispatch(s.bus, s.doc, cmd);
      if (r.skipped) {
        // ui-only / no content change — still adopt next doc if apply touched ui
        return { ...s, doc: r.doc };
      }
      return { doc: r.doc, bus: r.bus, dirty: true };
    });
  }, []);

  const doUndo = useCallback(() => {
    setState((s) => {
      const r = undo(s.bus, s.doc);
      if (!r) return s;
      return { doc: r.doc, bus: r.bus, dirty: true };
    });
  }, []);

  const doRedo = useCallback(() => {
    setState((s) => {
      const r = redo(s.bus, s.doc);
      if (!r) return s;
      return { doc: r.doc, bus: r.bus, dirty: true };
    });
  }, []);

  const setUi = useCallback((patch: Partial<ExploreDoc["ui"]>) => {
    setState((s) => ({ ...s, doc: patchUi(s.doc, patch) }));
  }, []);

  /** Canvas / hierarchy / matrix row: pick hotspot; rebind cell `on` if any. */
  const selectHotspot = useCallback(
    (id: string | null) => {
      setState((s) => ({
        ...s,
        doc: patchUi(s.doc, selectionAfterHotspotPick(s.doc.ui, id)),
      }));
    },
    [],
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
    try {
      const saved = await saveExploreDoc(persist, state.doc);
      setState((s) => ({
        ...s,
        dirty: false,
        doc: {
          ...s.doc,
          project: saved.project,
          scene: saved.scene,
          _rawProject: saved._rawProject,
          _rawScene: saved._rawScene,
        },
      }));
      setSaveStatus("已儲存");
      void refreshCatalog();
    } catch (e) {
      setSaveStatus(`錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [persist, state.doc, effectiveCatalog, knownSceneIds, refreshCatalog]);

  const doReload = useCallback(async () => {
    if (!persist) {
      setSaveStatus("未接 persist");
      return;
    }
    if (!confirmDiscardIfDirty(dirty)) {
      setSaveStatus("已取消重載");
      return;
    }
    setSaveStatus("重載中…");
    try {
      const next = await loadExploreDoc(persist, state.doc.scene.id);
      setState({ doc: next, bus: emptyBus(), dirty: false });
      setSaveStatus("已重載");
    } catch (e) {
      setSaveStatus(`錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [persist, state.doc.scene.id, dirty]);

  const doSwitchScene = useCallback(
    async (sceneId: string) => {
      if (!sceneId || sceneId === state.doc.scene.id) return;
      if (dirty) {
        setSaveStatus("請先存檔再切換場景");
        return;
      }
      if (!persist) {
        setSaveStatus("未接 persist，無法切換場景");
        return;
      }
      setSaveStatus("切換中…");
      try {
        const next = await loadExploreDoc(persist, sceneId);
        setState({ doc: next, bus: emptyBus(), dirty: false });
        setSaveStatus(`已切換：${sceneId}`);
        void refreshCatalog();
      } catch (e) {
        setSaveStatus(
          `無法切換「${sceneId}」：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [persist, state.doc.scene.id, dirty, refreshCatalog],
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
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const t = e.target as HTMLElement | null;
      const inEditableField = !!(
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      );
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelected, pasteSelected, doUndo, doRedo, doSave, persist, doc.ui]);

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
      setState({ doc: loaded, bus: emptyBus(), dirty: false });
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

    if (dirty) {
      if (!persist) {
        setSaveStatus("請先存檔再出包（未接 persist）");
        return;
      }
      setSaveStatus("存檔後出包…");
      try {
        const saved = await saveExploreDoc(persist, state.doc);
        setState((s) => ({
          ...s,
          dirty: false,
          doc: {
            ...s.doc,
            project: saved.project,
            scene: saved.scene,
            _rawProject: saved._rawProject,
            _rawScene: saved._rawScene,
          },
        }));
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
      {/* 頂欄：dirty／存檔／Undo */}
      <div
        data-testid="explore-topbar"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 8,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "6px 8px",
          background: "#1a1e28",
          border: "1px solid #333",
          borderRadius: 6,
        }}
      >
        <span
          data-testid="explore-dirty"
          data-dirty={dirty ? "1" : "0"}
          style={{
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: 4,
            background: dirty ? "#532" : "#243",
            border: `1px solid ${dirty ? "#a64" : "#385"}`,
          }}
        >
          {dirty ? "未儲存 *" : "已同步"}
        </span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          場景
          <select
            data-testid="scene-switch"
            value={doc.scene.id}
            onChange={(e) => void doSwitchScene(e.target.value)}
            title="切換探險場景（請先存檔）"
          >
            {effectiveCatalog.map((s) => (
              <option key={s.id} value={s.id} disabled={s.kind === "dialogue"}>
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
              data-testid="scene-create-confirm"
              onClick={() => void doCreateScene()}
              disabled={!persist}
            >
              建立
            </button>
            <button type="button" data-testid="scene-create-cancel" onClick={cancelCreateScene}>
              取消
            </button>
            {createSceneError ? (
              <span
                data-testid="scene-create-error"
                style={{ fontSize: 12, color: "#f88" }}
              >
                {createSceneError}
              </span>
            ) : null}
          </span>
        ) : (
          <button
            type="button"
            data-testid="scene-create"
            onClick={openCreateSceneForm}
            disabled={!persist}
            title={persist ? "新建空白探險場景" : "未接 persist"}
          >
            ＋場景
          </button>
        )}
        <button
          type="button"
          data-testid="open-dialogue-editor"
          title="開啟對話編輯器（離開 #explore）"
          onClick={() => navigateToDialogueEditor()}
        >
          對話編輯器
        </button>
        <button
          type="button"
          data-testid="undo"
          title={undoLabel ? `復原：${undoLabel}` : "復原"}
          disabled={!canUndo(bus)}
          onClick={doUndo}
        >
          復原
        </button>
        <button
          type="button"
          data-testid="redo"
          title={redoLabel ? `重做：${redoLabel}` : "重做"}
          disabled={!canRedo(bus)}
          onClick={doRedo}
        >
          重做
        </button>
        {persist ? (
          <>
            <button type="button" data-testid="explore-save" onClick={() => void doSave()}>
              存檔{dirty ? " *" : ""}
            </button>
            <button type="button" data-testid="explore-reload" onClick={() => void doReload()}>
              重載
            </button>
            <span data-testid="explore-save-status" style={{ fontSize: 12, opacity: 0.8 }}>
              {saveStatus}
            </span>
          </>
        ) : (
          <button type="button" data-testid="explore-save" disabled title="未接 persist">
            存檔
          </button>
        )}
        <button
          type="button"
          data-testid="explore-pack"
          onClick={() => void doPack()}
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
          data-testid="play-placeholder"
          disabled
          title="需要 SDL／galeng-player（本環境可缺）"
          style={{ opacity: 0.45 }}
        >
          ▶ 播放
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="tool-select"
          data-active={doc.ui.canvasTool === "select" ? "1" : "0"}
          aria-pressed={doc.ui.canvasTool === "select"}
          title="選取／移動／調整熱區"
          onClick={() => setUi({ canvasTool: "select" })}
          style={
            doc.ui.canvasTool === "select"
              ? {
                  background: "#2a4a6a",
                  border: "1px solid #6af",
                  fontWeight: 600,
                }
              : undefined
          }
        >
          選取
        </button>
        <button
          type="button"
          data-testid="tool-draw"
          data-active={doc.ui.canvasTool === "drawRect" ? "1" : "0"}
          aria-pressed={doc.ui.canvasTool === "drawRect"}
          title="繪製矩形熱區（Shift 維持連續繪製）"
          onClick={() => setUi({ canvasTool: "drawRect" })}
          style={
            doc.ui.canvasTool === "drawRect"
              ? {
                  background: "#2a4a6a",
                  border: "1px solid #6af",
                  fontWeight: 600,
                }
              : undefined
          }
        >
          畫熱區
        </button>
        <button type="button" data-testid="add-hotspot" onClick={() => applyCmd(addHotspot())}>
          ＋熱區
        </button>
        {doc.ui.selectedHotspotId ? (
          <button
            type="button"
            data-testid="remove-hotspot"
            onClick={() => {
              const id = doc.ui.selectedHotspotId!;
              const impact = countHotspotDeleteImpact(doc, id);
              if (!defaultConfirmFn(confirmDeleteHotspotMessage(id, impact))) return;
              applyCmd(removeHotspot(id));
            }}
          >
            刪熱區
          </button>
        ) : null}
        <button
          type="button"
          data-testid="matrix-copy"
          disabled={!doc.ui.selectedCell}
          onClick={copySelected}
        >
          複製格
        </button>
        <button
          type="button"
          data-testid="matrix-paste"
          disabled={!doc.ui.selectedCell || !doc.ui.clipboardRules}
          onClick={pasteSelected}
        >
          貼上格
        </button>
      </div>

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
            onCreateRect={(rect: Rect, opts) => {
              applyCmd(addHotspot({ shape: { type: "rect", ...rect } }));
              if (!opts?.keepDrawTool) setUi({ canvasTool: "select" });
            }}
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
