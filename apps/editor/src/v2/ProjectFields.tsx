import { useState } from "react";
import {
  addMusicItem,
  setHideGameTitle,
  setOptionalPath,
  setPauseButton,
  setSkipTitle,
  setTitleButton,
} from "../project";
import { AssetField } from "../AssetField";
import { assetLists } from "../assets";
import type { GalleryItem, PauseButtonKey, TitleButton, TitleButtonKey } from "../types";
import { PAUSE_BUTTON_KEYS, TITLE_BUTTON_KEYS } from "../types";
import { Field, Section, Switch } from "./fields";
import { IconPlus, IconTrash } from "./icons";
import { PauseLayout, TitleLayout } from "./TitleLayout";
import type { Editor } from "./useEditorState";

const PAUSE_BTN_NAME: Record<PauseButtonKey, string> = {
  continue: "editor.pauseBtnContinue",
  quickSave: "editor.pauseBtnQuickSave",
  quickLoad: "editor.pauseBtnQuickLoad",
  autoLoad: "editor.pauseBtnAutoLoad",
  save: "editor.pauseBtnSave",
  load: "editor.pauseBtnLoad",
  settings: "editor.pauseBtnSettings",
  title: "editor.pauseBtnTitle",
  quit: "editor.pauseBtnQuit",
};

const TITLE_BTN_NAME: Record<TitleButtonKey, string> = {
  newGame: "editor.titleBtnNewGame",
  continue: "editor.titleBtnContinue",
  load: "editor.titleBtnLoad",
  gallery: "editor.titleBtnGallery",
  music: "editor.titleBtnMusic",
  settings: "editor.titleBtnSettings",
  quit: "editor.titleBtnQuit",
};

function parseCoord(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) {
    return undefined;
  }
  if (!/^-?\d+$/.test(text)) {
    return undefined;
  }
  return Number(text);
}

function parseSize(raw: string): number | undefined {
  const n = parseCoord(raw);
  if (n === undefined || n < 1) {
    return undefined;
  }
  return n;
}

function GalleryList({
  ed,
  items,
  assetOptions,
  idLabel,
  assetLabel,
  addLabel,
  onPatch,
  onAdd,
  onDel,
}: {
  ed: Editor;
  items: GalleryItem[];
  assetOptions: string[];
  idLabel: string;
  assetLabel: string;
  addLabel: string;
  onPatch: (index: number, item: GalleryItem) => void;
  onAdd: () => void;
  onDel: (index: number) => void;
}) {
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="v2-card v2-gallery-row">
          <div className="v2-field-row">
            <Field label={idLabel}>
              <input
                type="text"
                value={item.id}
                onChange={(e) => onPatch(i, { ...item, id: e.target.value })}
              />
            </Field>
            <Field label={assetLabel}>
              <AssetField
                value={item.asset}
                options={assetOptions}
                t={ed.t}
                onChange={(value) => onPatch(i, { ...item, asset: value })}
              />
            </Field>
          </div>
          <button
            type="button"
            className="v2-btn v2-btn-icon v2-gallery-del"
            title={ed.t("editor.delCg")}
            onClick={() => onDel(i)}
          >
            <IconTrash />
          </button>
        </div>
      ))}
      <button type="button" className="v2-btn v2-btn-block" onClick={onAdd}>
        <IconPlus />
        {addLabel}
      </button>
    </>
  );
}

