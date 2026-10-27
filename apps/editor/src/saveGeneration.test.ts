import { describe, expect, it } from "vitest";
import { mergeSaveResponse } from "./saveGeneration";

describe("mergeSaveResponse", () => {
  it("keeps the saved body and clears dirty when the edit rev is unchanged", () => {
    const decision = mergeSaveResponse({
      requestRev: 3,
      currentRev: 3,
      saved: { id: "a", text: "from-server" },
      current: { id: "a", text: "sent" },
    });
    expect(decision).toEqual({
      value: { id: "a", text: "from-server" },
      clearDirty: true,
    });
  });

  it("keeps the newer local body and leaves dirty set when the rev moved", () => {
    const decision = mergeSaveResponse({
      requestRev: 3,
      currentRev: 4,
      saved: { id: "a", text: "stale" },
      current: { id: "a", text: "typed-while-saving" },
    });
    expect(decision).toEqual({
      value: { id: "a", text: "typed-while-saving" },
      clearDirty: false,
    });
  });
});
