import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import en from "../../../../packages/i18n/locales/en.json";
import zhHans from "../../../../packages/i18n/locales/zh-Hans.json";
import zhHant from "../../../../packages/i18n/locales/zh-Hant.json";
import { deleteJson, getJson, postJson, putJson } from "../api";
import {
  adjustIndexAfterMoveBeats,
  applyAssetToMany,
  clearBeatsLabel,
  clearBeatsTrack,
  duplicateBeat,
  ensureBeatIds,
  ensureGalleryItem,
  insertBeatAfter as insertBeatAfterBeats,
  moveBeats,
  normalizeIndices,
  pasteBeatField,
  patchSay,
  rangeIndices,
  removeBeatsAt,
  selectionAfterMoveBeats,
  toggleIndex,
  type PasteField,
  type TrackKey,
} from "../beats";
import { playAudition, stopAudition } from "../audition";
import { backupNeedsOffer, clearBackup, readBackup, writeBackup, type BackupSnap } from "../backup";
import {
  flushThenAllowLeave,
  LEAVE_CANCELLED_MESSAGE,
  sceneLeaveBlocked,
  shouldWarnUnload,
} from "../dirty";
import { registerShellSession } from "../shellGate";
import { parseSceneId } from "../goto";
import { liveIssueContext, sceneLiveIssues } from "../liveIssues";
import type { LiveIssue } from "../liveIssues";
import { canArchiveScene, canDeleteScene, duplicateScene, nextSceneAfterArchive } from "../scene";
import { formatSaveIssues, projectSaveIssues, sceneSaveIssues } from "../saveIssues";
import { emptyHistory, push, redo, undo } from "../history";
import { launchPlay } from "../play";
import { formatPackNote, packWarningsOf, type PackResult } from "../pack";
import { beatStepAudio } from "../previewState";
import { dialogueRouteParams } from "../editorRoute";
import { exportAllScenes, exportScene, type ScriptFile } from "../exportScript";
import { upsertSceneMeta } from "../route";
import { clampBeatIndex, loadScenesForSearch, type SearchHit } from "../search";
import { mergeSaveResponse } from "../saveGeneration";
import type { CiteSite } from "../overview";
import { varNames, type VarSite } from "../vars";
import type { AssetMeta, AssetRootInfo, Beat, Locale, Project, Scene, SceneMeta } from "../types";

const TABLES: Record<Locale, Record<string, string>> = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
};

const LOCALE_KEY = "galeng.locale";
const PACK_OUT_KEY = "galeng.packOut";

/** 04-editor.md: default follows OS locale; stored locally, not in the project. */
function detectLocale(): Locale {
  try {
    const saved = globalThis.localStorage?.getItem(LOCALE_KEY);
    if (saved === "zh-Hant" || saved === "zh-Hans" || saved === "en") {
      return saved;
    }
    const nav = globalThis.navigator?.language ?? "";
    if (/^zh/i.test(nav)) {
      return /hans|cn|sg/i.test(nav) ? "zh-Hans" : "zh-Hant";
    }
  } catch {
    // fall through
  }
  return "en";
}

export interface Toast {
  id: number;
  kind: "error" | "note";
  text: string;
}

