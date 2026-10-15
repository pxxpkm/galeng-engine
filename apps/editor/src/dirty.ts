export async function flushIfDirty(
  dirty: boolean,
  save: () => Promise<unknown>,
): Promise<"clean" | "saved"> {
  if (!dirty) {
    return "clean";
  }
  await save();
  return "saved";
}

export function shouldWarnUnload(dirty: boolean): boolean {
  return dirty;
}

export function confirmDiscardIfDirty(
  dirty: boolean,
  message = "有未儲存變更，確定要丟棄並重載？",
  confirmFn: (msg: string) => boolean = (msg) =>
    typeof window !== "undefined" ? window.confirm(msg) : false,
): boolean {
  if (!dirty) return true;
  return confirmFn(message);
}
