import type { AssetMeta, Beat, CharOnStage, GalleryItem } from "./types";

/** Stable beat id: `b` + 16 lowercase hex digits. */
export const BEAT_ID_RE = /^b[0-9a-f]{16}$/;

export function mintBeatId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = "b";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * In-place JSON patch for `beats` arrays (dialogue or explore raw).
 * Keeps a legal id; otherwise spreads the object and assigns a new one.
 */
export function ensureBeatIds(beats: unknown): unknown[] {
  if (!Array.isArray(beats)) {
    return [];
  }
  return beats.map((el) => {
    if (el !== null && typeof el === "object" && !Array.isArray(el)) {
      const rec = el as Record<string, unknown>;
      if (typeof rec.id === "string" && BEAT_ID_RE.test(rec.id)) {
        return el;
      }
      return { ...rec, id: mintBeatId() };
    }
    return el;
  });
}

export const STAGE_SLOTS = ["left", "center", "right"] as const;
export type StageSlot = (typeof STAGE_SLOTS)[number];
export const MAX_STAGE_CHARS = 3;

export function slotOf(ch: CharOnStage): StageSlot {
  return ch.slot === "left" || ch.slot === "right" ? ch.slot : "center";
}

export function firstFreeSlot(chars: CharOnStage[]): StageSlot | null {
  const used = new Set(chars.map(slotOf));
  const order: StageSlot[] = ["center", "left", "right"];
  return order.find((s) => !used.has(s)) ?? null;
}

/** First unused id from `prefer`, else the first non-empty id, else "". */
export function fallbackStageCharId(
  prefer: Iterable<string>,
  existing?: CharOnStage[],
): string {
  const used = new Set((existing ?? []).map((ch) => ch.id).filter(Boolean));
  const all = [...prefer].map((id) => id.trim()).filter(Boolean);
  return all.find((id) => !used.has(id)) ?? all[0] ?? "";
}

/** Empty / whitespace `id` is a no-op (schema rejects ""). */
export function addStageChar(beat: Beat, id?: string): Beat {
  const chars = [...(beat.chars ?? [])];
  const slot = firstFreeSlot(chars);
  if (!slot) {
    return beat;
  }
  const trimmed = (id ?? "").trim();
  if (!trimmed) {
    return beat;
  }
  chars.push({ id: trimmed, face: "smile", slot });
  return { ...beat, chars };
}

export function removeStageChar(beat: Beat, index: number): Beat {
  const chars = (beat.chars ?? []).filter((_, i) => i !== index);
  if (chars.length === 0) {
    const next = { ...beat };
    delete next.chars;
    return next;
  }
  return { ...beat, chars };
}

export function patchStageChar(
  beat: Beat,
  index: number,
  patch: Partial<CharOnStage>,
): Beat {
  const chars = (beat.chars ?? []).map((ch) => ({ ...ch }));
  if (!chars[index]) {
    return beat;
  }
  const cleaned: Partial<CharOnStage> = { ...patch };
  if (cleaned.id !== undefined && !cleaned.id.trim()) {
    delete cleaned.id;
  }
  if (cleaned.face !== undefined && !cleaned.face.trim()) {
    delete cleaned.face;
  }
  const nextSlot = cleaned.slot;
  if (nextSlot === "left" || nextSlot === "center" || nextSlot === "right") {
    const stolen = chars.findIndex((ch, i) => i !== index && slotOf(ch) === nextSlot);
    const previous = slotOf(chars[index]!);
    chars[index] = { ...chars[index]!, ...cleaned, slot: nextSlot };
    if (stolen >= 0) {
      chars[stolen] = { ...chars[stolen]!, slot: previous };
    }
  } else {
    chars[index] = { ...chars[index]!, ...cleaned };
  }
  return { ...beat, chars };
}

export function setCharOffset(beat: Beat, index: number, x: number, y: number): Beat {
  const nextX = Number.isFinite(x) ? Math.round(x) : 0;
  const nextY = Number.isFinite(y) ? Math.round(y) : 0;
  const patched = patchStageChar(beat, index, { x: nextX, y: nextY });
  const chars = (patched.chars ?? []).map((ch, i) => {
    if (i !== index) {
      return ch;
    }
    const cleaned = { ...ch };
    if (!cleaned.x) {
      delete cleaned.x;
    }
    if (!cleaned.y) {
      delete cleaned.y;
    }
    return cleaned;
  });
  return { ...patched, chars };
}

