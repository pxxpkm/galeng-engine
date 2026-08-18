import { describe, expect, it } from "vitest";
import { TRACK_KEYS, addStageChar, adjustIndexAfterMove, adjustIndexAfterMoveBeats, applyAsset, applyAssetAt, applyAssetToMany, beatFoldSummary, beatSummary, clearBeatsLabel, clearBeatsTrack, clearBeatTrack, closeAmb, closeCg, duplicateBeat, encodeAssetDrag, encodeBeatDrag, ensureGalleryItem, fallbackStageCharId, hasTrackContent, inheritCamera, insertBeatAfter, moveBeat, moveBeats, newBeatAfter, parseAssetDrag, parseBeatDrag, parseBeatDragSet, patchSay, patchStageChar, pasteBeatField, rangeIndices, removeBeatAt, removeBeatsAt, removeStageChar, resetCamera, seDisplay, selectionAfterMoveBeats, setAmb, setAutoAdvance, setBeatLabel, setBg, setBgMs, setBgTrans, setCamera, setCameraField, setCharOffset, setCharSlideMs, setCg, setFx, setMovie, setSayVoice, setSe, toggleIndex } from "./beats";
import type { Beat } from "./types";

describe("applyAsset", () => {
  it("puts bg/ on the background track", () => {
    const beat = applyAsset({}, { logical: "bg/park_afternoon", kind: "image" });
    expect(beat.bg?.asset).toBe("bg/park_afternoon");
  });

  it("puts char/id/face on the character track", () => {
    const beat = applyAsset({}, { logical: "char/sora/smile", kind: "image" });
    expect(beat.chars).toEqual([{ id: "sora", face: "smile", slot: "center" }]);
  });

  it("keeps the other character when applying a second face", () => {
    const one = applyAsset({}, { logical: "char/sora/smile", kind: "image" });
    const two = applyAsset(one, { logical: "char/yuki/blush", kind: "image" });
    expect(two.chars).toEqual([
      { id: "sora", face: "smile", slot: "center" },
      { id: "yuki", face: "blush", slot: "left" },
    ]);
    const face = applyAsset(two, { logical: "char/sora/blush", kind: "image" });
    expect(face.chars).toEqual([
      { id: "sora", face: "blush", slot: "center" },
      { id: "yuki", face: "blush", slot: "left" },
    ]);
  });

  it("replaces the last character when all three slots are full", () => {
    let beat: Beat = {};
    beat = applyAsset(beat, { logical: "char/a/1", kind: "image" });
    beat = applyAsset(beat, { logical: "char/b/1", kind: "image" });
    beat = applyAsset(beat, { logical: "char/c/1", kind: "image" });
    beat = applyAsset(beat, { logical: "char/d/2", kind: "image" });
    expect(beat.chars).toHaveLength(3);
    expect(beat.chars?.[2]).toEqual({ id: "d", face: "2", slot: "right" });
  });

  it("patches one row without deleting the other and swaps slots", () => {
    const beat: Beat = {
      chars: [
        { id: "sora", face: "smile", slot: "left" },
        { id: "yuki", face: "blush", slot: "right" },
      ],
    };
    const patched = patchStageChar(beat, 0, { face: "angry" });
    expect(patched.chars?.[0]).toEqual({ id: "sora", face: "angry", slot: "left" });
    expect(patched.chars?.[1]).toEqual({ id: "yuki", face: "blush", slot: "right" });
    const swapped = patchStageChar(patched, 0, { slot: "right" });
    expect(swapped.chars?.[0]?.slot).toBe("right");
    expect(swapped.chars?.[1]?.slot).toBe("left");
  });

  it("writes pixel offset and drops zeros", () => {
    const beat: Beat = {
      chars: [{ id: "sora", face: "smile", slot: "left" }],
    };
    expect(setCharOffset(beat, 0, 80, -20).chars?.[0]).toEqual({
      id: "sora",
      face: "smile",
      slot: "left",
      x: 80,
      y: -20,
    });
    expect(setCharOffset(beat, 0, 0, 0).chars?.[0]).toEqual({
      id: "sora",
      face: "smile",
      slot: "left",
    });
  });

  it("sets and clears slideMs", () => {
    const beat: Beat = { chars: [{ id: "sora", face: "smile", slot: "left" }] };
    expect(setCharSlideMs(beat, 0, "400").chars?.[0]?.slideMs).toBe(400);
    expect(setCharSlideMs(setCharSlideMs(beat, 0, "400"), 0, "").chars?.[0]?.slideMs).toBeUndefined();
  });

  it("adds up to three then refuses a fourth empty row", () => {
    const one = addStageChar({}, "sora");
    const two = addStageChar(one, "sora");
    const three = addStageChar(two, "sora");
    expect(three.chars).toHaveLength(3);
    expect(addStageChar(three, "sora").chars).toHaveLength(3);
    expect(removeStageChar(two, 0).chars).toEqual([{ id: "sora", face: "smile", slot: "left" }]);
  });

  it("does not add a row without a character id", () => {
    expect(addStageChar({})).toEqual({});
    expect(addStageChar({}, "  ")).toEqual({});
  });

  it("picks the first unused fallback id", () => {
    expect(fallbackStageCharId(["sora", "yuki"])).toBe("sora");
    expect(
      fallbackStageCharId(["sora", "yuki"], [{ id: "sora", face: "smile", slot: "center" }]),
    ).toBe("yuki");
    expect(fallbackStageCharId(["  ", "sora"])).toBe("sora");
    expect(fallbackStageCharId([])).toBe("");
  });

  it("puts bgm/ on the music track", () => {
    const beat = applyAsset({}, { logical: "bgm/park", kind: "audio" });
    expect(beat.bgm?.asset).toBe("bgm/park");
  });

  it("keeps fadeMs when applying another bgm", () => {
    const beat = applyAsset(
      { bgm: { asset: "bgm/park", fadeMs: 800 } },
      { logical: "bgm/other", kind: "audio" },
    );
    expect(beat.bgm).toEqual({ asset: "bgm/other", fadeMs: 800 });
  });

  it("puts voice/ on say.voice and does not touch bgm", () => {
    const beat = applyAsset(
      { say: { speaker: "sora", text: "今天風真好。" }, bgm: { asset: "bgm/park" } },
      { logical: "voice/sora/001", kind: "audio" },
    );
    expect(beat.say?.voice).toBe("voice/sora/001");
    expect(beat.bgm?.asset).toBe("bgm/park");
  });

  it("does not invent say when applying voice/ to an empty beat", () => {
    const beat = applyAsset({}, { logical: "voice/sora/001", kind: "audio" });
    expect(beat.say).toBeUndefined();
    expect(beat.bgm).toBeUndefined();
  });

  it("puts cg/ on beat.cg and does not touch bg", () => {
    const beat = applyAsset(
      { bg: { asset: "bg/park_afternoon" } },
      { logical: "cg/op_still", kind: "image" },
    );
    expect(beat.cg).toBe("cg/op_still");
    expect(beat.bg?.asset).toBe("bg/park_afternoon");
  });

  it("clears beat.cg with whitespace and closes with null", () => {
    expect(setCg({ cg: "cg/op_still" }, "  ")).toEqual({});
    expect(closeCg({ bg: { asset: "bg/park_afternoon" } })).toEqual({
      bg: { asset: "bg/park_afternoon" },
      cg: null,
    });
  });

  it("appends a new gallery asset once", () => {
    const once = ensureGalleryItem([{ id: "op_still", asset: "cg/op_still" }], "cg/op_still");
    expect(once).toHaveLength(1);
    const next = ensureGalleryItem(once, "cg/other");
    expect(next).toEqual([
      { id: "op_still", asset: "cg/op_still" },
      { id: "other", asset: "cg/other" },
    ]);
  });

  it("puts se/ on the se list", () => {
    const beat = applyAsset({}, { logical: "se/breeze", kind: "audio" });
    expect(beat.se).toEqual([{ asset: "se/breeze" }]);
    expect(beat.bgm).toBeUndefined();
    expect(beat.amb).toBeUndefined();
  });

  it("puts amb/ on beat.amb and does not write se", () => {
    const beat = applyAsset(
      { se: [{ asset: "se/breeze" }] },
      { logical: "amb/rain", kind: "audio" },
    );
    expect(beat.amb).toBe("amb/rain");
    expect(beat.se).toEqual([{ asset: "se/breeze" }]);
    expect(beat.bgm).toBeUndefined();
  });

  it("clears beat.amb with whitespace and closes with null", () => {
    expect(setAmb({ amb: "amb/rain" }, "  ")).toEqual({});
    expect(closeAmb({ se: [{ asset: "se/breeze" }] })).toEqual({
      se: [{ asset: "se/breeze" }],
      amb: null,
    });
  });

  it("puts movie/ on beat.movie and does not touch bg", () => {
    const beat = applyAsset(
      { bg: { asset: "bg/park_afternoon", trans: "fade", ms: 500 } },
      { logical: "movie/op", kind: "movie" },
    );
    expect(beat.movie).toEqual({ asset: "movie/op" });
    expect(beat.bg?.asset).toBe("bg/park_afternoon");
  });

  it("keeps bg trans when applying another background", () => {
    const beat = applyAsset(
      { bg: { asset: "bg/park_afternoon", trans: "fade", ms: 500 } },
      { logical: "bg/home", kind: "image" },
    );
    expect(beat.bg).toEqual({ asset: "bg/home", trans: "fade", ms: 500 });
  });

  it("sets and clears movie fx and bg fields", () => {
    const withBg = setBg({}, "bg/park_afternoon");
    expect(setBgTrans(withBg, "fade").bg?.trans).toBe("fade");
    expect(setBgMs(setBgTrans(withBg, "fade"), "400").bg?.ms).toBe(400);
    expect(setMovie({}, "movie/op").movie?.asset).toBe("movie/op");
    expect(setMovie({ movie: { asset: "movie/op" } }, "").movie).toBeUndefined();
    expect(setFx({}, "wait", 200).fx).toEqual({ type: "wait", ms: 200 });
    expect(setFx({}, "shake").fx).toEqual({ type: "shake" });
    expect(setFx({}, "flash").fx).toEqual({ type: "flash" });
    expect(setFx({}, "flash", 120).fx).toEqual({ type: "flash", ms: 120 });
    expect(setFx({ fx: { type: "wait", ms: 200 } }, "none").fx).toBeUndefined();
  });

  it("applyAssetAt only writes the target beat", () => {
    const beats: Beat[] = [{}, { say: { speaker: "sora", text: "hi" } }];
    const next = applyAssetAt(beats, 1, { logical: "bg/home", kind: "image" });
    expect(next[0]).toEqual({});
    expect(next[1]?.bg?.asset).toBe("bg/home");
    expect(next[1]?.say?.text).toBe("hi");
    expect(applyAssetAt(beats, 9, { logical: "bg/home", kind: "image" })).toBe(beats);
  });

  it("round-trips drag payload and rejects junk", () => {
    const asset = { logical: "char/sora/smile", kind: "image" };
    expect(parseAssetDrag(encodeAssetDrag(asset))).toEqual(asset);
    expect(parseAssetDrag("not-json")).toBeNull();
    expect(parseAssetDrag("{}")).toBeNull();
    expect(parseAssetDrag(JSON.stringify({ logical: "bg/x" }))).toBeNull();
  });
});

