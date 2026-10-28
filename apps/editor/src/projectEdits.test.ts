import { expect, it } from "vitest";
import { mergeProjectEdits } from "./projectEdits";

it("preserves unrelated latest fields, including nested font roles", () => {
  const base = { titleBgm: "bgm/a", fonts: { ui: "fonts/a", dialogue: "fonts/a" }, verbs: ["old"] };
  const draft = { ...base, fonts: { ...base.fonts, ui: "fonts/b" } };
  const latest = { ...base, fonts: { ...base.fonts, dialogue: "fonts/new" }, verbs: ["new"] };
  expect(mergeProjectEdits(base, draft, latest)).toEqual({ ...latest, fonts: { ui: "fonts/b", dialogue: "fonts/new" } });
});

it("applies deletions without resurrecting other deleted fields", () => {
  const base = { titleBgm: "bgm/a", font: "fonts/a", fonts: { ui: "fonts/a", title: "fonts/a" } };
  const draft = { ...base, titleBgm: undefined, fonts: { ui: "fonts/a" } };
  const latest = { ...base, font: undefined, fonts: { ui: "fonts/new", title: "fonts/a" } };
  const merged = mergeProjectEdits<object>(base, draft, latest);
  expect(merged).toEqual({ font: undefined, fonts: { ui: "fonts/new" } });
  expect(merged).not.toHaveProperty("titleBgm");
});

it("rebases edits made during a save without replaying the sent snapshot", () => {
  const sent = { titleBgm: "bgm/b", verbs: ["old"], musicGallery: [] };
  const current = { ...sent, musicGallery: ["new"] };
  const saved = { ...sent, verbs: ["new"] };
  expect(mergeProjectEdits(sent, current, saved)).toEqual({ ...saved, musicGallery: ["new"] });
});