export function setCharSlideMs(beat: Beat, index: number, raw: string): Beat {
  const chars = (beat.chars ?? []).map((ch, i) => ({ ...ch }));
  if (!chars[index]) {
    return beat;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    delete chars[index]!.slideMs;
    return { ...beat, chars };
  }
  const ms = Number(trimmed);
  if (!Number.isFinite(ms) || ms < 0) {
    return beat;
  }
  if (ms === 0) {
    delete chars[index]!.slideMs;
    return { ...beat, chars };
  }
  chars[index]!.slideMs = Math.round(ms);
  return { ...beat, chars };
}

export function upsertStageCharFromAsset(beat: Beat, id: string, face: string): Beat {
  const chars = [...(beat.chars ?? [])];
  const same = chars.findIndex((ch) => ch.id === id);
  if (same >= 0) {
    chars[same] = { ...chars[same]!, id, face };
    return { ...beat, chars };
  }
  const free = firstFreeSlot(chars);
  if (free) {
    chars.push({ id, face, slot: free });
    return { ...beat, chars };
  }
  if (chars.length === 0) {
    return { ...beat, chars: [{ id, face, slot: "center" }] };
  }
  const last = chars.length - 1;
  chars[last] = { id, face, slot: slotOf(chars[last]!) };
  return { ...beat, chars };
}

export function applyAsset(beat: Beat, asset: AssetMeta): Beat {
  const next: Beat = { ...beat };
  if (asset.logical.startsWith("voice/")) {
    if (next.say) {
      next.say = { ...next.say, voice: asset.logical };
    }
    return next;
  }
  if (asset.logical.startsWith("se/")) {
    next.se = [{ asset: asset.logical }];
    return next;
  }
  if (asset.logical.startsWith("amb/")) {
    next.amb = asset.logical;
    return next;
  }
  if (asset.kind === "audio" || asset.logical.startsWith("bgm/")) {
    next.bgm = { asset: asset.logical, fadeMs: next.bgm?.fadeMs };
    return next;
  }
  if (asset.logical.startsWith("cg/")) {
    next.cg = asset.logical;
    return next;
  }
  if (asset.logical.startsWith("char/")) {
    const parts = asset.logical.split("/");
    const id = parts[1] ?? "char";
    const face = parts[2] ?? "default";
    return upsertStageCharFromAsset(beat, id, face);
  }
  if (asset.kind === "movie" || asset.logical.startsWith("movie/")) {
    next.movie = { asset: asset.logical };
    return next;
  }
  next.bg = {
    asset: asset.logical,
    trans: next.bg?.trans,
    ms: next.bg?.ms,
  };
  return next;
}

export function setBg(beat: Beat, raw: string): Beat {
  const trimmed = raw.trim();
  if (!trimmed) {
    const next = { ...beat };
    delete next.bg;
    return next;
  }
  return {
    ...beat,
    bg: { asset: trimmed, trans: beat.bg?.trans, ms: beat.bg?.ms },
  };
}

export function setBgTrans(beat: Beat, trans: string): Beat {
  if (!beat.bg) {
    return beat;
  }
  const next = { ...beat.bg };
  if (!trans || trans === "none") {
    delete next.trans;
  } else {
    next.trans = trans;
  }
  return { ...beat, bg: next };
}

export function setBgMs(beat: Beat, raw: string): Beat {
  if (!beat.bg) {
    return beat;
  }
  const next = { ...beat.bg };
  if (raw === "") {
    delete next.ms;
  } else {
    const ms = Number(raw);
    if (!Number.isFinite(ms)) {
      return beat;
    }
    next.ms = ms;
  }
  return { ...beat, bg: next };
}

export function setMovie(beat: Beat, raw: string): Beat {
  const trimmed = raw.trim();
  if (!trimmed) {
    const next = { ...beat };
    delete next.movie;
    return next;
  }
  return { ...beat, movie: { asset: trimmed } };
}

export type FxKind = "none" | "wait" | "shake" | "flash";