describe("insert and remove", () => {
  it("inserts an empty beat after a beat with no speaker", () => {
    const beats: Beat[] = [{ bg: { asset: "a" } }, { bg: { asset: "b" } }];
    const next = insertBeatAfter(beats, 0);
    expect(next).toHaveLength(3);
    expect(next[1]).toEqual({});
    expect(next[2]?.bg?.asset).toBe("b");
  });

  it("inherits speaker only after a line, not text voice or chars", () => {
    const beats: Beat[] = [
      {
        chars: [{ id: "sora", face: "smile", slot: "center" }],
        say: { speaker: "sora", text: "今天風真好。", voice: "voice/sora/001", autoAdvance: { type: "voice" } },
      },
      { label: "later" },
    ];
    const next = insertBeatAfter(beats, 0);
    expect(next).toHaveLength(3);
    expect(next[1]).toEqual({ say: { speaker: "sora", text: "" } });
    expect(next[1]?.chars).toBeUndefined();
    expect(next[0]?.say?.text).toBe("今天風真好。");
    expect(next[2]?.label).toBe("later");
  });

  it("treats a blank speaker as an empty beat", () => {
    expect(newBeatAfter({ say: { speaker: "  ", text: "x" } })).toEqual({});
    expect(newBeatAfter({})).toEqual({});
    expect(newBeatAfter(undefined)).toEqual({});
  });

  it("refuses to delete the last beat", () => {
    expect(removeBeatAt([{}], 0)).toHaveLength(1);
  });

  it("deletes a middle beat", () => {
    const next = removeBeatAt([{ label: "a" }, { label: "b" }, { label: "c" }], 1);
    expect(next.map((b) => b.label)).toEqual(["a", "c"]);
  });
});

