import { describe, expect, it } from "vitest";
import { blankExploreDoc } from "./fixture";
import { collectExploreProblems } from "./problems";

describe("missingBg (M8)", () => {
  it("warns when bg object has blank asset", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      scene: { ...doc.scene, bg: { asset: "   ", trans: "fade", ms: 200 } },
    };
    const probs = collectExploreProblems(doc);
    const p = probs.find((x) => x.key === "explore.missingBg");
    expect(p).toBeTruthy();
    expect(p!.message).toBe("背景資產為空");
    // trans/ms preserved on scene even when blank asset is odd
    expect(doc.scene.bg?.trans).toBe("fade");
    expect(doc.scene.bg?.ms).toBe(200);
  });

  it("warns when asset not in knownAssets", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      scene: { ...doc.scene, bg: { asset: "bg/missing_room" } },
    };
    const probs = collectExploreProblems(doc, {
      knownAssets: ["bg/study", "bg/hall"],
    });
    expect(
      probs.some(
        (p) => p.key === "explore.missingBg" && p.message.includes("bg/missing_room"),
      ),
    ).toBe(true);
  });

  it("does not warn when asset is known", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      scene: { ...doc.scene, bg: { asset: "bg/study" } },
    };
    const probs = collectExploreProblems(doc, {
      knownAssets: new Set(["bg/study"]),
    });
    expect(probs.some((p) => p.key === "explore.missingBg")).toBe(false);
  });

  it("skips knownAssets check when list not provided", () => {
    let doc = blankExploreDoc();
    doc = {
      ...doc,
      scene: { ...doc.scene, bg: { asset: "bg/anything" } },
    };
    const probs = collectExploreProblems(doc);
    expect(probs.some((p) => p.key === "explore.missingBg")).toBe(false);
  });
});
