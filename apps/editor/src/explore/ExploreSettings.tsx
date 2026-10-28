import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import en from "../../../../packages/i18n/locales/en.json";
import zhHans from "../../../../packages/i18n/locales/zh-Hans.json";
import zhHant from "../../../../packages/i18n/locales/zh-Hant.json";
import { getJson, updateJson } from "../api";
import { mergeSaveResponse } from "../saveGeneration";
import { mergeProjectEdits } from "../projectEdits";
import type { AssetMeta, Locale, Project } from "../types";
import { AudioPanel, type AudioPanelHost } from "../v2/AudioPanel";
import { FontPanel, type FontPanelHost } from "../v2/FontPanel";
import { IconSettings, IconX } from "../v2/icons";
import { bindModalElement } from "../v2/modalFocus";
import "../v2/v2.css";

const TABLES: Record<Locale, Record<string, string>> = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
};

const LOCALE_KEY = "galeng.locale";

/** Same locale key as Dialogue editor; stored locally, not in galeng.json. */
export function detectEditorLocale(): Locale {
  try {
    const saved = globalThis.localStorage?.getItem(LOCALE_KEY);
    if (saved === "zh-Hant" || saved === "zh-Hans" || saved === "en") {
      return saved;
    }
    const nav = globalThis.navigator?.language ?? "";
    if (/^zh/i.test(nav)) {
      return /hans|cn|sg/i.test(nav) ? "zh-Hans" : "zh-Hant";
    }
  } catch {
    // fall through
  }
  return "zh-Hant";
}

export function editorT(locale: Locale = detectEditorLocale()): (key: string) => string {
  const table = TABLES[locale];
  return (key) => table[key] ?? key;
}

export async function loadExploreProjectBundle(api: {
  getJson: <T>(path: string) => Promise<T>;
} = { getJson }): Promise<{ project: Project; assets: AssetMeta[] }> {
  const [project, assets] = await Promise.all([
    api.getJson<Project>("/api/project"),
    api.getJson<AssetMeta[]>("/api/assets"),
  ]);
  return { project, assets };
}

export async function saveExploreProject(
  baseline: Project,
  project: Project,
  api: { updateJson: typeof updateJson } = { updateJson },
): Promise<Project> {
  // Snapshot before waiting on the lane. Unchanged fields belong to the latest project.
  const before = structuredClone(baseline);
  const draft = structuredClone(project);
  return api.updateJson<Project>("/api/project", latest => mergeProjectEdits(before, draft, latest));
}

/**
 * Apply a settings PUT only when the dialog revision is still the one that
 * was captured at send time. A patch during the request keeps the new draft.
 */
export function settleSettingsSave<T>(input: {
  requestRev: number;
  currentRev: number;
  saved: T;
  current: T;
}): { project: T; clearDirty: boolean } {
  const merged = mergeSaveResponse({
    requestRev: input.requestRev,
    currentRev: input.currentRev,
    saved: input.saved,
    current: input.current,
  });
  return { project: merged.value, clearDirty: merged.clearDirty };
}

type Page = "main" | "fonts" | "audio";

/**
 * Minimal project Settings for Explore shell (Fonts / Audio via /api/project).
 * Does not mount the full V2 editor tree.
 */
