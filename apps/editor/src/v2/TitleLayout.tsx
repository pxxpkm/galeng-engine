import { useEffect, useRef, useState, type PointerEvent } from "react";
import { mediaUrl } from "../media";
import { setPauseButton, setTitleButton } from "../project";
import type { PauseButtonKey, Project, TitleButton, TitleButtonKey } from "../types";
import { PAUSE_BUTTON_KEYS, TITLE_BUTTON_KEYS } from "../types";
import {
  defaultPauseRect,
  defaultTitleRect,
  pauseCaption,
  previewScale,
  previewToStage,
  resolvedButtonRect,
  snapPosition,
  stageToPreview,
  titleCaption,
  TITLE_STAGE_H,
  TITLE_STAGE_W,
  type TitleRect,
} from "../titleLayout";
import type { Editor } from "./useEditorState";

function ScreenLayout<K extends string>({
  keys,
  getBtn,
  onMove,
  defaultRect,
  captionOf,
  selected,
  onSelect,
  backdrop,
  name,
  hideName,
  hint,
}: {
  keys: readonly K[];
  getBtn: (key: K) => TitleButton | undefined;
  onMove: (key: K, x: number, y: number) => void;
  defaultRect: (index: number) => TitleRect;
  captionOf: (key: K, btn?: TitleButton) => string;
  selected: K | null;
  onSelect: (key: K) => void;
  backdrop?: string | null;
  name?: string;
  hideName?: boolean;
  hint: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [imageSize, setImageSize] = useState<Partial<Record<K, { w: number; h: number }>>>({});
  const drag = useRef<{
    key: K;
    pointer: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) {
      return;
    }
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = previewScale(width);
  const height = Math.max(1, Math.round(width * (TITLE_STAGE_H / TITLE_STAGE_W)));

  function rectOf(key: K) {
    const index = keys.indexOf(key);
    return resolvedButtonRect(defaultRect(index), getBtn(key), imageSize[key]);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, key: K) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(key);
    const rect = rectOf(key);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      key,
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: rect.x,
      origY: rect.y,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const session = drag.current;
    if (!session || event.pointerId !== session.pointer || scale <= 0) {
      return;
    }
    const dx = previewToStage(event.clientX - session.startX, scale);
    const dy = previewToStage(event.clientY - session.startY, scale);
    const others = keys
      .filter((key) => key !== session.key)
      .map((key) => {
        const rect = rectOf(key);
        return { x: rect.x, y: rect.y };
      });
    const next = snapPosition(session.origX + dx, session.origY + dy, others);
    onMove(session.key, next.x, next.y);
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer === event.pointerId) {
      drag.current = null;
    }
  }

  return (
    <div className="v2-title-layout">
      <p className="v2-hint">{hint}</p>
      <div ref={frameRef} className="v2-title-stage" style={{ height }}>
        {backdrop ? <img className="v2-title-stage-bg" src={backdrop} alt="" draggable={false} /> : null}
        {!hideName && name ? (
          <div
            className="v2-title-stage-name"
            style={{
              left: stageToPreview(200, scale),
              top: stageToPreview(200, scale),
              fontSize: Math.max(12, stageToPreview(72, scale)),
            }}
          >
            {name}
          </div>
        ) : null}
        {keys.map((key) => {
          const btn = getBtn(key);
          const rect = rectOf(key);
          const caption = captionOf(key, btn);
          const img = btn?.image ? mediaUrl(btn.image) : null;
          return (
            <button
              key={key}
              type="button"
              className={`v2-title-stage-btn${selected === key ? " is-selected" : ""}`}
              style={{
                left: stageToPreview(rect.x, scale),
                top: stageToPreview(rect.y, scale),
                width: stageToPreview(rect.w, scale),
                height: stageToPreview(rect.h, scale),
                fontSize: Math.max(10, stageToPreview(32, scale)),
              }}
              onPointerDown={(event) => onPointerDown(event, key)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {img ? (
                <img
                  src={img}
                  alt=""
                  draggable={false}
                  onLoad={(event) => {
                    const el = event.currentTarget;
                    setImageSize((prev) => ({
                      ...prev,
                      [key]: { w: el.naturalWidth, h: el.naturalHeight },
                    }));
                  }}
                />
              ) : null}
              {caption ? <span>{caption}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TitleLayout({
  ed,
  selected,
  onSelect,
}: {
  ed: Editor;
  selected: TitleButtonKey | null;
  onSelect: (key: TitleButtonKey) => void;
}) {
  const { project, t, locale } = ed;
  if (!project) {
    return null;
  }
  return (
    <ScreenLayout
      keys={TITLE_BUTTON_KEYS}
      getBtn={(key) => project.titleButtons?.[key]}
      onMove={(key, x, y) => ed.patchProject(setTitleButton(project, key, { x, y }))}
      defaultRect={defaultTitleRect}
      captionOf={(key, btn) => titleCaption(locale, key, btn)}
      selected={selected}
      onSelect={onSelect}
      backdrop={project.titleBg ? mediaUrl(project.titleBg) : null}
      name={project.title}
      hideName={project.hideGameTitle}
      hint={t("editor.titleLayoutHint")}
    />
  );
}

export function PauseLayout({
  ed,
  selected,
  onSelect,
}: {
  ed: Editor;
  selected: PauseButtonKey | null;
  onSelect: (key: PauseButtonKey) => void;
}) {
  const { project, t, locale } = ed;
  if (!project) {
    return null;
  }
  return (
    <ScreenLayout
      keys={PAUSE_BUTTON_KEYS}
      getBtn={(key) => project.pauseButtons?.[key]}
      onMove={(key, x, y) => ed.patchProject(setPauseButton(project, key, { x, y }))}
      defaultRect={defaultPauseRect}
      captionOf={(key, btn) => pauseCaption(locale, key, btn)}
      selected={selected}
      onSelect={onSelect}
      hint={t("editor.pauseLayoutHint")}
    />
  );
}
