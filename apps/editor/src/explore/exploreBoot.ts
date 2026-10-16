/**
 * Explore shell boot. Reads project.startScene, then loads that scene + catalog.
 * Never writes. Callers must not mount the editor with live persist on failure.
 */

import { loadExploreDoc, type ExplorePersistApi } from "./persist";
import { loadSceneCatalog } from "./sceneCatalog";
import type { ExploreDoc, SceneCatalogEntry } from "./types";

/** Used only when project.startScene is missing or blank. */
export const EXPLORE_BOOT_FALLBACK_SCENE = "study";

/** Scene id to open. Non-empty string startScene wins; otherwise "study". */
export function exploreBootSceneId(projectRaw: unknown): string {
  if (!projectRaw || typeof projectRaw !== "object" || Array.isArray(projectRaw)) {
    return EXPLORE_BOOT_FALLBACK_SCENE;
  }
  const start = (projectRaw as { startScene?: unknown }).startScene;
  if (typeof start !== "string") return EXPLORE_BOOT_FALLBACK_SCENE;
  const id = start.trim();
  return id.length > 0 ? id : EXPLORE_BOOT_FALLBACK_SCENE;
}

export type ExploreBootResult =
  | { ok: true; doc: ExploreDoc; sceneCatalog: SceneCatalogEntry[] }
  | { ok: false; error: string };

function catalogWithIds(
  catalog: SceneCatalogEntry[],
  loaded: ExploreDoc,
  startScene: string,
): SceneCatalogEntry[] {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  if (!byId.has(loaded.scene.id)) {
    byId.set(loaded.scene.id, {
      id: loaded.scene.id,
      kind: "explore",
      title: loaded.scene.title,
    });
  }
  if (!byId.has(loaded.project.startScene)) {
    byId.set(loaded.project.startScene, {
      id: loaded.project.startScene,
      kind: "explore",
    });
  }
  if (!byId.has(startScene)) {
    byId.set(startScene, { id: startScene, kind: "explore" });
  }
  return [...byId.values()];
}

/**
 * 1. loadProject — read startScene (fallback "study").
 * 2. loadExploreDoc(startScene) + loadSceneCatalog.
 * Does not call saveProject / saveScene.
 */
export async function bootExplore(
  persist: ExplorePersistApi,
  opts?: { sceneId?: string },
): Promise<ExploreBootResult> {
  try {
    const projectRaw = await persist.loadProject();
    const override = opts?.sceneId?.trim();
    const startScene =
      override && override.length > 0 ? override : exploreBootSceneId(projectRaw);
    const [loaded, catalog] = await Promise.all([
      loadExploreDoc(persist, startScene),
      loadSceneCatalog(persist),
    ]);
    return {
      ok: true,
      doc: loaded,
      sceneCatalog: catalogWithIds(catalog, loaded, startScene),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
