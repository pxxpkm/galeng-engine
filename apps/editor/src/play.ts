import { inferListedSceneKind } from "./editorRoute";

export async function launchPlay(opts: {
  dirty: boolean;
  save: () => Promise<unknown>;
  play: () => Promise<unknown>;
}): Promise<"played" | "saved-then-played"> {
  if (opts.dirty) {
    await opts.save();
    await opts.play();
    return "saved-then-played";
  }
  await opts.play();
  return "played";
}

export type PlayNotice = "dialogue-initial" | "explore-onenter" | "explore-not-start";

export type PlayBody = { scene: string; beat: number };

export type PlayDecision =
  | { action: "spawn"; body: PlayBody; notice: "dialogue-initial" | "explore-onenter" }
  | { action: "refuse"; notice: "explore-not-start" };

/**
 * What "Play from here" is allowed to spawn.
 *
 * Dialogue starts at this scene and beat with initial vars and inventory.
 * An explore room that is `startScene` still spawns: the player runs that
 * room's onEnter. Any other explore room must not call `/api/play`.
 * `load_from` only builds an Engine when the start scene is explore, and
 * `Engine::new` always enters `project.start_scene` (vm.rs:161-163).
 */
export function playFromHereDecision(input: {
  sceneId: string;
  beat: number;
  sceneKind?: unknown;
  hotspots?: unknown;
  startScene: string;
}): PlayDecision {
  const kind = inferListedSceneKind({
    sceneKind: input.sceneKind,
    hotspots: input.hotspots,
  });
  if (kind === "explore") {
    if (input.sceneId !== input.startScene) {
      return { action: "refuse", notice: "explore-not-start" };
    }
    return {
      action: "spawn",
      body: { scene: input.sceneId, beat: input.beat },
      notice: "explore-onenter",
    };
  }
  return {
    action: "spawn",
    body: { scene: input.sceneId, beat: input.beat },
    notice: "dialogue-initial",
  };
}

/** Explicit "play from the game opening", not from the room on screen. */
export function playFromStartBody(startScene: string): PlayBody {
  return { scene: startScene, beat: 0 };
}

export function playNoticeKey(notice: PlayNotice): string {
  switch (notice) {
    case "dialogue-initial":
      return "editor.playDialogueInitial";
    case "explore-onenter":
      return "editor.playExploreOnEnter";
    case "explore-not-start":
      return "editor.playExploreRefused";
  }
}

/** Refuse never calls `launch`. Spawn calls it once. */
export async function runPlayFromHere(opts: {
  decision: PlayDecision;
  launch: () => Promise<unknown>;
}): Promise<"spawned" | "refused"> {
  if (opts.decision.action === "refuse") return "refused";
  await opts.launch();
  return "spawned";
}
