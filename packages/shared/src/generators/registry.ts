import type { PortraitGenerator } from './types.js';

// Lazy-loaded real generator entries. Each `getX()` defers the actual provider
// import until first call so a `*_GENERATOR=stub` deployment never resolves
// (or fails on missing API keys for) the real SDKs at boot.
//
// We cache the in-flight Promise (not the resolved value) so two concurrent
// first calls share a single dynamic import + factory invocation.

let nanoBananaPortraitPromise: Promise<PortraitGenerator> | null = null;

export function getNanoBananaPortraitGenerator(): Promise<PortraitGenerator> {
  if (!nanoBananaPortraitPromise) {
    nanoBananaPortraitPromise = import('./nano-banana/index.js').then((mod) =>
      mod.createNanoBananaPortraitGenerator(),
    );
  }
  return nanoBananaPortraitPromise;
}

export function resetNanoBananaPortraitCache(): void {
  nanoBananaPortraitPromise = null;
}
