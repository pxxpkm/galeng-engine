import { useEffect, useState, type ReactNode } from "react";
import { AssetOverview } from "../AssetOverview";
import { liveIssues, type LiveIssue } from "../liveIssues";
import { formatIssueText, interpolate } from "../saveIssues";
import { SearchPalette } from "../SearchPalette";
import { VarList } from "../VarList";
import type { Locale } from "../types";
import { IconX } from "./icons";
import { ProjectFields, ScreenButtonsFields } from "./ProjectFields";
import { RosterEditor } from "./RosterEditor";
import { switchUiVersion } from "./uiVersion";
import type { Editor } from "./useEditorState";

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="v2-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`v2-modal${wide ? " v2-modal-wide" : ""}`} role="dialog" aria-label={title}>
        <div className="v2-modal-head">
          <h2>{title}</h2>
          <button type="button" className="v2-btn v2-btn-icon" onClick={onClose} title="Esc">
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewSceneDialog({ ed }: { ed: Editor }) {
  const { t } = ed;
  const dialog = ed.sceneDialog;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dialog) {
      setValue("");
      setError(null);
      setBusy(false);
    }
  }, [dialog]);

  if (!dialog) return null;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created =
        dialog!.kind === "dup" ? await ed.duplicateCurrentScene(value) : await ed.createScene(value);
      ed.closeSceneDialog();
      dialog!.onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={dialog.kind === "dup" ? t("editor.dupSceneTitle") : t("editor.newSceneTitle")}
      onClose={ed.closeSceneDialog}
    >
      <div className="v2-modal-body">
        <div className="v2-field">
          <label>{t("editor.sceneId")}</label>
          <input
            type="text"
            autoFocus
            value={value}
            placeholder={t("editor.newSceneId")}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        {error ? <p className="v2-form-error">{error}</p> : null}
      </div>
      <div className="v2-modal-foot">
        <button type="button" className="v2-btn" onClick={ed.closeSceneDialog}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-primary"
          disabled={busy || value.trim().length === 0}
          onClick={() => void submit()}
        >
          {t("common.create")}
        </button>
      </div>
    </Modal>
  );
}

