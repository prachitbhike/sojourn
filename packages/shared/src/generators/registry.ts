import type { PortraitGenerator } from './types.js';

// Lazy-loaded real generator entries. Each `getX()` defers the actual provider
// import until first call so a `*_GENERATOR=stub` deployment never resolves
// (or fails on missing API keys for) the real SDKs at boot.

let cachedNanoBananaPortrait: PortraitGenerator | null = null;

export async function getNanoBananaPortraitGenerator(): Promise<PortraitGenerator> {
  if (!cachedNanoBananaPortrait) {
    const mod = await import('./nano-banana/index.js');
    cachedNanoBananaPortrait = mod.createNanoBananaPortraitGenerator();
  }
  return cachedNanoBananaPortrait;
}

export function resetNanoBananaPortraitCache(): void {
  cachedNanoBananaPortrait = null;
}
