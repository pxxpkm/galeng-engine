import type { Beat, CharOnStage } from "./types";
import { CAMERA_DEFAULT_ZOOM, type Camera } from "./beats";
import { isAudibleLogical } from "./audition";

export type PreviewSnap = {
  scene: string;
  beatIndex: number;
  bg: string | null;
  chars: { id: string; face: string; slot: "left" | "center" | "right"; x?: number; y?: number }[];
  cg: string | null;
  bgm: string | null;
  saySpeaker: string | null;
  sayText: string | null;
  voice: string | null;
  camera?: { x: number; y: number; zoom: number };
};

function normalizeChar(ch: CharOnStage): PreviewSnap["chars"][number] {
  return {
    id: ch.id,
    face: ch.face,
    slot: ch.slot ?? "center",
    ...(ch.x ? { x: ch.x } : {}),
    ...(ch.y ? { y: ch.y } : {}),
  };
}

/** Visible state at the end of `index`, including leftover BG / chars / BGM / CG. */
export function previewState(sceneId: string, beats: Beat[], index: number): PreviewSnap {
  let bg: string | null = null;
  let chars: PreviewSnap["chars"] = [];
  let cg: string | null = null;
  let bgm: string | null = null;
  let camera: Camera | null = null;
  if (beats.length > 0) {
    const last = Math.min(beats.length - 1, Math.max(0, index));
    for (let i = 0; i <= last; i++) {
      const beat = beats[i];
      if (!beat) continue;
      if (beat.bg) {
        bg = beat.bg.asset;
      }
      if (beat.chars) {
        chars = beat.chars.map(normalizeChar);
      }
      if (beat.bgm) {
        bgm = beat.bgm.asset;
      }
      if (beat.cg !== undefined) {
        cg = beat.cg;
      }
      if (beat.camera !== undefined) {
        camera = beat.camera;
      }
    }
  }
  const cur = index >= 0 && index < beats.length ? beats[index] : undefined;
  const cam = {
    x: camera?.x ?? 0,
    y: camera?.y ?? 0,
    zoom: camera?.zoom ?? CAMERA_DEFAULT_ZOOM,
  };
  const hasCam = cam.x !== 0 || cam.y !== 0 || cam.zoom !== CAMERA_DEFAULT_ZOOM;
  return {
    scene: sceneId,
    beatIndex: index,
    bg,
    chars,
    cg,
    bgm,
    saySpeaker: cur?.say?.speaker ?? null,
    sayText: cur?.say?.text ?? null,
    voice: cur?.say?.voice ?? null,
    ...(hasCam ? { camera: cam } : {}),
  };
}

/** First audible path of a beat for step audition: voice, first SE, BGM, ambience. */
export function beatStepAudio(beat: Beat | undefined): string | null {
  if (!beat) {
    return null;
  }
  const candidates = [
    beat.say?.voice,
    beat.se?.[0]?.asset,
    beat.bgm?.asset ?? undefined,
    beat.amb ?? undefined,
  ];
  for (const candidate of candidates) {
    if (candidate && isAudibleLogical(candidate)) {
      return candidate;
    }
  }
  return null;
}
