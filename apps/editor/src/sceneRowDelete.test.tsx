import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LEAVE_CANCELLED_MESSAGE } from "./dirty";
import {
  applySceneRemovalDestination,
  sceneIsOpen,
  sceneRemovalDestination,
  sceneRowMenuActions,
} from "./scene";
import {
  runArchiveScene,
  runDeleteScene,
  type ArchiveSceneDeps,
  type DeleteSceneDeps,
} from "./sceneRemoval";
import { SceneRowMenu, Sidebar } from "./v2/Sidebar";
import type { Editor } from "./v2/useEditorState";
import type { SceneMeta } from "./types";

const dialogue = (id: string): SceneMeta => ({ id, sceneKind: "dialogue" });
const explore = (id: string): SceneMeta => ({ id, sceneKind: "explore" });

function archiveDeps(over: Partial<ArchiveSceneDeps> = {}): ArchiveSceneDeps {
  return {
    startScene: "park_01",
    currentId: "park_01",
    cannot: "cannot-archive",
    flushIfCurrent: async () => "clean",
    stillBlocked: () => false,
    archive: async () => {},
    loadLive: async () => [dialogue("park_01")],
    loadArchived: async () => [],
    setLive: () => {},
    setArchived: () => {},
    openDialogue: () => {},
    openExplore: () => {},
    ...over,
  };
}

function deleteDeps(over: Partial<DeleteSceneDeps> = {}): DeleteSceneDeps {
  return {
    startScene: "park_01",
    cannot: "cannot-delete",
    confirm: () => true,
    isOpen: () => false,
    loadedId: () => "park_01",
    tryBegin: () => true,
    end: () => {},
    ignoreInFlightSaves: () => {},
    deleteFile: async () => {},
    clearLoaded: () => {},
    clearBackup: () => {},
    dropFromList: () => {},
    loadLive: async () => [dialogue("park_01")],
    setLive: () => {},
    openDialogue: () => {},
    openExplore: () => {},
    ...over,
  };
}