export function ProjectFields({ ed }: { ed: Editor }) {
  const { t, project } = ed;
  const lists = assetLists(ed.assets);
  if (!project) return null;
  const cg = project.cg ?? [];
  const music = project.musicGallery ?? [];
  return (
    <>
      <Section title={t("editor.project")}>
        <Field label={t("editor.projectTitle")}>
          <input
            type="text"
            value={project.title}
            onChange={(e) => ed.patchProject({ ...project, title: e.target.value })}
          />
        </Field>
        <Field label={t("editor.startScene")}>
          <select
            className="v2-select"
            value={project.startScene}
            onChange={(e) => ed.patchProject({ ...project, startScene: e.target.value })}
          >
            {ed.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title ?? s.id}
              </option>
            ))}
          </select>
        </Field>
        <Switch
          checked={project.skipTitle ?? false}
          label={t("editor.skipTitle")}
          onChange={(on) => ed.patchProject(setSkipTitle(project, on))}
        />
        <Switch
          checked={project.hideGameTitle ?? false}
          label={t("editor.hideGameTitle")}
          onChange={(on) => ed.patchProject(setHideGameTitle(project, on))}
        />
        <Field label={t("editor.titleBgm")}>
          <AssetField
            value={project.titleBgm ?? ""}
            options={lists.bgm}
            t={t}
            placeholder="bgm/park"
            onChange={(value) => ed.patchProject(setOptionalPath(project, "titleBgm", value))}
          />
        </Field>
        <Field label={t("editor.titleBg")}>
          <AssetField
            value={project.titleBg ?? ""}
            options={lists.bg}
            t={t}
            placeholder="bg/park_afternoon"
            onChange={(value) => ed.patchProject(setOptionalPath(project, "titleBg", value))}
          />
        </Field>
        <Field label={t("editor.titleMovie")}>
          <AssetField
            value={project.titleMovie ?? ""}
            options={lists.movie}
            t={t}
            placeholder="movie/op"
            onChange={(value) => ed.patchProject(setOptionalPath(project, "titleMovie", value))}
          />
        </Field>
        <Field label={t("editor.font")}>
          <AssetField
            value={project.font ?? ""}
            options={lists.fonts}
            t={t}
            placeholder="fonts/mplus"
            onChange={(value) => ed.patchProject(setOptionalPath(project, "font", value))}
          />
        </Field>
        <Field label={t("editor.msgBox")}>
          <AssetField
            value={project.msgBox ?? ""}
            options={lists.ui.length > 0 ? lists.ui : lists.images}
            t={t}
            placeholder="ui/msgbox"
            onChange={(value) => ed.patchProject(setOptionalPath(project, "msgBox", value))}
          />
        </Field>
        <Field label={t("editor.assetRoot")}>
          <p className="v2-hint" title={ed.assetRoot?.path}>
            {ed.assetRoot?.path ?? ""}
          </p>
          <div className="v2-pack-row">
            <button type="button" className="v2-btn" onClick={() => void ed.browseAssetRoot()}>
              {t("editor.assetBrowse")}
            </button>
            <button
              type="button"
              className="v2-btn"
              disabled={!ed.assetRoot || ed.assetRoot.isDefault}
              onClick={() => void ed.resetAssetRoot()}
            >
              {t("editor.assetDefault")}
            </button>
          </div>
          <p className="v2-hint">{t("editor.assetHint")}</p>
        </Field>
        <Field label={t("editor.icon")}>
          <AssetField
            value={project.icon ?? ""}
            options={lists.ui.length > 0 ? lists.ui : lists.images}
            t={t}
            placeholder="ui/icon"
            onChange={(value) => ed.patchProject(setOptionalPath(project, "icon", value))}
          />
        </Field>
      </Section>

      <Section title={t("editor.cgGallery")}>
        <GalleryList
          ed={ed}
          items={cg}
          assetOptions={lists.cg}
          idLabel={t("editor.cgId")}
          assetLabel={t("editor.cgAsset")}
          addLabel={t("editor.addCg")}
          onPatch={(i, item) => {
            const next = cg.slice();
            next[i] = item;
            ed.patchProject({ ...project, cg: next });
          }}
          onAdd={() => {
            const n = cg.length + 1;
            ed.patchProject({ ...project, cg: [...cg, { id: `cg_${n}`, asset: "cg/still" }] });
          }}
          onDel={(i) => ed.patchProject({ ...project, cg: cg.filter((_, j) => j !== i) })}
        />
      </Section>

      <Section title={t("editor.musicGallery")}>
        <GalleryList
          ed={ed}
          items={music}
          assetOptions={lists.bgm}
          idLabel={t("editor.musicId")}
          assetLabel={t("editor.musicAsset")}
          addLabel={t("editor.addMusic")}
          onPatch={(i, item) => {
            const next = music.slice();
            next[i] = item;
            ed.patchProject({ ...project, musicGallery: next });
          }}
          onAdd={() => ed.patchProject(addMusicItem(project))}
          onDel={(i) =>
            ed.patchProject({ ...project, musicGallery: music.filter((_, j) => j !== i) })
          }
        />
      </Section>
    </>
  );
}

