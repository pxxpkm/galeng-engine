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
