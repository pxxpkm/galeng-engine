import { useMemo } from "react";
import { AssetField } from "../AssetField";
import { assetLists } from "../assets";
import { mediaUrl } from "../media";
import {
  fontDialogueOf,
  fontTitleOf,
  fontUiOf,
  patchFontRole,
} from "../project";
import type { Editor } from "./useEditorState";
import { Field } from "./fields";

/** Dedicated Font Manager surface (MVP): list fonts/, assign dialogue/ui/title roles. */
export function FontPanel({ ed }: { ed: Editor }) {
  const { t, project } = ed;
  if (!project) return null;

  const fonts = assetLists(ed.assets).fonts;
  const dialogue = fontDialogueOf(project) ?? "";
  const ui = fontUiOf(project) ?? "";
  const title = fontTitleOf(project) ?? "";

  const licenseHints = useMemo(
    () =>
      fonts.filter(
        (f) => f.toLowerCase().includes("ofl") || f.toLowerCase().includes("license"),
      ),
    [fonts],
  );

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
