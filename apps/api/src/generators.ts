import {
  createStubPortraitGenerator,
  createStubSpriteGenerator,
  type GeneratorRegistry,
  type PortraitGeneratorId,
  type SpriteGeneratorId,
} from '@sojourn/shared/generators';

export type GeneratorDefaults = {
  portrait: PortraitGeneratorId;
  sprite: SpriteGeneratorId;
};

// Builds the generator registry seeded with stub impls. Real `pixellab` and
// `nano-banana` entries land in Slices 2 and 3; the env-driven defaults flip
// to those once their registry entries exist.
export function buildGeneratorRegistry(stubBaseUrl: string): GeneratorRegistry {
  return {
    portraits: {
      stub: createStubPortraitGenerator(stubBaseUrl),
    },
    sprites: {
      stub: createStubSpriteGenerator(stubBaseUrl),
    },
  };
}
