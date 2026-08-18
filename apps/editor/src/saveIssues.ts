import type { Project, Scene } from "./types";

export type SaveIssue = {
  key: string;
  params?: Record<string, string | number>;
};

export function sceneSaveIssues(scene: Scene): SaveIssue[] {
  const out: SaveIssue[] = [];
  scene.beats.forEach((beat, n) => {
    const say = beat.say;
    if (say) {
      if (!say.speaker.trim()) {
        out.push({ key: "editor.emptySaySpeaker", params: { n } });
      }
      if (!say.text.trim()) {
        out.push({ key: "editor.emptySayText", params: { n } });
      }
    }
    (beat.chars ?? []).forEach((ch, ci) => {
      if (!ch.id.trim()) {
        out.push({ key: "editor.emptyCharId", params: { n, i: ci } });
      }
      if (!ch.face.trim()) {
        out.push({ key: "editor.emptyCharFace", params: { n, i: ci } });
      }
    });
  });
  const exit = scene.exit;
  if (exit?.type === "next" && !exit.goto.trim()) {
    out.push({ key: "editor.emptyNextGoto" });
  }
  if (exit?.type === "choices") {
    exit.options.forEach((opt, n) => {
      if (!opt.text.trim()) {
        out.push({ key: "editor.emptyChoiceText", params: { n } });
      }
      if (!opt.goto.trim()) {
        out.push({ key: "editor.emptyChoiceGoto", params: { n } });
      }
    });
  }
  if (exit?.type === "branch") {
    if (!exit.then.trim()) {
      out.push({ key: "editor.emptyBranchThen" });
    }
    if (!exit.else.trim()) {
      out.push({ key: "editor.emptyBranchElse" });
    }
  }
  return out;
}

export function projectSaveIssues(project: Project): SaveIssue[] {
  const out: SaveIssue[] = [];
  (project.characters ?? []).forEach((ch, n) => {
    if (!ch.id.trim()) {
      out.push({ key: "editor.emptyRosterId", params: { n } });
    }
  });
  pushGalleryIssues(out, project.cg, "editor.cgGallery");
  pushGalleryIssues(out, project.musicGallery, "editor.musicGallery");
  return out;
}

function pushGalleryIssues(
  out: SaveIssue[],
  items: { id: string; asset: string }[] | undefined,
  fieldKey: string,
): void {
  (items ?? []).forEach((item, n) => {
    if (!item.id.trim()) {
      out.push({ key: "editor.emptyGalleryId", params: { n, fieldKey } });
    }
    if (!item.asset.trim()) {
      out.push({ key: "editor.emptyGalleryAsset", params: { n, fieldKey } });
    }
  });
}

/** Format one issue line; resolves `fieldKey` params through `t`. */
export function formatIssueText(
  issue: SaveIssue,
  t: (key: string) => string,
): string {
  const params = { ...issue.params };
  if (typeof params.fieldKey === "string") {
    params.field = t(params.fieldKey);
    delete params.fieldKey;
  }
  return interpolate(t(issue.key), params);
}

export function formatSaveIssues(
  issues: SaveIssue[],
  t: (key: string) => string,
): string {
  const lines = issues.map((issue) => formatIssueText(issue, t));
  return [t("editor.saveBlocked"), ...lines].join("\n");
}

export function interpolate(template: string, params: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}
