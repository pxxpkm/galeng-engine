import type { Character, ChoiceOption, Project } from "./types";

export const DISPLAY_LOCALES = ["zh-Hant", "zh-Hans", "en"] as const;

export type AffectionDelta = -1 | 0 | 1;

export function rosterOf(project: Project | null | undefined): Character[] {
  return project?.characters ?? [];
}

export function affectionKey(id: string): string {
  return `${id.trim()}_affection`;
}

export function speakerOptions(characters: Character[], current?: string): string[] {
  const ids = characters.map((ch) => ch.id).filter(Boolean);
  if (current && !ids.includes(current)) {
    return [current, ...ids];
  }
  return ids;
}

export function addCharacter(project: Project): Project {
  const used = new Set((project.characters ?? []).map((ch) => ch.id));
  let n = used.size + 1;
  let id = `char_${n}`;
  while (used.has(id)) {
    n += 1;
    id = `char_${n}`;
  }
  return { ...project, characters: [...(project.characters ?? []), { id }] };
}

export function removeCharacter(project: Project, index: number): Project {
  const characters = (project.characters ?? []).filter((_, i) => i !== index);
  const next = { ...project };
  if (characters.length === 0) {
    delete next.characters;
  } else {
    next.characters = characters;
  }
  return next;
}

export function patchCharacter(
  project: Project,
  index: number,
  patch: {
    id?: string;
    displayLocale?: string;
    displayName?: string;
    textRate?: number | null;
  },
): Project {
  const characters = (project.characters ?? []).map((ch, i) => {
    if (i !== index) return ch;
    let next: Character = { ...ch };
    if (patch.id !== undefined) {
      const trimmed = patch.id.trim();
      if (trimmed) {
        next = { ...next, id: trimmed };
      }
    }
    if (patch.textRate !== undefined) {
      if (patch.textRate === null || !Number.isFinite(patch.textRate)) {
        const { textRate: _drop, ...rest } = next;
        next = rest;
      } else {
        const n = Math.round(patch.textRate);
        next = { ...next, textRate: Math.min(400, Math.max(25, n)) };
      }
    }
    if (patch.displayLocale !== undefined) {
      const display = { ...next.display };
      const name = patch.displayName ?? "";
      if (name.trim().length === 0) {
        delete display[patch.displayLocale];
      } else {
        display[patch.displayLocale] = name;
      }
      next = {
        ...next,
        display: Object.keys(display).length > 0 ? display : undefined,
      };
    }
    return next;
  });
  return { ...project, characters };
}

export function affectionDeltaOf(
  set: ChoiceOption["set"] | undefined,
  id: string,
): AffectionDelta {
  const raw = set?.[affectionKey(id)];
  if (raw === "+1" || raw === 1) return 1;
  if (raw === "-1" || raw === -1) return -1;
  return 0;
}

export function setAffectionDelta(
  set: ChoiceOption["set"] | undefined,
  id: string,
  delta: AffectionDelta,
): ChoiceOption["set"] {
  const key = affectionKey(id);
  if (!id.trim()) return set;
  const next = { ...(set ?? {}) };
  if (delta === 0) {
    delete next[key];
  } else if (delta === 1) {
    next[key] = "+1";
  } else {
    next[key] = "-1";
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
