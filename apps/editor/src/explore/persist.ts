/**
 * Explore document persistence against host project/scene JSON.
 * HTTP: GET/PUT /api/project, GET/PUT /api/scenes/:id
 * Mapping helpers + injectable ExplorePersistApi (FS impl in persistFs.ts for Node tests).
 */

import { getJson, putJson } from "../api";
import { ensureBeatIds } from "../beats";
import { loadExplore } from "./commands";
import {
  BUILTIN_VERBS,
  type ExploreDoc,
  type ExploreProject,
  type ExploreScene,
  type Fallback,
  type SceneCatalogEntry,
  type Verb,
} from "./types";

export interface ExplorePersistApi {
  loadProject(): Promise<unknown>;
  saveProject(body: unknown): Promise<unknown>;
  loadScene(id: string): Promise<unknown>;
  saveScene(id: string, body: unknown): Promise<unknown>;
  /** Optional: list scenario ids for Call picker / Problems catalog. */
  listSceneIds?(): Promise<string[]>;
}

export function createHttpPersistApi(): ExplorePersistApi {
  return {
    loadProject: () => getJson("/api/project"),
    saveProject: (body) => putJson("/api/project", body),
    loadScene: (id) => getJson(`/api/scenes/${id}`),
    saveScene: (id, body) => putJson(`/api/scenes/${id}`, body),
    listSceneIds: async () => {
      const metas = await getJson<{ id: string }[]>("/api/scenes");
      if (!Array.isArray(metas)) return [];
      return metas
        .map((m) => (m && typeof m.id === "string" ? m.id : ""))
        .filter(Boolean);
    },
  };
}

function asRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: expected object`);
  }
  return raw as Record<string, unknown>;
}

/** Explore-owned project fields overlaid on optional host raw (lossless). */
export function exploreProjectToApi(
  p: ExploreProject,
  raw?: Record<string, unknown>,
): Record<string, unknown> {
  const owned: Record<string, unknown> = {
    id: p.id,
    title: p.title,
    schemaVersion: p.schemaVersion,
    resolution: p.resolution,
    startScene: p.startScene,
    locale: p.locale,
    verbs: p.verbs,
    items: p.items,
    switches: p.switches,
    characters: p.characters.map((c) => ({
      id: c.id,
      ...(c.display ? { display: c.display } : {}),
      ...(c.textRate !== undefined ? { textRate: c.textRate } : {}),
    })),
    fallback: {
      perVerb: p.fallback.perVerb ?? {},
      ...(p.fallback.itemOnHotspot !== undefined
        ? { itemOnHotspot: p.fallback.itemOnHotspot }
        : {}),
      ...(p.fallback.global !== undefined ? { global: p.fallback.global } : {}),
    },
  };
  if (p.effectLibrary && p.effectLibrary.length > 0) {
    owned.effectLibrary = p.effectLibrary;
  }
  if (p.transitionDefaults) {
    owned.transitionDefaults = p.transitionDefaults;
  }
  // Do NOT hard-write skipTitle — preserve from raw or omit.
  const merged: Record<string, unknown> = { ...(raw ?? {}), ...owned };
  // Cleared Explore-owned optional fields must not resurrect from raw.
  if (!p.effectLibrary || p.effectLibrary.length === 0) {
    delete merged.effectLibrary;
  }
  return merged;
}

/** Explore-owned scene fields overlaid on optional host raw (preserves exit etc.). */
export function exploreSceneToApi(
  s: ExploreScene,
  raw?: Record<string, unknown>,
): Record<string, unknown> {
  // Omit beats from owned — preserve any dialogue beats on disk (Script Library / dual-shell).
  const owned: Record<string, unknown> = {
    id: s.id,
    ...(s.title !== undefined && s.title !== "" ? { title: s.title } : {}),
    sceneKind: "explore",
    ...(s.bg ? { bg: s.bg } : {}),
    hotspots: s.hotspots,
    interactions: s.interactions,
    ...(s.onEnter && s.onEnter.length > 0 ? { onEnter: s.onEnter } : {}),
    ...(s.onEmptyClick && s.onEmptyClick.length > 0
      ? { onEmptyClick: s.onEmptyClick }
      : {}),
  };
  // Overlay must not delete exit / beats / unknown keys — omit them from owned.
  const merged: Record<string, unknown> = { ...(raw ?? {}), ...owned };
  // Cleared Explore-owned optional fields must not resurrect from raw.
  if (s.title === undefined || s.title === "") {
    delete merged.title;
  }
  if (!s.bg) {
    delete merged.bg;
  }
  if (!s.onEnter || s.onEnter.length === 0) {
    delete merged.onEnter;
  }
  if (!s.onEmptyClick || s.onEmptyClick.length === 0) {
    delete merged.onEmptyClick;
  }
  // Host schema expects beats array; keep raw beats or default empty (never wipe raw).
  if (!Array.isArray(merged.beats)) {
    merged.beats = [];
  }
  // Patch ids in place on the raw JSON array — do not round-trip through Beat[].
  merged.beats = ensureBeatIds(merged.beats);
  return merged;
}

function defaultFallback(): Fallback {
  return {
    perVerb: {
      look: "冇咩特別。",
      take: "拎唔到。",
      use: "咁樣用唔到。",
      talk: "冇人應。",
      open: "開唔到。",
      move: "去唔到。",
    },
    itemOnHotspot: "用呢樣嘢冇效果。",
    global: "……",
  };
}

export function apiToExploreProject(raw: unknown): ExploreProject {
  const o = asRecord(raw, "project");
  const verbsRaw = Array.isArray(o.verbs) ? (o.verbs as Verb[]) : [];
  const verbs = verbsRaw.length > 0 ? verbsRaw : [...BUILTIN_VERBS];
  const fb = (o.fallback && typeof o.fallback === "object"
    ? (o.fallback as Fallback)
    : defaultFallback()) as Fallback;
  const characters = Array.isArray(o.characters)
    ? (o.characters as ExploreProject["characters"])
    : [];
  const resolution =
    o.resolution && typeof o.resolution === "object"
      ? (o.resolution as { width: number; height: number })
      : { width: 1920, height: 1080 };
  return {
    id: String(o.id ?? "demo"),
    title: String(o.title ?? "Demo"),
    schemaVersion: Number(o.schemaVersion ?? 2),
    resolution,
    startScene: String(o.startScene ?? "room"),
    locale: String(o.locale ?? "zh-Hant"),
    verbs,
    items: Array.isArray(o.items) ? (o.items as ExploreProject["items"]) : [],
    switches: Array.isArray(o.switches)
      ? (o.switches as ExploreProject["switches"])
      : [],
    characters,
    fallback: {
      perVerb: fb.perVerb ?? {},
      itemOnHotspot: fb.itemOnHotspot,
      global: fb.global,
    },
    effectLibrary: Array.isArray(o.effectLibrary)
      ? (o.effectLibrary as ExploreProject["effectLibrary"])
      : undefined,
    transitionDefaults:
      o.transitionDefaults && typeof o.transitionDefaults === "object"
        ? (o.transitionDefaults as ExploreProject["transitionDefaults"])
        : undefined,
  };
}

export function apiToExploreScene(raw: unknown): ExploreScene {
  const o = asRecord(raw, "scene");
  const kind = o.sceneKind;
  const hasHotspots = Array.isArray(o.hotspots) && (o.hotspots as unknown[]).length > 0;
  if (kind !== "explore" && !hasHotspots) {
    throw new Error(
      `scene "${String(o.id)}": expected sceneKind "explore" (got ${String(kind)})`,
    );
  }
  return {
    id: String(o.id),
    title: typeof o.title === "string" ? o.title : undefined,
    sceneKind: "explore",
    bg:
      o.bg && typeof o.bg === "object"
        ? (o.bg as ExploreScene["bg"])
        : undefined,
    hotspots: Array.isArray(o.hotspots)
      ? (o.hotspots as ExploreScene["hotspots"])
      : [],
    interactions: Array.isArray(o.interactions)
      ? (o.interactions as ExploreScene["interactions"])
      : [],
    onEnter: Array.isArray(o.onEnter)
      ? (o.onEnter as ExploreScene["onEnter"])
      : [],
    onEmptyClick: Array.isArray(o.onEmptyClick)
      ? (o.onEmptyClick as ExploreScene["onEmptyClick"])
      : [],
  };
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Successful GET is the only base. Missing keys on disk stay missing, so a
 * Settings delete is not filled back in from a stale `_rawProject`.
 * Explore-owned fields are still applied from `doc.project` afterwards.
 * Only a missing project file (ENOENT, first save) keeps the in-memory raw.
 * HTTP and other load errors propagate so the room save fails closed.
 */
async function projectBaseForSave(
  api: ExplorePersistApi,
  raw: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  try {
    return asRecord(await api.loadProject(), "project");
  } catch (err) {
    if (isEnoent(err)) return raw;
    throw err;
  }
}

/**
 * Replace raw with the project Settings just stored.
 * Do not pad with the previous raw — absent keys are deletions.
 */
export function adoptSavedProjectRaw(doc: ExploreDoc, saved: object): ExploreDoc {
  return {
    ...doc,
    _rawProject: { ...(saved as Record<string, unknown>) },
  };
}

export async function saveExploreDoc(
  api: ExplorePersistApi,
  doc: ExploreDoc,
): Promise<{
  project: ExploreProject;
  scene: ExploreScene;
  _rawProject: Record<string, unknown>;
  _rawScene: Record<string, unknown>;
}> {
  const projectBody = exploreProjectToApi(
    doc.project,
    await projectBaseForSave(api, doc._rawProject),
  );
  const sceneBody = exploreSceneToApi(doc.scene, doc._rawScene);
  const savedProject = await api.saveProject(projectBody);
  const savedScene = await api.saveScene(doc.scene.id, sceneBody);
  // Refresh raw from what we wrote (FS api returns body; HTTP may too).
  const _rawProject = asRecord(
    savedProject && typeof savedProject === "object" ? savedProject : projectBody,
    "saved project",
  );
  const _rawScene = asRecord(
    savedScene && typeof savedScene === "object" ? savedScene : sceneBody,
    "saved scene",
  );
  return {
    project: apiToExploreProject(_rawProject),
    scene: apiToExploreScene(_rawScene),
    _rawProject,
    _rawScene,
  };
}

export async function loadExploreDoc(
  api: ExplorePersistApi,
  sceneId: string,
): Promise<ExploreDoc> {
  const projectRaw = await api.loadProject();
  const sceneRaw = await api.loadScene(sceneId);
  const _rawProject = asRecord(projectRaw, "project");
  const _rawScene = asRecord(sceneRaw, "scene");
  const doc = loadExplore(
    apiToExploreProject(_rawProject),
    apiToExploreScene(_rawScene),
  );
  return { ...doc, _rawProject, _rawScene };
}

/**
 * Load every explore scene in catalog for pack-time Problems (L4).
 * Current scene uses in-memory doc (may be dirty); siblings load from persist.
 */
export async function loadSiblingExploreScenes(
  api: ExplorePersistApi,
  catalog: SceneCatalogEntry[],
  current: ExploreDoc,
): Promise<ExploreScene[]> {
  const fromCatalog = catalog.filter((c) => c.kind === "explore").map((c) => c.id);
  const ids = fromCatalog.length > 0 ? fromCatalog : [current.scene.id];
  const out: ExploreScene[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === current.scene.id) {
      out.push(structuredClone(current.scene));
      continue;
    }
    try {
      const raw = await api.loadScene(id);
      out.push(apiToExploreScene(raw));
    } catch {
      // skip missing / non-explore
    }
  }
  if (!seen.has(current.scene.id)) {
    out.unshift(structuredClone(current.scene));
  }
  return out;
}
