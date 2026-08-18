import { mediaUrl } from "./media";

export function isAudibleLogical(logical: string | undefined | null): boolean {
  const trimmed = logical?.trim() ?? "";
  return (
    trimmed.startsWith("voice/") ||
    trimmed.startsWith("bgm/") ||
    trimmed.startsWith("se/") ||
    trimmed.startsWith("amb/")
  );
}

type Listener = () => void;

let current: HTMLAudioElement | null = null;
let currentLogical: string | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) {
    fn();
  }
}

export function subscribeAudition(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function playingLogical(): string | null {
  if (!current || current.paused) {
    return null;
  }
  return currentLogical;
}

export function stopAudition(): void {
  if (current) {
    current.pause();
    current.removeAttribute("src");
    current.load();
    current = null;
  }
  currentLogical = null;
  emit();
}

/** Play `logical`. Same clip while playing toggles off. Returns the now-playing path or null. */
export function playAudition(logical: string): string | null {
  const trimmed = logical.trim();
  if (!isAudibleLogical(trimmed)) {
    return playingLogical();
  }
  if (currentLogical === trimmed && current && !current.paused) {
    stopAudition();
    return null;
  }
  stopAudition();
  if (typeof Audio === "undefined") {
    return null;
  }
  const audio = new Audio(mediaUrl(trimmed));
  audio.addEventListener("ended", () => {
    if (current === audio) {
      current = null;
      currentLogical = null;
      emit();
    }
  });
  void audio.play().catch(() => {
    if (current === audio) {
      stopAudition();
    }
  });
  current = audio;
  currentLogical = trimmed;
  emit();
  return trimmed;
}
