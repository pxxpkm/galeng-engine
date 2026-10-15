/** Hash-based top-level editor route (#explore vs dialogue/classic). */

export type EditorRoute = "explore" | "dialogue";

/** `location.hash` with or without leading `#`. */
export function editorRouteFromHash(hash: string): EditorRoute {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  return h === "explore" ? "explore" : "dialogue";
}

/** Leave Explore → dialogue / classic editor (clear #explore). */
export function navigateToDialogueEditor(): void {
  if (typeof location === "undefined") return;
  if (editorRouteFromHash(location.hash) === "explore") {
    location.hash = "";
  }
}

/** Open Explore shell via #explore (hashchange swaps root). */
export function navigateToExploreEditor(): void {
  if (typeof location === "undefined") return;
  if (editorRouteFromHash(location.hash) !== "explore") {
    location.hash = "explore";
  }
}
