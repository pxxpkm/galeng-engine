import {
  DISPLAY_LOCALES,
  addCharacter,
  affectionDeltaOf,
  affectionKey,
  patchCharacter,
  removeCharacter,
  rosterOf,
  setAffectionDelta,
  speakerOptions,
  type AffectionDelta,
} from "./roster";
import type { Character, ChoiceOption, Project } from "./types";

const LOCALE_I18N: Record<(typeof DISPLAY_LOCALES)[number], string> = {
  "zh-Hant": "locale.zhHant",
  "zh-Hans": "locale.zhHans",
  en: "locale.en",
};

export function SpeakerSelect({
  value,
  characters,
  onChange,
  t,
  disabled,
}: {
  value: string;
  characters: Character[];
  onChange: (id: string) => void;
  t: (key: string) => string;
  disabled?: boolean;
}) {
  const options = speakerOptions(characters, value);
  if (options.length === 0) {
    return (
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <select
      className="v2-select"
      value={value}
      disabled={disabled}
      aria-label={t("editor.speaker")}
      onChange={(e) => onChange(e.target.value)}
    >
      {value ? null : <option value="">{t("editor.speaker")}</option>}
      {options.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  );
}

export function AffectionMeter({ id }: { id: string }) {
  const key = id.trim() ? affectionKey(id) : "";
  return (
    <div className="roster-meter" title={key || undefined}>
      <span className="roster-meter-pips" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      {key ? <code className="roster-var">{key}</code> : null}
    </div>
  );
}

export function AffectionRow({
  characters,
  set,
  onChange,
  t,
}: {
  characters: Character[];
  set: ChoiceOption["set"] | undefined;
  onChange: (set: ChoiceOption["set"]) => void;
  t: (key: string) => string;
}) {
  if (characters.length === 0) return null;
  return (
    <div className="roster-aff-list">
      {characters.map((ch) => {
        if (!ch.id) return null;
        const delta = affectionDeltaOf(set, ch.id);
        const setDelta = (next: AffectionDelta) => onChange(setAffectionDelta(set, ch.id, next));
        return (
          <div key={ch.id} className="roster-aff">
            <span className="roster-aff-id">{ch.id}</span>
            <div className="roster-aff-btns" role="group" aria-label={affectionKey(ch.id)}>
              <button
                type="button"
                className={delta === -1 ? "active" : undefined}
                onClick={() => setDelta(delta === -1 ? 0 : -1)}
              >
                {t("editor.affectionMinus")}
              </button>
              <button
                type="button"
                className={delta === 0 ? "active" : undefined}
                onClick={() => setDelta(0)}
              >
                {t("editor.affectionNone")}
              </button>
              <button
                type="button"
                className={delta === 1 ? "active" : undefined}
                onClick={() => setDelta(delta === 1 ? 0 : 1)}
              >
                {t("editor.affectionPlus")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RosterPanel({
  project,
  onChange,
  t,
}: {
  project: Project | null;
  onChange: (project: Project) => void;
  t: (key: string) => string;
}) {
  const characters = rosterOf(project);
  return (
    <div className="roster">
      {characters.map((ch, i) => (
        <div key={i} className="roster-card">
          <label>{t("editor.rosterId")}</label>
          <input
            type="text"
            value={ch.id}
            disabled={!project}
            onChange={(e) => project && onChange(patchCharacter(project, i, { id: e.target.value }))}
          />
          {DISPLAY_LOCALES.map((locale) => (
            <div key={locale}>
              <label>{t(LOCALE_I18N[locale])}</label>
              <input
                type="text"
                value={ch.display?.[locale] ?? ""}
                disabled={!project}
                onChange={(e) =>
                  project &&
                  onChange(
                    patchCharacter(project, i, {
                      displayLocale: locale,
                      displayName: e.target.value,
                    }),
                  )
                }
              />
            </div>
          ))}
          <label>{t("editor.textRate")}</label>
          <input
            type="number"
            min={25}
            max={400}
            placeholder="100"
            value={ch.textRate ?? ""}
            disabled={!project}
            onChange={(e) => {
              if (!project) return;
              const raw = e.target.value;
              onChange(
                patchCharacter(project, i, {
                  textRate: raw === "" ? null : Number(raw),
                }),
              );
            }}
          />
          <AffectionMeter id={ch.id} />
          <button
            type="button"
            disabled={!project}
            onClick={() => project && onChange(removeCharacter(project, i))}
          >
            {t("editor.rosterRemove")}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={!project}
        onClick={() => project && onChange(addCharacter(project))}
      >
        {t("editor.rosterAdd")}
      </button>
    </div>
  );
}
