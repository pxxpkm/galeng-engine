/** Hash-based top-level editor route (#explore vs dialogue/classic). */

export type EditorRoute = "explore" | "dialogue";

export type DialogueRouteParams = {
  sceneId?: string;
  /** Open Script Library after landing on dialogue editor. */
  openScripts?: boolean;
};

export type ExploreRouteParams = {
  /** Open this explore scene after landing on #explore. */
  sceneId?: string;
};

function hashBody(hash: string): string {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

/** `location.hash` with or without leading `#`. */
export function editorRouteFromHash(hash: string): EditorRoute {
  const h = hashBody(hash);
  const path = h.split("?")[0] || "";
  return path === "explore" ? "explore" : "dialogue";
}

/** Parse `#dialogue?scene=id&scripts=1` or `?scene=id` on empty/dialogue hash. */
export function dialogueRouteParams(hash: string): DialogueRouteParams {
  const h = hashBody(hash);
  if (!h || h === "explore" || h.startsWith("explore?")) {
    return {};
  }
  const qIndex = h.indexOf("?");
  const query = qIndex >= 0 ? h.slice(qIndex + 1) : h.includes("=") ? h : "";
  if (!query) return {};
  const params = new URLSearchParams(query);
  const sceneId = params.get("scene")?.trim() || undefined;
  const openScripts = params.get("scripts") === "1" || params.get("scripts") === "true";
  return { sceneId, openScripts: openScripts || undefined };
}

/** Parse `#explore?scene=id`. */
export function exploreRouteParams(hash: string): ExploreRouteParams {
  const h = hashBody(hash);
  if (!h.startsWith("explore")) return {};
  const qIndex = h.indexOf("?");
  if (qIndex < 0) return {};
  const params = new URLSearchParams(h.slice(qIndex + 1));
  const sceneId = params.get("scene")?.trim() || undefined;
  return { sceneId };
}

/** Leave Explore → dialogue / classic editor. Optional deep link into a scene + Script Library. */
export function navigateToDialogueEditor(opts?: {
  sceneId?: string;
  openScripts?: boolean;
}): void {
  if (typeof location === "undefined") return;
  const params = new URLSearchParams();
  if (opts?.sceneId?.trim()) params.set("scene", opts.sceneId.trim());
  if (opts?.openScripts) params.set("scripts", "1");
  const q = params.toString();
  location.hash = q ? `dialogue?${q}` : "";
}

/** Open Explore shell via #explore (hashchange swaps root). Optional scene deep link. */
export function navigateToExploreEditor(opts?: { sceneId?: string }): void {
  if (typeof location === "undefined") return;
  const params = new URLSearchParams();
  if (opts?.sceneId?.trim()) params.set("scene", opts.sceneId.trim());
  const q = params.toString();
  location.hash = q ? `explore?${q}` : "explore";
}

export type ListedSceneKind = "dialogue" | "explore";

/**
 * Same rule as the host list and `sceneRawToCatalogEntry`: explicit explore,
 * or not explicit dialogue while hotspots are present. Anything else is dialogue.
 */
export function inferListedSceneKind(input: {
  sceneKind?: unknown;
  hotspots?: unknown;
}): ListedSceneKind {
  const kindRaw = input.sceneKind;
  const hasHotspots = Array.isArray(input.hotspots) && input.hotspots.length > 0;
  if (kindRaw === "explore" || (kindRaw !== "dialogue" && hasHotspots)) return "explore";
  return "dialogue";
}

/** Missing kind stays dialogue so old list fixtures do not bounce shells. */
export function editorForScene(kind: ListedSceneKind | undefined | null): ListedSceneKind {
  return kind === "explore" ? "explore" : "dialogue";
}

export function listedKindOf(
  scenes: { id: string; sceneKind?: ListedSceneKind | null }[],
  id: string,
  explicit?: ListedSceneKind | null,
): ListedSceneKind {
  if (explicit === "explore" || explicit === "dialogue") return explicit;
  return editorForScene(scenes.find((scene) => scene.id === id)?.sceneKind);
}

export type ShellStartup = { surface: ListedSceneKind; sceneId: string };

/**
 * One shot from a dialogue hash. An explore hash returns null so the shells
 * do not bounce. `honorHashScene` is the v2 deep link; classic keeps opening
 * the start scene unless the hash itself names an explore room.
 */
export function dialogueStartupDecision(
  hash: string,
  scenes: { id: string; sceneKind?: ListedSceneKind | null }[],
  startScene: string | undefined,
  honorHashScene: boolean,
): ShellStartup | null {
  if (editorRouteFromHash(hash) === "explore") return null;
  const hashScene = dialogueRouteParams(hash).sceneId;
  if (hashScene && listedKindOf(scenes, hashScene) === "explore") {
    return { surface: "explore", sceneId: hashScene };
  }
  const openId = honorHashScene && hashScene ? hashScene : startScene;
  if (!openId) return null;
  return { surface: listedKindOf(scenes, openId), sceneId: openId };
}

/**
 * Flush first. A throw leaves both shells alone so a refused leave never
 * changes the hash or the dialogue scene id.
 */
export async function commitSceneOpen(opts: {
  surface: ListedSceneKind;
  id: string;
  flush: () => Promise<unknown>;
  openDialogue: (id: string) => void;
  openExplore: (id: string) => void;
  fail?: (err: unknown) => void;
}): Promise<ListedSceneKind | "cancelled"> {
  try {
    await opts.flush();
  } catch (err) {
    opts.fail?.(err);
    return "cancelled";
  }
  if (opts.surface === "explore") opts.openExplore(opts.id);
  else opts.openDialogue(opts.id);
  return opts.surface;
}
