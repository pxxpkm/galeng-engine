import type { SavePhase } from "./savePhase";

export function SaveLayerStatus({
  id,
  phase,
  label,
  reason,
  conflict,
  onRetry,
  onReload,
  onFocus,
  t,
}: {
  id: string;
  phase: SavePhase;
  label: string;
  reason?: string | null;
  conflict?: boolean;
  onRetry?: () => void;
  onReload?: () => void;
  onFocus?: () => void;
  t: (key: string) => string;
}) {
  if (phase === "clean") return null;
  const text =
    phase === "dirty"
      ? t("editor.dirty")
      : phase === "saving"
        ? t("editor.savePhaseSaving")
        : phase === "saved"
          ? t("editor.saved")
          : t("editor.savePhaseFailed");
  return (
    <span className="status" data-testid={id} data-phase={phase}>
      {label}: {text}
      {phase === "failed" && reason ? <span data-testid={`${id}-reason`}> {reason}</span> : null}
      {phase === "failed" && conflict && onReload ? (
        <button type="button" onClick={onReload}>
          {t("editor.saveConflictReload")}
        </button>
      ) : null}
      {phase === "failed" && !conflict && onRetry ? (
        <button type="button" data-testid={`${id}-retry`} onClick={onRetry}>
          {t("editor.saveRetry")}
        </button>
      ) : null}
      {phase === "failed" && onFocus ? (
        <button type="button" data-testid={`${id}-focus`} onClick={onFocus}>
          {t("editor.saveFocus")}
        </button>
      ) : null}
    </span>
  );
}