describe("duplicateBeat", () => {
  it("inserts a deep copy after the index", () => {
    const beats: Beat[] = [
      { label: "a", say: { speaker: "sora", text: "hi" }, chars: [{ id: "sora", face: "smile" }] },
      { label: "b" },
    ];
    const next = duplicateBeat(beats, 0);
    expect(next).toHaveLength(3);
    expect(next[0]?.label).toBe("a");
    expect(next[1]?.label).toBe("a");
    expect(next[2]?.label).toBe("b");
    expect(next[1]).toEqual(next[0]);
    expect(next[1]).not.toBe(next[0]);
    expect(next[1]?.say).not.toBe(next[0]?.say);
    expect(next[1]?.chars).not.toBe(next[0]?.chars);
    next[1]!.say!.text = "yo";
    next[1]!.chars![0]!.face = "blush";
    expect(next[0]?.say?.text).toBe("hi");
    expect(next[0]?.chars?.[0]?.face).toBe("smile");
  });

  it("no-ops out of range", () => {
    const beats: Beat[] = [{ label: "a" }];
    expect(duplicateBeat(beats, -1)).toBe(beats);
    expect(duplicateBeat(beats, 1)).toBe(beats);
    expect(duplicateBeat([], 0)).toBeInstanceOf(Array);
    expect(duplicateBeat([], 0)).toHaveLength(0);
  });
});

