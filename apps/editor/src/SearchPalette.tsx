import { useEffect, useMemo, useRef, useState } from "react";
import { searchProject, type SearchHit, type SearchKind } from "./search";
import type { AssetMeta, Scene } from "./types";

const KIND_KEY: Record<SearchKind, string> = {
  text: "editor.searchKindText",
  choice: "editor.searchKindChoice",
  label: "editor.searchKindLabel",
  speaker: "editor.searchKindSpeaker",
  goto: "editor.searchKindGoto",
  scene: "editor.searchKindScene",
  asset: "editor.searchKindAsset",
};

export function SearchPalette({
  open,
  onClose,
  loadScenes,
  assets,
  onPick,
  t,
  tone,
}: {
  open: boolean;
  onClose: () => void;
  loadScenes: () => Promise<Scene[]>;
  assets: AssetMeta[];
  onPick: (hit: SearchHit) => void;
  t: (key: string) => string;
  tone: "v2" | "classic";
}) {
  const [query, setQuery] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadRef = useRef(loadScenes);
  loadRef.current = loadScenes;

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActive(0);
    setScenes([]);
    let cancelled = false;
    void loadRef.current()
      .then((list) => {
        if (!cancelled) {
          setScenes(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScenes([]);
        }
      });
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open]);

  const hits = useMemo(() => searchProject(query, scenes, assets), [query, scenes, assets]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (hits.length === 0) {
      setActive(0);
      return;
    }
    setActive((cur) => Math.max(0, Math.min(cur, hits.length - 1)));
  }, [hits.length]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const emptyQuery = normalizeEmpty(query);
  const overlay = tone === "v2" ? "v2-overlay v2-cmd-overlay" : "search-overlay";
  const panel = tone === "v2" ? "v2-cmd" : "search-panel";
  const row = tone === "v2" ? "v2-cmd-hit" : "search-hit";

  function move(delta: number) {
    if (hits.length === 0) {
      return;
    }
    setActive((cur) => (cur + delta + hits.length) % hits.length);
  }

  function pick(hit: SearchHit) {
    onPick(hit);
  }

  return (
    <div
      className={overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={panel} role="dialog" aria-label={t("editor.search")}>
        <input
          ref={inputRef}
          type="search"
          className={tone === "v2" ? "v2-cmd-input" : "search-input"}
          value={query}
          placeholder={t("editor.searchPlaceholder")}
          aria-label={t("editor.search")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const hit = hits[active];
              if (hit) {
                pick(hit);
              }
            }
          }}
        />
        {emptyQuery ? (
          <p className={tone === "v2" ? "v2-cmd-empty" : "search-empty"}>{t("editor.searchHint")}</p>
        ) : hits.length === 0 ? (
          <p className={tone === "v2" ? "v2-cmd-empty" : "search-empty"}>{t("editor.searchNoHits")}</p>
        ) : (
          <ul className={tone === "v2" ? "v2-cmd-list" : "search-list"} role="listbox">
            {hits.map((hit, index) => {
              const where = hitWhere(hit, t);
              return (
                <li key={`${hit.sceneId}:${hit.beatIndex}:${hit.kind}:${hit.preview}:${index}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`${row}${index === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(hit)}
                  >
                    <span className={tone === "v2" ? "v2-cmd-meta" : "search-meta"}>{where}</span>
                    <span className={tone === "v2" ? "v2-cmd-preview" : "search-preview"}>{hit.preview}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function normalizeEmpty(query: string): boolean {
  return query.trim().length === 0;
}

function hitWhere(hit: SearchHit, t: (key: string) => string): string {
  const kind = t(KIND_KEY[hit.kind]);
  if (!hit.sceneId) {
    return kind;
  }
  const title = hit.sceneTitle || hit.sceneId;
  if (hit.beatIndex == null) {
    return `${title} · ${kind}`;
  }
  return `${title} #${hit.beatIndex} · ${kind}`;
}