export function setFx(beat: Beat, kind: FxKind, ms?: number): Beat {
  if (kind === "none") {
    const next = { ...beat };
    delete next.fx;
    return next;
  }
  if (kind === "wait") {
    const waitMs = ms !== undefined && Number.isFinite(ms) ? ms : 500;
    return { ...beat, fx: { type: "wait", ms: waitMs } };
  }
  if (kind === "flash") {
    if (ms !== undefined && Number.isFinite(ms)) {
      return { ...beat, fx: { type: "flash", ms } };
    }
    return { ...beat, fx: { type: "flash" } };
  }
  if (ms !== undefined && Number.isFinite(ms)) {
    return { ...beat, fx: { type: "shake", ms } };
  }
  return { ...beat, fx: { type: "shake" } };
}

export function applyAssetAt(beats: Beat[], index: number, asset: AssetMeta): Beat[] {
  if (index < 0 || index >= beats.length) {
    return beats;
  }
  const next = beats.slice();
  next[index] = applyAsset(next[index] ?? {}, asset);
  return next;
}

export function moveBeat(beats: Beat[], from: number, to: number): Beat[] {
  if (from === to) {
    return beats;
  }
  if (from < 0 || from >= beats.length || to < 0 || to >= beats.length) {
    return beats;
  }
  const next = beats.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item ?? {});
  return next;
}

/** Where `selected` lands after `moveBeat(beats, from, to)`. */
export function adjustIndexAfterMove(from: number, to: number, selected: number): number {
  if (selected === from) {
    return to;
  }
  if (from < to && selected > from && selected <= to) {
    return selected - 1;
  }
  if (from > to && selected >= to && selected < from) {
    return selected + 1;
  }
  return selected;
}

export function normalizeIndices(indices: number[], length: number): number[] {
  return [...new Set(indices)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < length)
    .sort((a, b) => a - b);
}

export function rangeIndices(from: number, to: number): number[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const next: number[] = [];
  for (let i = lo; i <= hi; i++) {
    next.push(i);
  }
  return next;
}

/** Toggle `index` in the set. Never returns empty — lone last item stays. */
export function toggleIndex(selected: number[], index: number): number[] {
  if (!Number.isInteger(index) || index < 0) {
    return selected;
  }
  const has = selected.includes(index);
  if (has) {
    const next = selected.filter((i) => i !== index);
    return next.length === 0 ? [index] : next.sort((a, b) => a - b);
  }
  return [...selected, index].sort((a, b) => a - b);
}

function insertAtAfterRemove(from: number[], to: number): number {
  const left = from.filter((i) => i < to).length;
  return left > 0 ? to - left + 1 : to;
}

/** Move `indices` as one block to `to`. Same-side rule as `moveBeat`. */
export function moveBeats(beats: Beat[], indices: number[], to: number): Beat[] {
  const from = normalizeIndices(indices, beats.length);
  if (from.length === 0 || to < 0 || to >= beats.length) {
    return beats;
  }
  if (from.length === 1) {
    return moveBeat(beats, from[0]!, to);
  }
  if (from.includes(to)) {
    return beats;
  }
  const insertAt = insertAtAfterRemove(from, to);
  const picked = from.map((i) => beats[i] ?? {});
  const remaining = beats.filter((_, i) => !from.includes(i));
  if (insertAt < 0 || insertAt > remaining.length) {
    return beats;
  }
  const next = remaining.slice();
  next.splice(insertAt, 0, ...picked);
  if (next.every((beat, i) => beat === beats[i])) {
    return beats;
  }
  return next;
}

export function adjustIndexAfterMoveBeats(
  indices: number[],
  to: number,
  selected: number,
  length: number,
): number {
  const from = normalizeIndices(indices, length);
  if (from.length === 0 || to < 0 || to >= length || from.includes(to)) {
    return selected;
  }
  if (from.length === 1) {
    return adjustIndexAfterMove(from[0]!, to, selected);
  }
  const insertAt = insertAtAfterRemove(from, to);
  const rank = from.indexOf(selected);
  if (rank >= 0) {
    return insertAt + rank;
  }
  let idx = selected;
  idx -= from.filter((i) => i < selected).length;
  if (insertAt <= idx) {
    idx += from.length;
  }
  return idx;
}