describe("moveBeat", () => {
  const beats: Beat[] = [{ label: "a" }, { label: "b" }, { label: "c" }];

  it("moves first to last", () => {
    expect(moveBeat(beats, 0, 2).map((b) => b.label)).toEqual(["b", "c", "a"]);
  });

  it("moves last to first", () => {
    expect(moveBeat(beats, 2, 0).map((b) => b.label)).toEqual(["c", "a", "b"]);
  });

  it("no-ops same index or out of range", () => {
    expect(moveBeat(beats, 1, 1)).toBe(beats);
    expect(moveBeat(beats, -1, 0)).toBe(beats);
    expect(moveBeat(beats, 0, 9)).toBe(beats);
  });

  it("adjusts the selected index", () => {
    expect(adjustIndexAfterMove(0, 2, 0)).toBe(2);
    expect(adjustIndexAfterMove(0, 2, 2)).toBe(1);
    expect(adjustIndexAfterMove(0, 2, 3)).toBe(3);
    expect(adjustIndexAfterMove(2, 0, 0)).toBe(1);
    expect(adjustIndexAfterMove(2, 0, 2)).toBe(0);
  });

  it("distinguishes beat drag from asset drag", () => {
    expect(parseBeatDrag(encodeBeatDrag(3))).toBe(3);
    expect(parseBeatDrag(encodeAssetDrag({ logical: "bg/x", kind: "image" }))).toBeNull();
    expect(parseAssetDrag(encodeBeatDrag(1))).toBeNull();
  });
});

