/**
 * Modal Tab cycle and background inert. The focus trap always runs.
 * `inert` is extra when the platform has it; it is not the only guard.
 */

export type ModalKeyEvent = {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export type FocusEl = { focus: () => void };

export type ModalFocusBinding = {
  /** Element focused before the dialog opened. */
  opener: FocusEl | null;
  activeElement: () => FocusEl | null;
  activeInside: () => boolean;
  focusables: () => FocusEl[];
  autofocus: () => FocusEl | null;
  supportsInert: boolean;
  setInert: (on: boolean) => void;
  addKeyListener: (fn: (event: ModalKeyEvent) => void) => () => void;
};

export function pickInitialFocus<T>(opts: {
  active: T | null;
  activeInside: boolean;
  autofocus: T | null;
  first: T | null;
}): T | null {
  if (opts.active && opts.activeInside) return opts.active;
  return opts.autofocus ?? opts.first;
}

export function nextFocusIndex(count: number, index: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (index < 0) return shift ? count - 1 : 0;
  const step = shift ? -1 : 1;
  return (index + step + count) % count;
}

/**
 * Marks every sibling of the dialog and of each ancestor, stopping at `stop`.
 * The dialog chain itself is not marked, so the window stays usable.
 */
export function collectOutside<T extends { parent: T | null; children: readonly T[] }>(
  dialog: T,
  stop: T | null,
): T[] {
  const out: T[] = [];
  let node: T | null = dialog;
  const seen = new Set<T>();
  while (node && node !== stop) {
    if (seen.has(node)) break;
    seen.add(node);
    const parent: T | null = node.parent;
    if (!parent || parent === stop) {
      if (parent) {
        for (const child of parent.children) {
          if (child !== node) out.push(child);
        }
      }
      break;
    }
    for (const child of parent.children) {
      if (child !== node) out.push(child);
    }
    node = parent;
  }
  return out;
}

/** Enter on the card applies. A nested audition control keeps its own key. */
export function assetCardAction(key: string, fromCard: boolean): "apply" | "ignore" {
  if (!fromCard) return "ignore";
  return key === "Enter" ? "apply" : "ignore";
}

export function bindModalFocus(binding: ModalFocusBinding, onClose: () => void): () => void {
  if (binding.supportsInert) binding.setInert(true);
  const initial = pickInitialFocus({
    active: binding.activeElement(),
    activeInside: binding.activeInside(),
    autofocus: binding.autofocus(),
    first: binding.focusables()[0] ?? null,
  });
  initial?.focus();

  const remove = binding.addKeyListener((event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = binding.focusables();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const current = binding.activeElement();
    const index = current ? items.indexOf(current) : -1;
    const next = nextFocusIndex(items.length, index, event.shiftKey);
    event.preventDefault();
    if (next >= 0) items[next]?.focus();
  });

  return () => {
    remove();
    if (binding.supportsInert) binding.setInert(false);
    binding.opener?.focus();
  };
}

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function listTabbable(root: ParentNode): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(TABBABLE);
  const out: HTMLElement[] = [];
  for (const el of nodes) {
    if (el.closest("[hidden]")) continue;
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (el.tabIndex < 0) continue;
    out.push(el);
  }
  return out;
}

/** DOM adapter. Escape still calls `onClose` and does not confirm a dirty form. */
export function bindModalElement(panel: HTMLElement, onClose: () => void): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const targets = collectInertElements(panel);
  const supportsInert = typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;
  return bindModalFocus(
    {
      opener,
      activeElement: () =>
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      activeInside: () => {
        const active = document.activeElement;
        return active instanceof HTMLElement && panel.contains(active);
      },
      focusables: () => listTabbable(panel),
      autofocus: () => panel.querySelector<HTMLElement>("[autofocus]"),
      supportsInert,
      setInert: (on) => {
        for (const el of targets) {
          el.inert = on;
        }
      },
      addKeyListener: (fn) => {
        const handler = (event: KeyboardEvent) => fn(event);
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
      },
    },
    onClose,
  );
}

export function collectInertElements(dialog: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let node: HTMLElement | null = dialog;
  const seen = new Set<HTMLElement>();
  while (node && node.parentElement && node.parentElement !== document.body) {
    if (seen.has(node)) break;
    seen.add(node);
    const parent: HTMLElement | null = node.parentElement;
    for (const child of parent.children) {
      if (child !== node && child instanceof HTMLElement) out.push(child);
    }
    node = parent;
  }
  if (node?.parentElement === document.body) {
    for (const child of document.body.children) {
      if (child !== node && child instanceof HTMLElement) out.push(child);
    }
  }
  return out;
}
