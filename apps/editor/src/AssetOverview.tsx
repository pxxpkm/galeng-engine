import { useEffect, useMemo, useRef, useState } from "react";
import { canJumpCite, overviewOf, type CiteField, type CiteRow, type CiteSite } from "./overview";
import type { AssetMeta, Project, Scene } from "./types";

const FIELD_KEY: Record<CiteField, string> = {
  bg: "editor.trackBg",
  char: "editor.trackChar",
  voice: "editor.trackVoice",
  bgm: "editor.trackBgm",
  se: "editor.trackSe",
  amb: "editor.trackAmb",
  cg: "editor.trackCg",
  movie: "editor.movie",
  titleBgm: "editor.titleBgm",
  titleBg: "editor.titleBg",
  titleMovie: "editor.titleMovie",
  font: "editor.font",
  msgBox: "editor.msgBox",
  icon: "editor.icon",
  titleButton: "editor.titleButtons",
  gallery: "editor.cgGallery",
  music: "editor.musicGallery",
};

const STATUS_KEY = {
  used: "editor.overviewUsed",
  orphan: "editor.overviewOrphan",
  missing: "editor.overviewMissing",
} as const;

export function AssetOverview({
  open,
  onClose,
  loadScenes,
  project,
  assets,
  onJump,
  t,
  tone,
}: {
  open: boolean;
  onClose: () => void;
  loadScenes: () => Promise<Scene[]>;
  project: Project | null;
  assets: AssetMeta[];
  onJump: (site: CiteSite) => void;
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

  const rows = useMemo(() => overviewOf(project, scenes, assets), [project, scenes, assets]);
  const q = filter.trim().toLowerCase();
  const visible = q ? rows.filter((row) => row.logical.toLowerCase().includes(q)) : rows;
  const used = rows.filter((row) => row.status === "used").length;
  const orphan = rows.filter((row) => row.status === "orphan").length;
  const missing = rows.filter((row) => row.status === "missing").length;

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
      <div className={panel} role="dialog" aria-label={t("editor.overview")}>
        <div className={tone === "v2" ? "v2-modal-head" : "overview-head"}>
          <h2>{t("editor.overview")}</h2>
          <button type="button" className={tone === "v2" ? "v2-btn v2-btn-icon" : undefined} onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        <div className={tone === "v2" ? "v2-modal-body" : "overview-body"}>
          <p className={tone === "v2" ? "v2-hint" : "hint"}>
            {t("editor.overviewUsed")}: {used} · {t("editor.overviewOrphan")}: {orphan} ·{" "}
            {t("editor.overviewMissing")}: {missing}
          </p>
          <input
            type="search"
            value={filter}
            placeholder={t("editor.overviewFilter")}
            aria-label={t("editor.overviewFilter")}
            onChange={(event) => setFilter(event.target.value)}
          />
          {visible.length === 0 ? (
            <p className={tone === "v2" ? "v2-hint" : "hint"}>{t("editor.overviewEmpty")}</p>
          ) : (
            <table className={tone === "v2" ? "v2-overview" : "overview-table"}>
              <thead>
                <tr>
                  <th>{t("editor.overviewPath")}</th>
                  <th>{t("editor.overviewKind")}</th>
                  <th>{t("editor.overviewCount")}</th>
                  <th>{t("editor.overviewStatus")}</th>
                  <th>{t("editor.overviewWhere")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <OverviewRow key={row.logical} row={row} onJump={onJump} t={t} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewRow({
  row,
  onJump,
  t,
}: {
  row: CiteRow;
  onJump: (site: CiteSite) => void;
  t: (key: string) => string;
}) {
  return (
    <tr className={`overview-row overview-${row.status}`}>
      <td className="overview-path">{row.logical}</td>
      <td>{row.kind}</td>
      <td>{row.count}</td>
      <td>{t(STATUS_KEY[row.status])}</td>
      <td>
        {row.sites.length === 0 ? (
          <span className="overview-none">—</span>
        ) : (
          <ul className="overview-sites">
            {row.sites.map((site, index) => {
              const label = siteLabel(site, t);
              if (!canJumpCite(site)) {
                return (
                  <li key={`${site.field}:${index}`}>
                    <span>{label}</span>
                  </li>
                );
              }
              return (
                <li key={`${site.sceneId}:${site.beatIndex}:${site.field}:${index}`}>
                  <button type="button" className="overview-jump" onClick={() => onJump(site)}>
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </td>
    </tr>
  );
}

function siteLabel(site: CiteSite, t: (key: string) => string): string {
  const field = t(FIELD_KEY[site.field]);
  if (!site.sceneId) {
    return `${t("editor.overviewProject")} · ${field}`;
  }
  const title = site.sceneTitle || site.sceneId;
  return `${title} #${site.beatIndex ?? 0} · ${field}`;
}