describe("moveBeats", () => {
  const beats: Beat[] = [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "d" }, { label: "e" }];

  it("moves a block right like arrayMove", () => {
    expect(moveBeats(beats, [1, 2], 4).map((b) => b.label)).toEqual(["a", "d", "e", "b", "c"]);
  });

  it("moves a block left", () => {
    expect(moveBeats(beats, [3, 4], 0).map((b) => b.label)).toEqual(["d", "e", "a", "b", "c"]);
  });

  it("packs a non-contiguous set", () => {
    expect(moveBeats(beats, [0, 2], 4).map((b) => b.label)).toEqual(["b", "d", "e", "a", "c"]);
  });

  it("delegates a single index to moveBeat", () => {
    expect(moveBeats(beats, [0], 4).map((b) => b.label)).toEqual(moveBeat(beats, 0, 4).map((b) => b.label));
    expect(moveBeats(beats, [4], 0).map((b) => b.label)).toEqual(moveBeat(beats, 4, 0).map((b) => b.label));
  });

  it("no-ops drop on self, empty, or out of range", () => {
    expect(moveBeats(beats, [1, 2], 2)).toBe(beats);
    expect(moveBeats(beats, [], 1)).toBe(beats);
    expect(moveBeats(beats, [1, 2], 9)).toBe(beats);
  });

  it("adjusts focus and the new selection", () => {
    expect(adjustIndexAfterMoveBeats([1, 2], 4, 1, 5)).toBe(3);
    expect(adjustIndexAfterMoveBeats([1, 2], 4, 2, 5)).toBe(4);
    expect(adjustIndexAfterMoveBeats([1, 2], 4, 0, 5)).toBe(0);
    expect(adjustIndexAfterMoveBeats([1, 2], 4, 4, 5)).toBe(2);
    expect(selectionAfterMoveBeats([1, 2], 4, 5)).toEqual([3, 4]);
    expect(adjustIndexAfterMoveBeats([0], 4, 0, 5)).toBe(adjustIndexAfterMove(0, 4, 0));
  });

  it("builds a shift range and toggles without emptying", () => {
    expect(rangeIndices(2, 0)).toEqual([0, 1, 2]);
    expect(toggleIndex([1], 3)).toEqual([1, 3]);
    expect(toggleIndex([1, 3], 1)).toEqual([3]);
    expect(toggleIndex([3], 3)).toEqual([3]);
  });

  it("deletes a set but refuses to delete every beat", () => {
    expect(removeBeatsAt(beats, [1, 2]).map((b) => b.label)).toEqual(["a", "d", "e"]);
    expect(removeBeatsAt(beats, [0, 1, 2, 3, 4])).toBe(beats);
    expect(removeBeatAt(beats, 1).map((b) => b.label)).toEqual(["a", "c", "d", "e"]);
  });

  it("encodes a group without breaking single-beat parse", () => {
    expect(parseBeatDragSet(encodeBeatDrag(2, [1, 2]))).toEqual([1, 2]);
    expect(parseBeatDrag(encodeBeatDrag(2, [1, 2]))).toBe(2);
    expect(parseBeatDragSet(encodeBeatDrag(3))).toEqual([3]);
    expect(parseBeatDragSet(encodeAssetDrag({ logical: "bg/x", kind: "image" }))).toBeNull();
  });
});

describe("say voice", () => {
  const lined: Beat = { say: { speaker: "sora", text: "今天風真好。", voice: "voice/sora/001" } };

  it("sets a logical path", () => {
    const next = setSayVoice({ say: { speaker: "sora", text: "hi" } }, " voice/sora/002 ");
    expect(next.say?.voice).toBe("voice/sora/002");
  });

  it("clears voice with whitespace and does not keep an empty key", () => {
    const next = setSayVoice(lined, "   ");
    expect(next.say).toEqual({ speaker: "sora", text: "今天風真好。" });
    expect(next.say && "voice" in next.say).toBe(false);
  });

  it("does not invent say when the beat has no line", () => {
    expect(setSayVoice({}, "voice/sora/001")).toEqual({});
  });

  it("keeps voice when speaker or text changes", () => {
    const next = patchSay(lined, { text: "風還不錯。" });
    expect(next.say?.voice).toBe("voice/sora/001");
    expect(next.say?.text).toBe("風還不錯。");
  });

  it("drops say when speaker and text are both empty", () => {
    expect(patchSay(lined, { speaker: "  ", text: "  " })).toEqual({});
    expect(patchSay({}, { speaker: "", text: "" })).toEqual({});
  });

  it("sets and clears autoAdvance without inventing say", () => {
    expect(setAutoAdvance({}, "ms")).toEqual({});
    const withAuto = setAutoAdvance({ say: { speaker: "sora", text: "hi" } }, "ms", 1200);
    expect(withAuto.say?.autoAdvance).toEqual({ type: "ms", ms: 1200 });
    const kept = patchSay(withAuto, { text: "yo" });
    expect(kept.say?.autoAdvance).toEqual({ type: "ms", ms: 1200 });
    expect(setAutoAdvance(withAuto, "none").say?.autoAdvance).toBeUndefined();
  });
});

