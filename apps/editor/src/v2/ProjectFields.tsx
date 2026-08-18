import { addMusicItem, setOptionalPath, setSkipTitle } from "../project";
import { AssetField } from "../AssetField";
import { assetLists } from "../assets";
import { RosterPanel } from "../RosterUi";
import type { GalleryItem } from "../types";
import { Field, Section, Switch } from "./fields";
import { IconPlus, IconTrash } from "./icons";
import type { Editor } from "./useEditorState";

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

      <Section title={t("editor.roster")}>
        <RosterPanel project={project} onChange={ed.patchProject} t={t} />
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
