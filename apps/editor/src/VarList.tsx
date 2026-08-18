import { useEffect, useMemo, useRef, useState } from "react";
import { varsOf, type VarKind, type VarSite, type VarWhere } from "./vars";
import type { Scene } from "./types";

const KIND_KEY: Record<VarKind, string> = {
  set: "editor.varsSet",
  if: "editor.varsIf",
};

const WHERE_KEY: Record<VarWhere, string> = {
  choice: "editor.searchKindChoice",
  branch: "editor.exitBranch",
  beat: "editor.beats",
};

export function VarList({
  open,
  onClose,
  loadScenes,
  onJump,
  t,
  tone,
}: {
  open: boolean;
  onClose: () => void;
  loadScenes: () => Promise<Scene[]>;
  onJump: (site: VarSite) => void;
  t: (key: string) => string;
  tone: "v2" | "classic";
}) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [filter, setFilter] = useState("");
  const loadRef = useRef(loadScenes);
  loadRef.current = loadScenes;

  useEffect(() => {
    if (!open) {
      return;
    }
    setFilter("");
    setScenes([]);
    let cancelled = false;
    void loadRef
      .current()
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
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  const rows = useMemo(() => varsOf(scenes), [scenes]);
  const q = filter.trim().toLowerCase();
  const visible = q ? rows.filter((row) => row.key.toLowerCase().includes(q)) : rows;

  if (!open) {
    return null;
  }

  const overlay = tone === "v2" ? "v2-overlay" : "search-overlay";
  const panel = tone === "v2" ? "v2-modal v2-modal-wide" : "search-panel overview-panel";

  return (
    <div
      className={overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={panel} role="dialog" aria-label={t("editor.vars")}>
        <div className={tone === "v2" ? "v2-modal-head" : "overview-head"}>
          <h2>{t("editor.vars")}</h2>
          <button type="button" className={tone === "v2" ? "v2-btn v2-btn-icon" : undefined} onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        <div className={tone === "v2" ? "v2-modal-body" : "overview-body"}>
          <input
            type="search"
            value={filter}
            placeholder={t("editor.varsFilter")}
            aria-label={t("editor.varsFilter")}
            onChange={(event) => setFilter(event.target.value)}
          />
          {visible.length === 0 ? (
            <p className={tone === "v2" ? "v2-hint" : "hint"}>{t("editor.varsEmpty")}</p>
          ) : (
            <table className={tone === "v2" ? "v2-overview" : "overview-table"}>
              <thead>
                <tr>
                  <th>{t("editor.varsKey")}</th>
                  <th>{t("editor.varsCount")}</th>
                  <th>{t("editor.varsWhere")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.key}>
                    <td className="overview-path">{row.key}</td>
                    <td>{row.count}</td>
                    <td>
                      <ul className="overview-sites">
                        {row.sites.map((site, index) => (
                          <li key={`${site.sceneId}:${site.where}:${site.choiceIndex}:${site.beatIndex}:${index}`}>
                            <button type="button" className="overview-jump" onClick={() => onJump(site)}>
                              {siteLabel(site, t)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function siteLabel(site: VarSite, t: (key: string) => string): string {
  const title = site.sceneTitle || site.sceneId;
  const kind = t(KIND_KEY[site.kind]);
  const where = t(WHERE_KEY[site.where]);
  const extra =
    site.where === "choice" && site.choiceIndex != null
      ? ` #${site.choiceIndex}`
      : site.where === "beat" && site.beatIndex != null
        ? ` #${site.beatIndex}`
        : "";
  const note = site.note ? ` · ${site.note}` : "";
  return `${title} · ${where}${extra} · ${kind}${note}`;
}
