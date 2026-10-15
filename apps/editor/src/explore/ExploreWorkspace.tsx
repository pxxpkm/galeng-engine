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
  saveExploreDoc,
  type ExplorePersistApi,
} from "./persist";
import { ProblemsPanel } from "./ProblemsPanel";
import { TracePanel } from "./TracePanel";
import { resolveTrace } from "./trace";
import { collectExploreProblems } from "./problems";
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
import { VerbMatrix } from "./VerbMatrix";
import { confirmDiscardIfDirty, shouldWarnUnload } from "../dirty";

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
  const [localCatalog, setLocalCatalog] = useState<SceneCatalogEntry[]>(
    () => sceneCatalog ?? [],
  );
  const { doc, bus, dirty } = state;

  useEffect(() => {
    if (sceneCatalog && sceneCatalog.length > 0) {
      setLocalCatalog(sceneCatalog);
    }
  }, [sceneCatalog]);

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

  const selectHotspotOnly = useCallback(
    (id: string | null) => {
      setUi({ selectedHotspotId: id, selectedCell: null });
    },
    [setUi],
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
    } catch (e) {
      setSaveStatus(`錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [persist, state.doc, effectiveCatalog, knownSceneIds]);

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
      } catch (e) {
        setSaveStatus(
          `無法切換「${sceneId}」：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [persist, state.doc.scene.id, dirty],
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
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "c" || e.key === "C") {
        if (doc.ui.selectedCell) {
          e.preventDefault();
          copySelected();
        }
      } else if (e.key === "v" || e.key === "V") {
        if (doc.ui.selectedCell && doc.ui.clipboardRules) {
          e.preventDefault();
          pasteSelected();
        }
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (e.key === "s" || e.key === "S") {
        if (persist) {
          e.preventDefault();
          void doSave();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelected, pasteSelected, doUndo, doRedo, doSave, persist, doc.ui]);

  const doCreateScene = useCallback(async () => {
    if (!persist) {
      setSaveStatus("未接 persist");
      return;
    }
    const raw =
      typeof window !== "undefined"
        ? window.prompt("新探險場景 ID（檔名）", "room_2")
        : null;
    if (raw === null) return;
    const id = raw.trim();
    if (!id) {
      setSaveStatus("場景 ID 不可為空");
      return;
    }
    if (effectiveCatalog.some((c) => c.id === id)) {
      setSaveStatus(`場景「${id}」已存在於目錄`);
      return;
    }
    if (dirty) {
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
      setSaveStatus(`已建立並切換：${id}`);
    } catch (e) {
      setSaveStatus(
        `建立失敗：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [persist, dirty, state.doc.project, state.doc._rawProject, effectiveCatalog]);

  const resolvedPackApi = useMemo(
    () => (packApi === null ? null : packApi ?? createHttpPackApi()),
    [packApi],
  );

  const doPack = useCallback(async () => {
    if (!resolvedPackApi) {
      setSaveStatus("未接出包 API（需要 host /api/pack）");
      return;
    }
    if (dirty) {
      if (!persist) {
        setSaveStatus("請先存檔再出包（未接 persist）");
        return;
      }
      const errs = collectExploreProblems(state.doc, {
        sceneCatalog: effectiveCatalog,
        knownSceneIds,
      }).filter((p) => p.severity === "error");
      if (errs.length > 0) {
        setSaveStatus(`無法出包：${errs.length} 個錯誤（見 Problems）`);
        setBottomTab("problems");
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
      }),
    [doc, effectiveCatalog, knownSceneIds],
  );
  const problemHs = useMemo(
    () => new Set(problems.filter((p) => p.hotspotId).map((p) => p.hotspotId!)),
    [problems],
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
        <button
          type="button"
          data-testid="scene-create"
          onClick={() => void doCreateScene()}
          disabled={!persist}
          title={persist ? "新建空白探險場景" : "未接 persist"}
        >
          ＋場景
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
          onClick={() => setUi({ canvasTool: "select" })}
        >
          選取
        </button>
        <button
          type="button"
          data-testid="tool-draw"
          onClick={() => setUi({ canvasTool: "drawRect" })}
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
            onClick={() => applyCmd(removeHotspot(doc.ui.selectedHotspotId!))}
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
          onSelectHotspot={selectHotspotOnly}
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
            onSelectHotspot={selectHotspotOnly}
            onCommitRect={(id, rect) => applyCmd(setHotspotRect(id, rect))}
            onCreateRect={(rect: Rect) =>
              applyCmd(addHotspot({ shape: { type: "rect", ...rect } }))
            }
          />
          <div style={{ marginTop: 8 }}>
            <VerbMatrix
              doc={doc}
              onSelectCell={(hotspotId, on) =>
                setUi({ selectedCell: { hotspotId, on }, selectedHotspotId: hotspotId })
              }
              problemHotspotIds={problemHs}
            />
          </div>
        </div>

        <div data-testid="inspector-column">
          <h4 style={{ margin: "0 0 8px" }}>屬性</h4>
          {doc.ui.selectedCell ? (
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
          ) : selectedHotspot ? (
            <HotspotInspector
              doc={doc}
              hotspot={selectedHotspot}
              onUpdate={(patch, coalesceKey) =>
                applyCmd(updateHotspot(selectedHotspot.id, patch, coalesceKey))
              }
            />
          ) : (
            <div style={{ fontSize: 12, opacity: 0.6 }} data-testid="inspector-empty">
              選熱區或矩陣格
            </div>
          )}
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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>轉場預設（E1-min）</div>
            {(
              [
                ["toDialogue", "Call→對話"],
                ["fromDialogue", "Return"],
                ["gotoScene", "Goto"],
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
                {errorCount}/{warnCount}
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
          <ProblemsPanel problems={problems} />
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