describe("se field", () => {
  it("sets a single asset and shows it", () => {
    const next = setSe({}, " se/breeze ");
    expect(next.se).toEqual([{ asset: "se/breeze" }]);
    expect(seDisplay(next)).toBe("se/breeze");
  });

  it("clears se and does not keep an empty list", () => {
    const next = setSe({ se: [{ asset: "se/breeze" }] }, "  ");
    expect(next.se).toBeUndefined();
    expect("se" in next).toBe(false);
    expect(seDisplay(next)).toBe("");
  });

  it("overwrites a longer list with one item", () => {
    const next = setSe({ se: [{ asset: "a" }, { asset: "b" }] }, "se/breeze");
    expect(next.se).toEqual([{ asset: "se/breeze" }]);
  });

  it("can set se on a beat with no say", () => {
    const next = setSe({ bg: { asset: "bg/park_afternoon" } }, "se/breeze");
    expect(next.say).toBeUndefined();
    expect(next.se).toEqual([{ asset: "se/breeze" }]);
  });
});

describe("camera field", () => {
  it("writes x y zoom and omits identity keys", () => {
    expect(setCamera({}, { x: 80, y: -40, zoom: 160 })).toEqual({
      camera: { x: 80, y: -40, zoom: 160 },
    });
    expect(setCamera({ bg: { asset: "bg/park" } }, { x: 0, y: 0, zoom: 100 })).toEqual({
      bg: { asset: "bg/park" },
      camera: {},
    });
  });

  it("inherits by deleting the key and resets with null", () => {
    expect(inheritCamera({ camera: { zoom: 160 }, label: "a" })).toEqual({ label: "a" });
    expect(resetCamera({ bg: { asset: "bg/park" } })).toEqual({
      bg: { asset: "bg/park" },
      camera: null,
    });
  });

  it("patches one field from inherit", () => {
    expect(setCameraField({}, "zoom", "200")).toEqual({ camera: { zoom: 200 } });
    expect(setCameraField({ camera: { x: 10 } }, "y", "-20")).toEqual({
      camera: { x: 10, y: -20 },
    });
  });
});

describe("setBeatLabel", () => {
  it("sets a trimmed label without inventing say", () => {
    const next = setBeatLabel({ bg: { asset: "bg/park_afternoon" } }, "  過場  ");
    expect(next.label).toBe("過場");
    expect(next.say).toBeUndefined();
    expect(next.bg?.asset).toBe("bg/park_afternoon");
    expect(JSON.stringify(next)).toContain('"label":"過場"');
  });

  it("clears label with whitespace and does not keep an empty key", () => {
    const next = setBeatLabel({ label: "過場", say: { speaker: "sora", text: "hi" } }, "   ");
    expect(next.label).toBeUndefined();
    expect("label" in next).toBe(false);
    expect(next.say?.text).toBe("hi");
    expect(JSON.stringify(next)).not.toContain("label");
  });
});

