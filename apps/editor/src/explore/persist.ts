/**
 * Explore document persistence against host project/scene JSON.
 * HTTP: GET/PUT /api/project, GET/PUT /api/scenes/:id
 * Mapping helpers + injectable ExplorePersistApi (FS impl in persistFs.ts for Node tests).
 */

import { getJson, putJson } from "../api";
import { loadExplore } from "./commands";
import {
  BUILTIN_VERBS,
  type ExploreDoc,
  type ExploreProject,
  type ExploreScene,
  type Fallback,
  type Verb,
} from "./types";

export interface ExplorePersistApi {
  loadProject(): Promise<unknown>;
  saveProject(body: unknown): Promise<unknown>;
  loadScene(id: string): Promise<unknown>;
  saveScene(id: string, body: unknown): Promise<unknown>;
}

export function createHttpPersistApi(): ExplorePersistApi {
  return {
    loadProject: () => getJson("/api/project"),
    saveProject: (body) => putJson("/api/project", body),
    loadScene: (id) => getJson(`/api/scenes/${id}`),
    saveScene: (id, body) => putJson(`/api/scenes/${id}`, body),
  };
}

function asRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: expected object`);
  }
  return raw as Record<string, unknown>;
}

export function exploreProjectToApi(p: ExploreProject): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    schemaVersion: p.schemaVersion,
    resolution: p.resolution,
    startScene: p.startScene,
    locale: p.locale,
    skipTitle: true,
    verbs: p.verbs,
    items: p.items,
    switches: p.switches,
    ...(p.characters.length > 0
      ? {
          characters: p.characters.map((c) => ({
            id: c.id,
            ...(c.display ? { display: c.display } : {}),
            ...(c.textRate !== undefined ? { textRate: c.textRate } : {}),
          })),
        }
      : {}),
    fallback: {
      perVerb: p.fallback.perVerb ?? {},
      ...(p.fallback.itemOnHotspot !== undefined
        ? { itemOnHotspot: p.fallback.itemOnHotspot }
        : {}),
      ...(p.fallback.global !== undefined ? { global: p.fallback.global } : {}),
    },
  };
}

export function exploreSceneToApi(s: ExploreScene): Record<string, unknown> {
  return {
    id: s.id,
    ...(s.title !== undefined ? { title: s.title } : {}),
    sceneKind: "explore",
    ...(s.bg ? { bg: s.bg } : {}),
    beats: [],
    hotspots: s.hotspots,
    interactions: s.interactions,
    ...(s.onEnter && s.onEnter.length > 0 ? { onEnter: s.onEnter } : {}),
  };
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
  };
}

export async function saveExploreDoc(
  api: ExplorePersistApi,
  doc: ExploreDoc,
): Promise<{ project: ExploreProject; scene: ExploreScene }> {
  const projectBody = exploreProjectToApi(doc.project);
  const sceneBody = exploreSceneToApi(doc.scene);
  const savedProject = await api.saveProject(projectBody);
  const savedScene = await api.saveScene(doc.scene.id, sceneBody);
  return {
    project: apiToExploreProject(savedProject),
    scene: apiToExploreScene(savedScene),
  };
}

export async function loadExploreDoc(
  api: ExplorePersistApi,
  sceneId: string,
): Promise<ExploreDoc> {
  const projectRaw = await api.loadProject();
  const sceneRaw = await api.loadScene(sceneId);
  return loadExplore(apiToExploreProject(projectRaw), apiToExploreScene(sceneRaw));
}
