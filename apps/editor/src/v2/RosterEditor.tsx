import { useState } from "react";
import { assetLists } from "../assets";
import { mediaUrl } from "../media";
import {
  DISPLAY_LOCALES,
  addCharacter,
  displayNameOf,
  firstFaceLogical,
  patchCharacter,
  removeCharacter,
  rosterOf,
} from "../roster";
import { Field } from "./fields";
import { IconPlus, IconTrash } from "./icons";
import type { Editor } from "./useEditorState";

const LOCALE_I18N: Record<(typeof DISPLAY_LOCALES)[number], string> = {
  "zh-Hant": "locale.zhHant",
  "zh-Hans": "locale.zhHans",
  en: "locale.en",
};

export function RosterEditor({ ed }: { ed: Editor }) {
  const { t, project, locale } = ed;
  const characters = rosterOf(project);
  const [selected, setSelected] = useState(0);
  const index = characters.length === 0 ? -1 : Math.min(selected, characters.length - 1);
  const ch = index >= 0 ? characters[index] : undefined;
  const lists = assetLists(ed.assets);

  if (!project) {
    return null;
  }

  return (
    <div className="v2-roster">
      <p className="v2-hint">{t("editor.rosterHint")}</p>
      <div className="v2-roster-split">
        <div className="v2-roster-list">
          {characters.length === 0 ? (
            <p className="v2-hint">{t("editor.rosterEmpty")}</p>
          ) : (
            characters.map((item, i) => {
              const face = firstFaceLogical(item.id, lists.facesFor(item.id));
              return (
                <button
                  key={`${item.id}-${i}`}
                  type="button"
                  className={`v2-roster-item${i === index ? " is-selected" : ""}`}
                  onClick={() => setSelected(i)}
                >
                  <span className="v2-roster-thumb">
                    {face ? <img src={mediaUrl(face)} alt="" /> : <span>{item.id.slice(0, 1) || "?"}</span>}
                  </span>
                  <span className="v2-roster-item-text">
                    <strong>{displayNameOf(item, locale)}</strong>
                    <code>{item.id || "—"}</code>
                  </span>
                </button>
              );
            })
          )}
          <button
            type="button"
            className="v2-btn v2-btn-block"
            onClick={() => {
              ed.patchProject(addCharacter(project));
              setSelected(characters.length);
            }}
          >
            <IconPlus />
            {t("editor.rosterAdd")}
          </button>
        </div>
        <div className="v2-roster-edit">
          {ch && index >= 0 ? (
            <>
              <Field label={t("editor.rosterId")}>
                <input
                  type="text"
                  value={ch.id}
                  onChange={(e) => ed.patchProject(patchCharacter(project, index, { id: e.target.value }))}
                />
              </Field>
              <div className="v2-field-row">
                {DISPLAY_LOCALES.map((loc) => (
                  <Field key={loc} label={t(LOCALE_I18N[loc])}>
                    <input
                      type="text"
                      value={ch.display?.[loc] ?? ""}
                      onChange={(e) =>
                        ed.patchProject(
                          patchCharacter(project, index, {
                            displayLocale: loc,
                            displayName: e.target.value,
                          }),
                        )
                      }
                    />
                  </Field>
                ))}
              </div>
              <Field label={t("editor.textRate")}>
                <input
                  type="number"
                  min={25}
                  max={400}
                  placeholder="100"
                  value={ch.textRate ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    ed.patchProject(
                      patchCharacter(project, index, {
                        textRate: raw === "" ? null : Number(raw),
                      }),
                    );
                  }}
                />
              </Field>
              <p className="v2-hint">
                {t("editor.affection")}: <code>{ch.id.trim() ? `${ch.id.trim()}_affection` : "—"}</code>
              </p>
              <button
                type="button"
                className="v2-btn v2-btn-danger"
                onClick={() => {
                  ed.patchProject(removeCharacter(project, index));
                  setSelected(Math.max(0, index - 1));
                }}
              >
                <IconTrash />
                {t("editor.rosterRemove")}
              </button>
            </>
          ) : (
            <p className="v2-hint">{t("editor.rosterEmpty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
