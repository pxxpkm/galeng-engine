import { useEffect } from "react";
import {
  addStageChar,
  fallbackStageCharId,
  beatFoldSummary,
  ambDisplay,
  cgDisplay,
  closeAmb,
  closeCg,
  inheritCamera,
  resetCamera,
  setCameraField,
  MAX_STAGE_CHARS,
  patchSay,
  patchStageChar,
  setCharOffset,
  setCharSlideMs,
  removeStageChar,
  seDisplay,
  setAmb,
  setAutoAdvance,
  setBeatLabel,
  setBg,
  setBgMs,
  setBgTrans,
  setCg,
  setFx,
  setMovie,
  setSayVoice,
  setSe,
} from "../beats";
import {
  emptyChoice,
  exitKind,
  formatSet,
  parseSet,
  patchChoiceIf,
  readBranch,
  readCond,
  setExitKind,
  writeBranch,
  type BranchForm,
  type ExitKind,
} from "../exit";
import { gotoOptions } from "../goto";
import { AssetField } from "../AssetField";
import { assetLists, charAssetPath, isMissingAsset } from "../assets";
import { AffectionRow, SpeakerSelect } from "../RosterUi";
import { rosterOf } from "../roster";
import type { ChoiceOption, Exit } from "../types";
import { Field, Fold, Section, Seg } from "./fields";
import { IconPlus, IconTrash } from "./icons";
import type { Editor } from "./useEditorState";

type Slot = "left" | "center" | "right";

