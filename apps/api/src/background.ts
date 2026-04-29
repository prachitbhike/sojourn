// Tracks fire-and-forget background promises so:
// - vitest can drain them deterministically before asserting on persisted state
// - graceful shutdown (Phase 2+) has a place to await in-flight work
//
// Production traffic does not need to interact with this — handlers call
// tracker.run(work) and return immediately.

export type BackgroundTracker = {
  run<T>(work: Promise<T>): Promise<T>;
  drain(): Promise<void>;
  size(): number;
};

export function createBackgroundTracker(): BackgroundTracker {
  const inflight = new Set<Promise<unknown>>();
  return {
    run(work) {
      const wrapped = work.catch(() => undefined);
      inflight.add(wrapped);
      void wrapped.finally(() => inflight.delete(wrapped));
      return work;
    },
    async drain() {
      while (inflight.size > 0) {
        await Promise.allSettled([...inflight]);
      }
    },
    size() {
      return inflight.size;
    },
  };
}
