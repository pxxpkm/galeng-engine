import { describe, expect, it, vi } from "vitest";
import {
  detectEditorLocale,
  editorT,
  loadExploreProjectBundle,
  saveExploreProject,
} from "./ExploreSettings";

describe("detectEditorLocale / editorT", () => {
  it("falls back to zh-Hant without storage", () => {
    const locale = detectEditorLocale();
    expect(["zh-Hant", "zh-Hans", "en"]).toContain(locale);
    const t = editorT("zh-Hant");
    expect(t("menu.settings")).toBe("設定");
    expect(t("editor.fontsPanel")).toBe("字型");
    expect(t("editor.audioPanel")).toBe("音訊");
    expect(t("editor.warnSaveExploreFromDialogue")).toContain("探險");
    expect(t("editor.saveCancelled")).toBe("已取消儲存");
  });
});

describe("loadExploreProjectBundle / saveExploreProject", () => {
  it("loads project + assets via getJson", async () => {
    const getJson = vi.fn(async (path: string) => {
      if (path === "/api/project") return { id: "demo", title: "Demo", startScene: "s1", locale: "zh-Hant" };
      if (path === "/api/assets") return [{ logical: "fonts/mplus", kind: "font" }];
      throw new Error(path);
    });
    const bundle = await loadExploreProjectBundle({ getJson: getJson as never });
    expect(bundle.project.title).toBe("Demo");
    expect(bundle.assets).toHaveLength(1);
    expect(getJson).toHaveBeenCalledWith("/api/project");
    expect(getJson).toHaveBeenCalledWith("/api/assets");
  });

  it("saves project via putJson", async () => {
    const project = { id: "demo", title: "Demo", startScene: "s1", locale: "zh-Hant" };
    const putJson = vi.fn(async (_path: string, body: unknown) => body);
    const saved = await saveExploreProject(project as never, { putJson: putJson as never });
    expect(saved).toEqual(project);
    expect(putJson).toHaveBeenCalledWith("/api/project", project);
  });
});