function ExportDialog({ ed }: { ed: Editor }) {
  const { t } = ed;
  const files = ed.exportFiles;
  const [active, setActive] = useState(0);
  if (!files) return null;
  const current = files[Math.min(active, files.length - 1)];
  return (
    <Modal title={t("menu.exportScript")} onClose={ed.closeExport} wide>
      <div className="v2-modal-body v2-export-body">
        <p className="v2-hint">{t("editor.exportReadonly")}</p>
        {files.length > 1 ? (
          <div className="v2-tabs v2-export-tabs">
            {files.map((file, i) => (
              <button
                key={file.id}
                type="button"
                className={`v2-tab${i === active ? " active" : ""}`}
                onClick={() => setActive(i)}
              >
                {file.id}
              </button>
            ))}
          </div>
        ) : null}
        <textarea className="v2-export-text" readOnly value={current.text} spellCheck={false} />
        {ed.exportPath ? (
          <p className="v2-hint">
            {t("editor.exportWrote")}: {ed.exportPath}
          </p>
        ) : null}
      </div>
      <div className="v2-modal-foot">
        <button
          type="button"
          className="v2-btn v2-btn-primary"
          onClick={() => void ed.writeExportFiles()}
        >
          {t("editor.exportWrite")}
        </button>
        <button type="button" className="v2-btn" onClick={ed.closeExport}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}

function PackDialog({ ed }: { ed: Editor }) {
  const { t } = ed;
  if (!ed.packOpen) return null;
  return (
    <Modal title={t("menu.exportGame")} onClose={ed.closePack}>
      <div className="v2-modal-body">
        <p className="v2-hint">{t("editor.packHint")}</p>
        <div className="v2-field">
          <label>{t("editor.packOut")}</label>
          <div className="v2-pack-row">
            <input
              type="text"
              value={ed.packOut}
              onChange={(e) => ed.setPackOut(e.target.value)}
              spellCheck={false}
            />
            <button type="button" className="v2-btn" onClick={() => void ed.browsePackOut()}>
              {t("editor.packBrowse")}
            </button>
          </div>
        </div>
      </div>
      <div className="v2-modal-foot">
        <button type="button" className="v2-btn v2-btn-primary" onClick={() => void ed.pack()}>
          {t("menu.exportGame")}
        </button>
        <button type="button" className="v2-btn" onClick={ed.closePack}>
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}

function SettingsDialog({ ed }: { ed: Editor }) {
  const { t } = ed;
  const [page, setPage] = useState<"main" | "buttons" | "roster">("main");
  if (!ed.settingsOpen) return null;
  const title =
    page === "buttons" ? t("editor.screenButtons") : page === "roster" ? t("editor.roster") : t("menu.settings");
  return (
    <Modal
      title={title}
      onClose={() => {
        setPage("main");
        ed.closeSettings();
      }}
      wide
    >
      <div className="v2-modal-body">
        {page === "main" ? (
          <>
            <div className="v2-field">
              <label>{t("editor.language")}</label>
              <select
                className="v2-select"
                value={ed.locale}
                onChange={(e) => ed.setLocale(e.target.value as Locale)}
              >
                <option value="zh-Hant">{t("locale.zhHant")}</option>
                <option value="zh-Hans">{t("locale.zhHans")}</option>
                <option value="en">{t("locale.en")}</option>
              </select>
            </div>
            <div className="v2-field">
              <label>{t("editor.uiVersion")}</label>
              <div className="v2-uiversion">
                <span className="v2-chip">{t("editor.uiBetaName")}</span>
              </div>
              <p className="v2-hint">{t("editor.uiVersionNote")}</p>
              <button type="button" className="v2-btn" onClick={() => switchUiVersion("classic")}>
                {t("editor.uiClassic")}
              </button>
            </div>
            <ProjectFields ed={ed} />
            <div className="v2-field">
              <label>{t("editor.roster")}</label>
              <p className="v2-hint">{t("editor.rosterPageHint")}</p>
              <button type="button" className="v2-btn" onClick={() => setPage("roster")}>
                {t("editor.roster")}
              </button>
            </div>
            <div className="v2-field">
              <label>{t("editor.screenButtons")}</label>
              <p className="v2-hint">{t("editor.screenButtonsHint")}</p>
              <button type="button" className="v2-btn" onClick={() => setPage("buttons")}>
                {t("editor.screenButtons")}
              </button>
            </div>
            <div className="v2-field">
              <label>{t("editor.overview")}</label>
              <p className="v2-hint">{t("editor.overviewTitle")}</p>
              <button type="button" className="v2-btn" onClick={ed.openOverview}>
                {t("editor.overview")}
              </button>
            </div>
            <div className="v2-field">
              <label>{t("editor.vars")}</label>
              <p className="v2-hint">{t("editor.varsTitle")}</p>
              <button type="button" className="v2-btn" onClick={ed.openVars}>
                {t("editor.vars")}
              </button>
            </div>
          </>
        ) : (
          page === "roster" ? <RosterEditor ed={ed} /> : <ScreenButtonsFields ed={ed} />
        )}
      </div>
      <div className="v2-modal-foot">
        {page !== "main" ? (
          <button type="button" className="v2-btn" onClick={() => setPage("main")}>
            {t("editor.backToSettings")}
          </button>
        ) : null}
        <button
          type="button"
          className="v2-btn v2-btn-primary"
          onClick={() => {
            setPage("main");
            ed.closeSettings();
          }}
        >
          {t("common.ok")}
        </button>
      </div>
    </Modal>
  );
}

function issueWhere(issue: LiveIssue, t: (key: string) => string): string {
  const target = issue.target;
  if (target.kind === "project") {
    return t("menu.settings");
  }
  if (target.kind === "beat") {
    return `${target.sceneId} · #${target.beatIndex}`;
  }
  return `${target.sceneId} · ${t("editor.exit")}`;
}

function IssuesDialog({ ed }: { ed: Editor }) {
  const { t } = ed;
  const [issues, setIssues] = useState<LiveIssue[] | null>(null);

  useEffect(() => {
    if (!ed.issuesOpen) return;
    let cancelled = false;
    setIssues(null);
    void ed.loadSearchScenes().then((loaded) => {
      if (!cancelled) {
        setIssues(liveIssues(ed.project, loaded, ed.issueContext));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ed.issuesOpen, ed.project, ed.issueContext, ed.loadSearchScenes]);

  if (!ed.issuesOpen) return null;
  return (
    <Modal title={t("editor.issuesTitle")} onClose={ed.closeIssues} wide>
      <div className="v2-modal-body v2-issues-body">
        <p className="v2-hint">{t("editor.issuesHint")}</p>
        {issues === null ? (
          <p className="v2-empty">{t("editor.issuesLoading")}</p>
        ) : issues.length === 0 ? (
          <p className="v2-empty">{t("editor.issuesNone")}</p>
        ) : (
          <ul className="v2-issues-list">
            {issues.map((issue, i) => (
              <li key={`${issue.key}-${i}`}>
                <button
                  type="button"
                  className="v2-issues-row"
                  onClick={() => void ed.goToIssue(issue)}
                >
                  <span className="v2-issues-where">{issueWhere(issue, t)}</span>
                  <span className="v2-issues-text">{formatIssueText(issue, t)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function BackupDialog({ ed }: { ed: Editor }) {
  const offer = ed.backupOffer;
  if (!offer) return null;
  const { t } = ed;
  return (
    <Modal title={t("editor.backupTitle")} onClose={ed.dismissBackup}>
      <div className="v2-modal-body">
        <p>{interpolate(t("editor.backupText"), { id: offer.scene.id })}</p>
      </div>
      <div className="v2-modal-foot">
        <button type="button" className="v2-btn" onClick={ed.dismissBackup}>
          {t("editor.backupDiscard")}
        </button>
        <button type="button" className="v2-btn v2-btn-primary" onClick={ed.restoreBackup}>
          {t("editor.backupRestore")}
        </button>
      </div>
    </Modal>
  );
}

/** Static list; when shortcuts change, update both the handler and this table. */
const SHORTCUT_ROWS: ReadonlyArray<{ keys: string; labelKey: string }> = [
  { keys: "Ctrl+S", labelKey: "editor.shortSave" },
  { keys: "Ctrl+Z", labelKey: "editor.shortUndo" },
  { keys: "Ctrl+Y / Ctrl+Shift+Z", labelKey: "editor.shortRedo" },
  { keys: "Ctrl+D", labelKey: "editor.shortDup" },
  { keys: "Ctrl+K", labelKey: "editor.shortSearch" },
  { keys: "← / →", labelKey: "editor.shortStep" },
  { keys: "Shift+← / Shift+→", labelKey: "editor.shortExtend" },
  { keys: "Esc", labelKey: "editor.shortEsc" },
  { keys: "?", labelKey: "editor.shortHelp" },
  { keys: "Mouse", labelKey: "editor.shortMouse" },
];

function ShortcutsDialog({ ed }: { ed: Editor }) {
  if (!ed.shortcutsOpen) return null;
  const { t } = ed;
  return (
    <Modal title={t("editor.shortcutsTitle")} onClose={ed.closeShortcuts}>
      <div className="v2-modal-body">
        <div className="v2-shortcut-list">
          {SHORTCUT_ROWS.map((row) => (
            <div key={row.labelKey} className="v2-shortcut-row">
              <kbd className="v2-kbd">{row.keys}</kbd>
              <span>{t(row.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function Toasts({ ed }: { ed: Editor }) {
  if (ed.toasts.length === 0) return null;
  return (
    <div className="v2-toasts">
      {ed.toasts.map((toast) => (
        <div key={toast.id} className={`v2-toast v2-toast-${toast.kind}`}>
          <span className="v2-toast-text">{toast.text}</span>
          <button
            type="button"
            className="v2-toast-close"
            onClick={() => ed.dismissToast(toast.id)}
          >
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Dialogs({ ed }: { ed: Editor }) {
  return (
    <>
      <NewSceneDialog ed={ed} />
      <ExportDialog ed={ed} />
      <SettingsDialog ed={ed} />
      <SearchPalette
        open={ed.searchOpen}
        onClose={ed.closeSearch}
        loadScenes={ed.loadSearchScenes}
        assets={ed.assets}
        onPick={(hit) => void ed.goToSearchHit(hit)}
        t={ed.t}
        tone="v2"
      />
      <AssetOverview
        open={ed.overviewOpen}
        onClose={ed.closeOverview}
        loadScenes={ed.loadSearchScenes}
        project={ed.project}
        assets={ed.assets}
        onJump={(site) => void ed.goToCite(site)}
        t={ed.t}
        tone="v2"
      />
      <VarList
        open={ed.varsOpen}
        onClose={ed.closeVars}
        loadScenes={ed.loadSearchScenes}
        onJump={(site) => void ed.goToVar(site)}
        t={ed.t}
        tone="v2"
      />
      <IssuesDialog ed={ed} />
      <BackupDialog ed={ed} />
      <ShortcutsDialog ed={ed} />
      <PackDialog ed={ed} />
      <Toasts ed={ed} />
    </>
  );
}
