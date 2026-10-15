import { describe, expect, it } from "vitest";
import {
  exitKind,
  formatSet,
  parseSet,
  patchChoiceIf,
  readBranch,
  readCond,
  setExitKind,
  writeBranch,
  writeCond,
} from "./exit";
import { exitEdges } from "./route";

describe("setExitKind", () => {
  it("clears exit for ending", () => {
    expect(setExitKind({ type: "next", goto: "x" }, "none")).toBeUndefined();
  });

  it("starts two empty choices", () => {
    const exit = setExitKind(undefined, "choices");
    expect(exit?.type).toBe("choices");
    if (exit?.type === "choices") {
      expect(exit.options).toHaveLength(2);
    }
  });

  it("keeps existing choices", () => {
    const cur = { type: "choices" as const, options: [{ text: "A", goto: "a" }] };
    expect(setExitKind(cur, "choices")).toEqual(cur);
  });

  it("creates an empty integer branch", () => {
    const exit = setExitKind(undefined, "branch");
    expect(exit).toEqual({ type: "branch", if: { flag: { gte: 0 } }, then: "", else: "" });
  });

  it("creates a return exit and keeps trans when already return", () => {
    expect(setExitKind(undefined, "return")).toEqual({ type: "return" });
    expect(setExitKind({ type: "next", goto: "x" }, "return")).toEqual({ type: "return" });
    const cur = { type: "return" as const, trans: "fade_black" };
    expect(setExitKind(cur, "return")).toEqual(cur);
  });
});

describe("branch form", () => {
  it("writes sora_affection gte 3", () => {
    expect(
      writeBranch({
        name: "sora_affection",
        op: "gte",
        n: 3,
        then: "ending_good",
        else: "ending_normal",
      }),
    ).toEqual({
      type: "branch",
      if: { sora_affection: { gte: 3 } },
      then: "ending_good",
      else: "ending_normal",
    });
  });

  it("omits if when the variable name is blank", () => {
    expect(writeCond({ name: "  ", op: "gte", n: 1 })).toBeUndefined();
    const cleared = patchChoiceIf(
      { text: "A", goto: "a", if: { flag: { gte: 1 } } },
      { name: "", op: "gte", n: 0 },
    );
    expect(cleared.if).toBeUndefined();
    expect("if" in cleared).toBe(false);
  });

  it("writes and reads a choice condition", () => {
    expect(writeCond({ name: "flag", op: "gte", n: 1 })).toEqual({ flag: { gte: 1 } });
    expect(readCond({ flag: { gte: 1 } })).toEqual({ name: "flag", op: "gte", n: 1 });
  });

  it("reads the first cmp", () => {
    const form = readBranch({
      type: "branch",
      if: { sora_affection: { gte: 3 } },
      then: "good",
      else: "ok",
    });
    expect(form).toEqual({
      name: "sora_affection",
      op: "gte",
      n: 3,
      then: "good",
      else: "ok",
    });
  });
});

describe("set parse", () => {
  it("round-trips +1", () => {
    expect(parseSet("sora_affection=+1")).toEqual({ sora_affection: "+1" });
    expect(formatSet({ sora_affection: "+1" })).toBe("sora_affection=+1");
  });

  it("parses integer overwrite", () => {
    expect(parseSet("flag=1")).toEqual({ flag: 1 });
  });

  it("reports none/next/choices", () => {
    expect(exitKind(undefined)).toBe("none");
    expect(exitKind({ type: "next", goto: "home_01" })).toBe("next");
  });

  it("reports return", () => {
    expect(exitKind({ type: "return" })).toBe("return");
    expect(exitKind({ type: "return", trans: "fade_black" })).toBe("return");
  });
});

describe("return exit edges", () => {
  it("has no route edges", () => {
    expect(exitEdges({ type: "return" })).toEqual([]);
    expect(exitEdges({ type: "return", trans: "fade_black" })).toEqual([]);
  });
});
