import { useEffect, useRef, useState, type ReactNode } from "react";
import { beatSummary, encodeBeatDrag, hasTrackContent, parseAssetDrag, parseBeatDragSet } from "../beats";
import { interpolate } from "../saveIssues";
import type { Editor } from "./useEditorState";
import { IconAmb, IconCg, IconChar, IconCopy, IconImage, IconMic, IconMusic, IconPlus, IconSe, IconText, IconTrash } from "./icons";

const TRACKS = [
  { key: "bg", i18n: "editor.trackBg", icon: <IconImage /> },
  { key: "char", i18n: "editor.trackChar", icon: <IconChar /> },
  { key: "text", i18n: "editor.trackText", icon: <IconText /> },
  { key: "bgm", i18n: "editor.trackBgm", icon: <IconMusic /> },
  { key: "voice", i18n: "editor.trackVoice", icon: <IconMic /> },
  { key: "se", i18n: "editor.trackSe", icon: <IconSe /> },
  { key: "amb", i18n: "editor.trackAmb", icon: <IconAmb /> },
  { key: "cg", i18n: "editor.trackCg", icon: <IconCg /> },
] as const;

function Cell({ value }: { value: string }) {
  const empty = value === "—";
  return (
    <div className={`v2-tl-cell${empty ? " empty" : ""}`} title={empty ? "" : value}>
      {empty ? "·" : value}
    </div>
  );
}

/** Dialogue strip: speaker + readable CJK preview (classic-style beat card cue). */
function TextCell({ speaker, text }: { speaker?: string; text: string }) {
  const empty = !text || text === "—";
  const title = empty ? "" : [speaker?.trim(), text].filter(Boolean).join(" · ");
  return (
    <div className={`v2-tl-cell v2-tl-cell-text${empty ? " empty" : ""}`} title={title}>
      {speaker?.trim() ? <span className="v2-tl-speaker">{speaker.trim()}</span> : null}
      <span className="v2-tl-dialogue">{empty ? "·" : text}</span>
    </div>
  );
}