describe("beatSummary", () => {
  it("does not use a clock", () => {
    const s = beatSummary({ say: { speaker: "sora", text: "hi" } });
    expect(s.text).toBe("hi");
    expect(JSON.stringify(s)).not.toMatch(/\d{2}:\d{2}/);
  });

  it("shows voice and se or a dash", () => {
    const empty = beatSummary({ say: { speaker: "sora", text: "hi" } });
    expect(empty.voice).toBe("—");
    expect(empty.se).toBe("—");
    expect(empty.amb).toBe("—");
    const full = beatSummary({
      say: { speaker: "sora", text: "今天風真好。", voice: "voice/sora/001" },
      se: [{ asset: "se/breeze" }],
      amb: "amb/rain",
    });
    expect(full.voice).toBe("voice/sora/001");
    expect(full.se).toBe("se/breeze");
    expect(full.amb).toBe("amb/rain");
    expect(JSON.stringify(full)).not.toMatch(/\d{2}:\d{2}/);
  });

  it("exposes a trimmed label or empty, never a clock", () => {
    expect(beatSummary({}).label).toBe("");
    expect(beatSummary({ label: "  過場  " }).label).toBe("過場");
  });

  it("summarises folded inspector groups", () => {
    expect(beatFoldSummary({})).toEqual({ stage: "", audio: "", visual: "" });
    expect(
      beatFoldSummary({
        bg: { asset: "bg/park" },
        chars: [{ id: "sora", face: "smile" }],
        bgm: { asset: "bgm/park" },
        se: [{ asset: "se/breeze" }],
        amb: "amb/rain",
        cg: "cg/op_still",
        movie: { asset: "movie/op" },
        fx: { type: "shake" },
      }),
    ).toEqual({
      stage: "bg/park · sora/smile",
      audio: "bgm/park · se/breeze · amb/rain",
      visual: "cg/op_still · movie/op · shake",
    });
  });

  it("lists every character on stage", () => {
    const s = beatSummary({
      chars: [
        { id: "sora", face: "smile", slot: "left" },
        { id: "yuki", face: "blush", slot: "right" },
      ],
    });
    expect(s.char).toBe("sora/smile · yuki/blush");
  });
});

describe("clearBeatTrack", () => {
  const full: Beat = {
    bg: { asset: "bg/park" },
    chars: [
      { id: "sora", face: "smile", slot: "center" },
      { id: "yuki", face: "blush", slot: "left" },
    ],
    say: { speaker: "sora", text: "hi", voice: "voice/sora/001" },
    bgm: { asset: "bgm/park", fadeMs: 800 },
    se: [{ asset: "se/breeze" }],
    amb: null,
    cg: "cg/op_still",
  };

  it("clears every track with delete-key (inherit) semantics", () => {
    expect(clearBeatTrack(full, "bg").bg).toBeUndefined();
    expect(clearBeatTrack(full, "char").chars).toBeUndefined();
    expect(clearBeatTrack(full, "text").say).toBeUndefined();
    expect(clearBeatTrack(full, "bgm").bgm).toBeUndefined();
    const voice = clearBeatTrack(full, "voice");
    expect(voice.say?.voice).toBeUndefined();
    expect(voice.say?.text).toBe("hi");
    expect(clearBeatTrack(full, "se").se).toBeUndefined();
    expect(clearBeatTrack(full, "amb").amb).toBeUndefined();
    expect(clearBeatTrack(full, "cg").cg).toBeUndefined();
  });

  it("treats null-off amb／cg as content", () => {
    expect(hasTrackContent({ amb: null }, "amb")).toBe(true);
    expect(hasTrackContent({ cg: null }, "cg")).toBe(true);
    expect(hasTrackContent({}, "amb")).toBe(false);
    expect(hasTrackContent({}, "cg")).toBe(false);
  });

  it("returns the same reference when there is nothing to clear", () => {
    const empty: Beat = {};
    for (const track of TRACK_KEYS) {
      expect(hasTrackContent(empty, track)).toBe(false);
      expect(clearBeatTrack(empty, track)).toBe(empty);
    }
  });
});

