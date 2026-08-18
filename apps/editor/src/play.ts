export async function launchPlay(opts: {
  dirty: boolean;
  save: () => Promise<unknown>;
  play: () => Promise<unknown>;
}): Promise<"played" | "saved-then-played"> {
  if (opts.dirty) {
    await opts.save();
    await opts.play();
    return "saved-then-played";
  }
  await opts.play();
  return "played";
}
