import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson } from "../api";
import { exportAllScenes, exportScene, joinExportTexts } from "../exportScript";
import {
  collectSpeakers,
  DEFAULT_SCRIPT_FILTERS,
  filterScriptRows,
  scriptRowFromMeta,
  scriptRowFromScene,
  type ScriptFilters,
  type ScriptRow,
} from "../scriptLibrary";
import type { Scene, SceneMeta } from "../types";
import type { Editor } from "./useEditorState";

async function loadAllScenes(
  live: SceneMeta[],
  archived: SceneMeta[],
  current: Scene | null,
): Promise<ScriptRow[]> {
  const allIds = new Set([...live, ...archived].map((m) => m.id));
  const rows: ScriptRow[] = [];

  async function loadOne(meta: SceneMeta, isArchived: boolean) {
    try {
      const scene =
        current && current.id === meta.id && !isArchived
          ? current
          : await getJson<Scene>(
              isArchived ? `/api/archived/${meta.id}` : `/api/scenes/${meta.id}`,
            );
      // Archived GET might not exist — host uses unarchive path. Fall back to meta-only.
      rows.push(scriptRowFromScene(scene, { archived: isArchived, allIds }));
    } catch {
      rows.push(
        scriptRowFromScene(
          {
            id: meta.id,
            title: meta.title,
            beats: [],
            exit: meta.exit,
          },
          { archived: isArchived, allIds },
        ),
      );
    }
  }

  for (const m of live) await loadOne(m, false);
  for (const m of archived) {
    // Archived bodies are not GET-able; meta-only until unarchived.
    rows.push(scriptRowFromMeta(m, { archived: true, allIds }));
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

export function ScriptLibrary({ ed }: { ed: Editor }) {
  const { t } = ed;
  const [rows, setRows] = useState<ScriptRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [filters, setFilters] = useState<ScriptFilters>(DEFAULT_SCRIPT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(ed.sceneId);
  const [manuscript, setManuscript] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await loadAllScenes(ed.scenes, showArchived ? ed.archived : [], ed.scene);
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [ed.scenes, ed.archived, ed.scene, showArchived]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    let list = rows;
    if (!showArchived) list = list.filter((r) => !r.archived);
    return filterScriptRows(list, filters);
  }, [rows, filters, showArchived]);

  const speakers = useMemo(() => collectSpeakers(rows), [rows]);

  const selected = visible.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId);

  useEffect(() => {
    if (selected?.scene) {
      setManuscript(exportScene(selected.scene));
    } else {
      setManuscript("");
    }
  }, [selected]);

  async function openRow(row: ScriptRow) {
    setSelectedId(row.id);
    if (row.archived) {
      await ed.unarchiveScene(row.id);
    }
    await ed.selectScene(row.id);
    ed.closeScripts();
  }

  async function exportAll() {
    setBusy(true);
    try {
      const liveScenes: Scene[] = [];
      for (const row of rows.filter((r) => !r.archived)) {
        if (row.scene) liveScenes.push(row.scene);
        else liveScenes.push(await getJson<Scene>(`/api/scenes/${row.id}`));
      }
      const files = exportAllScenes(liveScenes);
      // Reuse export dialog
      ed.openExportFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function copyManuscript() {
    if (!manuscript) return;
    void navigator.clipboard?.writeText(manuscript);
  }

  return (
    <div className="v2-modal-body" data-testid="script-library">
      <p className="v2-hint">{t("editor.scriptsHint")}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <input
          type="search"
          value={filters.query}
          placeholder={t("editor.scriptsSearch")}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          style={{ minWidth: 160 }}
        />
        <select
          value={filters.kind}
          onChange={(e) =>
            setFilters((f) => ({ ...f, kind: e.target.value as ScriptFilters["kind"] }))
          }
        >
          <option value="all">{t("editor.scriptsKindAll")}</option>
          <option value="dialogue">{t("editor.scriptsKindDialogue")}</option>
          <option value="explore">{t("editor.scriptsKindExplore")}</option>
        </select>
        <select
          value={filters.speaker}
          onChange={(e) => setFilters((f) => ({ ...f, speaker: e.target.value }))}
        >
          <option value="">{t("editor.scriptsSpeakerAll")}</option>
          {speakers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.callReturn}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              callReturn: e.target.value as ScriptFilters["callReturn"],
            }))
          }
        >
          <option value="">{t("editor.scriptsCallReturnAny")}</option>
          <option value="call">{t("editor.scriptsHasCall")}</option>
          <option value="return">{t("editor.scriptsHasReturn")}</option>
          <option value="either">{t("editor.scriptsHasCallOrReturn")}</option>
        </select>
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={filters.unresolvedOnly}
            onChange={(e) => setFilters((f) => ({ ...f, unresolvedOnly: e.target.checked }))}
          />
          {t("editor.scriptsUnresolved")}
        </label>
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t("editor.scriptsShowArchived")}
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" className="v2-btn" onClick={() => ed.requestNewScene()}>
          {t("editor.newScene")}
        </button>
        <button
          type="button"
          className="v2-btn"
          disabled={!ed.scene}
          onClick={() => ed.requestDupScene()}
        >
          {t("editor.dupScene")}
        </button>
        <button
          type="button"
          className="v2-btn"
          disabled={!ed.scene}
          onClick={() => void ed.archiveCurrentScene()}
        >
          {t("editor.archive")}
        </button>
        <button type="button" className="v2-btn" disabled={busy} onClick={() => void exportAll()}>
          {t("editor.exportAll")}
        </button>
        <button type="button" className="v2-btn" disabled={busy} onClick={() => void refresh()}>
          {t("editor.scriptsRefresh")}
        </button>
      </div>

      {error ? <p className="v2-hint" style={{ color: "#f88" }}>{error}</p> : null}
      {busy ? <p className="v2-hint">{t("editor.scriptsLoading")}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, minHeight: 320 }}>
        <div style={{ overflow: "auto", maxHeight: 420 }}>
          <table className="v2-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th align="left">{t("editor.scriptsColId")}</th>
                <th align="left">{t("editor.scriptsColTitle")}</th>
                <th align="left">{t("editor.scriptsColKind")}</th>
                <th align="right">{t("editor.scriptsColBeats")}</th>
                <th align="left">{t("editor.scriptsColExit")}</th>
                <th align="left">{t("editor.scriptsColFlags")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const flags: string[] = [];
                if (row.hasCall) flags.push("Call");
                if (row.hasReturn) flags.push("Return");
                if (row.unresolvedGoto) flags.push("?");
                if (row.archived) flags.push("arch");
                return (
                  <tr
                    key={row.id + (row.archived ? ":a" : "")}
                    data-testid={`script-row-${row.id}`}
                    style={{
                      cursor: "pointer",
                      background:
                        selectedId === row.id ? "rgba(255,220,120,0.15)" : undefined,
                      opacity: row.archived ? 0.65 : 1,
                    }}
                    onClick={() => setSelectedId(row.id)}
                    onDoubleClick={() => void openRow(row)}
                  >
                    <td>
                      <code>{row.id}</code>
                    </td>
                    <td>{row.title}</td>
                    <td>{row.sceneKind}</td>
                    <td align="right">{row.beatCount < 0 ? "—" : row.beatCount}</td>
                    <td>{row.exitKind}</td>
                    <td>{flags.join(" · ") || "—"}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && !busy ? (
                <tr>
                  <td colSpan={6} className="v2-hint">
                    {t("editor.scriptsEmpty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <strong>{t("editor.scriptsManuscript")}</strong>
            <button
              type="button"
              className="v2-btn"
              disabled={!selected}
              onClick={() => selected && void openRow(selected)}
            >
              {t("editor.scriptsOpen")}
            </button>
            <button
              type="button"
              className="v2-btn"
              disabled={!manuscript}
              onClick={copyManuscript}
            >
              {t("editor.scriptsCopy")}
            </button>
          </div>
          <textarea
            readOnly
            value={manuscript || t("editor.scriptsManuscriptEmpty")}
            style={{
              flex: 1,
              minHeight: 280,
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              resize: "vertical",
            }}
          />
          <p className="v2-hint">{t("editor.scriptsOpenHint")}</p>
        </div>
      </div>
    </div>
  );
}

/** Used by export-all button path when Editor exposes a setter. */
export function manuscriptAllText(scenes: Scene[]): string {
  return joinExportTexts(exportAllScenes(scenes));
}
