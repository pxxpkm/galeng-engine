import type { AssetMeta, Beat, Scene } from "./types";

export type SearchKind =
  | "text"
  | "choice"
  | "label"
  | "speaker"
  | "goto"
  | "scene"
  | "asset";

export interface SearchHit {
  sceneId: string;
  sceneTitle?: string;
  beatIndex: number | null;
  kind: SearchKind;
  preview: string;
}

export interface SearchRecord {
  sceneId: string;
  sceneTitle?: string;
  beatIndex: number | null;
  kind: SearchKind;
  text: string;
}

const KIND_RANK: Record<SearchKind, number> = {
  text: 0,
  choice: 1,
  label: 2,
  speaker: 3,
  goto: 4,
  scene: 5,
  asset: 6,
};

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function overlayScenes(scenes: Scene[], current: Scene | null): Scene[] {
  if (!current) {
    return scenes;
  }
  const index = scenes.findIndex((item) => item.id === current.id);
  if (index < 0) {
    return [...scenes, current];
  }
  const next = scenes.slice();
  next[index] = current;
  return next;
}

export function clampBeatIndex(want: number | null | undefined, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (want == null || !Number.isFinite(want)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.trunc(want), length - 1));
}

function addRecord(out: SearchRecord[], rec: SearchRecord): void {
  const text = rec.text.trim();
  if (!text) {
    return;
  }
  out.push({ ...rec, text });
}

function recordsOfBeat(scene: Scene, beat: Beat, index: number, out: SearchRecord[]): void {
  const base = { sceneId: scene.id, sceneTitle: scene.title, beatIndex: index };
  if (beat.say?.text) {
    addRecord(out, { ...base, kind: "text", text: beat.say.text });
  }
  if (beat.say?.speaker) {
    addRecord(out, { ...base, kind: "speaker", text: beat.say.speaker });
  }
  if (beat.say?.voice) {
    addRecord(out, { ...base, kind: "asset", text: beat.say.voice });
  }
  if (beat.label) {
    addRecord(out, { ...base, kind: "label", text: beat.label });
  }
  if (beat.bg?.asset) {
    addRecord(out, { ...base, kind: "asset", text: beat.bg.asset });
  }
  if (beat.bgm?.asset) {
    addRecord(out, { ...base, kind: "asset", text: beat.bgm.asset });
  }
  if (beat.movie?.asset) {
    addRecord(out, { ...base, kind: "asset", text: beat.movie.asset });
  }
  if (typeof beat.cg === "string" && beat.cg) {
    addRecord(out, { ...base, kind: "asset", text: beat.cg });
  }
  if (typeof beat.amb === "string" && beat.amb) {
    addRecord(out, { ...base, kind: "asset", text: beat.amb });
  }
  for (const se of beat.se ?? []) {
    if (se.asset) {
      addRecord(out, { ...base, kind: "asset", text: se.asset });
    }
  }
  for (const ch of beat.chars ?? []) {
    if (ch.id) {
      addRecord(out, { ...base, kind: "speaker", text: ch.id });
    }
  }
}

function recordsOfExit(scene: Scene, out: SearchRecord[]): void {
  const exit = scene.exit;
  if (!exit) {
    return;
  }
  const beatIndex = scene.beats.length > 0 ? scene.beats.length - 1 : 0;
  const base = { sceneId: scene.id, sceneTitle: scene.title, beatIndex };
  if (exit.type === "next") {
    addRecord(out, { ...base, kind: "goto", text: exit.goto ?? "" });
    return;
  }
  if (exit.type === "choices") {
    for (const opt of exit.options ?? []) {
      addRecord(out, { ...base, kind: "choice", text: opt.text ?? "" });
      addRecord(out, { ...base, kind: "goto", text: opt.goto ?? "" });
    }
    return;
  }
  addRecord(out, { ...base, kind: "goto", text: exit.then ?? "" });
  addRecord(out, { ...base, kind: "goto", text: exit.else ?? "" });
}

export function indexScenes(scenes: Scene[], assets: AssetMeta[] = []): SearchRecord[] {
  const out: SearchRecord[] = [];
  for (const scene of scenes) {
    addRecord(out, {
      sceneId: scene.id,
      sceneTitle: scene.title,
      beatIndex: null,
      kind: "scene",
      text: scene.id,
    });
    if (scene.title) {
      addRecord(out, {
        sceneId: scene.id,
        sceneTitle: scene.title,
        beatIndex: null,
        kind: "scene",
        text: scene.title,
      });
    }
    scene.beats.forEach((beat, index) => recordsOfBeat(scene, beat, index, out));
    recordsOfExit(scene, out);
  }
  const used = new Set(
    out.filter((rec) => rec.kind === "asset").map((rec) => rec.text.toLowerCase()),
  );
  for (const asset of assets) {
    const logical = asset.logical.trim();
    if (!logical || used.has(logical.toLowerCase())) {
      continue;
    }
    addRecord(out, {
      sceneId: "",
      beatIndex: null,
      kind: "asset",
      text: logical,
    });
  }
  return out;
}

function dedupKey(rec: SearchRecord): string {
  return `${rec.sceneId}\0${rec.beatIndex ?? ""}\0${rec.kind}\0${rec.text.toLowerCase()}`;
}

export function searchProject(
  query: string,
  scenes: Scene[],
  assets: AssetMeta[] = [],
): SearchHit[] {
  const q = normalizeQuery(query);
  if (!q) {
    return [];
  }
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const rec of indexScenes(scenes, assets)) {
    if (!rec.text.toLowerCase().includes(q)) {
      continue;
    }
    const key = dedupKey(rec);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hits.push({
      sceneId: rec.sceneId,
      sceneTitle: rec.sceneTitle,
      beatIndex: rec.beatIndex,
      kind: rec.kind,
      preview: rec.text,
    });
  }
  hits.sort((a, b) => {
    const kind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kind !== 0) {
      return kind;
    }
    const scene = a.sceneId.localeCompare(b.sceneId);
    if (scene !== 0) {
      return scene;
    }
    return (a.beatIndex ?? -1) - (b.beatIndex ?? -1);
  });
  return hits;
}

export async function loadScenesForSearch(
  metas: { id: string }[],
  current: Scene | null,
  fetchScene: (id: string) => Promise<Scene>,
): Promise<Scene[]> {
  const loaded = await Promise.all(
    metas.map((meta) =>
      current && meta.id === current.id ? Promise.resolve(current) : fetchScene(meta.id),
    ),
  );
  return overlayScenes(loaded, current);
}
