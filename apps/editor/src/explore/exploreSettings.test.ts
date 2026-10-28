import { describe, expect, it, vi } from "vitest";
import {
  detectEditorLocale,
  editorT,
  loadExploreProjectBundle,
  saveExploreProject,
  settleSettingsSave,
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

  it("merges settings edits into the latest project", async () => {
    const base = { id: "demo", title: "Demo", startScene: "s1", locale: "en", titleBgm: "bgm/old" };
    const project = { ...base, titleBgm: "bgm/new" };
    const latest = { ...base, verbs: [{ id: "look", label: "NEW" }] };
    const updateJson = vi.fn(async (_path: string, update: (current: unknown) => unknown) => update(latest));
    const saved = await saveExploreProject(base as never, project as never, { updateJson: updateJson as never });
    expect(saved).toEqual({ ...latest, titleBgm: "bgm/new" });
    expect(updateJson).toHaveBeenCalledWith("/api/project", expect.any(Function));
  });
});

describe("settleSettingsSave", () => {
  it("keeps a newer draft when an in-flight save response is stale", async () => {
    type Draft = { id: string; titleBgm?: string };
    let project: Draft = { id: "demo", titleBgm: "bgm/a" };
    let rev = 1;
    let dirty = true;
    let adopted: Draft | null = null;
    let resolvePut: (value: Draft) => void = () => {};
    const put = () =>
      new Promise<Draft>((resolve) => {
        resolvePut = resolve;
      });

    const requestRev = rev;
    const pending = (async () => {
      const saved = await put();
      const settled = settleSettingsSave({
        requestRev,
        currentRev: rev,
        saved,
        current: project,
      });
      if (!settled.clearDirty) return;
      project = settled.project;
      dirty = false;
      adopted = settled.project;
    })();

    rev += 1;
    project = { id: "demo", titleBgm: "bgm/b" };
    dirty = true;
    resolvePut({ id: "demo", titleBgm: "bgm/a" });
    await pending;

    expect(project).toEqual({ id: "demo", titleBgm: "bgm/b" });
    expect(dirty).toBe(true);
    expect(adopted).toBeNull();
  });

  it("adopts the saved project when the revision is unchanged", () => {
    const settled = settleSettingsSave({
      requestRev: 3,
      currentRev: 3,
      saved: { id: "demo", titleBgm: "bgm/server" },
      current: { id: "demo", titleBgm: "bgm/local" },
    });
    expect(settled).toEqual({
      project: { id: "demo", titleBgm: "bgm/server" },
      clearDirty: true,
    });
  });
});