export function Timeline({ ed }: { ed: Editor }) {
  const { t } = ed;
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [draggingBeat, setDraggingBeat] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [menuPage, setMenuPage] = useState<"main" | "paste">("main");
  const activeRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [ed.beatIndex, ed.scene?.id]);

  useEffect(() => {
    if (!menu) return;
    function onDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenu(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
      }
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const beats = ed.scene?.beats ?? [];
  const canDelete = beats.length > 1;
  const menuGroup =
    menu && ed.selected.includes(menu.index) && ed.selected.length > 1 ? ed.selected : menu ? [menu.index] : [];
  const menuAnyLabel = menuGroup.some((i) => ((beats[i]?.label ?? "").trim() !== ""));

  const labels: ReactNode = (
    <div className="v2-tl-labels">
      <div className="v2-tl-corner">
        <button
          type="button"
          className="v2-sheet-toggle"
          title={t("editor.sheetView")}
          onClick={ed.toggleSheetView}
        >
          {t("editor.sheetView")}
        </button>
      </div>
      {TRACKS.map((track) => (
        <div key={track.key} className={`v2-tl-label${track.key === "text" ? " v2-tl-label-text" : ""}`}>
          {track.icon}
          <span>{t(track.i18n)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <footer className="v2-timeline" aria-label={t("editor.beats")}>
      {ed.sheetView ? (
        <>
          <div className="v2-sheet-bar">
            <button type="button" className="v2-btn" onClick={ed.toggleSheetView} title={t("editor.gridView")}>
              {t("editor.gridView")}
            </button>
          </div>
          <div className="v2-sheet">
            {beats.map((b, i) => (
              <div
                key={i}
                className={`v2-sheet-row${i === ed.beatIndex ? " active" : ""}`}
                onClick={() => ed.pickBeat(i, {})}
              >
                <span className="v2-tl-index">#{i}</span>
                <input
                  type="text"
                  className="v2-sheet-speaker"
                  value={b.say?.speaker ?? ""}
                  placeholder={t("editor.speaker")}
                  onChange={(event) => ed.patchSayAt(i, { speaker: event.target.value })}
                />
                <input
                  type="text"
                  className="v2-sheet-text"
                  value={b.say?.text ?? ""}
                  onChange={(event) => ed.patchSayAt(i, { text: event.target.value })}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {labels}
          <div className="v2-tl-scroll">
        {beats.map((b, i) => {
          const s = beatSummary(b);
          const active = i === ed.beatIndex;
          const chosen = ed.selected.includes(i);
          const dragging =
            draggingBeat !== null &&
            (ed.selected.includes(draggingBeat) ? ed.selected.includes(i) : draggingBeat === i);
          return (
            <div
              key={i}
              ref={active ? activeRef : undefined}
              className={`v2-tl-col${active ? " active" : ""}${chosen ? " selected" : ""}${dragOver === i ? " drag-over" : ""}${dragging ? " dragging" : ""}`}
              onClick={(event) => {
                if (draggingBeat !== null) return;
                ed.pickBeat(i, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey });
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!ed.selected.includes(i)) {
                  ed.pickBeat(i, {});
                }
                setMenuPage("main");
                setMenu({ x: event.clientX, y: event.clientY, index: i });
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = draggingBeat !== null ? "move" : "copy";
                setDragOver(i);
              }}
              onDragLeave={() => {
                setDragOver((cur) => (cur === i ? null : cur));
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(null);
                const raw = event.dataTransfer.getData("text/plain");
                const from = parseBeatDragSet(raw);
                if (from !== null) {
                  ed.moveBeatsTo(from, i);
                  setDraggingBeat(null);
                  return;
                }
                const asset = parseAssetDrag(raw);
                if (asset) {
                  ed.applyMedia(asset, i);
                }
                setDraggingBeat(null);
              }}
            >
              <div className="v2-tl-col-head">
                <span
                  className="v2-tl-index"
                  draggable
                  title={t("editor.multiSelect")}
                  onDragStart={(event) => {
                    const group = ed.selected.includes(i) ? ed.selected : [i];
                    event.dataTransfer.setData("text/plain", encodeBeatDrag(i, group));
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingBeat(i);
                  }}
                  onDragEnd={() => {
                    setDraggingBeat(null);
                    setDragOver(null);
                  }}
                >
                  <span className="v2-tl-index-num">#{i}</span>
                </span>
                {s.label ? (
                  <span className="v2-tl-note" title={s.label}>
                    {s.label}
                  </span>
                ) : null}
                <span className="v2-tl-col-actions">
                  <button
                    type="button"
                    title={t("editor.insertAfter")}
                    onClick={(event) => {
                      event.stopPropagation();
                      ed.insertBeatAfter(i);
                    }}
                  >
                    <IconPlus size={13} />
                  </button>
                  <button
                    type="button"
                    title={t("editor.dupBeatTitle")}
                    onClick={(event) => {
                      event.stopPropagation();
                      ed.duplicateBeatAt(i);
                    }}
                  >
                    <IconCopy size={13} />
                  </button>
                  <button
                    type="button"
                    title={t("editor.delBeat")}
                    disabled={!canDelete}
                    onClick={(event) => {
                      event.stopPropagation();
                      ed.deleteBeatAt(i);
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </span>
              </div>
              <Cell value={s.bg} />
              <Cell value={s.char} />
              <TextCell speaker={b.say?.speaker} text={s.text} />
              <Cell value={s.bgm} />
              <Cell value={s.voice} />
              <Cell value={s.se} />
              <Cell value={s.amb} />
              <Cell value={s.cg} />
              {dragOver === i ? (
                <div className="v2-tl-drop-tip">
                  {draggingBeat !== null ? t("editor.dropToMove") : t("editor.dropToApply")}
                </div>
              ) : null}
            </div>
          );
        })}
          </div>
        </>
      )}
      {menu ? (
        <div
          ref={menuRef}
          className="v2-ctx-menu"
          role="menu"
          style={{
            left: Math.min(menu.x, window.innerWidth - 210),
            top: Math.min(menu.y, window.innerHeight - 470),
          }}
        >
          {menuPage === "paste" ? (
            <>
              <button type="button" role="menuitem" onClick={() => setMenuPage("main")}>
                ← {t("editor.pasteBack")}
              </button>
              <div className="v2-menu-sep" />
              {TRACKS.map((track) => (
                <button
                  key={track.key}
                  type="button"
                  role="menuitem"
                  onClick={() => { ed.pasteFieldAt(menu.index, track.key); setMenu(null); }}
                >
                  {interpolate(t("editor.pasteField"), { field: t(track.i18n) })}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => { ed.pasteFieldAt(menu.index, "speaker"); setMenu(null); }}
              >
                {interpolate(t("editor.pasteField"), { field: t("editor.speaker") })}
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { ed.insertBeatAfter(menu.index); setMenu(null); }}>
                {t("editor.insertAfter")}
              </button>
              <button type="button" role="menuitem" onClick={() => { ed.duplicateBeatAt(menu.index); setMenu(null); }}>
                {t("editor.dupBeat")}
              </button>
              <button type="button" role="menuitem" onClick={() => { ed.copyBeat(menu.index); setMenu(null); }}>
                {t("editor.copyBeat")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canDelete}
                onClick={() => { ed.deleteBeatAt(menu.index); setMenu(null); }}
              >
                {t("editor.delBeat")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!menuAnyLabel}
                onClick={() => { ed.clearLabelsAt(menu.index); setMenu(null); }}
              >
                {t(menuGroup.length > 1 ? "editor.clearLabelsSel" : "editor.clearLabels")}
              </button>
              <div className="v2-menu-sep" />
              <button
                type="button"
                role="menuitem"
                disabled={!ed.beatClipboard}
                onClick={() => { ed.pasteWholeAt(menu.index); setMenu(null); }}
              >
                {t("editor.pasteWhole")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!ed.beatClipboard}
                onClick={() => setMenuPage("paste")}
              >
                {t("editor.pastePick")}
              </button>
              <div className="v2-menu-sep" />
              {TRACKS.map((track) => (
                <button
                  key={track.key}
                  type="button"
                  role="menuitem"
                  disabled={!menuGroup.some((idx) => hasTrackContent(beats[idx] ?? {}, track.key))}
                  onClick={() => { ed.clearTrackAt(menu.index, track.key); setMenu(null); }}
                >
                  {interpolate(
                    t(menuGroup.length > 1 ? "editor.clearTrackSel" : "editor.clearTrack"),
                    { track: t(track.i18n) },
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </footer>
  );
}
