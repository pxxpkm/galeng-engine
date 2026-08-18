import { describe, expect, it } from "vitest";
import { assetGroupOf, assetLists, charAssetPath, groupAssets, isMissingAsset } from "./assets";
import type { AssetMeta } from "./types";

describe("assetGroupOf", () => {
  it("uses the first path segment", () => {
    expect(assetGroupOf("bg/park_afternoon")).toBe("bg");
    expect(assetGroupOf("char/sora/smile")).toBe("char");
    expect(assetGroupOf("movie/op")).toBe("movie");
    expect(assetGroupOf("fonts/mplus")).toBe("fonts");
    expect(assetGroupOf("ui/msgbox")).toBe("ui");
    expect(assetGroupOf("amb/rain")).toBe("amb");
    expect(assetGroupOf("misc/foo")).toBe("other");
    expect(assetGroupOf("readme")).toBe("other");
  });
});

describe("groupAssets", () => {
  it("orders known folders and skips empty groups", () => {
    const assets: AssetMeta[] = [
      { logical: "se/breeze", kind: "audio" },
      { logical: "bg/home", kind: "image" },
      { logical: "voice/sora/001", kind: "audio" },
      { logical: "bg/park_afternoon", kind: "image" },
    ];
    const groups = groupAssets(assets);
    expect(groups.map((g) => g.group)).toEqual(["bg", "voice", "se"]);
    expect(groups[0]?.items.map((a) => a.logical)).toEqual(["bg/home", "bg/park_afternoon"]);
  });
});

describe("isMissingAsset", () => {
  const known = ["bg/park_afternoon", "voice/sora/001", "char/sora/smile"];

  it("treats empty as unset, not missing", () => {
    expect(isMissingAsset("", known)).toBe(false);
    expect(isMissingAsset("   ", known)).toBe(false);
    expect(isMissingAsset(undefined, known)).toBe(false);
  });

  it("is false when the logical path was scanned", () => {
    expect(isMissingAsset("bg/park_afternoon", known)).toBe(false);
    expect(isMissingAsset(" voice/sora/001 ", known)).toBe(false);
  });

  it("is true when the path is non-empty and unknown", () => {
    expect(isMissingAsset("voice/typo", known)).toBe(true);
  });
});

describe("charAssetPath", () => {
  it("joins id and face, or empty if either is blank", () => {
    expect(charAssetPath("sora", "smile")).toBe("char/sora/smile");
    expect(charAssetPath(" sora ", " blush ")).toBe("char/sora/blush");
    expect(charAssetPath("sora", "")).toBe("");
    expect(charAssetPath("", "smile")).toBe("");
  });
});

describe("assetLists", () => {
  it("groups prefixes and lists faces per character", () => {
    const lists = assetLists([
      { logical: "bg/home", kind: "image" },
      { logical: "char/sora/smile", kind: "image" },
      { logical: "char/sora/blush", kind: "image" },
      { logical: "voice/sora/001", kind: "audio" },
      { logical: "movie/op", kind: "movie" },
    ]);
    expect(lists.bg).toEqual(["bg/home"]);
    expect(lists.voice).toEqual(["voice/sora/001"]);
    expect(lists.movie).toEqual(["movie/op"]);
    expect(lists.charIds).toEqual(["sora"]);
    expect(lists.facesFor("sora")).toEqual(["smile", "blush"]);
    expect(lists.facesFor("other")).toEqual([]);
    expect(lists.known.has("char/sora/smile")).toBe(true);
  });
});
