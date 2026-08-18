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