export function selectionAfterMoveBeats(indices: number[], to: number, length: number): number[] {
  const from = normalizeIndices(indices, length);
  if (from.length === 0 || to < 0 || to >= length || from.includes(to)) {
    return from;
  }
  if (from.length === 1) {
    return [adjustIndexAfterMove(from[0]!, to, from[0]!)];
  }
  const insertAt = insertAtAfterRemove(from, to);
  return from.map((_, rank) => insertAt + rank);
}

export function removeBeatsAt(beats: Beat[], indices: number[]): Beat[] {
  const from = normalizeIndices(indices, beats.length);
  if (from.length === 0 || from.length >= beats.length) {
    return beats;
  }
  return beats.filter((_, i) => !from.includes(i));
}

export function encodeBeatDrag(index: number, group?: number[]): string {
  const beats = [...new Set((group && group.length > 0 ? group : [index]).filter((n) => Number.isInteger(n) && n >= 0))].sort(
    (a, b) => a - b,
  );
  if (beats.length <= 1) {
    return JSON.stringify({ beat: index });
  }
  return JSON.stringify({ beat: index, beats });
}

export function parseBeatDrag(raw: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const beat = (parsed as { beat?: unknown }).beat;
  return typeof beat === "number" && Number.isInteger(beat) && beat >= 0 ? beat : null;
}

export function parseBeatDragSet(raw: string): number[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const rec = parsed as { beat?: unknown; beats?: unknown };
  if (Array.isArray(rec.beats)) {
    const set = rec.beats.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0);
    if (set.length > 0) {
      return [...new Set(set)].sort((a, b) => a - b);
    }
  }
  if (typeof rec.beat === "number" && Number.isInteger(rec.beat) && rec.beat >= 0) {
    return [rec.beat];
  }
  return null;
}

export function encodeAssetDrag(asset: AssetMeta): string {
  return JSON.stringify({ logical: asset.logical, kind: asset.kind });
}

export function parseAssetDrag(raw: string): AssetMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const rec = parsed as { logical?: unknown; kind?: unknown };
  if (typeof rec.logical !== "string" || rec.logical.length === 0) {
    return null;
  }
  if (typeof rec.kind !== "string") {
    return null;
  }
  return { logical: rec.logical, kind: rec.kind };
}

/** Next empty beat: keep speaker only. No text / voice / chars. */
export function newBeatAfter(prev: Beat | undefined): Beat {
  const id = mintBeatId();
  const speaker = prev?.say?.speaker?.trim() ?? "";
  if (!speaker) {
    return { id };
  }
  return { id, say: { speaker, text: "" } };
}

export function insertBeatAfter(beats: Beat[], index: number): Beat[] {
  const i = Math.max(-1, Math.min(index, beats.length - 1));
  const copy = beats.slice();
  copy.splice(i + 1, 0, newBeatAfter(copy[i]));
  return copy;
}

/** Deep-copy `index` and insert it at `index + 1`. Out of range is a no-op. */
export function duplicateBeat(beats: Beat[], index: number): Beat[] {
  if (index < 0 || index >= beats.length) {
    return beats;
  }
  const copy = beats.slice();
  const cloned = structuredClone(beats[index] ?? {}) as Beat;
  delete cloned.id;
  cloned.id = mintBeatId();
  copy.splice(index + 1, 0, cloned);
  return copy;
}

export function removeBeatAt(beats: Beat[], index: number): Beat[] {
  if (beats.length <= 1) {
    return beats;
  }
  return beats.filter((_, i) => i !== index);
}

export type AutoAdvance = { type: "voice" } | { type: "ms"; ms: number };

export function patchSay(
  beat: Beat,
  partial: {
    speaker?: string;
    text?: string;
    voice?: string | null;
    autoAdvance?: AutoAdvance | null;
  },
): Beat {
  const speaker = (partial.speaker ?? beat.say?.speaker ?? "").trim();
  const text = partial.text ?? beat.say?.text ?? "";
  const voice =
    partial.voice === null ? undefined : (partial.voice ?? beat.say?.voice);
  const autoAdvance =
    partial.autoAdvance === null ? undefined : (partial.autoAdvance ?? beat.say?.autoAdvance);
  if (!speaker && !text.trim()) {
    const next = { ...beat };
    delete next.say;
    return next;
  }
  const say: NonNullable<Beat["say"]> = { speaker, text };
  if (voice) {
    say.voice = voice;
  }
  if (autoAdvance) {
    say.autoAdvance = autoAdvance;
  }
  return { ...beat, say };
}

