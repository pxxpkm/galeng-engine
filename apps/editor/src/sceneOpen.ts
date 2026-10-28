/**
 * New explore room from the dialogue shell. Keeps the real project: a bare
 * `blankExploreDoc` would overwrite galeng.json with the demo project.
 */
import { blankExploreDoc } from "./explore/fixture";
import { apiToExploreProject } from "./explore/persist";
import type { ExploreDoc } from "./explore/types";

export function exploreDocForNewRoom(rawProject: unknown, id: string, title?: string): ExploreDoc {
  const project = apiToExploreProject(rawProject);
  const blank = blankExploreDoc(id);
  const trimmed = title?.trim();
  const raw =
    rawProject && typeof rawProject === "object" && !Array.isArray(rawProject)
      ? (rawProject as Record<string, unknown>)
      : undefined;
  return {
    ...blank,
    project,
    _rawProject: raw,
    scene: {
      ...blank.scene,
      id,
      title: trimmed || blank.scene.title,
      sceneKind: "explore",
    },
  };
}
