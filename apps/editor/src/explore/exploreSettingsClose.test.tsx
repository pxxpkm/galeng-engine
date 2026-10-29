// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExploreSettingsDialog, SETTINGS_DISCARD_CONFIRM } from "./ExploreSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getJson: (path: string) => {
      if (path === "/api/project") {
        return Promise.resolve({
          id: "demo",
          title: "Demo",
          startScene: "room",
          locale: "zh-Hant",
        });
      }
      if (path === "/api/assets") return Promise.resolve([]);
      return Promise.reject(new Error(path));
    },
  };
});

function Harness() {
  const [open, setOpen] = useState(true);
  return <ExploreSettingsDialog open={open} onClose={() => setOpen(false)} />;
}

let root: Root;
let host: HTMLDivElement;
let confirmMock: ReturnType<typeof vi.fn<(message?: string) => boolean>>;
let originalConfirm: typeof window.confirm;

function dialogOpen(): boolean {
  return document.querySelector("[data-testid='explore-settings']") != null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(pred: () => boolean, label: string) {
  for (let i = 0; i < 40; i += 1) {
    if (pred()) return;
    await settle();
  }
  const error = document.querySelector("[data-testid='explore-settings-error']")?.textContent ?? "";
  throw new Error(
    `${label} timed out ${error} ${document.body.textContent?.slice(0, 240) ?? ""}`,
  );
}

async function mount() {
  await act(async () => {
    root.render(<Harness />);
  });
  await waitFor(
    () => document.querySelector("[data-testid='explore-settings-fonts']") != null,
    "settings load",
  );
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!descriptor?.set) throw new Error("input value setter missing");
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function makeDirty() {
  const fonts = document.querySelector<HTMLButtonElement>(
    "[data-testid='explore-settings-fonts']",
  );
  if (!fonts) throw new Error("fonts button missing");
  await act(async () => {
    fonts.click();
  });
  await waitFor(() => document.querySelector("input[type='number']") != null, "font scale");
  const input = document.querySelector<HTMLInputElement>("input[type='number']");
  if (!input) throw new Error("font scale missing");
  await act(async () => {
    setInputValue(input, "22");
  });
  await waitFor(() => {
    const save = document.querySelector<HTMLButtonElement>("[data-testid='explore-settings-save']");
    return Boolean(save && !save.disabled && save.textContent?.includes("*"));
  }, "dirty save");
}

function pressEscape() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

function pressBackdrop() {
  const overlay = document.querySelector<HTMLElement>(
    "[data-testid='explore-settings'] .v2-overlay",
  );
  if (!overlay) throw new Error("backdrop missing");
  overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}

function clickTestId(id: string) {
  const el = document.querySelector<HTMLButtonElement>(`[data-testid='${id}']`);
  if (!el) throw new Error(`${id} missing`);
  el.click();
}

const gestures = [
  { name: "Escape", press: pressEscape },
  { name: "the backdrop", press: pressBackdrop },
  { name: "OK", press: () => clickTestId("explore-settings-ok") },
  { name: "the close button", press: () => clickTestId("explore-settings-close") },
] as const;

describe("ExploreSettingsDialog dismiss", () => {
  beforeEach(() => {
    confirmMock = vi.fn<(message?: string) => boolean>(() => false);
    originalConfirm = window.confirm;
    window.confirm = confirmMock as unknown as typeof window.confirm;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    window.confirm = originalConfirm;
  });

  describe.each(gestures)("$name", ({ press }) => {
    it("closes a clean dialog without asking", async () => {
      await mount();
      const save = document.querySelector<HTMLButtonElement>(
        "[data-testid='explore-settings-save']",
      );
      expect(save?.disabled).toBe(true);

      await act(async () => {
        press();
      });

      expect(confirmMock).not.toHaveBeenCalled();
      expect(dialogOpen()).toBe(false);
    });

    it("asks when settings are dirty and closes after confirm", async () => {
      await mount();
      await makeDirty();
      confirmMock.mockReturnValue(true);

      await act(async () => {
        press();
      });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(confirmMock).toHaveBeenCalledWith(SETTINGS_DISCARD_CONFIRM);
      expect(dialogOpen()).toBe(false);
    });

    it("stays open when discarding dirty settings is cancelled", async () => {
      await mount();
      await makeDirty();
      confirmMock.mockReturnValue(false);

      await act(async () => {
        press();
      });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(confirmMock).toHaveBeenCalledWith(SETTINGS_DISCARD_CONFIRM);
      expect(dialogOpen()).toBe(true);
      const save = document.querySelector<HTMLButtonElement>(
        "[data-testid='explore-settings-save']",
      );
      expect(save?.disabled).toBe(false);
      expect(save?.textContent).toContain("*");
      expect(document.querySelector("input[type='number']")).not.toBeNull();
    });
  });

  it("does not treat a press inside the dialog as the backdrop", async () => {
    await mount();
    await makeDirty();
    const panel = document.querySelector(".v2-modal");
    expect(panel).not.toBeNull();

    await act(async () => {
      panel?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(confirmMock).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
  });
});