function ChromeButtonList<K extends string>({
  ed,
  keys,
  names,
  getBtn,
  onPatch,
  selected,
  onSelect,
}: {
  ed: Editor;
  keys: readonly K[];
  names: Record<K, string>;
  getBtn: (key: K) => TitleButton;
  onPatch: (key: K, patch: TitleButton) => void;
  selected: K;
  onSelect: (key: K) => void;
}) {
  const { t, project } = ed;
  const lists = assetLists(ed.assets);
  if (!project) {
    return null;
  }
  const ui = lists.ui.length > 0 ? lists.ui : lists.images;
  return (
    <>
      {keys.map((key) => {
        const btn = getBtn(key);
        return (
          <div
            key={key}
            className={`v2-card v2-gallery-row${selected === key ? " is-title-sel" : ""}`}
            onClick={() => onSelect(key)}
          >
            <Field label={t(names[key])}>
              <input
                type="text"
                value={btn.label ?? ""}
                placeholder={t(names[key])}
                onChange={(e) => onPatch(key, { label: e.target.value })}
              />
            </Field>
            <Field label={t("editor.titleBtnImage")}>
              <div className="v2-pack-row">
                <AssetField
                  value={btn.image ?? ""}
                  options={ui}
                  t={t}
                  placeholder="ui/btn"
                  onChange={(value) => onPatch(key, { image: value || undefined })}
                />
                <button
                  type="button"
                  className="v2-btn"
                  onClick={() => {
                    void ed.browseAssetFile().then((logical) => {
                      if (logical) {
                        onPatch(key, { image: logical });
                      }
                    });
                  }}
                >
                  {t("editor.assetBrowse")}
                </button>
              </div>
            </Field>
            <Field label={t("editor.titleBtnHover")}>
              <div className="v2-pack-row">
                <AssetField
                  value={btn.hover ?? ""}
                  options={ui}
                  t={t}
                  placeholder="ui/btn_h"
                  onChange={(value) => onPatch(key, { hover: value || undefined })}
                />
                <button
                  type="button"
                  className="v2-btn"
                  onClick={() => {
                    void ed.browseAssetFile().then((logical) => {
                      if (logical) {
                        onPatch(key, { hover: logical });
                      }
                    });
                  }}
                >
                  {t("editor.assetBrowse")}
                </button>
              </div>
            </Field>
            <div className="v2-field-row">
              <Field label={t("editor.titleBtnX")}>
                <input
                  type="text"
                  value={btn.x ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      onPatch(key, { x: undefined });
                      return;
                    }
                    const n = parseCoord(raw);
                    if (n !== undefined) {
                      onPatch(key, { x: n });
                    }
                  }}
                />
              </Field>
              <Field label={t("editor.titleBtnY")}>
                <input
                  type="text"
                  value={btn.y ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      onPatch(key, { y: undefined });
                      return;
                    }
                    const n = parseCoord(raw);
                    if (n !== undefined) {
                      onPatch(key, { y: n });
                    }
                  }}
                />
              </Field>
              <Field label={t("editor.titleBtnW")}>
                <input
                  type="text"
                  value={btn.w ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      onPatch(key, { w: undefined });
                      return;
                    }
                    const n = parseSize(raw);
                    if (n !== undefined) {
                      onPatch(key, { w: n });
                    }
                  }}
                />
              </Field>
              <Field label={t("editor.titleBtnH")}>
                <input
                  type="text"
                  value={btn.h ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      onPatch(key, { h: undefined });
                      return;
                    }
                    const n = parseSize(raw);
                    if (n !== undefined) {
                      onPatch(key, { h: n });
                    }
                  }}
                />
              </Field>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function ScreenButtonsFields({ ed }: { ed: Editor }) {
  const { t, project } = ed;
  const [titleSel, setTitleSel] = useState<TitleButtonKey>("newGame");
  const [pauseSel, setPauseSel] = useState<PauseButtonKey>("continue");
  if (!project) {
    return null;
  }
  return (
    <>
      <Section title={t("editor.titleButtons")}>
        <TitleLayout ed={ed} selected={titleSel} onSelect={setTitleSel} />
        <ChromeButtonList
          ed={ed}
          keys={TITLE_BUTTON_KEYS}
          names={TITLE_BTN_NAME}
          getBtn={(key) => project.titleButtons?.[key] ?? {}}
          onPatch={(key, patch) => ed.patchProject(setTitleButton(project, key, patch))}
          selected={titleSel}
          onSelect={setTitleSel}
        />
      </Section>
      <Section title={t("editor.pauseButtons")}>
        <PauseLayout ed={ed} selected={pauseSel} onSelect={setPauseSel} />
        <ChromeButtonList
          ed={ed}
          keys={PAUSE_BUTTON_KEYS}
          names={PAUSE_BTN_NAME}
          getBtn={(key) => project.pauseButtons?.[key] ?? {}}
          onPatch={(key, patch) => ed.patchProject(setPauseButton(project, key, patch))}
          selected={pauseSel}
          onSelect={setPauseSel}
        />
      </Section>
    </>
  );
}
