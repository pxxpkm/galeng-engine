import { useEffect, useRef, useState } from "react";
import type { Editor } from "./useEditorState";
import type { Locale } from "../types";
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
            {ed.dirty ? <span className="v2-dot" title={t("editor.dirty")} /> : null}
          </span>
        ) : null}
      </div>
      <div className="v2-topbar-group">
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
      <div className="v2-topbar-group">
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
        <ExportMenu ed={ed} />
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
        >
          <IconPlay />
          {t("menu.playFromHere")}
        </button>
        <select
          className="v2-select v2-locale"
          value={ed.locale}
          title={t("editor.language")}
          onChange={(e) => ed.setLocale(e.target.value as Locale)}
        >
          <option value="zh-Hant">{t("locale.zhHant")}</option>
          <option value="zh-Hans">{t("locale.zhHans")}</option>
          <option value="en">{t("locale.en")}</option>
        </select>
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
