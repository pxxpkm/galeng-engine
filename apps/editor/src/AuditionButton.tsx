import { useEffect, useState } from "react";
import {
  isAudibleLogical,
  playAudition,
  playingLogical,
  subscribeAudition,
} from "./audition";

export function useAuditionPlaying(): string | null {
  const [playing, setPlaying] = useState(playingLogical);
  useEffect(() => subscribeAudition(() => setPlaying(playingLogical())), []);
  return playing;
}

export function AuditionButton({
  logical,
  t,
  className,
}: {
  logical: string;
  t: (key: string) => string;
  className?: string;
}) {
  const playing = useAuditionPlaying();
  const trimmed = logical.trim();
  if (!isAudibleLogical(trimmed)) {
    return null;
  }
  const on = playing === trimmed;
  return (
    <button
      type="button"
      className={className ?? "audition-btn"}
      title={on ? t("editor.auditionStop") : t("editor.audition")}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        playAudition(trimmed);
      }}
    >
      {on ? "■" : "▶"}
    </button>
  );
}
