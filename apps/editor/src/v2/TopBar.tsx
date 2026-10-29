import { useEffect, useRef, useState } from "react";
import { navigateToExploreEditor } from "../editorRoute";
import { SaveLayerStatus } from "../SaveLayerStatus";
import { playNoticeKey } from "../play";
import type { Editor } from "./useEditorState";
import {
  IconChevronDown,
  IconCopy,
  IconExport,
  IconNewScene,
  IconPlay,
  IconQuestion,
  IconRedo,
  IconSave,
  IconSearch,
  IconSettings,
  IconUndo,
  IconWarning,
} from "./icons";

function ExportMenu({ ed }: { ed: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const { t } = ed;
  return (
    <div className="v2-menu" ref={ref}>
      <button
        type="button"
        className="v2-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <IconExport />
        {t("editor.exportMenu")}
        <IconChevronDown size={13} />
      </button>
      {open ? (
        <div className="v2-menu-pop" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={!ed.scene}
            onClick={() => {
              setOpen(false);
              ed.exportCurrentScene();
            }}
          >
            {t("menu.exportScript")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={ed.scenes.length === 0}
            onClick={() => {
              setOpen(false);
              void ed.exportEveryScene();
            }}
          >
            {t("editor.exportAll")}
          </button>
          <div className="v2-menu-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              ed.openPack();
            }}
          >
            {t("menu.exportGame")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TopBarSep() {
  return <span className="v2-topbar-sep" aria-hidden="true" />;
}

export function TopBar({ ed }: { ed: Editor }) {
  const { t } = ed;
  return (
    <header className="v2-topbar">
      <div className="v2-brand">
        <span className="v2-logo">G</span>
        <span className="v2-appname">{t("app.name")}</span>
        {ed.project ? (
          <span className="v2-project" title={ed.project.title}>
            {ed.project.title}
            <SaveLayerStatus
              id="project-save-state"
              phase={ed.projectPhase}
              label={t("editor.saveProject")}
              reason={ed.projectFail?.reason}
              conflict={ed.projectFail?.conflict}
              onRetry={() => void ed.save().catch(ed.fail)}
              onReload={() => void ed.reloadFromDisk()}
              onFocus={
                ed.projectFail?.focus
                  ? () => ed.focusSaveIssue(ed.projectFail!.focus!)
                  : undefined
              }
              t={t}
            />
            <SaveLayerStatus
              id="scene-save-state"
              phase={ed.scenePhase}
              label={t("editor.saveScene")}
              reason={ed.sceneFail?.reason}
              conflict={ed.sceneFail?.conflict}
              onRetry={() => void ed.save().catch(ed.fail)}
              onReload={() => void ed.reloadFromDisk()}
              onFocus={
                ed.sceneFail?.focus ? () => ed.focusSaveIssue(ed.sceneFail!.focus!) : undefined
              }
              t={t}
            />
          </span>
        ) : null}
      </div>

      {/* Edit */}
      <div className="v2-topbar-group" data-testid="topbar-edit">
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.undo")}
          onClick={ed.applyUndo}
          disabled={!ed.canUndo}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.redo")}
          onClick={ed.applyRedo}
          disabled={!ed.canRedo}
        >
          <IconRedo />
        </button>
      </div>

      <div className="v2-topbar-spacer" />

      {/* Scene */}
      <div className="v2-topbar-group" data-testid="topbar-scene">
        <button
          type="button"
          className="v2-btn"
          onClick={() => ed.requestNewScene()}
          title={t("editor.newScene")}
        >
          <IconNewScene />
          {t("editor.newScene")}
        </button>
        <button
          type="button"
          className="v2-btn"
          onClick={ed.requestDupScene}
          disabled={!ed.scene}
          title={t("editor.dupSceneTitle")}
        >
          <IconCopy />
          {t("editor.dupScene")}
        </button>
      </div>

      <TopBarSep />

      {/* Export */}
      <div className="v2-topbar-group" data-testid="topbar-export">
        <ExportMenu ed={ed} />
      </div>

      <TopBarSep />

      {/* Search + Issues */}
      <div className="v2-topbar-group" data-testid="topbar-find">
        <button
          type="button"
          className="v2-btn"
          onClick={ed.openSearch}
          title={t("editor.searchTitle")}
        >
          <IconSearch />
          {t("editor.search")}
        </button>
        <button
          type="button"
          className="v2-btn"
          onClick={ed.openIssues}
          title={t("editor.issuesTitle")}
        >
          <IconWarning />
          {t("editor.issues")}
          {ed.currentIssues.length > 0 ? (
            <span className="v2-badge">{ed.currentIssues.length}</span>
          ) : null}
        </button>
      </div>

      <TopBarSep />

      {/* File */}
      <div className="v2-topbar-group" data-testid="topbar-file">
        <button
          type="button"
          className={`v2-btn${ed.dirty ? " v2-btn-primary" : ""}`}
          onClick={() => void ed.save().catch(ed.fail)}
          disabled={!ed.dirty}
          title="Ctrl+S"
        >
          <IconSave />
          {t("menu.save")}
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-accent"
          onClick={() => void ed.play()}
          disabled={!ed.scene}
          title={ed.playDecision ? t(playNoticeKey(ed.playDecision.notice)) : undefined}
        >
          <IconPlay />
          {t("menu.playFromHere")}
        </button>
        {ed.playDecision?.action === "refuse" ? (
          <button type="button" className="v2-btn" onClick={() => void ed.playFromStart()}>
            {t("editor.playFromStart")}
          </button>
        ) : null}
      </div>

      <TopBarSep />

      {/* Shell switch + library + settings */}
      <div className="v2-topbar-group" data-testid="topbar-shell">
        <button
          type="button"
          className="v2-btn"
          data-testid="open-explore-editor"
          title={t("editor.shellExploreTitle")}
          onClick={() => navigateToExploreEditor()}
        >
          {t("editor.shellExplore")}
        </button>
        <button
          type="button"
          className="v2-btn"
          title={t("editor.scriptsPanel")}
          onClick={ed.openScripts}
        >
          {t("editor.scriptsPanel")}
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.shortcutsTitle")}
          onClick={ed.openShortcuts}
        >
          <IconQuestion />
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("menu.settings")}
          onClick={ed.openSettings}
        >
          <IconSettings />
        </button>
      </div>
    </header>
  );
}
