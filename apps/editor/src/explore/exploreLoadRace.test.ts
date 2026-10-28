import { describe, expect, it } from "vitest";
import { exploreLoadRaced } from "./ExploreWorkspace";

describe("exploreLoadRaced", () => {
  it("keeps the in-memory edit when docGen moves during load", async () => {
    let doc = { text: "disk-a" };
    let dirty = false;
    let docGen = 4;
    const seenGen = docGen;
    let resolveLoad: (value: { text: string }) => void = () => {};
    const load = new Promise<{ text: string }>((resolve) => {
      resolveLoad = resolve;
    });
    const pending = (async () => {
      const next = await load;
      if (
        exploreLoadRaced({
          seenGen,
          docGen,
          dirty,
          discardedBeforeLoad: false,
        })
      ) {
        return "cancelled";
      }
      doc = next;
      dirty = false;
      return "committed";
    })();

    docGen += 1;
    doc = { text: "typed" };
    dirty = true;
    resolveLoad({ text: "disk-a" });

    await expect(pending).resolves.toBe("cancelled");
    expect(doc).toEqual({ text: "typed" });
    expect(dirty).toBe(true);
  });

  it("still reloads when the confirmed dirty baseline did not change", () => {
    expect(
      exploreLoadRaced({
        seenGen: 2,
        docGen: 2,
        dirty: true,
        discardedBeforeLoad: true,
      }),
    ).toBe(false);
  });

  it("cancels when dirty appears from a clean baseline without a generation bump", () => {
    expect(
      exploreLoadRaced({
        seenGen: 1,
        docGen: 1,
        dirty: true,
        discardedBeforeLoad: false,
      }),
    ).toBe(true);
  });
});