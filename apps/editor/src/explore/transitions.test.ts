import { describe, expect, it } from "vitest";
import { resolveEffectiveTrans, transKindForAction } from "./transitions";

describe("resolveEffectiveTrans", () => {
  const defaults = {
    toDialogue: "fade_black",
    fromDialogue: "crossfade",
    gotoScene: "fade_black",
  };

  it("uses explicit trans over defaults", () => {
    expect(
      resolveEffectiveTrans({ type: "call", scene: "dlg", trans: "custom" }, defaults),
    ).toBe("custom");
  });

  it("falls back to toDialogue for call", () => {
    expect(resolveEffectiveTrans({ type: "call", scene: "dlg" }, defaults)).toBe(
      "fade_black",
    );
    expect(transKindForAction({ type: "call", scene: "x" })).toBe("toDialogue");
  });

  it("falls back to fromDialogue for return", () => {
    expect(resolveEffectiveTrans({ type: "return" }, defaults)).toBe("crossfade");
  });

  it("falls back to gotoScene for goto", () => {
    expect(resolveEffectiveTrans({ type: "gotoScene", scene: "end" }, defaults)).toBe(
      "fade_black",
    );
  });

  it("returns undefined without defaults", () => {
    expect(resolveEffectiveTrans({ type: "call", scene: "dlg" })).toBeUndefined();
  });
});
