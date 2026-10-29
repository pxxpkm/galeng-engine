import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import home01 from "../../../examples/prologue/scenario/home_01.json";
import park01 from "../../../examples/prologue/scenario/park_01.json";
import park02 from "../../../examples/prologue/scenario/park_02.json";
import { previewState, beatStepAudio, type PreviewSnap } from "./previewState";
import type { Scene } from "./types";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const scenes: Record<string, Scene> = {
  park_01: park01 as Scene,
  home_01: home01 as Scene,
  park_02: park02 as Scene,
};

// E03 case 1. Same rows as fixtures/e03/inherit.json, which the player walks.
// Compared fields: bg, chars, bgm, cg, and say text. Not fades or audio timing.
describe("previewState", () => {
  it("matches the shared prologue fixture", () => {
    const fixture = JSON.parse(
      readFileSync(join(repoRoot, "fixtures/preview/prologue.json"), "utf8"),
    ) as PreviewSnap[];
    for (const expected of fixture) {
      const scene = scenes[expected.scene];
      expect(scene, expected.scene).toBeTruthy();
      expect(previewState(expected.scene, scene.beats, expected.beatIndex)).toEqual(expected);
    }
  });

  it("keeps a speaker-only beat as speaker with empty text", () => {
    const snap = previewState("x", [{ say: { speaker: "sora", text: "" } }], 0);
    expect(snap.saySpeaker).toBe("sora");
    expect(snap.sayText).toBe("");
    expect(snap.voice).toBeNull();
  });

  it("keeps park background on later beats", () => {
    const mid = previewState("park_01", (park01 as Scene).beats, 1);
    expect(mid.bg).toBe("bg/park_afternoon");
    expect(mid.sayText).toBe("今天風真好。");
    const last = previewState("park_01", (park01 as Scene).beats, 2);
    expect(last.bg).toBe("bg/park_afternoon");
    expect(last.cg).toBe("cg/op_still");
    expect(last.chars[0]?.face).toBe("blush");
  });

  it("matches the player on inherit and explicit clear", () => {
    const fixture = JSON.parse(readFileSync(join(repoRoot, "fixtures/e03/inherit.json"), "utf8")) as {
      scene: Scene;
      rows: { bg: string | null; chars: PreviewSnap["chars"]; bgm: string | null; cg: string | null; say: string }[];
    };
    fixture.rows.forEach((row, index) => {
      const snap = previewState(fixture.scene.id, fixture.scene.beats, index);
      expect(snap.bg).toBe(row.bg);
      expect(snap.chars).toEqual(row.chars);
      expect(snap.bgm).toBe(row.bgm);
      expect(snap.cg).toBe(row.cg);
      expect(snap.sayText).toBe(row.say);
    });
  });

  it("inherits camera in the scene and resets on null", () => {
    const beats = [
      { camera: { zoom: 160, x: 20 } },
      { say: { speaker: "sora", text: "近" } },
      { camera: null, say: { speaker: "sora", text: "遠" } },
    ];
    expect(previewState("x", beats, 1).camera).toEqual({ x: 20, y: 0, zoom: 160 });
    expect(previewState("x", beats, 2).camera).toBeUndefined();
  });
});

describe("beatStepAudio", () => {
  it("prefers voice over se, bgm, and amb", () => {
    const beat = {
      say: { speaker: "sora", text: "hi", voice: "voice/line1" },
      se: [{ asset: "se/click" }],
      bgm: { asset: "bgm/theme" },
      amb: "amb/wind",
    };
    expect(beatStepAudio(beat)).toBe("voice/line1");
  });

  it("falls back se, then bgm, then amb", () => {
    expect(beatStepAudio({ se: [{ asset: "se/click" }], bgm: { asset: "bgm/theme" } })).toBe(
      "se/click",
    );
    expect(beatStepAudio({ bgm: { asset: "bgm/theme" }, amb: "amb/wind" })).toBe("bgm/theme");
    expect(beatStepAudio({ amb: "amb/wind" })).toBe("amb/wind");
  });

  it("skips null bgm/amb and missing beats", () => {
    expect(beatStepAudio({ bgm: { asset: null }, amb: null })).toBeNull();
    expect(beatStepAudio(undefined)).toBeNull();
    expect(beatStepAudio({})).toBeNull();
  });
});
