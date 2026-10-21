import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseJsonUtf8, validateProject, validateScene } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readUtf8(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function load(rel: string): unknown {
  return parseJsonUtf8(readUtf8(rel));
}

describe("valid examples and fixtures", () => {
  it("accepts character textRate", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      characters: [{ id: "sora", textRate: 80 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.characters?.[0]?.textRate).toBe(80);
    }
  });

  it("rejects textRate out of range", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      characters: [{ id: "sora", textRate: 10 }],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts char slideMs", () => {
    const ok = validateScene({
      id: "ok",
      beats: [{ chars: [{ id: "sora", face: "smile", slot: "left", slideMs: 400 }] }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.beats?.[0]?.chars?.[0]?.slideMs).toBe(400);
    }
  });

  it("accepts char pixel offset", () => {
    const ok = validateScene({
      id: "ok",
      beats: [{ chars: [{ id: "sora", face: "smile", slot: "left", x: 80, y: -20 }] }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.beats?.[0]?.chars?.[0]).toMatchObject({ x: 80, y: -20, slot: "left" });
    }
  });

  it("accepts beat fx flash", () => {
    const ok = validateScene({
      id: "ok",
      beats: [{ fx: { type: "flash" } }, { fx: { type: "flash", ms: 120 } }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.beats?.[0]?.fx?.type).toBe("flash");
      expect(ok.value.beats?.[1]?.fx?.ms).toBe(120);
    }
  });

  it("accepts beat camera object and null", () => {
    const path = validateScene({
      id: "ok",
      beats: [{ camera: { x: 80, y: -40, zoom: 160 } }],
    });
    expect(path.ok).toBe(true);
    if (path.ok) {
      expect(path.value.beats?.[0]?.camera).toEqual({ x: 80, y: -40, zoom: 160 });
    }
    const closed = validateScene({
      id: "ok",
      beats: [{ camera: null }],
    });
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.beats?.[0]?.camera).toBeNull();
    }
    const bad = validateScene({
      id: "bad",
      beats: [{ camera: { zoom: 10 } }],
    });
    expect(bad.ok).toBe(false);
  });

  it("accepts beat amb path and null", () => {
    const path = validateScene({
      id: "ok",
      beats: [{ amb: "amb/rain" }],
    });
    expect(path.ok).toBe(true);
    if (path.ok) {
      expect(path.value.beats?.[0]?.amb).toBe("amb/rain");
    }
    const closed = validateScene({
      id: "ok",
      beats: [{ amb: null }],
    });
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.beats?.[0]?.amb).toBeNull();
    }
  });

  it("accepts optional project icon", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      icon: "ui/icon",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.icon).toBe("ui/icon");
    }
  });

  it("accepts optional project msgBox", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      msgBox: "ui/msgbox",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.msgBox).toBe("ui/msgbox");
    }
  });

  it("accepts optional titleButtons and hideGameTitle", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      hideGameTitle: true,
      titleButtons: {
        newGame: { label: "", image: "ui/title/start", x: 80, y: 720 },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hideGameTitle).toBe(true);
      expect(result.value.titleButtons?.newGame?.image).toBe("ui/title/start");
    }
  });

  it("accepts optional pauseButtons", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      pauseButtons: { continue: { label: "", image: "ui/pause/cont" } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pauseButtons?.continue?.image).toBe("ui/pause/cont");
    }
  });

  it("rejects unknown titleButtons keys", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      titleButtons: { extra: { label: "x" } },
    });
    expect(result.ok).toBe(false);
  });

  it("accepts optional project font", () => {
    const result = validateProject({
      id: "x",
      title: "x",
      schemaVersion: 1,
      resolution: { width: 1920, height: 1080 },
      startScene: "a",
      locale: "en",
      font: "fonts/mplus",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.font).toBe("fonts/mplus");
    }
  });

  it("accepts examples/prologue/galeng.json", () => {
    const result = validateProject(load("examples/prologue/galeng.json"));
    expect(result.ok).toBe(true);
  });

  it("accepts park_01 with Chinese dialogue", () => {
    const text = readUtf8("examples/prologue/scenario/park_01.json");
    expect(text.includes("今天風真好。")).toBe(true);
    const result = validateScene(parseJsonUtf8(text));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exit?.type).toBe("choices");
      const first = result.value.exit?.type === "choices" ? result.value.exit.options[0] : undefined;
      expect(first?.set?.sora_affection).toBe("+1");
    }
  });

  it("accepts home_01 without exit", () => {
    const result = validateScene(load("examples/prologue/scenario/home_01.json"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exit).toBeUndefined();
    }
  });

  it("accepts park_02 without exit", () => {
    const result = validateScene(load("examples/prologue/scenario/park_02.json"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("park_02");
      expect(result.value.exit).toBeUndefined();
    }
  });

  it("accepts English fixture scene", () => {
    const result = validateScene(load("fixtures/valid/scene-english-say.json"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.beats?.[0]?.say?.text).toBe("The wind feels nice today.");
    }
  });
});

describe("invalid fixtures", () => {
  const dir = join(repoRoot, "fixtures/invalid");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));

  it("has invalid fixtures", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`rejects ${name}`, () => {
      const data = load(`fixtures/invalid/${name}`);
      const result = name.startsWith("project-") ? validateProject(data) : validateScene(data);
      expect(result.ok).toBe(false);
    });
  }
});

describe("set values", () => {
  it("accepts relative string +1 and integer overwrite", () => {
    const relative = validateScene({
      id: "ok",
      beats: [{ set: { sora_affection: "+1" } }],
    });
    expect(relative.ok).toBe(true);

    const overwrite = validateScene({
      id: "ok",
      beats: [{ set: { sora_affection: 1 } }],
    });
    expect(overwrite.ok).toBe(true);
  });

  it("accepts boolean as 0/1", () => {
    const result = validateScene({
      id: "ok",
      beats: [{ set: { met_sora: true } }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects bare +", () => {
    const result = validateScene({
      id: "bad",
      beats: [{ set: { sora_affection: "+" } }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects free string assignment", () => {
    const result = validateScene({
      id: "bad",
      beats: [{ set: { name: "sora" } }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects string condition", () => {
    const result = validateScene({
      id: "bad",
      beats: [{}],
      exit: { type: "branch", if: { flag: "yes" }, then: "a", else: "b" },
    });
    expect(result.ok).toBe(false);
  });
});

describe("beat id", () => {
  it("accepts a legal id", () => {
    const ok = validateScene({
      id: "ok",
      beats: [{ id: "b0123456789abcdef", say: { speaker: "a", text: "hi" } }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.beats?.[0]?.id).toBe("b0123456789abcdef");
    }
  });

  it("rejects an illegal id pattern", () => {
    const bad = validateScene({
      id: "bad",
      beats: [{ id: "B0123456789ABCDEF" }],
    });
    expect(bad.ok).toBe(false);
  });

  it("rejects an empty id string", () => {
    const bad = validateScene({
      id: "bad",
      beats: [{ id: "" }],
    });
    expect(bad.ok).toBe(false);
  });
});

