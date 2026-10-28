import { afterEach, describe, expect, it, vi } from "vitest";
import { putJson } from "./api";
import { mergeSaveResponse } from "./saveGeneration";
import { _resetLanesForTests, enqueueLane } from "./saveLane";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("enqueueLane", () => {
  afterEach(() => {
    _resetLanesForTests();
    vi.unstubAllGlobals();
  });

  it("writes A then B even when B's own work is faster", async () => {
    const order: string[] = [];
    let disk = "";
    let bSawAFinished = false;
    let aFinished = false;

    const a = enqueueLane("/api/scenes/room", async () => {
      await delay(40);
      order.push("A");
      disk = "A";
      aFinished = true;
      return "A";
    });
    const b = enqueueLane("/api/scenes/room", async () => {
      bSawAFinished = aFinished;
      await delay(1);
      order.push("B");
      disk = "B";
      return "B";
    });

    await expect(Promise.all([a, b])).resolves.toEqual(["A", "B"]);
    expect(order).toEqual(["A", "B"]);
    expect(disk).toBe("B");
    expect(bSawAFinished).toBe(true);
  });

  it("runs the next job after the previous one rejects", async () => {
    const order: string[] = [];
    const a = enqueueLane("/api/project", async () => {
      order.push("A");
      throw new Error("disk");
    });
    const b = enqueueLane("/api/project", async () => {
      order.push("B");
      return "B";
    });
    await expect(a).rejects.toThrow("disk");
    await expect(b).resolves.toBe("B");
    expect(order).toEqual(["A", "B"]);
  });

  it("does not block a different path", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const job = (key: string) =>
      enqueueLane(key, async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(30);
        inFlight -= 1;
      });
    await Promise.all([job("/api/project"), job("/api/scenes/room")]);
    expect(maxInFlight).toBe(2);
  });

  it("keeps disk on B and clears dirty only for the matching revision", async () => {
    let disk = "";
    let rev = 1;
    let ui = "A";
    let dirty = true;
    const writes: string[] = [];

    const write = (body: string, ms: number) =>
      enqueueLane("/api/scenes/study", async () => {
        await delay(ms);
        disk = body;
        writes.push(body);
        return body;
      });

    const revA = rev;
    const bodyA = ui;
    const pendingA = write(bodyA, 30).then((saved) => {
      const merged = mergeSaveResponse({
        requestRev: revA,
        currentRev: rev,
        saved,
        current: ui,
      });
      if (merged.clearDirty) {
        ui = merged.value;
        dirty = false;
      }
      return merged;
    });

    rev = 2;
    ui = "B";
    dirty = true;
    const revB = rev;
    const bodyB = ui;
    const pendingB = write(bodyB, 1).then((saved) => {
      const merged = mergeSaveResponse({
        requestRev: revB,
        currentRev: rev,
        saved,
        current: ui,
      });
      if (merged.clearDirty) {
        ui = merged.value;
        dirty = false;
      }
      return merged;
    });

    const [mergedA, mergedB] = await Promise.all([pendingA, pendingB]);
    expect(writes).toEqual(["A", "B"]);
    expect(disk).toBe("B");
    expect(mergedA.clearDirty).toBe(false);
    expect(mergedB.clearDirty).toBe(true);
    expect(ui).toBe("B");
    expect(dirty).toBe(false);
  });
});

describe("putJson lane", () => {
  afterEach(() => {
    _resetLanesForTests();
    vi.unstubAllGlobals();
  });

  it("snapshots the body and does not overlap one path", async () => {
    const sent: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = String(init.body);
      sent.push(body);
      if (sent.length === 1) await gate;
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstBody = { n: 1 };
    const secondBody = { n: 2 };
    const first = putJson("/api/project", firstBody);
    const second = putJson("/api/project", secondBody);
    secondBody.n = 9;

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([JSON.stringify({ n: 1 })]);

    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { n: 1 },
      { n: 2 },
    ]);
    expect(sent).toEqual([JSON.stringify({ n: 1 }), JSON.stringify({ n: 2 })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still sends the next PUT when the previous response fails", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls += 1;
        if (calls === 1) {
          return new Response("nope", { status: 500 });
        }
        return new Response(String(init.body), { status: 200 });
      }),
    );
    const first = putJson("/api/scenes/room", { v: "A" });
    const second = putJson("/api/scenes/room", { v: "B" });
    await expect(first).rejects.toThrow("nope");
    await expect(second).resolves.toEqual({ v: "B" });
  });
});
