import { describe, expect, it } from "vitest";
import { dispatch, emptyBus } from "./commandBus";
import { addHotspot } from "./commands";
import { blankExploreDoc } from "./fixture";

describe("addHotspot default placement", () => {
  it("centres first hotspot then offsets the next", () => {
    let doc = blankExploreDoc();
    let bus = emptyBus();
    ({ bus, doc } = dispatch(bus, doc, addHotspot()));
    const a = doc.scene.hotspots[0]!;
    expect(a.shape.type).toBe("rect");
    if (a.shape.type !== "rect") return;
    const res = doc.project.resolution;
    expect(a.shape.x).toBe(Math.round((res.width - 200) / 2));
    expect(a.shape.y).toBe(Math.round((res.height - 160) / 2));

    ({ bus, doc } = dispatch(bus, doc, addHotspot()));
    const b = doc.scene.hotspots[1]!;
    expect(b.shape.type).toBe("rect");
    if (b.shape.type !== "rect") return;
    expect(b.shape.x).toBe(a.shape.x + 24);
    expect(b.shape.y).toBe(a.shape.y + 24);
  });
});
