import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const localesDir = join(dirname(fileURLToPath(import.meta.url)), "../locales");

function load(name: string): Record<string, string> {
  return JSON.parse(readFileSync(join(localesDir, name), "utf8")) as Record<string, string>;
}

describe("i18n key parity", () => {
  const en = load("en.json");
  const hans = load("zh-Hans.json");
  const hant = load("zh-Hant.json");

  it("uses the same key set in zh-Hans, zh-Hant, and en", () => {
    const enKeys = Object.keys(en).sort();
    expect(Object.keys(hans).sort()).toEqual(enKeys);
    expect(Object.keys(hant).sort()).toEqual(enKeys);
  });

  it("keeps the product name untranslated", () => {
    expect(en["app.name"]).toBe("Galeng");
    expect(hans["app.name"]).toBe("Galeng");
    expect(hant["app.name"]).toBe("Galeng");
  });
});