export function useEditorState() {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const t = useCallback((key: string) => TABLES[locale][key] ?? key, [locale]);
  const tRef = useRef(t);
  tRef.current = t;

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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exportFiles, setExportFiles] = useState<ScriptFile[] | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [packOut, setPackOut] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(PACK_OUT_KEY) || "export/game";
    } catch {
      return "export/game";
    }
  });
  const [sceneDialog, setSceneDialog] = useState<{
    kind: "new" | "dup";
    onCreated: (id: string) => void;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const [varHints, setVarHints] = useState<string[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [backupOffer, setBackupOffer] = useState<BackupSnap | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"beat" | "exit">("beat");
  const [focusChoice, setFocusChoice] = useState<number | null>(null);
  const pendingBeatRef = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const projectRef = useRef(project);
  const dirtyRef = useRef(dirty);
  const projectDirtyRef = useRef(projectDirty);
  const sceneRev = useRef(0);
  const projectRev = useRef(0);
  sceneRef.current = scene;
  projectRef.current = project;
  dirtyRef.current = dirty;
  projectDirtyRef.current = projectDirty;

  const stillDirty = useCallback(
    () => sceneLeaveBlocked(dirtyRef.current, projectDirtyRef.current),
    [],
  );

  const toastId = useRef(0);
  const beat = scene?.beats[beatIndex];
  const anyDirty = dirty || projectDirty;

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const pushToast = useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = ++toastId.current;
      setToasts((list) => [...list.slice(-3), { id, kind, text }]);
      if (kind === "note") {
        setTimeout(() => dismissToast(id), 6000);
      }
    },
    [dismissToast],
  );

  const fail = useCallback(
    (err: unknown) => {
      pushToast("error", err instanceof Error ? err.message : String(err));
    },
    [pushToast],
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      globalThis.localStorage?.setItem(LOCALE_KEY, next);
    } catch {
      // storage unavailable
    }
  }, []);

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
        anyDirtyRef.current = dirtyRef.current;
        setProject(p);
        setScenes(s);
        setAssets(a);
        setArchived(hidden);
        setAssetRoot(root);
        setSceneId(p.startScene);
      } catch (err) {
        if (!cancelled) {
          pushToast("error", tRef.current("editor.hostDown"));
          console.error(err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  useEffect(() => {
    if (!sceneId || sceneRef.current?.id === sceneId) return;
    let cancelled = false;
    const loadedSceneRev = sceneRev.current;
    const loadedProjectRev = projectRev.current;
    const restoreSelection = () => {
      pendingBeatRef.current = null;
      setSceneId(sceneRef.current?.id ?? null);
    };
    getJson<Scene>(`/api/scenes/${sceneId}`)
      .then((s) => {
        if (cancelled) return;
        if (
          sceneRev.current !== loadedSceneRev ||
          projectRev.current !== loadedProjectRev ||
          dirtyRef.current || projectDirtyRef.current
        ) {
          restoreSelection();
          throw new Error(LEAVE_CANCELLED_MESSAGE);
        }
        const idx = clampBeatIndex(pendingBeatRef.current, s.beats.length);
        pendingBeatRef.current = null;
        sceneRev.current += 1;
        sceneRef.current = s;
        dirtyRef.current = false;
        anyDirtyRef.current = projectDirtyRef.current;
        setScene(s);
        setBeatIndex(idx);
        setSelected([idx]);
        setAnchor(idx);
        setDirty(false);
        setHistory(emptyHistory());
        const backup = readBackup(globalThis.localStorage, s.id);
        if (backupNeedsOffer(s, backup)) {
          setBackupOffer(backup);
        } else if (backup) {
          clearBackup(globalThis.localStorage, s.id);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        restoreSelection();
        fail(err);
      });
    return () => { cancelled = true; };
  }, [sceneId, fail]);



  const commitScene = useCallback(
    (next: Scene, nextBeat = beatIndex, nextSelected?: number[]) => {
      if (!scene) return;
      setHistory((h) => push(h, { scene, beatIndex }));
      sceneRev.current += 1;
      sceneRef.current = next;
      dirtyRef.current = true;
      anyDirtyRef.current = true;
      setScene(next);
      setBeatIndex(nextBeat);
      const focus = [nextBeat];
      setSelected(nextSelected && nextSelected.length > 0 ? nextSelected : focus);
      if (!nextSelected) {
        setAnchor(nextBeat);
      }
      setDirty(true);
      writeBackup(globalThis.localStorage, next);
    },
    [scene, beatIndex],
  );

  const updateBeat = useCallback(
    (mutator: (beat: Beat) => Beat) => {
      if (!scene) return;
      const next = structuredClone(scene);
      const current = next.beats[beatIndex] ?? {};
      next.beats[beatIndex] = mutator(current);
      commitScene(next);
    },
    [scene, beatIndex, commitScene],
  );

  const applyMedia = useCallback(
    (asset: AssetMeta, index = beatIndex) => {
      if (!scene) return;
      const group = selected.includes(index) && selected.length > 1 ? selected : [index];
      const next = structuredClone(scene);
      next.beats = applyAssetToMany(next.beats, group, asset);
      commitScene(next, index, group);
      if (asset.logical.startsWith("cg/") && project) {
        const nextProject = { ...project, cg: ensureGalleryItem(project.cg, asset.logical) };
        projectRev.current += 1;
        projectRef.current = nextProject;
        projectDirtyRef.current = true;
        anyDirtyRef.current = true;
        setProject(nextProject);
        setProjectDirty(true);
      }
    },
    [scene, beatIndex, selected, commitScene, project],
  );

  const applyUndo = useCallback(() => {
    if (!scene) return;
    const result = undo(history, { scene, beatIndex });
    if (!result) return;
    setHistory(result.history);
    sceneRev.current += 1;
    sceneRef.current = result.snap.scene;
    dirtyRef.current = true;
    anyDirtyRef.current = true;
    setScene(result.snap.scene);
    setBeatIndex(result.snap.beatIndex);
    setSelected([result.snap.beatIndex]);
    setAnchor(result.snap.beatIndex);
    setDirty(true);
  }, [scene, beatIndex, history]);

  const applyRedo = useCallback(() => {
    if (!scene) return;
    const result = redo(history, { scene, beatIndex });
    if (!result) return;
    setHistory(result.history);
    sceneRev.current += 1;
    sceneRef.current = result.snap.scene;
    dirtyRef.current = true;
    anyDirtyRef.current = true;
    setScene(result.snap.scene);
    setBeatIndex(result.snap.beatIndex);
    setSelected([result.snap.beatIndex]);
    setAnchor(result.snap.beatIndex);
    setDirty(true);
  }, [scene, beatIndex, history]);

  const save = useCallback(async () => {
    const projectNow = projectRef.current;
    const sceneNow = sceneRef.current;
    const issues = [
      ...(projectNow && projectDirtyRef.current ? projectSaveIssues(projectNow) : []),
      ...(sceneNow && dirtyRef.current ? sceneSaveIssues(sceneNow) : []),
    ];
    if (issues.length > 0) {
      throw new Error(formatSaveIssues(issues, tRef.current));
    }
    let accepted = false;
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
          anyDirtyRef.current = dirtyRef.current;
          setProject(merged.value);
          setProjectDirty(false);
          accepted = true;
        }
      }
    }
    const sceneForKind = sceneRef.current;
    if (sceneForKind && dirtyRef.current) {
      if (sceneForKind.sceneKind === "explore") {
        const ok = window.confirm(tRef.current("editor.warnSaveExploreFromDialogue"));
        if (!ok) {
          throw new Error(tRef.current("editor.saveCancelled"));
        }
      }
      const body = sceneRef.current;
      if (body && dirtyRef.current) {
        const requestRev = sceneRev.current;
        const withIds = {
          ...body,
          beats: ensureBeatIds(body.beats) as Scene["beats"],
        };
        const saved = await putJson<Scene>(`/api/scenes/${body.id}`, withIds);
        const current = sceneRef.current;
        if (current) {
          const merged = mergeSaveResponse({
            requestRev,
            currentRev: sceneRev.current,
            saved,
            current,
          });
          if (merged.clearDirty) {
            sceneRef.current = merged.value;
            dirtyRef.current = false;
            anyDirtyRef.current = projectDirtyRef.current;
            setScene(merged.value);
            setScenes((list) => upsertSceneMeta(list, merged.value));
            setDirty(false);
            clearBackup(globalThis.localStorage, merged.value.id);
            accepted = true;
          }
        }
      }
    }
    if (accepted) {
      pushToast("note", tRef.current("editor.saved"));
    }
  }, [pushToast]);

  // Deep link from Explore: #dialogue?scene=id&scripts=1
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || scenes.length === 0) return;
    const params = dialogueRouteParams(typeof location !== "undefined" ? location.hash : "");
    if (!params.sceneId && !params.openScripts) return;
    deepLinkDone.current = true;
    void (async () => {
      try {
        if (params.sceneId) {
          await flushThenAllowLeave(stillDirty(), save, stillDirty);
          setSceneId(params.sceneId);
        }
        if (params.openScripts) setScriptsOpen(true);
        if (typeof window !== "undefined" && params.sceneId) {
          window.history.replaceState(null, "", `${location.pathname}${location.search}`);
        }
      } catch (err) {
        fail(err);
      }
    })();
  }, [scenes.length, anyDirty, stillDirty, save, fail]);

  const play = useCallback(async () => {
    if (!scene) return;
    try {
      await launchPlay({
        dirty: anyDirty,
        save,
        play: () => postJson("/api/play", { scene: scene.id, beat: beatIndex }),
      });
    } catch (err) {
      fail(err);
    }
  }, [scene, anyDirty, save, beatIndex, fail]);

  const setPackOutPersist = useCallback((value: string) => {
    setPackOut(value);
    try {
      globalThis.localStorage?.setItem(PACK_OUT_KEY, value);
    } catch {
      /* ignore quota */
    }
  }, []);

  const applyAssetRoot = useCallback(async (path: string | null) => {
    const info = await putJson<AssetRootInfo>("/api/asset-root", { path });
    setAssetRoot(info);
    setAssets(await getJson<AssetMeta[]>("/api/assets"));
  }, []);

  const browseAssetRoot = useCallback(async () => {
    try {
      const res = await postJson<{ path: string | null }>("/api/pick-dir", {});
      if (res.path) {
        await applyAssetRoot(res.path);
      }
    } catch (err) {
      fail(err);
    }
  }, [applyAssetRoot, fail]);

  const resetAssetRoot = useCallback(async () => {
    try {
      await applyAssetRoot(null);
    } catch (err) {
      fail(err);
    }
  }, [applyAssetRoot, fail]);

  const browseAssetFile = useCallback(async (): Promise<string | null> => {
    try {
      const res = await postJson<{ logical: string | null }>("/api/pick-file", {});
      if (res.logical) {
        setAssets(await getJson<AssetMeta[]>("/api/assets"));
        return res.logical;
      }
      return null;
    } catch (err) {
      fail(err);
      return null;
    }
  }, [fail]);

  const browsePackOut = useCallback(async () => {
    try {
      const res = await postJson<{ path: string | null }>("/api/pick-dir", {});
      if (res.path) {
        setPackOutPersist(res.path);
      }
    } catch (err) {
      fail(err);
    }
  }, [setPackOutPersist, fail]);

  const pack = useCallback(async () => {
    try {
      let packed: PackResult | undefined;
      const dest = packOut.trim();
      await launchPlay({
        dirty: anyDirty,
        save,
        play: async () => {
          packed = await postJson<PackResult>("/api/pack", dest ? { out: dest } : {});
        },
      });
      const note = packed
        ? formatPackNote(packed, tRef.current)
        : tRef.current("editor.packWrote");
      const warn = packed ? packWarningsOf(packed).length > 0 : false;
      pushToast(warn ? "error" : "note", note);
      setPackOpen(false);
    } catch (err) {
      fail(err);
    }
  }, [anyDirty, save, packOut, pushToast, fail]);

  const createScene = useCallback(async (raw: string): Promise<Scene> => {
    const id = parseSceneId(raw);
    if (!id) {
      throw new Error(tRef.current("editor.badSceneId"));
    }
    const created = await postJson<Scene>("/api/scenes", { id });
    setScenes((list) => upsertSceneMeta(list, created));
    return created;
  }, []);

  const duplicateCurrentScene = useCallback(
    async (raw: string): Promise<Scene> => {
      if (!scene) {
        throw new Error(tRef.current("editor.badSceneId"));
      }
      const copy = duplicateScene(scene, raw);
      if (!copy) {
        throw new Error(tRef.current("editor.badSceneId"));
      }
      await flushThenAllowLeave(stillDirty(), save, stillDirty);
      await postJson<Scene>("/api/scenes", { id: copy.id });
      const saved = await putJson<Scene>(`/api/scenes/${copy.id}`, copy);
      setScenes((list) => upsertSceneMeta(list, saved));
      return saved;
    },
    [scene, stillDirty, save],
  );

  const archiveCurrentScene = useCallback(async () => {
    if (!scene || !project) {
      throw new Error(tRef.current("editor.cannotArchiveStart"));
    }
    if (!canArchiveScene(scene.id, project.startScene)) {
      throw new Error(tRef.current("editor.cannotArchiveStart"));
    }
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
    setSceneId(
      nextSceneAfterArchive(
        scene.id,
        scene.id,
        project.startScene,
        live.map((item) => item.id),
      ),
    );
  }, [scene, project, stillDirty, save]);

  const unarchiveScene = useCallback(async (id: string) => {
    const restored = await postJson<Scene>(`/api/scenes/${id}/unarchive`, {});
    setScenes((list) => upsertSceneMeta(list, restored));
    setArchived((list) => list.filter((item) => item.id !== restored.id));
  }, []);

  const deleteCurrentScene = useCallback(async () => {
    if (!scene || !project) {
      throw new Error(tRef.current("editor.cannotDeleteStart"));
    }
    if (!canDeleteScene(scene.id, project.startScene)) {
      throw new Error(tRef.current("editor.cannotDeleteStart"));
    }
    const ok = window.confirm(
      tRef.current("editor.deleteSceneConfirm").replaceAll("{id}", scene.id),
    );
    if (!ok) {
      return;
    }
    const removed = scene.id;
    await deleteJson(`/api/scenes/${removed}`);
    const live = await getJson<SceneMeta[]>("/api/scenes");
    setScenes(live);
    setSceneId(
      nextSceneAfterArchive(
        removed,
        removed,
        project.startScene,
        live.map((item) => item.id),
      ),
    );
  }, [scene, project]);

  const deleteArchivedScene = useCallback(async (id: string) => {
    const ok = window.confirm(
      tRef.current("editor.deleteArchivedConfirm").replaceAll("{id}", id),
    );
    if (!ok) {
      return;
    }
    await deleteJson(`/api/archived/${id}`);
    setArchived((list) => list.filter((item) => item.id !== id));
  }, []);

  const selectScene = useCallback(
    async (id: string) => {
      if (id === sceneId) return;
      try {
        await flushThenAllowLeave(stillDirty(), save, stillDirty);
        setSceneId(id);
      } catch (err) {
        fail(err);
      }
    },
    [sceneId, stillDirty, save, fail],
  );

  const requestNewScene = useCallback(
    (onCreated?: (id: string) => void) => {
      setSceneDialog({
        kind: "new",
        onCreated:
          onCreated ??
          ((id) => {
            void (async () => {
              try {
                await flushThenAllowLeave(stillDirty(), save, stillDirty);
                setSceneId(id);
              } catch (err) {
                fail(err);
              }
            })();
          }),
      });
    },
    [stillDirty, save, fail],
  );

  const requestDupScene = useCallback(() => {
    if (!scene) {
      return;
    }
    setSceneDialog({
      kind: "dup",
      onCreated: (id) => {
        if (sceneLeaveBlocked(dirtyRef.current, projectDirtyRef.current)) {
          fail(new Error(LEAVE_CANCELLED_MESSAGE));
          return;
        }
        setSceneId(id);
      },
    });
  }, [scene, fail]);

  const closeSceneDialog = useCallback(() => setSceneDialog(null), []);

  const exportCurrentScene = useCallback(() => {
    if (!scene) return;
    setExportPath(null);
    setExportFiles([{ id: scene.id, text: exportScene(scene) }]);
  }, [scene]);

  const exportEveryScene = useCallback(async () => {
    try {
      const loaded = await Promise.all(
        scenes.map((meta) =>
          scene && meta.id === scene.id
            ? Promise.resolve(scene)
            : getJson<Scene>(`/api/scenes/${meta.id}`),
        ),
      );
      setExportPath(null);
      setExportFiles(exportAllScenes(loaded));
    } catch (err) {
      fail(err);
    }
  }, [scenes, scene, fail]);

  const writeExportFiles = useCallback(async () => {
    if (!exportFiles) return;
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
    } catch (err) {
      fail(err);
    }
  }, [exportFiles, fail]);

  const closeExport = useCallback(() => {
    setExportFiles(null);
    setExportPath(null);
  }, []);

  const pickBeat = useCallback(
    (i: number, mods?: { shift?: boolean; toggle?: boolean }) => {
      if (!scene) return;
      const clamped = Math.max(0, Math.min(i, scene.beats.length - 1));
      if (mods?.shift) {
        const next = rangeIndices(anchor, clamped).filter((n) => n < scene.beats.length);
        setSelected(next);
        setBeatIndex(clamped);
        return;
      }
      if (mods?.toggle) {
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
    },
    [scene, anchor, selected],
  );

  const setBeat = useCallback((i: number) => pickBeat(i), [pickBeat]);

  const prevBeat = useCallback(() => pickBeat(beatIndex - 1), [pickBeat, beatIndex]);
  const nextBeat = useCallback(() => pickBeat(beatIndex + 1), [pickBeat, beatIndex]);

  const addBeat = useCallback(() => {
    if (!scene) return;
    const beats = insertBeatAfterBeats(scene.beats, beatIndex);
    commitScene({ ...scene, beats }, beatIndex + 1);
  }, [scene, beatIndex, commitScene]);

  const insertBeatAfter = useCallback(
    (index: number) => {
      if (!scene) return;
      const beats = insertBeatAfterBeats(scene.beats, index);
      commitScene({ ...scene, beats }, index + 1);
    },
    [scene, commitScene],
  );

  const duplicateBeatAt = useCallback(
    (index: number) => {
      if (!scene) return;
      const beats = duplicateBeat(scene.beats, index);
      if (beats === scene.beats) return;
      commitScene({ ...scene, beats }, index + 1);
    },
    [scene, commitScene],
  );

  const clearTrackAt = useCallback(
    (index: number, track: TrackKey) => {
      if (!scene) return;
      const group = selected.includes(index) && selected.length > 1 ? selected : [index];
      const next = structuredClone(scene);
      const beats = clearBeatsTrack(next.beats, group, track);
      if (beats === next.beats) return;
      next.beats = beats;
      commitScene(next, index, group);
    },
    [scene, selected, commitScene],
  );

  const clearLabelsAt = useCallback(
    (index: number) => {
      if (!scene) return;
      const group = selected.includes(index) && selected.length > 1 ? selected : [index];
      const next = structuredClone(scene);
      const beats = clearBeatsLabel(next.beats, group);
      if (beats === next.beats) return;
      next.beats = beats;
      commitScene(next, index, group);
    },
    [scene, selected, commitScene],
  );

  const [beatClipboard, setBeatClipboard] = useState<Beat | null>(null);

  const copyBeat = useCallback(
    (index: number) => {
      if (!scene) return;
      setBeatClipboard(structuredClone(scene.beats[index] ?? {}));
    },
    [scene],
  );

  const pasteWholeAt = useCallback(
    (index: number) => {
      if (!scene || !beatClipboard) return;
      const next = structuredClone(scene);
      next.beats[index] = structuredClone(beatClipboard);
      commitScene(next, index);
    },
    [scene, beatClipboard, commitScene],
  );

  const pasteFieldAt = useCallback(
    (index: number, field: PasteField) => {
      if (!scene || !beatClipboard) return;
      const next = structuredClone(scene);
      const pasted = pasteBeatField(next.beats[index] ?? {}, beatClipboard, field);
      if (pasted === next.beats[index]) return;
      next.beats[index] = pasted;
      commitScene(next, index);
    },
    [scene, beatClipboard, commitScene],
  );

  const [sheetView, setSheetView] = useState(false);
  const toggleSheetView = useCallback(() => setSheetView((v) => !v), []);

  const [stepAudition, setStepAudition] = useState(false);
  const toggleStepAudition = useCallback(() => setStepAudition((v) => !v), []);

  /** Step audition: replay only on move/switch/toggle; content edits must not retrigger. */
  useEffect(() => {
    if (!stepAudition) {
      stopAudition();
      return;
    }
    if (!scene) return;
    const logical = beatStepAudio(scene.beats[beatIndex]);
    stopAudition();
    if (logical) {
      playAudition(logical);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `scene` read fresh; identity changes per keystroke
  }, [stepAudition, sceneId, beatIndex]);

  const patchSayAt = useCallback(
    (index: number, partial: { speaker?: string; text?: string }) => {
      if (!scene) return;
      const next = structuredClone(scene);
      next.beats[index] = patchSay(next.beats[index] ?? {}, partial);
      commitScene(next, index);
    },
    [scene, commitScene],
  );

  const moveBeatsTo = useCallback(
    (indices: number[], to: number) => {
      if (!scene) return;
      const beats = moveBeats(scene.beats, indices, to);
      if (beats === scene.beats) return;
      const nextIndex = adjustIndexAfterMoveBeats(indices, to, beatIndex, scene.beats.length);
      const nextSelected = selectionAfterMoveBeats(indices, to, scene.beats.length);
      commitScene({ ...scene, beats }, nextIndex, nextSelected);
      setAnchor(nextSelected[0] ?? nextIndex);
    },
    [scene, beatIndex, commitScene],
  );

  const moveBeatTo = useCallback(
    (from: number, to: number) => {
      moveBeatsTo([from], to);
    },
    [moveBeatsTo],
  );

  const deleteBeatAt = useCallback(
    (index: number) => {
      if (!scene || scene.beats.length <= 1) return;
      const group =
        selected.includes(index) && selected.length > 1
          ? selected
          : [index];
      const from = normalizeIndices(group, scene.beats.length);
      const beats = removeBeatsAt(scene.beats, from);
      if (beats === scene.beats) return;
      commitScene({ ...scene, beats }, Math.min(from[0] ?? index, beats.length - 1));
    },
    [scene, selected, commitScene],
  );

  const patchProject = useCallback((next: Project) => {
    projectRev.current += 1;
    projectRef.current = next;
    projectDirtyRef.current = true;
    anyDirtyRef.current = true;
    setProject(next);
    setProjectDirty(true);
  }, []);

  const patchSceneTitle = useCallback(
    (raw: string) => {
      if (!scene) return;
      const title = raw.trim() || undefined;
      commitScene({ ...scene, title });
      setScenes((list) => list.map((s) => (s.id === scene.id ? { ...s, title } : s)));
    },
    [scene, commitScene],
  );

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const openSearch = useCallback(() => setSearchOpen(true), []);

  const closeOverview = useCallback(() => setOverviewOpen(false), []);

  const openOverview = useCallback(() => setOverviewOpen(true), []);

  const closeVars = useCallback(() => setVarsOpen(false), []);

  const openVars = useCallback(() => setVarsOpen(true), []);

  const closeIssues = useCallback(() => setIssuesOpen(false), []);

  const openIssues = useCallback(() => setIssuesOpen(true), []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  const issueContext = useMemo(
    () => liveIssueContext(scenes, archived, assets),
    [scenes, archived, assets],
  );

  /** Current scene issues, unsaved edits included; drives the top bar badge. */
  const currentIssues = useMemo(
    () => (scene ? sceneLiveIssues(scene, issueContext) : []),
    [scene, issueContext],
  );

  const loadSearchScenes = useCallback(async () => {
    try {
      return await loadScenesForSearch(scenes, scene, (id) => getJson<Scene>(`/api/scenes/${id}`));
    } catch (err) {
      fail(err);
      return scene ? [scene] : [];
    }
  }, [scenes, scene, fail]);

  const loadSearchScenesRef = useRef(loadSearchScenes);
  loadSearchScenesRef.current = loadSearchScenes;

  /** Stable identity so the exit tab can re-pull on mount/scene switch without refetching per keystroke. */
  const refreshVarHints = useCallback(async () => {
    const all = await loadSearchScenesRef.current();
    setVarHints(varNames(all));
  }, []);

  const goToBeat = useCallback(
    async (id: string, beat: number | null) => {
      if (id === sceneId) {
        pickBeat(beat ?? 0);
        return;
      }
      try {
        await flushThenAllowLeave(stillDirty(), save, stillDirty);
        pendingBeatRef.current = beat ?? 0;
        setSceneId(id);
      } catch (err) {
        fail(err);
      }
    },
    [sceneId, pickBeat, stillDirty, save, fail],
  );

  const goToSearchHit = useCallback(
    async (hit: SearchHit) => {
      setSearchOpen(false);
      if (!hit.sceneId) {
        return;
      }
      await goToBeat(hit.sceneId, hit.beatIndex);
    },
    [goToBeat],
  );

  const goToCite = useCallback(
    async (site: CiteSite) => {
      setOverviewOpen(false);
      setSettingsOpen(false);
      if (!site.sceneId) {
        return;
      }
      await goToBeat(site.sceneId, site.beatIndex ?? 0);
    },
    [goToBeat],
  );

  const goToVar = useCallback(
    async (site: VarSite) => {
      setVarsOpen(false);
      setSettingsOpen(false);
      if (site.where === "beat") {
        setInspectorTab("beat");
        setFocusChoice(null);
        await goToBeat(site.sceneId, site.beatIndex ?? 0);
        return;
      }
      setInspectorTab("exit");
      setFocusChoice(site.where === "choice" ? (site.choiceIndex ?? null) : null);
      await goToBeat(site.sceneId, 0);
    },
    [goToBeat],
  );

  /** Restores the offered backup into the edit state (undoable, stays dirty); never touches the saved file. */
  const restoreBackup = useCallback(() => {
    if (!backupOffer || !scene) return;
    const restored = backupOffer.scene;
    commitScene(restored, clampBeatIndex(beatIndex, restored.beats.length));
    setBackupOffer(null);
  }, [backupOffer, scene, beatIndex, commitScene]);

  const dismissBackup = useCallback(() => {
    if (backupOffer) {
      clearBackup(globalThis.localStorage, backupOffer.scene.id);
    }
    setBackupOffer(null);
  }, [backupOffer]);

  const goToIssue = useCallback(
    async (issue: LiveIssue) => {
      setIssuesOpen(false);
      const target = issue.target;
      if (target.kind === "project") {
        setSettingsOpen(true);
        return;
      }
      if (target.kind === "beat") {
        setInspectorTab("beat");
        setFocusChoice(null);
        await goToBeat(target.sceneId, target.beatIndex);
        return;
      }
      setInspectorTab("exit");
      setFocusChoice(target.choiceIndex ?? null);
      await goToBeat(target.sceneId, 0);
    },
    [goToBeat],
  );

  const modalOpen =
    sceneDialog !== null ||
    exportFiles !== null ||
    settingsOpen ||
    scriptsOpen ||
    searchOpen ||
    overviewOpen ||
    varsOpen ||
    issuesOpen ||
    shortcutsOpen ||
    packOpen ||
    backupOffer !== null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "s") {
          event.preventDefault();
          void save().catch(fail);
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
          if (!modalOpen) {
            duplicateBeatAt(beatIndex);
          }
          return;
        }
        if (key === "k") {
          event.preventDefault();
          if (searchOpen) {
            setSearchOpen(false);
          } else if (
            sceneDialog === null &&
            exportFiles === null &&
            !settingsOpen &&
            !scriptsOpen &&
            !overviewOpen &&
            !varsOpen &&
            !issuesOpen &&
            !shortcutsOpen &&
            !packOpen &&
            backupOffer === null
          ) {
            setSearchOpen(true);
          }
          return;
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (editing || event.altKey || modalOpen) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setSelected([beatIndex]);
        setAnchor(beatIndex);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (event.shiftKey) {
          pickBeat(beatIndex - 1, { shift: true });
        } else {
          prevBeat();
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (event.shiftKey) {
          pickBeat(beatIndex + 1, { shift: true });
        } else {
          nextBeat();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    return registerShellSession({
      getDirty: () => anyDirtyRef.current,
      save: () => saveRef.current(),
    });
  }, []);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!shouldWarnUnload(anyDirty)) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  return {
    locale,
    t,
    setLocale,
    project,
    scenes,
    archived,
    assets,
    assetRoot,
    browseAssetRoot,
    browseAssetFile,
    resetAssetRoot,
    sceneId,
    scene,
    beatIndex,
    selected,
    pickBeat,
    beat,
    dirty: anyDirty,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    toasts,
    dismissToast,
    pushToast,
    fail,
    commitScene,
    updateBeat,
    applyMedia,
    applyUndo,
    applyRedo,
    save,
    play,
    pack,
    packOpen,
    packOut,
    openPack: () => setPackOpen(true),
    closePack: () => setPackOpen(false),
    setPackOut: setPackOutPersist,
    browsePackOut,
    createScene,
    duplicateCurrentScene,
    archiveCurrentScene,
    unarchiveScene,
    deleteCurrentScene,
    deleteArchivedScene,
    selectScene,
    sceneDialog,
    requestNewScene,
    requestDupScene,
    closeSceneDialog,
    exportFiles,
    exportPath,
    exportCurrentScene,
    exportEveryScene,
    writeExportFiles,
    closeExport,
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    scriptsOpen,
    openScripts: () => setScriptsOpen(true),
    closeScripts: () => setScriptsOpen(false),
    openExportFiles: (files: ScriptFile[]) => {
      setExportPath(null);
      setExportFiles(files);
    },

    searchOpen,
    openSearch,
    closeSearch,
    loadSearchScenes,
    goToSearchHit,
    overviewOpen,
    openOverview,
    closeOverview,
    goToCite,
    varsOpen,
    openVars,
    closeVars,
    goToVar,
    varHints,
    refreshVarHints,
    backupOffer,
    restoreBackup,
    dismissBackup,
    issuesOpen,
    openIssues,
    closeIssues,
    goToIssue,
    shortcutsOpen,
    openShortcuts,
    closeShortcuts,
    issueContext,
    currentIssues,
    inspectorTab,
    setInspectorTab,
    focusChoice,
    setBeat,
    prevBeat,
    nextBeat,
    addBeat,
    insertBeatAfter,
    duplicateBeatAt,
    clearTrackAt,
    clearLabelsAt,
    beatClipboard,
    copyBeat,
    pasteWholeAt,
    pasteFieldAt,
    sheetView,
    toggleSheetView,
    stepAudition,
    toggleStepAudition,
    patchSayAt,
    moveBeatTo,
    moveBeatsTo,
    deleteBeatAt,
    patchProject,
    patchSceneTitle,
  };
}

export type Editor = ReturnType<typeof useEditorState>;
