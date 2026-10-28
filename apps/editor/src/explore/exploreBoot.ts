/**
 * Explore shell boot. Picks an explore room, or reports that the project has
 * none. Never writes. Callers must not mount the editor on failure.
 *
 * Order: an explore deep link, else an explore startScene, else the first
 * explore row from loadSceneCatalog (inferListedSceneKind). A dialogue deep
 * link is handed back so the caller can open the dialogue shell (U02).
 * A startScene that is not in the catalog still loads, so the "study"
 * fallback and a missing file keep their old results.
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
  | { ok: false; error: string }
  /** Project has scenes, but none of them is an explore room. Not a load error. */
  | { ok: "empty"; sceneCatalog: SceneCatalogEntry[]; projectRaw: unknown }
  /** Deep link names a dialogue scene. Open that scene in the dialogue shell. */
  | { ok: "dialogue"; sceneId: string };

type BootTarget =
  | { type: "load"; sceneId: string }
  | { type: "empty" }
  | { type: "dialogue"; sceneId: string };

function listedKind(
  catalog: SceneCatalogEntry[],
  id: string,
): SceneCatalogEntry["kind"] | undefined {
  return catalog.find((entry) => entry.id === id)?.kind;
}

/**
 * Deep link wins only when it is an explore room. A dialogue deep link does
 * not fall through to startScene. An unlisted id still loads (missing file
 * stays an error; the study fallback stays a load).
 */
function pickExploreBootTarget(
  catalog: SceneCatalogEntry[],
  startScene: string,
  deepLink?: string,
): BootTarget {
  const deep = deepLink?.trim() ?? "";
  if (deep.length > 0) {
    if (listedKind(catalog, deep) === "dialogue") {
      return { type: "dialogue", sceneId: deep };
    }
    return { type: "load", sceneId: deep };
  }
  if (listedKind(catalog, startScene) === "dialogue") {
    const first = catalog.find((entry) => entry.kind === "explore");
    if (first) return { type: "load", sceneId: first.id };
    return { type: "empty" };
  }
  return { type: "load", sceneId: startScene };
}

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
 * 1. loadProject + loadSceneCatalog.
 * 2. Pick an explore room, an empty project, or a dialogue redirect.
 * 3. loadExploreDoc only for the picked explore room.
 * Does not call saveProject / saveScene.
 */
export async function bootExplore(
  persist: ExplorePersistApi,
  opts?: { sceneId?: string },
): Promise<ExploreBootResult> {
  try {
    const projectRaw = await persist.loadProject();
    const catalog = await loadSceneCatalog(persist);
    const startScene = exploreBootSceneId(projectRaw);
    const target = pickExploreBootTarget(catalog, startScene, opts?.sceneId);
    if (target.type === "empty") {
      return { ok: "empty", sceneCatalog: catalog, projectRaw };
    }
    if (target.type === "dialogue") {
      return { ok: "dialogue", sceneId: target.sceneId };
    }
    const loaded = await loadExploreDoc(persist, target.sceneId);
    return {
      ok: true,
      doc: loaded,
      sceneCatalog: catalogWithIds(catalog, loaded, target.sceneId),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
