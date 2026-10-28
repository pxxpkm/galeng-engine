import { describe, expect, it } from "vitest";
import {
  assetCardAction,
  bindModalFocus,
  collectOutside,
  nextFocusIndex,
  pickInitialFocus,
  type FocusEl,
  type ModalKeyEvent,
} from "./modalFocus";

type Node = { id: string; parent: Node | null; children: Node[] };

function tree(): { body: Node; dialog: Node; save: Node; play: Node } {
  const body: Node = { id: "body", parent: null, children: [] };
  const root: Node = { id: "root", parent: body, children: [] };
  const app: Node = { id: "app", parent: root, children: [] };
  const save: Node = { id: "save", parent: app, children: [] };
  const play: Node = { id: "play", parent: app, children: [] };
  const overlay: Node = { id: "overlay", parent: root, children: [] };
  const dialog: Node = { id: "dialog", parent: overlay, children: [] };
  body.children = [root];
  root.children = [app, overlay];
  app.children = [save, play];
  overlay.children = [dialog];
  return { body, dialog, save, play };
}

type Item = FocusEl & { id: string };

function control(id: string): Item {
  const item: Item = {
    id,
    focus() {
      focused = item;
    },
  };
  return item;
}

let focused: Item | null = null;

function key(partial: { key: string; shiftKey?: boolean }): ModalKeyEvent & { prevented: boolean; stopped: boolean } {
  const event = {
    key: partial.key,
    shiftKey: Boolean(partial.shiftKey),
    prevented: false,
    stopped: false,
    preventDefault() {
      event.prevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    },
  };
  return event;
}

describe("modal focus", () => {
  it("keeps Tab on New scene controls and off the page behind", () => {
    const opener = control("new-scene");
    const close = control("close");
    const kindDialogue = control("kind-dialogue");
    const kindExplore = control("kind-explore");
    const sceneId = control("scene-id");
    const title = control("title");
    const cancel = control("cancel");
    const create = control("create");
    const pageBehind = control("body-new-scene");
    const items = [close, kindDialogue, kindExplore, sceneId, title, cancel, create];
    let active: Item | null = opener;
    let inert = false;
    const keys: { fn: ((event: ModalKeyEvent) => void) | null } = { fn: null };
    let closed = 0;
    focused = null;

    const cleanup = bindModalFocus(
      {
        opener,
        activeElement: () => active,
        activeInside: () => active != null && items.includes(active),
        focusables: () => items,
        autofocus: () => sceneId,
        supportsInert: true,
        setInert: (on) => {
          inert = on;
        },
        addKeyListener: (fn) => {
          keys.fn = fn;
          return () => {
            keys.fn = null;
          };
        },
      },
      () => {
        closed += 1;
      },
    );

    expect(inert).toBe(true);
    expect(focused).toBe(sceneId);
    active = sceneId;

    const seen = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      if (!active) break;
      seen.add(active.id);
      const event = key({ key: "Tab" });
      keys.fn?.(event);
      expect(event.prevented).toBe(true);
      active = focused;
    }
    expect([...seen].sort()).toEqual(
      ["cancel", "close", "create", "kind-dialogue", "kind-explore", "scene-id", "title"].sort(),
    );
    expect(seen.has(pageBehind.id)).toBe(false);
    expect(focused).toBe(sceneId);

    const back = key({ key: "Tab", shiftKey: true });
    keys.fn?.(back);
    expect(focused).toBe(kindExplore);

    const esc = key({ key: "Escape" });
    keys.fn?.(esc);
    expect(esc.stopped).toBe(true);
    expect(closed).toBe(1);

    cleanup();
    expect(inert).toBe(false);
    expect(focused).toBe(opener);
  });

  it("still traps Tab when inert is unavailable", () => {
    const opener = control("new-scene");
    const sceneId = control("scene-id");
    const cancel = control("cancel");
    const create = control("create");
    const items = [sceneId, cancel, create];
    let active: Item | null = opener;
    let inertCalls = 0;
    const keys: { fn: ((event: ModalKeyEvent) => void) | null } = { fn: null };
    focused = null;

    bindModalFocus(
      {
        opener,
        activeElement: () => active,
        activeInside: () => active != null && items.includes(active),
        focusables: () => items,
        autofocus: () => sceneId,
        supportsInert: false,
        setInert: () => {
          inertCalls += 1;
        },
        addKeyListener: (fn) => {
          keys.fn = fn;
          return () => {};
        },
      },
      () => {},
    );

    expect(inertCalls).toBe(0);
    expect(focused).toBe(sceneId);
    active = sceneId;
    keys.fn?.(key({ key: "Tab" }));
    expect(focused).toBe(cancel);
    active = focused;
    keys.fn?.(key({ key: "Tab" }));
    expect(focused).toBe(create);
    active = focused;
    keys.fn?.(key({ key: "Tab" }));
    expect(focused).toBe(sceneId);
  });

  it("picks the autofocus field when nothing inside is focused yet", () => {
    const id = { focus() {} };
    expect(
      pickInitialFocus({
        active: { focus() {} },
        activeInside: false,
        autofocus: id,
        first: { focus() {} },
      }),
    ).toBe(id);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });

  it("inerts the app behind the dialog and not the dialog chain", () => {
    const { body, dialog, save, play } = tree();
    const outside = collectOutside(dialog, body).map((node) => node.id);
    expect(outside).toContain("app");
    expect(outside).not.toContain("dialog");
    expect(outside).not.toContain("overlay");
    expect(save.parent?.id).toBe("app");
    expect(play.parent?.id).toBe("app");
  });
});

describe("asset card keyboard", () => {
  it("applies on Enter from the card and leaves the audition button alone", () => {
    expect(assetCardAction("Enter", true)).toBe("apply");
    expect(assetCardAction("Enter", false)).toBe("ignore");
    expect(assetCardAction(" ", true)).toBe("ignore");
  });
});
