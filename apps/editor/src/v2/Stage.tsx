import { Preview } from "../Preview";
import { setCharOffset } from "../beats";
import { playNoticeKey } from "../play";
import type { Beat } from "../types";
import type { Editor } from "./useEditorState";
import { IconChevronL, IconChevronR, IconCopy, IconMusic, IconPlay, IconPlus, IconScene, IconTrash } from "./icons";

const EMPTY_BEATS: Beat[] = [];

export function Stage({ ed }: { ed: Editor }) {
  const { t } = ed;
  const beats = ed.scene?.beats ?? EMPTY_BEATS;
  const total = beats.length;
  const beat = ed.beat;
  const isEmptyBeat = beat !== undefined && Object.keys(beat).length === 0;

  return (
    <main className="v2-stage">
      <div className="v2-stage-head">
        <span className="v2-chip">
          <IconScene />
          {ed.scene ? (ed.scene.title ?? ed.scene.id) : "—"}
        </span>
      </div>
      <div className="v2-stage-canvas-wrap">
        <div className="v2-stage-canvas">
          <Preview
            sceneId={ed.scene?.id ?? ""}
            beats={beats}
            beatIndex={ed.beatIndex}
            msgBox={ed.project?.msgBox}
            dialogueFont={ed.project?.fonts?.dialogue || ed.project?.font}
            onCharOffset={(index, x, y) => ed.updateBeat((cur) => setCharOffset(cur, index, x, y))}
          />
          {isEmptyBeat ? <div className="v2-stage-hint">{t("editor.emptyBeat")}</div> : null}
        </div>
      </div>
      <div className="v2-transport">
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.prevBeat")}
          onClick={ed.prevBeat}
          disabled={!ed.scene || ed.beatIndex <= 0}
        >
          <IconChevronL />
        </button>
        <span className="v2-beat-pos">
          {t("editor.beatPosition")
            .replace("{n}", String(total === 0 ? 0 : ed.beatIndex + 1))
            .replace("{total}", String(total))}
        </span>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.nextBeat")}
          onClick={ed.nextBeat}
          disabled={!ed.scene || ed.beatIndex >= total - 1}
        >
          <IconChevronR />
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.stepAudition")}
          aria-pressed={ed.stepAudition}
          onClick={ed.toggleStepAudition}
          disabled={!ed.scene}
        >
          <IconMusic />
        </button>
        <span className="v2-transport-sep" />
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.addBeat")}
          onClick={ed.addBeat}
          disabled={!ed.scene}
        >
          <IconPlus />
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.dupBeatTitle")}
          onClick={() => ed.duplicateBeatAt(ed.beatIndex)}
          disabled={!ed.scene}
        >
          <IconCopy />
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-icon"
          title={t("editor.delBeat")}
          onClick={() => ed.deleteBeatAt(ed.beatIndex)}
          disabled={!ed.scene || total <= 1}
        >
          <IconTrash />
        </button>
        <span className="v2-topbar-spacer" />
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
    </main>
  );
}