function GotoField({
  ed,
  label,
  value,
  onChange,
}: {
  ed: Editor;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = gotoOptions(ed.scenes, value);
  return (
    <Field label={label}>
      <div className="v2-goto">
        <select className="v2-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={ed.t("editor.gotoNew")}
          onClick={() => ed.requestNewScene(onChange)}
        >
          <IconPlus />
        </button>
      </div>
    </Field>
  );
}

function BeatTab({ ed }: { ed: Editor }) {
  const { t, beat } = ed;
  const lists = assetLists(ed.assets);
  const chars = beat?.chars ?? [];
  const folds = beatFoldSummary(beat ?? {});
  const autoKind =
    beat?.say?.autoAdvance?.type === "voice"
      ? "voice"
      : beat?.say?.autoAdvance?.type === "ms"
        ? "ms"
        : "none";

  return (
    <>
      <div className="v2-inspector-caption">#{ed.beatIndex}</div>

      <Section title={t("editor.secDialogue")}>
        <Field label={t("editor.speaker")}>
          <SpeakerSelect
            value={beat?.say?.speaker ?? ""}
            characters={rosterOf(ed.project)}
            t={t}
            onChange={(speaker) => ed.updateBeat((cur) => patchSay(cur, { speaker }))}
          />
        </Field>
        <Field label={t("editor.line")}>
          <textarea
            rows={3}
            value={beat?.say?.text ?? ""}
            onChange={(e) => ed.updateBeat((cur) => patchSay(cur, { text: e.target.value }))}
          />
        </Field>
        <Field label={t("editor.beatLabel")}>
          <input
            type="text"
            value={beat?.label ?? ""}
            onChange={(e) => ed.updateBeat((cur) => setBeatLabel(cur, e.target.value))}
          />
        </Field>
        <Field label={t("editor.voice")}>
          <AssetField
            value={beat?.say?.voice ?? ""}
            options={lists.voice}
            t={t}
            disabled={!beat?.say}
            placeholder="voice/sora/001"
            onChange={(value) => ed.updateBeat((cur) => setSayVoice(cur, value))}
          />
        </Field>
        <Field label={t("editor.autoAdvance")}>
          <select
            className="v2-select"
            value={autoKind}
            disabled={!beat?.say}
            onChange={(e) => {
              const kind = e.target.value as "none" | "voice" | "ms";
              ed.updateBeat((cur) =>
                setAutoAdvance(
                  cur,
                  kind,
                  cur.say?.autoAdvance && "ms" in cur.say.autoAdvance ? cur.say.autoAdvance.ms : 3000,
                ),
              );
            }}
          >
            <option value="none">{t("editor.autoNone")}</option>
            <option value="voice">{t("editor.autoVoice")}</option>
            <option value="ms">{t("editor.autoMs")}</option>
          </select>
        </Field>
        {beat?.say?.autoAdvance?.type === "ms" ? (
          <Field label={t("editor.autoMs")}>
            <input
              type="number"
              min={0}
              value={beat.say.autoAdvance.ms}
              onChange={(e) =>
                ed.updateBeat((cur) => setAutoAdvance(cur, "ms", Number(e.target.value) || 0))
              }
            />
          </Field>
        ) : null}
      </Section>

      <Fold title={t("editor.secStage")} summary={folds.stage}>
        <Field label={t("editor.trackBg")}>
          <AssetField
            value={beat?.bg?.asset ?? ""}
            options={lists.bg}
            t={t}
            onChange={(value) => ed.updateBeat((cur) => setBg(cur, value))}
          />
        </Field>
        <div className="v2-field-row">
          <Field label={t("editor.bgTrans")}>
            <select
              className="v2-select"
              value={beat?.bg?.trans ?? "none"}
              disabled={!beat?.bg}
              onChange={(e) => ed.updateBeat((cur) => setBgTrans(cur, e.target.value))}
            >
              <option value="none">{t("editor.transNone")}</option>
              <option value="fade">{t("editor.transFade")}</option>
              <option value="crossfade">{t("editor.transCrossfade")}</option>
            </select>
          </Field>
          <Field label={t("editor.bgMs")}>
            <input
              type="number"
              min={0}
              value={beat?.bg?.ms ?? ""}
              disabled={!beat?.bg}
              onChange={(e) => ed.updateBeat((cur) => setBgMs(cur, e.target.value))}
            />
          </Field>
        </div>
        <Field label={t("editor.trackChar")}>
          {chars.map((ch, i) => (
            <div key={`${i}-${ch.slot}`} className="v2-stage-row">
              <AssetField
                value={ch.id}
                options={lists.charIds}
                t={t}
                warn={false}
                placeholder="id"
                onChange={(value) =>
                  ed.updateBeat((cur) => patchStageChar(cur, i, { id: value }))
                }
              />
              <AssetField
                value={ch.face}
                options={lists.facesFor(ch.id)}
                t={t}
                warn={false}
                placeholder={t("editor.face")}
                onChange={(value) =>
                  ed.updateBeat((cur) => patchStageChar(cur, i, { face: value }))
                }
              />
              <Seg<Slot>
                value={ch.slot ?? "center"}
                onChange={(slot) => ed.updateBeat((cur) => patchStageChar(cur, i, { slot }))}
                options={[
                  { value: "left", label: "left" },
                  { value: "center", label: "center" },
                  { value: "right", label: "right" },
                ]}
              />
              <div className="v2-field-row">
                <Field label={t("editor.charX")}>
                  <input
                    type="number"
                    value={ch.x ?? 0}
                    onChange={(e) =>
                      ed.updateBeat((cur) => setCharOffset(cur, i, Number(e.target.value) || 0, ch.y ?? 0))
                    }
                  />
                </Field>
                <Field label={t("editor.charY")}>
                  <input
                    type="number"
                    value={ch.y ?? 0}
                    onChange={(e) =>
                      ed.updateBeat((cur) => setCharOffset(cur, i, ch.x ?? 0, Number(e.target.value) || 0))
                    }
                  />
                </Field>
                <Field label={t("editor.charSlide")}>
                  <input
                    type="number"
                    min={0}
                    value={ch.slideMs ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      ed.updateBeat((cur) => setCharSlideMs(cur, i, e.target.value))
                    }
                  />
                </Field>
              </div>
              <button
                type="button"
                className="v2-btn v2-btn-icon"
                title={t("editor.delChar")}
                onClick={() => ed.updateBeat((cur) => removeStageChar(cur, i))}
              >
                <IconTrash />
              </button>
              {isMissingAsset(charAssetPath(ch.id, ch.face), lists.known) ? (
                <div className="asset-missing">{t("editor.assetMissing")}</div>
              ) : null}
            </div>
          ))}
          {chars.length < MAX_STAGE_CHARS ? (
            <button
              type="button"
              className="v2-btn"
              onClick={() =>
                ed.updateBeat((cur) =>
                  addStageChar(
                    cur,
                    fallbackStageCharId(
                      [...rosterOf(ed.project).map((ch) => ch.id), ...lists.charIds],
                      cur.chars,
                    ),
                  ),
                )
              }
            >
              <IconPlus /> {t("editor.addChar")}
            </button>
          ) : null}
        </Field>
      </Fold>

      <Fold title={t("editor.secAudio")} summary={folds.audio}>
        <Field label={t("editor.trackBgm")}>
          <AssetField
            value={beat?.bgm?.asset ?? ""}
            options={lists.bgm}
            t={t}
            onChange={(value) =>
              ed.updateBeat((cur) => ({
                ...cur,
                bgm: value ? { asset: value, fadeMs: cur.bgm?.fadeMs } : undefined,
              }))
            }
          />
        </Field>
        <div className="v2-field-row">
          <Field label={t("editor.bgmFade")}>
            <input
              type="number"
              min={0}
              value={beat?.bgm?.fadeMs ?? ""}
              disabled={!beat?.bgm}
              onChange={(e) =>
                ed.updateBeat((cur) => {
                  if (!cur.bgm) return cur;
                  const raw = e.target.value;
                  const fadeMs = raw === "" ? undefined : Number(raw);
                  return {
                    ...cur,
                    bgm: {
                      ...cur.bgm,
                      fadeMs: fadeMs !== undefined && Number.isFinite(fadeMs) ? fadeMs : undefined,
                    },
                  };
                })
              }
            />
          </Field>
          <Field label={t("editor.se")}>
            <AssetField
              value={seDisplay(beat)}
              options={lists.se}
              t={t}
              placeholder="se/breeze"
              onChange={(value) => ed.updateBeat((cur) => setSe(cur, value))}
            />
          </Field>
        </div>
        <Field label={t("editor.amb")}>
          <AssetField
            value={ambDisplay(beat)}
            options={lists.amb}
            t={t}
            placeholder="amb/rain"
            onChange={(value) => ed.updateBeat((cur) => setAmb(cur, value))}
          />
        </Field>
        <Seg<"inherit" | "off">
          value={beat?.amb === null ? "off" : "inherit"}
          onChange={(v) =>
            ed.updateBeat((cur) => (v === "off" ? closeAmb(cur) : setAmb(cur, "")))
          }
          options={[
            { value: "inherit", label: t("editor.ambInherit") },
            { value: "off", label: t("editor.ambOff") },
          ]}
        />
      </Fold>

      <Fold title={t("editor.secVisual")} summary={folds.visual}>
        <Field label={t("editor.cg")}>
          <AssetField
            value={cgDisplay(beat)}
            options={lists.cg}
            t={t}
            placeholder="cg/op_still"
            onChange={(value) => ed.updateBeat((cur) => setCg(cur, value))}
          />
        </Field>
        <Seg<"inherit" | "off">
          value={beat?.cg === null ? "off" : "inherit"}
          onChange={(v) =>
            ed.updateBeat((cur) => (v === "off" ? closeCg(cur) : setCg(cur, "")))
          }
          options={[
            { value: "inherit", label: t("editor.cgInherit") },
            { value: "off", label: t("editor.cgOff") },
          ]}
        />
        <Field label={t("editor.movie")}>
          <AssetField
            value={beat?.movie?.asset ?? ""}
            options={lists.movie}
            t={t}
            placeholder="movie/op"
            onChange={(value) => ed.updateBeat((cur) => setMovie(cur, value))}
          />
        </Field>
        <Field label={t("editor.camera")}>
          <div className="v2-field-row">
            <Field label={t("editor.cameraX")}>
              <input
                type="number"
                value={beat?.camera === undefined ? "" : (beat.camera?.x ?? 0)}
                onChange={(e) => ed.updateBeat((cur) => setCameraField(cur, "x", e.target.value))}
              />
            </Field>
            <Field label={t("editor.cameraY")}>
              <input
                type="number"
                value={beat?.camera === undefined ? "" : (beat.camera?.y ?? 0)}
                onChange={(e) => ed.updateBeat((cur) => setCameraField(cur, "y", e.target.value))}
              />
            </Field>
            <Field label={t("editor.cameraZoom")}>
              <input
                type="number"
                min={50}
                max={400}
                value={beat?.camera === undefined ? "" : (beat.camera?.zoom ?? 100)}
                onChange={(e) => ed.updateBeat((cur) => setCameraField(cur, "zoom", e.target.value))}
              />
            </Field>
          </div>
        </Field>
        <Seg<"inherit" | "off">
          value={beat?.camera === null ? "off" : "inherit"}
          onChange={(v) =>
            ed.updateBeat((cur) => (v === "off" ? resetCamera(cur) : inheritCamera(cur)))
          }
          options={[
            { value: "inherit", label: t("editor.cameraInherit") },
            { value: "off", label: t("editor.cameraReset") },
          ]}
        />
        <div className="v2-field-row">
          <Field label={t("editor.fx")}>
            <select
              className="v2-select"
              value={beat?.fx?.type ?? "none"}
              onChange={(e) =>
                ed.updateBeat((cur) =>
                  setFx(cur, e.target.value as "none" | "wait" | "shake" | "flash", cur.fx?.ms),
                )
              }
            >
              <option value="none">{t("editor.fxNone")}</option>
              <option value="wait">{t("editor.fxWait")}</option>
              <option value="shake">{t("editor.fxShake")}</option>
              <option value="flash">{t("editor.fxFlash")}</option>
            </select>
          </Field>
          <Field label={t("editor.fxMs")}>
            <input
              type="number"
              min={0}
              value={beat?.fx?.ms ?? ""}
              disabled={!beat?.fx}
              onChange={(e) => {
                const kind =
                  beat?.fx?.type === "wait" || beat?.fx?.type === "flash" || beat?.fx?.type === "shake"
                    ? beat.fx.type
                    : "shake";
                const raw = e.target.value;
                ed.updateBeat((cur) => setFx(cur, kind, raw === "" ? undefined : Number(raw)));
              }}
            />
          </Field>
        </div>
      </Fold>
    </>
  );
}

function ChoicesEditor({
  ed,
  exit,
}: {
  ed: Editor;
  exit: Extract<Exit, { type: "choices" }>;
}) {
  const { t, scene } = ed;
  if (!scene) return null;
  const commit = (options: ChoiceOption[]) =>
    ed.commitScene({ ...scene, exit: { type: "choices", options } });
  const patch = (i: number, opt: ChoiceOption) => {
    const options = exit.options.slice();
    options[i] = opt;
    commit(options);
  };
  return (
    <>
      {exit.options.map((opt, i) => {
        const cond = readCond(opt.if);
        return (
          <div key={i} className={`v2-card${ed.focusChoice === i ? " v2-card-focus" : ""}`}>
            <Field label={t("editor.choiceText")}>
              <input
                type="text"
                value={opt.text}
                onChange={(e) => patch(i, { ...opt, text: e.target.value })}
              />
            </Field>
            <GotoField
              ed={ed}
              label={t("editor.goto")}
              value={opt.goto}
              onChange={(goto) => patch(i, { ...opt, goto })}
            />
            <Field label={t("editor.affection")}>
              <AffectionRow
                characters={rosterOf(ed.project)}
                set={opt.set}
                t={ed.t}
                onChange={(set) => patch(i, { ...opt, set })}
              />
            </Field>
            <Field label={t("editor.choiceSet")}>
              <input
                type="text"
                value={formatSet(opt.set)}
                onChange={(e) => patch(i, { ...opt, set: parseSet(e.target.value) })}
              />
            </Field>
            <Field label={t("editor.choiceIf")}>
              <div className="v2-cond">
                <input
                  type="text"
                  list="v2-var-names"
                  placeholder={t("editor.branchVar")}
                  value={cond.name}
                  onChange={(e) => patch(i, patchChoiceIf(opt, { ...cond, name: e.target.value }))}
                />
                <select
                  className="v2-select"
                  value={cond.op}
                  onChange={(e) =>
                    patch(i, patchChoiceIf(opt, { ...cond, op: e.target.value as typeof cond.op }))
                  }
                >
                  <option value="gte">gte</option>
                  <option value="lte">lte</option>
                  <option value="gt">gt</option>
                  <option value="lt">lt</option>
                  <option value="eq">eq</option>
                </select>
                <input
                  type="number"
                  value={cond.n}
                  onChange={(e) =>
                    patch(i, patchChoiceIf(opt, { ...cond, n: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </Field>
            <div className="v2-card-actions">
              <button
                type="button"
                className="v2-btn v2-btn-danger"
                onClick={() =>
                  commit(exit.options.filter((_, j) => j !== i).length
                    ? exit.options.filter((_, j) => j !== i)
                    : [emptyChoice()])
                }
              >
                <IconTrash />
                {t("editor.delChoice")}
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="v2-btn v2-btn-block"
        onClick={() => commit([...exit.options, emptyChoice()])}
      >
        <IconPlus />
        {t("editor.addChoice")}
      </button>
    </>
  );
}

function BranchEditor({
  ed,
  exit,
}: {
  ed: Editor;
  exit: Extract<Exit, { type: "branch" }>;
}) {
  const { t, scene } = ed;
  if (!scene) return null;
  const form = readBranch(exit);
  const patch = (partial: Partial<BranchForm>) =>
    ed.commitScene({ ...scene, exit: writeBranch({ ...form, ...partial }) });
  return (
    <>
      <div className="v2-cond">
        <Field label={t("editor.branchVar")}>
          <input
            type="text"
            list="v2-var-names"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label={t("editor.branchOp")}>
          <select
            className="v2-select"
            value={form.op}
            onChange={(e) => patch({ op: e.target.value as BranchForm["op"] })}
          >
            <option value="gte">gte</option>
            <option value="lte">lte</option>
            <option value="gt">gt</option>
            <option value="lt">lt</option>
            <option value="eq">eq</option>
          </select>
        </Field>
        <Field label={t("editor.branchN")}>
          <input
            type="number"
            value={form.n}
            onChange={(e) => patch({ n: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <GotoField
        ed={ed}
        label={t("editor.branchThen")}
        value={form.then}
        onChange={(then) => patch({ then })}
      />
      <GotoField
        ed={ed}
        label={t("editor.branchElse")}
        value={form.else}
        onChange={(elseGoto) => patch({ else: elseGoto })}
      />
    </>
  );
}

function ExitTab({ ed }: { ed: Editor }) {
  const { t, scene } = ed;
  useEffect(() => {
    void ed.refreshVarHints();
  }, [ed.refreshVarHints, ed.sceneId]);
  if (!scene) return null;
  const kind = exitKind(scene.exit);
  return (
    <>
      <Field label={t("editor.sceneTitle")}>
        <input
          type="text"
          value={scene.title ?? ""}
          onChange={(e) => ed.patchSceneTitle(e.target.value)}
        />
      </Field>
      <Field label={t("editor.exit")}>
        <select
          className="v2-select"
          value={kind}
          onChange={(e) =>
            ed.commitScene({ ...scene, exit: setExitKind(scene.exit, e.target.value as ExitKind) })
          }
        >
          <option value="none">{t("editor.exitNone")}</option>
          <option value="next">{t("editor.exitNext")}</option>
          <option value="choices">{t("editor.exitChoices")}</option>
          <option value="branch">{t("editor.exitBranch")}</option>
          <option value="return">{t("editor.exitReturn")}</option>
        </select>
      </Field>
      {scene.exit?.type === "next" ? (
        <GotoField
          ed={ed}
          label={t("editor.goto")}
          value={scene.exit.goto}
          onChange={(goto) => ed.commitScene({ ...scene, exit: { type: "next", goto } })}
        />
      ) : null}
      {scene.exit?.type === "choices" ? <ChoicesEditor ed={ed} exit={scene.exit} /> : null}
      {scene.exit?.type === "branch" ? <BranchEditor ed={ed} exit={scene.exit} /> : null}
      <datalist id="v2-var-names">
        {ed.varHints.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

export function Inspector({ ed }: { ed: Editor }) {
  const { t } = ed;
  const tab = ed.inspectorTab;
  return (
    <aside className="v2-inspector">
      <div className="v2-tabs">
        <button
          type="button"
          className={`v2-tab${tab === "beat" ? " active" : ""}`}
          onClick={() => ed.setInspectorTab("beat")}
        >
          {t("editor.beats")}
        </button>
        <button
          type="button"
          className={`v2-tab${tab === "exit" ? " active" : ""}`}
          onClick={() => ed.setInspectorTab("exit")}
        >
          {t("editor.exit")}
        </button>
      </div>
      <div className="v2-inspector-body">
        {tab === "beat" ? <BeatTab ed={ed} /> : null}
        {tab === "exit" ? <ExitTab ed={ed} /> : null}
      </div>
    </aside>
  );
}