export function setAutoAdvance(beat: Beat, kind: "none" | "voice" | "ms", ms = 3000): Beat {
  if (!beat.say) {
    return beat;
  }
  if (kind === "none") {
    return patchSay(beat, { autoAdvance: null });
  }
  if (kind === "voice") {
    return patchSay(beat, { autoAdvance: { type: "voice" } });
  }
  return patchSay(beat, { autoAdvance: { type: "ms", ms } });
}

/** Empty / whitespace removes `voice`. No `say` → unchanged (do not invent a line). */
export function setSayVoice(beat: Beat, raw: string): Beat {
  if (!beat.say) {
    return beat;
  }
  const trimmed = raw.trim();
  return patchSay(beat, { voice: trimmed.length > 0 ? trimmed : null });
}

export function seDisplay(beat: Beat | undefined): string {
  return beat?.se?.[0]?.asset ?? "";
}

/** Empty / whitespace removes `se`. Always allowed (opening beats have SE and no say). */
export function setSe(beat: Beat, raw: string): Beat {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    const next = { ...beat };
    delete next.se;
    return next;
  }
  return { ...beat, se: [{ asset: trimmed }] };
}

export function cgDisplay(beat: Beat | undefined): string {
  if (beat?.cg === null) {
    return "";
  }
  return beat?.cg ?? "";
}

/** Empty / whitespace removes `cg` (inherit). */
export function setCg(beat: Beat, raw: string): Beat {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    const next = { ...beat };
    delete next.cg;
    return next;
  }
  return { ...beat, cg: trimmed };
}

export function closeCg(beat: Beat): Beat {
  return { ...beat, cg: null };
}

export function ambDisplay(beat: Beat | undefined): string {
  if (beat?.amb === null) {
    return "";
  }
  return beat?.amb ?? "";
}

/** Empty / whitespace removes `amb` (inherit). */
export function setAmb(beat: Beat, raw: string): Beat {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    const next = { ...beat };
    delete next.amb;
    return next;
  }
  return { ...beat, amb: trimmed };
}

export function closeAmb(beat: Beat): Beat {
  return { ...beat, amb: null };
}

export const CAMERA_MIN_ZOOM = 50;
export const CAMERA_MAX_ZOOM = 400;
export const CAMERA_DEFAULT_ZOOM = 100;

export type Camera = { x?: number; y?: number; zoom?: number };

export function cameraOf(beat: Beat | undefined): Camera | null | undefined {
  return beat?.camera;
}

export function cameraSummary(cam: Camera | null | undefined): string {
  if (cam === null) {
    return "off";
  }
  if (!cam) {
    return "—";
  }
  const x = cam.x ?? 0;
  const y = cam.y ?? 0;
  const zoom = cam.zoom ?? CAMERA_DEFAULT_ZOOM;
  if (x === 0 && y === 0 && zoom === CAMERA_DEFAULT_ZOOM) {
    return "100%";
  }
  return `${x},${y} ${zoom}%`;
}

function clampZoom(n: number): number {
  return Math.min(CAMERA_MAX_ZOOM, Math.max(CAMERA_MIN_ZOOM, Math.round(n)));
}

/** Empty / whitespace on all fields removes `camera` (inherit). */
export function setCamera(beat: Beat, patch: Camera): Beat {
  const x = patch.x ?? 0;
  const y = patch.y ?? 0;
  const zoom = patch.zoom ?? CAMERA_DEFAULT_ZOOM;
  const next: Camera = {};
  if (x !== 0) {
    next.x = x;
  }
  if (y !== 0) {
    next.y = y;
  }
  if (zoom !== CAMERA_DEFAULT_ZOOM) {
    next.zoom = clampZoom(zoom);
  }
  return { ...beat, camera: next };
}

export function inheritCamera(beat: Beat): Beat {
  const next = { ...beat };
  delete next.camera;
  return next;
}

export function resetCamera(beat: Beat): Beat {
  return { ...beat, camera: null };
}

