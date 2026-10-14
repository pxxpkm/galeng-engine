import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { updateProject, updateScene } from "./commands";
import { blankExploreDoc } from "./fixture";

/**
 * Hierarchy UI contract: fields call updateScene / updateProject
 * (same patches HierarchyPanel emits). No RTL — command path is SoT.
 */
describe("hierarchy meta (updateScene / updateProject)", () => {
  it("sets scene title and bg.asset; clears bg when asset blank", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateScene({ title: "書房" }, "scene-title"),
    ));
    expect(doc.scene.title).toBe("書房");

    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateScene(
        { bg: { asset: "bg/study", trans: "fade", ms: 400 } },
        "scene-bg-asset",
      ),
    ));
    expect(doc.scene.bg).toEqual({ asset: "bg/study", trans: "fade", ms: 400 });

    // Preserve trans/ms when only asset changes (Hierarchy does this)
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateScene(
        {
          bg: {
            asset: "bg/ending",
            trans: doc.scene.bg!.trans,
            ms: doc.scene.bg!.ms,
          },
        },
        "scene-bg-asset",
      ),
    ));
    expect(doc.scene.bg).toEqual({
      asset: "bg/ending",
      trans: "fade",
      ms: 400,
    });

    // Clear via key present + undefined (Hierarchy empty input)
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateScene({ bg: undefined }, "scene-bg-asset"),
    ));
    expect(doc.scene.bg).toBeUndefined();
    // hotspots untouched
    expect(doc.scene.hotspots).toEqual(blankExploreDoc().scene.hotspots);
  });

  it("sets project title and startScene without wiping db", () => {
    let doc = blankExploreDoc();
    const itemCount = doc.project.items.length;
    let bus = emptyBus();
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateProject({ title: "Click Room" }, "project-title"),
    ));
    ({ bus, doc } = dispatch(
      bus,
      doc,
      updateProject({ startScene: "study" }, "project-startScene"),
    ));
    expect(doc.project.title).toBe("Click Room");
    expect(doc.project.startScene).toBe("study");
    expect(doc.project.items).toHaveLength(itemCount);
  });
});
