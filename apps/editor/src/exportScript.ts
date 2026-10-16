import type { Beat, CharOnStage, ChoiceOption, Exit, Scene } from "./types";

type StageChar = { id: string; face: string; slot: string };

export type ScriptFile = { id: string; text: string };

export function exportAllScenes(scenes: Scene[]): ScriptFile[] {
  return [...scenes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((scene) => ({ id: scene.id, text: exportScene(scene) }));
}

export function joinExportTexts(files: ScriptFile[]): string {
  return files.map((file) => file.text.replace(/\n+$/, "")).join("\n\n") + "\n";
}

export function exportScene(scene: Scene): string {
  const lines: string[] = [];
  const heading = scene.title ? `${scene.id} — ${scene.title}` : scene.id;
  lines.push(`# ${heading}`);
  lines.push(`@scene ${scene.id}`);
  lines.push("");

  let stage: StageChar[] = [];
  let prevHadSay = false;
  let emitted = false;

  for (const beat of scene.beats) {
    const nextStage = beat.chars ? normalizeChars(beat.chars) : stage;
    const chunk = exportBeat(beat, stage, nextStage);
    if (chunk.length > 0) {
      if (emitted && beat.say && !prevHadSay) {
        lines.push("");
      }
      lines.push(...chunk);
      emitted = true;
    }
    stage = nextStage;
    prevHadSay = Boolean(beat.say);
  }

  if (scene.exit) {
    if (emitted) {
      lines.push("");
    }
    lines.push(...exportExit(scene.exit));
  }

  return `${lines.join("\n")}\n`;
}

function exportBeat(beat: Beat, prev: StageChar[], next: StageChar[]): string[] {
  const lines: string[] = [];
  if (beat.label) {
    lines.push(`# ${beat.label}`);
  }
  if (beat.bg) {
    lines.push(joinCmd("@bg", shortAsset(beat.bg.asset, "bg"), beat.bg.trans, beat.bg.ms));
  }

  const faceOnlyIds = new Set<string>();
  lines.push(...charCommands(prev, next, Boolean(beat.say), faceOnlyIds));

  if (beat.bgm) {
    const fadeWord = beat.bgm.fadeMs !== undefined ? "fade" : "";
    if (beat.bgm.asset === null) {
      lines.push(joinCmd("@bgm", "stop", fadeWord, beat.bgm.fadeMs));
    } else {
      lines.push(
        joinCmd("@bgm", shortAsset(beat.bgm.asset, "bgm"), fadeWord, beat.bgm.fadeMs),
      );
    }
  }
  if (beat.se) {
    for (const se of beat.se) {
      lines.push(joinCmd("@se", shortAsset(se.asset, "se")));
    }
  }
  if (beat.fx?.type === "wait" && beat.fx.ms !== undefined) {
    lines.push(joinCmd("@wait", beat.fx.ms));
  }
  if (beat.fx?.type === "shake") {
    lines.push(joinCmd("@shake", beat.fx.ms));
  }
  if (beat.fx?.type === "flash") {
    lines.push(joinCmd("@flash", beat.fx.ms));
  }
  if (beat.movie?.asset) {
    lines.push(joinCmd("@movie", shortAsset(beat.movie.asset, "movie")));
  }
  if (beat.cg === null) {
    lines.push("@cg off");
  } else if (beat.cg) {
    lines.push(joinCmd("@cg", shortAsset(beat.cg, "cg")));
  }

  if (beat.say) {
    let line = `${beat.say.speaker}: ${beat.say.text}`;
    if (beat.say.voice) {
      line += ` [voice=${beat.say.voice}]`;
    }
    const faceId = [...faceOnlyIds][0];
    if (faceId) {
      const ch = next.find((c) => c.id === faceId);
      if (ch) {
        line += ` face=${ch.face}`;
      }
    }
    lines.push(line);
  }

  return lines;
}

function charCommands(
  prev: StageChar[],
  next: StageChar[],
  hasSay: boolean,
  faceOnlyIds: Set<string>,
): string[] {
  const lines: string[] = [];
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const nextIds = new Set(next.map((c) => c.id));

  for (const ch of prev) {
    if (!nextIds.has(ch.id)) {
      lines.push(`@hide ${ch.id}`);
    }
  }
  for (const ch of next) {
    const was = prevById.get(ch.id);
    if (!was) {
      lines.push(`@char ${ch.id} ${ch.slot} face=${ch.face}`);
      continue;
    }
    const sameFace = was.face === ch.face && was.slot === ch.slot;
    if (sameFace) {
      continue;
    }
    if (hasSay && was.slot === ch.slot && was.face !== ch.face) {
      faceOnlyIds.add(ch.id);
      continue;
    }
    if (was.face !== ch.face && was.slot === ch.slot) {
      lines.push(`@face ${ch.id} ${ch.face}`);
    } else {
      lines.push(`@char ${ch.id} ${ch.slot} face=${ch.face}`);
    }
  }
  return lines;
}

function exportExit(exit: Exit): string[] {
  if (exit.type === "next") {
    return [`@goto ${exit.goto}`];
  }
  if (exit.type === "choices") {
    return ["@choice", ...exit.options.map((opt) => `  ${formatChoice(opt)}`)];
  }
  if (exit.type === "return" || exit.type === "end") {
    return [];
  }
  if (exit.type === "call") {
    return [`@call ${exit.scene}`];
  }
  if (exit.type === "branch") {
    return [`@if ${summarizeBranchIf(exit.if)} @goto ${exit.then} @else @goto ${exit.else}`];
  }
  return [];
}

function formatChoice(opt: ChoiceOption): string {
  const set = opt.set ? ` ${formatSetBlock(opt.set)}` : "";
  const cond = opt.if ? ` if ${summarizeBranchIf(opt.if)}` : "";
  return `${opt.text} -> ${opt.goto}${set}${cond}`;
}

function formatSetBlock(set: Record<string, string | number | boolean>): string {
  const parts = Object.entries(set).map(([key, value]) => {
    if (typeof value === "string" && /^[+-]\d+$/.test(value)) {
      const n = Number(value);
      return n >= 0 ? `${key} += ${n}` : `${key} -= ${-n}`;
    }
    return `${key} = ${value}`;
  });
  return `{ ${parts.join(", ")} }`;
}

function summarizeBranchIf(cond: unknown): string {
  if (!cond || typeof cond !== "object") {
    return "?";
  }
  const entries = Object.entries(cond as Record<string, unknown>);
  if (entries.length === 0) {
    return "?";
  }
  const [key, pred] = entries[0]!;
  if (pred && typeof pred === "object" && "gte" in (pred as object)) {
    return `${key} gte ${(pred as { gte: unknown }).gte}`;
  }
  return `${key} ${String(pred)}`;
}

function normalizeChars(chars: CharOnStage[]): StageChar[] {
  return chars.map((c) => ({ id: c.id, face: c.face, slot: c.slot ?? "center" }));
}

function shortAsset(logical: string, prefix: string): string {
  const head = `${prefix}/`;
  return logical.startsWith(head) ? logical.slice(head.length) : logical;
}

function joinCmd(cmd: string, ...parts: Array<string | number | undefined>): string {
  const bits = [cmd, ...parts.filter((p) => p !== undefined && p !== "")];
  return bits.join(" ");
}