export function setCameraField(beat: Beat, field: "x" | "y" | "zoom", raw: string): Beat {
  if (raw.trim() === "" && beat.camera === undefined) {
    return beat;
  }
  const prev = beat.camera === null || beat.camera === undefined ? {} : beat.camera;
  if (raw.trim() === "") {
    return setCamera(beat, {
      x: field === "x" ? 0 : (prev.x ?? 0),
      y: field === "y" ? 0 : (prev.y ?? 0),
      zoom: field === "zoom" ? CAMERA_DEFAULT_ZOOM : (prev.zoom ?? CAMERA_DEFAULT_ZOOM),
    });
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return beat;
  }
  return setCamera(beat, {
    x: field === "x" ? n : (prev.x ?? 0),
    y: field === "y" ? n : (prev.y ?? 0),
    zoom: field === "zoom" ? n : (prev.zoom ?? CAMERA_DEFAULT_ZOOM),
  });
}

/** Empty / whitespace removes `label`. Does not invent say. */
export function setBeatLabel(beat: Beat, raw: string): Beat {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    const next = { ...beat };
    delete next.label;
    return next;
  }
  return { ...beat, label: trimmed };
}

export function ensureGalleryItem(list: GalleryItem[] | undefined, asset: string): GalleryItem[] {
  const items = list ?? [];
  if (items.some((item) => item.asset === asset)) {
    return items;
  }
  const parts = asset.split("/").filter(Boolean);
  const id = parts[parts.length - 1] ?? asset;
  return [...items, { id, asset }];
}

export function beatSummary(beat: Beat): {
  bg: string;
  char: string;
  text: string;
  bgm: string;
  voice: string;
  se: string;
  amb: string;
  cg: string;
  camera: string;
  label: string;
} {
  const chars = beat.chars ?? [];
  return {
    bg: beat.bg?.asset ?? "—",
    char:
      chars.length === 0
        ? "—"
        : chars.map((ch) => `${ch.id}/${ch.face}`).join(" · "),
    text: beat.say?.text || "—",
    bgm: beat.bgm?.asset ?? "—",
    voice: beat.say?.voice || "—",
    se: beat.se?.[0]?.asset || "—",
    amb: beat.amb === null ? "off" : (beat.amb || "—"),
    cg: beat.cg === null ? "off" : (beat.cg || "—"),
    camera: cameraSummary(beat.camera),
    label: (beat.label ?? "").trim(),
  };
}

/** Collapsed inspector headers. Empty string = nothing to show. */
export function beatFoldSummary(beat: Beat): { stage: string; audio: string; visual: string } {
  const s = beatSummary(beat);
  const join = (parts: string[]) => parts.filter((p) => p.length > 0).join(" · ");
  return {
    stage: join([s.bg !== "—" ? s.bg : "", s.char !== "—" ? s.char : ""]),
    audio: join([
      s.bgm !== "—" ? s.bgm : "",
      s.se !== "—" ? s.se : "",
      s.amb !== "—" ? s.amb : "",
    ]),
    visual: join([
      s.cg !== "—" ? s.cg : "",
      s.camera !== "—" ? s.camera : "",
      beat.movie?.asset ?? "",
      beat.fx?.type ?? "",
    ]),
  };
}

export const TRACK_KEYS = ["bg", "char", "text", "bgm", "voice", "se", "amb", "cg"] as const;
export type TrackKey = (typeof TRACK_KEYS)[number];

/** `null` (explicit off) counts as content for amb／cg — clearing reverts to inherit. */
export function hasTrackContent(beat: Beat, track: TrackKey): boolean {
  switch (track) {
    case "bg":
      return Boolean(beat.bg);
    case "char":
      return (beat.chars ?? []).length > 0;
    case "text":
      return Boolean(beat.say);
    case "bgm":
      return Boolean(beat.bgm);
    case "voice":
      return Boolean(beat.say?.voice);
    case "se":
      return (beat.se ?? []).length > 0;
    case "amb":
      return beat.amb !== undefined;
    case "cg":
      return beat.cg !== undefined;
  }
}

