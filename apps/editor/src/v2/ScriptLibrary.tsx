import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson } from "../api";
import { exportAllScenes, exportScene, joinExportTexts } from "../exportScript";
import {
  collectSpeakers,
  DEFAULT_SCRIPT_FILTERS,
  filterScriptRows,
  loadScriptRows,
  readableScenesForExport,
  reloadScriptRow,
  type ScriptFilters,
  type ScriptRow,
} from "../scriptLibrary";

import type { Scene } from "../types";
import type { Editor } from "./useEditorState";

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
      const next = await loadScriptRows(
        ed.scenes,
        showArchived ? ed.archived : [],
        ed.scene,
        (id) => getJson<Scene>(`/api/scenes/${id}`),
      );
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
    if (selected?.loadError || !selected?.scene) {
      setManuscript("");
      return;
    }
    setManuscript(exportScene(selected.scene));
  }, [selected]);

  async function retryRow(row: ScriptRow) {
    const allIds = new Set([...ed.scenes, ...ed.archived].map((m) => m.id));
    const next = await reloadScriptRow(row, allIds, () => getJson<Scene>(`/api/scenes/${row.id}`));
    setRows((prev) => prev.map((r) => (r.id === row.id && !r.archived ? next : r)));
  }

  async function openRow(row: ScriptRow) {
    if (row.loadError) return;
    setSelectedId(row.id);
    if (row.archived) {
      await ed.unarchiveScene(row.id);
    }
    // Kind is passed explicitly: unarchive updates the list after this await.
    const opened = await ed.selectScene(row.id, row.sceneKind);
    if (opened) ed.closeScripts();
  }

  async function exportAll() {
    const decision = readableScenesForExport(rows);
    if (!decision.ok) {
      const list = decision.missing.map((m) => `${m.fileName} (${m.id})`).join(", ");
      setError(`${t("editor.scriptsExportBlocked")} ${list}`);
      return;
    }
    setBusy(true);
    try {
      const files = exportAllScenes(decision.scenes);
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
          onClick={() => {
            if (!ed.scene) return;
            void ed.archiveScene(ed.scene.id).catch(ed.fail);
          }}
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
                const failed = Boolean(row.loadError);
                return (
                  <tr
                    key={row.id + (row.archived ? ":a" : "")}
                    data-testid={`script-row-${row.id}`}
                    data-load-error={failed ? "true" : undefined}
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
                      {row.fileName ? (
                        <div className="v2-hint" data-testid={`script-file-${row.id}`}>
                          {row.fileName}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.title}</td>
                    <td>{failed ? "—" : row.sceneKind}</td>
                    <td align="right" data-testid={`script-beats-${row.id}`}>
                      {failed || row.beatCount < 0 ? "—" : row.beatCount}
                    </td>
                    <td>{failed ? "—" : row.exitKind}</td>
                    <td>
                      {failed ? (
                        <span>
                          <span data-testid={`script-error-${row.id}`}>{row.loadError}</span>{" "}
                          <button
                            type="button"
                            className="v2-btn"
                            data-testid={`script-retry-${row.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void retryRow(row);
                            }}
                          >
                            {t("editor.scriptsRetry")}
                          </button>
                        </span>
                      ) : (
                        flags.join(" · ") || "—"
                      )}
                    </td>
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
              disabled={!selected || Boolean(selected.loadError)}
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
            value={
              selected?.loadError
                ? `${t("editor.scriptsLoadFailed")} ${selected.fileName ?? selected.id} (${selected.id})\n${selected.loadError}`
                : manuscript || t("editor.scriptsManuscriptEmpty")
            }
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