describe("batch helpers", () => {
  it("applies an asset to every indexed beat", () => {
    const beats: Beat[] = [{}, { say: { speaker: "sora", text: "hi" } }, {}];
    const next = applyAssetToMany(beats, [0, 2], { logical: "bg/park", kind: "image" });
    expect(next[0]?.bg?.asset).toBe("bg/park");
    expect(next[1]?.bg).toBeUndefined();
    expect(next[1]?.say?.text).toBe("hi");
    expect(next[2]?.bg?.asset).toBe("bg/park");
  });

  it("returns the same array for empty or out-of-range index sets", () => {
    const beats: Beat[] = [{}, {}];
    expect(applyAssetToMany(beats, [], { logical: "bg/park", kind: "image" })).toBe(beats);
    expect(applyAssetToMany(beats, [5], { logical: "bg/park", kind: "image" })).toBe(beats);
    expect(clearBeatsTrack(beats, [9], "bg")).toBe(beats);
    expect(clearBeatsLabel(beats, [])).toBe(beats);
  });

  it("clears one track across the selection", () => {
    const beats: Beat[] = [
      { bg: { asset: "bg/a" } },
      {},
      { bg: { asset: "bg/b" }, say: { speaker: "sora", text: "hi" } },
    ];
    const next = clearBeatsTrack(beats, [0, 1, 2], "bg");
    expect(next[0]?.bg).toBeUndefined();
    expect(next[2]?.bg).toBeUndefined();
    expect(next[2]?.say?.text).toBe("hi");
  });

  it("keeps the same reference when no beat has the track", () => {
    const beats: Beat[] = [{}, { say: { speaker: "sora", text: "hi" } }];
    expect(clearBeatsTrack(beats, [0, 1], "bg")).toBe(beats);
  });

  it("removes labels only from beats that have one", () => {
    const beats: Beat[] = [{ label: "A" }, {}, { label: "B" }];
    const next = clearBeatsLabel(beats, [0, 1, 2]);
    expect(next[0]?.label).toBeUndefined();
    expect(next[2]?.label).toBeUndefined();
    expect(clearBeatsLabel([{}, {}], [0, 1])).toEqual([{}, {}]);
    const plain: Beat[] = [{}, { say: { speaker: "s", text: "t" } }];
    expect(clearBeatsLabel(plain, [0, 1])).toBe(plain);
  });
});

describe("pasteBeatField", () => {
  const source: Beat = {
    bg: { asset: "bg/park" },
    chars: [{ id: "sora", face: "smile", slot: "center" }],
    say: { speaker: "sora", text: "hi", voice: "voice/sora/001" },
    amb: null,
  };

  it("overwrites one field without touching the rest", () => {
    const target: Beat = { bg: { asset: "bg/home" }, se: [{ asset: "se/click" }] };
    const next = pasteBeatField(target, source, "bg");
    expect(next.bg?.asset).toBe("bg/park");
    expect(next.se).toEqual([{ asset: "se/click" }]);
    expect(next.bg).not.toBe(source.bg);
  });

  it("clears the field when the source lacks it", () => {
    const target: Beat = { bg: { asset: "bg/home" }, cg: "cg/op" };
    expect(pasteBeatField(target, source, "cg").cg).toBeUndefined();
    expect(pasteBeatField(target, { say: { speaker: "s", text: "t" } }, "bg").bg).toBeUndefined();
  });

  it("copies amb null (explicit off) as a value", () => {
    const target: Beat = { amb: "amb/rain" };
    expect(pasteBeatField(target, source, "amb").amb).toBeNull();
  });

  it("pastes speaker onto a beat without say", () => {
    const next = pasteBeatField({}, source, "speaker");
    expect(next.say).toEqual({ speaker: "sora", text: "" });
  });

  it("keeps target text when pasting speaker onto an existing line", () => {
    const next = pasteBeatField({ say: { speaker: "yuki", text: "yo" } }, source, "speaker");
    expect(next.say).toEqual({ speaker: "sora", text: "yo" });
  });

  it("is a no-op for voice when target has no say", () => {
    const target: Beat = { bg: { asset: "bg/home" } };
    expect(pasteBeatField(target, source, "voice")).toBe(target);
  });

  it("returns the same reference when nothing changes", () => {
    const target: Beat = { bg: { asset: "bg/park" } };
    expect(pasteBeatField(target, source, "bg")).toBe(target);
    expect(pasteBeatField({}, {}, "bg")).toEqual({});
  });
});
