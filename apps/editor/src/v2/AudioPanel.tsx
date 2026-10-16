import { useMemo, useState } from "react";
import { AssetField } from "../AssetField";
import { AuditionButton } from "../AuditionButton";
import { assetLists } from "../assets";
import {
  AUDIO_KIND_FILTERS,
  audioKindOf,
  citeCountMap,
  listAudioLogicals,
  patchMusicGalleryItem,
  removeMusicGalleryItem,
  type AudioKindFilter,
} from "../audioPanel";
import { addMusicItem, setOptionalPath } from "../project";
import { overviewOf } from "../overview";
import type { AssetMeta, Project, Scene } from "../types";
import { Field, Section } from "./fields";
import { IconPlus, IconTrash } from "./icons";

const FILTER_LABEL_KEYS: Record<AudioKindFilter, string> = {
  all: "editor.audioFilterAll",
  bgm: "editor.trackBgm",
  se: "editor.trackSe",
  amb: "editor.trackAmb",
  voice: "editor.trackVoice",
};

/** Thin host so Explore Settings can reuse AudioPanel without mounting V2 editor. */
export type AudioPanelHost = {
  t: (key: string) => string;
  project: Project | null;
  assets: AssetMeta[];
  /** Full scenes for cite counts (omit to skip beat-level cites). Named citeScenes so Editor.scenes (SceneMeta[]) does not clash. */
  citeScenes?: Scene[];
  patchProject: (next: Project) => void;
};

/** Dedicated Audio Manager: browse/preview assets + titleBgm / musicGallery. */
export function AudioPanel({ ed }: { ed: AudioPanelHost }) {
  const { t, project } = ed;
  const [filter, setFilter] = useState<AudioKindFilter>("all");
  const lists = assetLists(ed.assets);
  const logicals = useMemo(
    () => listAudioLogicals(ed.assets, filter),
    [ed.assets, filter],
  );
  const cites = useMemo(() => {
    if (!project) return new Map<string, number>();
    return citeCountMap(overviewOf(project, ed.citeScenes ?? [], ed.assets));
  }, [project, ed.citeScenes, ed.assets]);

  if (!project) return null;

  const music = project.musicGallery ?? [];

  return (
    <div className="v2-modal-body" data-testid="audio-panel">
      <p className="v2-hint">{t("editor.audioPanelHint")}</p>

      <Section title={t("editor.audioProject")}>
        <Field label={t("editor.titleBgm")}>
          <div className="v2-field-row" style={{ alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <AssetField
                value={project.titleBgm ?? ""}
                options={lists.bgm}
                t={t}
                placeholder="bgm/…"
                onChange={(value) =>
                  ed.patchProject(setOptionalPath(project, "titleBgm", value))
                }
              />
            </div>
            <AuditionButton logical={project.titleBgm ?? ""} t={t} />
          </div>
        </Field>

        <Section title={t("editor.musicGallery")}>
          <p className="v2-hint">{t("editor.audioGalleryHint")}</p>
          {music.map((item, i) => (
            <div key={i} className="v2-card v2-gallery-row">
              <div className="v2-field-row">
                <Field label={t("editor.musicId")}>
                  <input
                    type="text"
                    value={item.id}
                    onChange={(e) =>
                      ed.patchProject(
                        patchMusicGalleryItem(project, i, {
                          ...item,
                          id: e.target.value,
                        }),
                      )
                    }
                  />
                </Field>
                <Field label={t("editor.musicAsset")}>
                  <div className="v2-field-row" style={{ alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <AssetField
                        value={item.asset}
                        options={lists.bgm}
                        t={t}
                        onChange={(value) =>
                          ed.patchProject(
                            patchMusicGalleryItem(project, i, {
                              ...item,
                              asset: value,
                            }),
                          )
                        }
                      />
                    </div>
                    <AuditionButton logical={item.asset} t={t} />
                  </div>
                </Field>
              </div>
              <button
                type="button"
                className="v2-btn v2-btn-icon v2-gallery-del"
                title={t("editor.delMusic")}
                onClick={() => ed.patchProject(removeMusicGalleryItem(project, i))}
              >
                <IconTrash />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="v2-btn v2-btn-block"
            onClick={() => ed.patchProject(addMusicItem(project))}
          >
            <IconPlus />
            {t("editor.addMusic")}
          </button>
        </Section>
      </Section>

      <Section title={t("editor.audioLibrary")}>
        <div
          className="v2-tabs"
          style={{ padding: "0 0 8px", borderBottom: "1px solid var(--line)" }}
          role="tablist"
          aria-label={t("editor.audioLibrary")}
        >
          {AUDIO_KIND_FILTERS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={filter === kind}
              className={`v2-tab${filter === kind ? " active" : ""}`}
              data-testid={`audio-filter-${kind}`}
              onClick={() => setFilter(kind)}
            >
              {t(FILTER_LABEL_KEYS[kind])}
            </button>
          ))}
        </div>

        {logicals.length === 0 ? (
          <p className="v2-hint" data-testid="audio-library-empty">
            {t("editor.audioLibraryEmpty")}
          </p>
        ) : (
          <ul
            className="v2-audio-list"
            style={{
              listStyle: "none",
              margin: "8px 0 0",
              padding: 0,
              maxHeight: 260,
              overflow: "auto",
            }}
            data-testid="audio-library-list"
          >
            {logicals.map((logical) => {
              const kind = audioKindOf(logical);
              const count = cites.get(logical);
              return (
                <li
                  key={logical}
                  className="v2-audio-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 2px",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 12.5,
                  }}
                >
                  <AuditionButton logical={logical} t={t} />
                  <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {logical}
                  </code>
                  {kind ? (
                    <span className="v2-chip" style={{ flexShrink: 0 }}>
                      {t(FILTER_LABEL_KEYS[kind])}
                    </span>
                  ) : null}
                  {ed.citeScenes !== undefined && count !== undefined ? (
                    <span
                      className="v2-hint"
                      style={{ flexShrink: 0, margin: 0 }}
                      title={t("editor.audioCiteCount")}
                    >
                      ×{count}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
