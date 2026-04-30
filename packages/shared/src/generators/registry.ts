// Lazy factory entry points for the real generator providers. These are
// imported only when the corresponding env-driven default (or per-row override)
// asks for them, so a `*_GENERATOR=stub` deployment never has to import the
// real provider's modules or trip on a missing `PIXELLAB_API_KEY` /
// `GEMINI_API_KEY` at boot.
//
// Each factory reads its own env vars internally, validates the minimum it
// needs, and returns a generator whose `id` matches the registry key.

import type { PortraitGenerator, SpriteGenerator } from './types.js';
import {
  createPixelLabSpriteGenerator,
  type PixelLabConfig,
} from './pixellab/index.js';

export function createPixelLabFromEnv(
  overrides: Partial<PixelLabConfig> = {},
): SpriteGenerator {
  const apiKey = process.env.PIXELLAB_API_KEY ?? '';
  if (!apiKey) {
    throw new Error(
      'PIXELLAB_API_KEY is required when SPRITE_GENERATOR=pixellab. ' +
        'Set PIXELLAB_API_KEY in your environment or set SPRITE_GENERATOR=stub.',
    );
  }
  const apiBase = process.env.PIXELLAB_API_BASE?.trim() || undefined;
  return createPixelLabSpriteGenerator({
    apiKey,
    apiBase,
    ...overrides,
  });
}

// Nano-banana uses a dynamic import + cached in-flight Promise so the
// `@google/genai` SDK stays out of the boot graph for `PORTRAIT_GENERATOR=stub`
// deployments. Two concurrent first calls share a single import + factory.

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
