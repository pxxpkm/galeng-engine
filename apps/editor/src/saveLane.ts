/**
 * One in-flight writer per key. Callers enqueue in invocation order; the next
 * `run` starts only after the previous settles, including rejection.
 * `run` itself is not called until the lane reaches it.
 */
const tails = new Map<string, Promise<void>>();

export function enqueueLane<T>(key: string, run: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const result = prev.then(run, run);
  tails.set(
    key,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/** Test helper — drop queued tails. In-flight work is not cancelled. */
export function _resetLanesForTests(): void {
  tails.clear();
}
