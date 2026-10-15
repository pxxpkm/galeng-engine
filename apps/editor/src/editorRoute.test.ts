import { describe, expect, it } from "vitest";
import { editorRouteFromHash } from "./editorRoute";

describe("editorRouteFromHash", () => {
  it("maps #explore to explore", () => {
    expect(editorRouteFromHash("#explore")).toBe("explore");
    expect(editorRouteFromHash("explore")).toBe("explore");
  });

  it("maps empty / other hashes to dialogue", () => {
    expect(editorRouteFromHash("")).toBe("dialogue");
    expect(editorRouteFromHash("#")).toBe("dialogue");
    expect(editorRouteFromHash("#v2")).toBe("dialogue");
  });
});