function buttonTag(html: string, testId: string): string {
  const match = html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`));
  expect(match, testId).not.toBeNull();
  return match?.[0] ?? "";
}

describe("scene row menu", () => {
  it("disables archive and delete on the start scene and says why", () => {
    const actions = sceneRowMenuActions("park_01", "park_01");
    expect(actions.map((item) => item.id)).toEqual(["archive", "delete"]);
    expect(actions.every((item) => item.disabled)).toBe(true);
    expect(actions.map((item) => item.titleKey)).toEqual([
      "editor.cannotArchiveStart",
      "editor.cannotDeleteStart",
    ]);

    const html = renderToStaticMarkup(
      <SceneRowMenu
        x={8}
        y={8}
        sceneId="park_01"
        startScene="park_01"
        t={(key) => key}
        onArchive={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-scene-id="park_01"');
    expect(buttonTag(html, "scene-row-archive")).toContain("disabled");
    expect(buttonTag(html, "scene-row-delete")).toContain("disabled");
    expect(html).toContain("editor.cannotArchiveStart");
    expect(html).toContain("editor.cannotDeleteStart");
  });

  it("enables archive and delete for a non-start explore row", () => {
    const actions = sceneRowMenuActions("study", "park_01");
    expect(actions.every((item) => item.disabled)).toBe(false);
    expect(actions.map((item) => item.titleKey)).toEqual([
      "editor.archiveTitle",
      "editor.deleteSceneRowTitle",
    ]);

    const html = renderToStaticMarkup(
      <SceneRowMenu
        x={8}
        y={8}
        sceneId="study"
        startScene="park_01"
        t={(key) => key}
        onArchive={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-scene-id="study"');
    expect(buttonTag(html, "scene-row-archive")).not.toContain("disabled");
    expect(buttonTag(html, "scene-row-delete")).not.toContain("disabled");
    expect(html.match(/role="menuitem"/g)).toHaveLength(2);
  });

  it("renders a more button on every scene row, including explore rooms", () => {
    const ed = {
      t: (key: string) => key,
      scenes: [dialogue("park_01"), explore("study")],
      scene: { id: "park_01", title: "Park", sceneKind: "dialogue", beats: [] },
      sceneId: "park_01",
      project: { startScene: "park_01" },
      archived: [],
      selectScene: vi.fn(),
      archiveScene: vi.fn(),
      deleteScene: vi.fn(),
      fail: vi.fn(),
      requestNewScene: vi.fn(),
      unarchiveScene: vi.fn(),
      deleteArchivedScene: vi.fn(),
    } as unknown as Editor;
    const html = renderToStaticMarkup(<Sidebar ed={ed} />);
    expect(html).toContain('data-testid="scene-more-park_01"');
    expect(html).toContain('data-testid="scene-more-study"');
    expect(html).toContain("editor.moreMenu");
    expect(buttonTag(html, "scene-more-study")).not.toContain("disabled");
    expect(ed.selectScene).not.toHaveBeenCalled();
    expect(ed.archiveScene).not.toHaveBeenCalled();
    expect(ed.deleteScene).not.toHaveBeenCalled();
  });
});

describe("removing a scene", () => {
  it("does not treat a loaded dialogue scene as the explore row", () => {
    expect(sceneIsOpen("park_01", "park_01", "study")).toBe(false);
    expect(sceneIsOpen(null, "park_01", "study")).toBe(false);
    expect(sceneIsOpen("park_02", "home", "park_02")).toBe(true);
    expect(sceneIsOpen(null, "study", "study")).toBe(true);
  });

  it("stays put when the removed id is not the open scene, even if that id is explore", () => {
    const dest = sceneRemovalDestination("park_01", "study", "park_01", ["park_01", "study"], () => "explore");
    expect(dest).toEqual({ type: "stay" });
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    applySceneRemovalDestination(dest, { openDialogue, openExplore });
    expect(openDialogue).not.toHaveBeenCalled();
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("opens the next dialogue scene after the current one is removed", () => {
    const dest = sceneRemovalDestination(
      "park_02",
      "park_02",
      "park_01",
      ["park_01", "study"],
      (id) => (id === "study" ? "explore" : "dialogue"),
    );
    expect(dest).toEqual({ type: "dialogue", id: "park_01" });
  });

  it("opens Explore only when nextSceneAfterArchive picks an explore room", () => {
    const dest = sceneRemovalDestination("park_02", "park_02", "study", ["study"], (id) =>
      id === "study" ? "explore" : "dialogue",
    );
    expect(dest).toEqual({ type: "explore", id: "study" });
  });
});

describe("runArchiveScene", () => {
  it("archives a non-current explore room without flushing or navigating", async () => {
    const flushIfCurrent = vi.fn(async () => "saved");
    const archive = vi.fn(async () => {});
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    const setLive = vi.fn();
    await runArchiveScene(
      "study",
      archiveDeps({
        currentId: "park_01",
        stillBlocked: () => true,
        flushIfCurrent,
        archive,
        setLive,
        loadLive: async () => [dialogue("park_01")],
        loadArchived: async () => [explore("study")],
        openDialogue,
        openExplore,
      }),
    );
    expect(archive).toHaveBeenCalledWith("study");
    expect(flushIfCurrent).not.toHaveBeenCalled();
    expect(setLive).toHaveBeenCalledWith([dialogue("park_01")]);
    expect(openDialogue).not.toHaveBeenCalled();
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("flushes the open scene, then opens the next dialogue scene", async () => {
    const flushIfCurrent = vi.fn(async () => "saved");
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    await runArchiveScene(
      "park_02",
      archiveDeps({
        currentId: "park_02",
        flushIfCurrent,
        loadLive: async () => [dialogue("park_01"), explore("study")],
        openDialogue,
        openExplore,
      }),
    );
    expect(flushIfCurrent).toHaveBeenCalledTimes(1);
    expect(openDialogue).toHaveBeenCalledWith("park_01");
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("does not archive or navigate when unsaved edits cannot be flushed", async () => {
    const archive = vi.fn(async () => {});
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    await expect(
      runArchiveScene(
        "park_02",
        archiveDeps({
          currentId: "park_02",
          flushIfCurrent: async () => {
            throw new Error(LEAVE_CANCELLED_MESSAGE);
          },
          archive,
          openDialogue,
          openExplore,
        }),
      ),
    ).rejects.toThrow(LEAVE_CANCELLED_MESSAGE);
    expect(archive).not.toHaveBeenCalled();
    expect(openDialogue).not.toHaveBeenCalled();
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("does not leave when a newer edit is still dirty after the archive", async () => {
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    await expect(
      runArchiveScene(
        "park_02",
        archiveDeps({
          currentId: "park_02",
          stillBlocked: () => true,
          loadLive: async () => [dialogue("park_01")],
          openDialogue,
          openExplore,
        }),
      ),
    ).rejects.toThrow(LEAVE_CANCELLED_MESSAGE);
    expect(openDialogue).not.toHaveBeenCalled();
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("refuses the start scene", async () => {
    const archive = vi.fn();
    const flushIfCurrent = vi.fn();
    await expect(
      runArchiveScene("park_01", archiveDeps({ currentId: "park_01", archive, flushIfCurrent })),
    ).rejects.toThrow("cannot-archive");
    expect(archive).not.toHaveBeenCalled();
    expect(flushIfCurrent).not.toHaveBeenCalled();
  });
});

describe("runDeleteScene", () => {
  it("deletes a non-current explore room without navigating to Explore", async () => {
    const confirm = vi.fn(() => true);
    const deleteFile = vi.fn(async () => {});
    const clearLoaded = vi.fn();
    const ignoreInFlightSaves = vi.fn();
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    let loaded: string | null = "park_01";
    await runDeleteScene(
      "study",
      deleteDeps({
        confirm,
        deleteFile,
        clearLoaded,
        ignoreInFlightSaves,
        openDialogue,
        openExplore,
        isOpen: (id) => sceneIsOpen(loaded, "park_01", id),
        loadedId: () => loaded,
        loadLive: async () => [dialogue("park_01")],
      }),
    );
    expect(confirm).toHaveBeenCalledWith("study");
    expect(deleteFile).toHaveBeenCalledWith("study");
    expect(clearLoaded).not.toHaveBeenCalled();
    expect(ignoreInFlightSaves).not.toHaveBeenCalled();
    expect(loaded).toBe("park_01");
    expect(openDialogue).not.toHaveBeenCalled();
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("does not navigate while the open dialogue scene is still loading", async () => {
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    const clearLoaded = vi.fn();
    await runDeleteScene(
      "study",
      deleteDeps({
        isOpen: (id) => sceneIsOpen(null, "park_01", id),
        loadedId: () => null,
        clearLoaded,
        openDialogue,
        openExplore,
        loadLive: async () => [dialogue("park_01")],
      }),
    );
    expect(clearLoaded).not.toHaveBeenCalled();
    expect(openDialogue).not.toHaveBeenCalled();
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("after deleting the open scene, opens the next one and does not keep the deleted buffer", async () => {
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    const ignoreInFlightSaves = vi.fn();
    let loaded: string | null = "park_02";
    const clearLoaded = vi.fn(() => {
      loaded = null;
    });
    await runDeleteScene(
      "park_02",
      deleteDeps({
        isOpen: (id) => sceneIsOpen(loaded, "park_02", id),
        loadedId: () => loaded,
        clearLoaded,
        ignoreInFlightSaves,
        openDialogue,
        openExplore,
        loadLive: async () => [dialogue("park_01"), explore("study")],
      }),
    );
    expect(clearLoaded).toHaveBeenCalledTimes(1);
    expect(ignoreInFlightSaves).toHaveBeenCalledTimes(1);
    expect(openDialogue).toHaveBeenCalledWith("park_01");
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("opens Explore when the next scene after the current one is an explore room", async () => {
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    let loaded: string | null = "park_02";
    await runDeleteScene(
      "park_02",
      deleteDeps({
        startScene: "study",
        isOpen: (id) => id === "park_02",
        loadedId: () => loaded,
        clearLoaded: () => {
          loaded = null;
        },
        openDialogue,
        openExplore,
        loadLive: async () => [explore("study")],
      }),
    );
    expect(openExplore).toHaveBeenCalledWith("study");
    expect(openDialogue).not.toHaveBeenCalled();
  });

  it("does not replace a scene the user opened while the delete was in flight", async () => {
    const openDialogue = vi.fn();
    const openExplore = vi.fn();
    const clearLoaded = vi.fn();
    await runDeleteScene(
      "park_02",
      deleteDeps({
        isOpen: (id) => id === "park_02",
        loadedId: () => "home_01",
        clearLoaded,
        openDialogue,
        openExplore,
        loadLive: async () => [dialogue("park_01"), dialogue("home_01")],
      }),
    );
    expect(clearLoaded).not.toHaveBeenCalled();
    expect(openDialogue).not.toHaveBeenCalled();
    expect(openExplore).not.toHaveBeenCalled();
  });

  it("refuses the start scene before confirm", async () => {
    const confirm = vi.fn(() => true);
    const deleteFile = vi.fn();
    await expect(
      runDeleteScene("park_01", deleteDeps({ confirm, deleteFile, isOpen: () => true })),
    ).rejects.toThrow("cannot-delete");
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("does nothing when confirm is declined", async () => {
    const deleteFile = vi.fn();
    const tryBegin = vi.fn(() => true);
    await runDeleteScene("study", deleteDeps({ confirm: () => false, deleteFile, tryBegin }));
    expect(tryBegin).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("keeps the open scene when the delete fails", async () => {
    const end = vi.fn();
    const clearLoaded = vi.fn();
    const openDialogue = vi.fn();
    await expect(
      runDeleteScene(
        "park_02",
        deleteDeps({
          isOpen: (id) => id === "park_02",
          loadedId: () => "park_02",
          deleteFile: async () => {
            throw new Error("delete failed");
          },
          end,
          clearLoaded,
          openDialogue,
        }),
      ),
    ).rejects.toThrow("delete failed");
    expect(end).toHaveBeenCalledTimes(1);
    expect(clearLoaded).not.toHaveBeenCalled();
    expect(openDialogue).not.toHaveBeenCalled();
  });
});