/** Clear one track with delete-key (inherit) semantics; same reference when nothing to clear. */
export function clearBeatTrack(beat: Beat, track: TrackKey): Beat {
  if (!hasTrackContent(beat, track)) {
    return beat;
  }
  switch (track) {
    case "bg":
      return setBg(beat, "");
    case "char": {
      let next = beat;
      for (let i = (beat.chars ?? []).length - 1; i >= 0; i--) {
        next = removeStageChar(next, i);
      }
      return next;
    }
    case "text":
      return patchSay(beat, { speaker: "", text: "" });
    case "bgm": {
      const next = { ...beat };
      delete next.bgm;
      return next;
    }
    case "voice":
      return setSayVoice(beat, "");
    case "se":
      return setSe(beat, "");
    case "amb":
      return setAmb(beat, "");
    case "cg":
      return setCg(beat, "");
  }
}

/** Apply `asset` to every beat in `indices`. Empty／out-of-range set is a no-op. */
export function applyAssetToMany(beats: Beat[], indices: number[], asset: AssetMeta): Beat[] {
  const from = normalizeIndices(indices, beats.length);
  if (from.length === 0) {
    return beats;
  }
  const next = beats.slice();
  for (const i of from) {
    next[i] = applyAsset(next[i] ?? {}, asset);
  }
  return next;
}

/** Clear one track on every beat in `indices`. Same reference when nothing changes. */
export function clearBeatsTrack(beats: Beat[], indices: number[], track: TrackKey): Beat[] {
  const from = normalizeIndices(indices, beats.length);
  if (from.length === 0) {
    return beats;
  }
  const next = beats.slice();
  let changed = false;
  for (const i of from) {
    const cleared = clearBeatTrack(next[i] ?? {}, track);
    if (cleared !== next[i]) {
      next[i] = cleared;
      changed = true;
    }
  }
  return changed ? next : beats;
}

/** Remove `label` from every beat in `indices`. Same reference when nothing changes. */
export function clearBeatsLabel(beats: Beat[], indices: number[]): Beat[] {
  const from = normalizeIndices(indices, beats.length);
  if (from.length === 0) {
    return beats;
  }
  const next = beats.slice();
  let changed = false;
  for (const i of from) {
    const cur = next[i] ?? {};
    if (cur.label === undefined) {
      continue;
    }
    next[i] = setBeatLabel(cur, "");
    changed = true;
  }
  return changed ? next : beats;
}

export type PasteField = TrackKey | "speaker";

/**
 * Paste one field from `source` onto `target` (deep copy).
 * Missing on `source` mirrors clearing on `target` (delete key = inherit).
 * `speaker` goes through `patchSay` — invents `{ say: { speaker, text: "" } }` like `newBeatAfter`.
 * Same reference when the result is deeply equal.
 */
export function pasteBeatField(target: Beat, source: Beat, field: PasteField): Beat {
  let next: Beat;
  switch (field) {
    case "bg": {
      next = { ...target };
      if (source.bg) {
        next.bg = structuredClone(source.bg);
      } else {
        delete next.bg;
      }
      break;
    }
    case "char": {
      next = { ...target };
      if ((source.chars ?? []).length > 0) {
        next.chars = structuredClone(source.chars);
      } else {
        delete next.chars;
      }
      break;
    }
    case "text": {
      next = { ...target };
      if (source.say) {
        next.say = structuredClone(source.say);
      } else {
        delete next.say;
      }
      break;
    }
    case "speaker":
      next = patchSay(target, { speaker: source.say?.speaker ?? "" });
      break;
    case "voice":
      next = setSayVoice(target, source.say?.voice ?? "");
      break;
    case "bgm": {
      next = { ...target };
      if (source.bgm) {
        next.bgm = structuredClone(source.bgm);
      } else {
        delete next.bgm;
      }
      break;
    }
    case "se": {
      next = { ...target };
      if ((source.se ?? []).length > 0) {
        next.se = structuredClone(source.se);
      } else {
        delete next.se;
      }
      break;
    }
    case "amb": {
      next = { ...target };
      if (source.amb !== undefined) {
        next.amb = structuredClone(source.amb);
      } else {
        delete next.amb;
      }
      break;
    }
    case "cg": {
      next = { ...target };
      if (source.cg !== undefined) {
        next.cg = structuredClone(source.cg);
      } else {
        delete next.cg;
      }
      break;
    }
  }
  if (JSON.stringify(next) === JSON.stringify(target)) {
    return target;
  }
  return next;
}
