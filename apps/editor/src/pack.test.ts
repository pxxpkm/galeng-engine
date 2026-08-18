import { describe, expect, it } from "vitest";
import { formatPackNote, packWarningsOf, type PackResult } from "./pack";

const t = (key: string) => {
  if (key === "editor.packWrote") return "Exported game";
  if (key === "editor.packWarnings") return "Warnings";
  return key;
};

describe("formatPackNote", () => {
  it("lists the pak path when there are no warnings", () => {
    const result: PackResult = { pak: "export/game/game.pak" };
    expect(formatPackNote(result, t)).toBe("Exported game: export/game/game.pak");
    expect(packWarningsOf(result)).toEqual([]);
  });

  it("includes exe and every warning", () => {
    const result: PackResult = {
      pak: "export/game/game.pak",
      exe: "export/game/player.exe",
      warnings: ["missing asset `voice/sora/001`", "skip bad.json: schema"],
    };
    const note = formatPackNote(result, t);
    expect(note).toContain("export/game/game.pak + export/game/player.exe");
    expect(note).toContain("Warnings (2)");
    expect(note).toContain("missing asset `voice/sora/001`");
    expect(note).toContain("skip bad.json: schema");
    expect(packWarningsOf(result)).toHaveLength(2);
  });
});
