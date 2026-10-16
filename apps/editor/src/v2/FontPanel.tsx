import { useMemo } from "react";
import { AssetField } from "../AssetField";
import { assetLists } from "../assets";
import { mediaUrl } from "../media";
import {
  FONT_SCALE_DEFAULTS,
  FONT_SCALE_KEYS,
  fontDialogueOf,
  fontTitleOf,
  fontUiOf,
  patchFontRole,
  patchFontScale,
  type FontScaleKey,
} from "../project";
import type { Editor } from "./useEditorState";
import { Field, Section } from "./fields";

const SCALE_LABEL_KEYS: Record<FontScaleKey, string> = {
  dialogueBody: "editor.fontScaleDialogueBody",
  speaker: "editor.fontScaleSpeaker",
  explorePill: "editor.fontScaleExplorePill",
  inventory: "editor.fontScaleInventory",
  hud: "editor.fontScaleHud",
  title: "editor.fontScaleTitle",
  menu: "editor.fontScaleMenu",
  settings: "editor.fontScaleSettings",
};

/** Dedicated Font Manager surface: roles + type-scale knobs. */
export function FontPanel({ ed }: { ed: Editor }) {
  const { t, project } = ed;
  const fonts = assetLists(ed.assets).fonts;
  const licenseHints = useMemo(
    () =>
      fonts.filter(
        (f) => f.toLowerCase().includes("ofl") || f.toLowerCase().includes("license"),
      ),
    [fonts],
  );
  if (!project) return null;

  const dialogue = fontDialogueOf(project) ?? "";
  const ui = fontUiOf(project) ?? "";
  const title = fontTitleOf(project) ?? "";
  const scale = project.fonts?.scale;

  return (
    <div className="v2-modal-body">
      <p className="v2-hint">{t("editor.fontsPanelHint")}</p>

      <Field label={t("editor.fontDialogue")}>
        <AssetField
          value={dialogue}
          options={fonts}
          t={t}
          placeholder="fonts/…"
          onChange={(value) => ed.patchProject(patchFontRole(project, "dialogue", value))}
        />
      </Field>
      <Field label={t("editor.fontUi")}>
        <AssetField
          value={ui}
          options={fonts}
          t={t}
          placeholder="fonts/…"
          onChange={(value) => ed.patchProject(patchFontRole(project, "ui", value))}
        />
      </Field>
      <Field label={t("editor.fontTitle")}>
        <AssetField
          value={title}
          options={fonts}
          t={t}
          placeholder="fonts/…"
          onChange={(value) => ed.patchProject(patchFontRole(project, "title", value))}
        />
      </Field>

      <Section title={t("editor.fontScale")}>
        <p className="v2-hint">{t("editor.fontScaleHint")}</p>
        <div className="v2-field-row v2-font-scale">
          {FONT_SCALE_KEYS.map((key) => (
            <Field key={key} label={t(SCALE_LABEL_KEYS[key])}>
              <input
                type="number"
                min={1}
                step={1}
                value={scale?.[key] ?? ""}
                placeholder={String(FONT_SCALE_DEFAULTS[key])}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") {
                    ed.patchProject(patchFontScale(project, key, undefined));
                    return;
                  }
                  const n = Number(raw);
                  ed.patchProject(
                    patchFontScale(project, key, Number.isNaN(n) ? undefined : n),
                  );
                }}
              />
            </Field>
          ))}
        </div>
      </Section>

      <div className="v2-field">
        <label>{t("editor.fontLibrary")}</label>
        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflow: "auto" }}>
          {fonts.length === 0 ? (
            <li className="v2-hint">{t("editor.fontLibraryEmpty")}</li>
          ) : (
            fonts.map((logical) => (
              <li key={logical}>
                <code>{logical}</code>{" "}
                <a href={mediaUrl(logical)} target="_blank" rel="noreferrer">
                  {t("editor.fontOpen")}
                </a>
              </li>
            ))
          )}
        </ul>
      </div>

      {licenseHints.length > 0 && (
        <div className="v2-field">
          <label>{t("editor.fontLicense")}</label>
          <p className="v2-hint">{t("editor.fontLicenseHint")}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {licenseHints.map((logical) => (
              <li key={logical}>
                <a href={mediaUrl(logical)} target="_blank" rel="noreferrer">
                  {logical}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="v2-hint">{t("editor.fontDeprecatedAlias")}</p>
    </div>
  );
}