export function ExploreSettingsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Workspace adopts the saved project so a later room save does not write stale raw. */
  onSaved?: (project: Project) => void;
}) {
  const locale = useMemo(() => detectEditorLocale(), [open]);
  const t = useMemo(() => editorT(locale), [locale]);
  const [page, setPage] = useState<Page>("main");
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const projectRef = useRef<Project | null>(null);
  const settingsRev = useRef(0);
  const baselineRef = useRef<Project | null>(null);
  const sessionRev = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    sessionRev.current += 1;
    if (!open) {
      setPage("main");
      setDirty(false);
      setStatus("");
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setStatus("載入中…");
    void loadExploreProjectBundle()
      .then((bundle) => {
        if (cancelled) return;
        settingsRev.current += 1;
        projectRef.current = bundle.project;
        baselineRef.current = bundle.project;
        setProject(bundle.project);
        setAssets(bundle.assets);
        setDirty(false);
        setStatus("");
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setStatus("");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    return bindModalElement(panel, () => onCloseRef.current());
  }, [open]);

  const patchProject = useCallback((next: Project) => {
    settingsRev.current += 1;
    projectRef.current = next;
    setProject(next);
    setDirty(true);
  }, []);

  const doSave = useCallback(async () => {
    const body = projectRef.current;
    const baseline = baselineRef.current;
    if (!body || !baseline) return;
    const requestRev = settingsRev.current;
    const requestSession = sessionRev.current;
    setStatus("儲存中…");
    try {
      const saved = await saveExploreProject(baseline, body);
      if (requestSession !== sessionRev.current) return;
      baselineRef.current = saved;
      onSaved?.(saved);
      const settled = settleSettingsSave({
        requestRev,
        currentRev: settingsRev.current,
        saved,
        current: projectRef.current ?? saved,
      });
      if (!settled.clearDirty) {
        // Rebase only edits made while saving; do not replay the old full snapshot.
        const rebased = mergeProjectEdits(body, projectRef.current ?? body, saved);
        projectRef.current = rebased;
        setProject(rebased);
        setStatus("仍有未儲存修改");
        return;
      }
      projectRef.current = settled.project;
      setProject(settled.project);
      setDirty(false);
      setStatus("已儲存");
    } catch (err: unknown) {
      if (requestSession !== sessionRev.current) return;
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [onSaved]);

  if (!open) return null;

  const title =
    page === "fonts"
      ? t("editor.fontsPanel")
      : page === "audio"
        ? t("editor.audioPanel")
        : t("menu.settings");

  const host: (FontPanelHost & AudioPanelHost) | null =
    project == null
      ? null
      : {
          t,
          project,
          assets,
          patchProject,
        };

  return (
    <div
      className="v2 explore-settings-host"
      data-testid="explore-settings"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        height: "auto",
        display: "block",
        background: "transparent",
      }}
    >
      <div
        className="v2-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          className="v2-modal v2-modal-wide"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="v2-modal-head">
            <h2>{title}</h2>
            <button
              type="button"
              className="v2-btn v2-btn-icon"
              onClick={onClose}
              title="Esc"
              data-testid="explore-settings-close"
            >
              <IconX />
            </button>
          </div>
          <div className="v2-modal-body">
            {loadError ? (
              <p className="v2-hint" data-testid="explore-settings-error">
                {loadError}
              </p>
            ) : null}
            {!loadError && !project ? (
              <p className="v2-hint">{status || "…"}</p>
            ) : null}
            {!loadError && project && page === "main" ? (
              <>
                <div className="v2-field">
                  <label>{t("editor.fontsPanel")}</label>
                  <p className="v2-hint">{t("editor.fontsPanelHint")}</p>
                  <button
                    type="button"
                    className="v2-btn"
                    data-testid="explore-settings-fonts"
                    onClick={() => setPage("fonts")}
                  >
                    {t("editor.fontsPanel")}
                  </button>
                </div>
                <div className="v2-field">
                  <label>{t("editor.audioPanel")}</label>
                  <p className="v2-hint">{t("editor.audioPanelHint")}</p>
                  <button
                    type="button"
                    className="v2-btn"
                    data-testid="explore-settings-audio"
                    onClick={() => setPage("audio")}
                  >
                    {t("editor.audioPanel")}
                  </button>
                </div>
                <p className="v2-hint">
                  字型／字級／音訊寫入 galeng.json（/api/project）。對話編輯器內其餘專案設定仍可在對話殼開啟。
                </p>
              </>
            ) : null}
            {!loadError && host && page === "fonts" ? <FontPanel ed={host} /> : null}
            {!loadError && host && page === "audio" ? <AudioPanel ed={host} /> : null}
          </div>
          <div className="v2-modal-foot">
            {page !== "main" ? (
              <button type="button" className="v2-btn" onClick={() => setPage("main")}>
                {t("editor.backToSettings")}
              </button>
            ) : null}
            <button
              type="button"
              className={`v2-btn${dirty ? " v2-btn-primary" : ""}`}
              data-testid="explore-settings-save"
              disabled={!project || !dirty}
              onClick={() => void doSave()}
            >
              {t("menu.save")}
              {dirty ? " *" : ""}
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={() => {
                if (dirty) {
                  const ok = window.confirm("設定尚未儲存，仍要關閉？");
                  if (!ok) return;
                }
                setPage("main");
                onClose();
              }}
            >
              {t("common.ok")}
            </button>
            {status ? <span className="v2-hint">{status}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Gear button for Explore chrome. */
export function ExploreSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="explore-btn explore-btn-icon"
      data-testid="explore-settings-open"
      title="設定"
      aria-label="設定"
      onClick={onClick}
    >
      <IconSettings />
    </button>
  );
}
