import {
  createPixelLabFromEnv,
  createStubPortraitGenerator,
  createStubSpriteGenerator,
  type GeneratorRegistry,
  type PortraitGeneratorId,
  type SpriteGenerator,
  type SpriteGeneratorId,
} from '@sojourn/shared/generators';

export type GeneratorDefaults = {
  portrait: PortraitGeneratorId;
  sprite: SpriteGeneratorId;
};

export type BuildRegistryOptions = {
  // The env-driven default sprite generator id. The pixellab entry is only
  // constructed (and PIXELLAB_API_KEY only required) when this is 'pixellab'
  // — a 'stub' deployment must boot cleanly without provider keys.
  defaultSpriteGenerator?: SpriteGeneratorId;
};

// Builds the generator registry seeded with stub impls. The real pixellab
// entry is wired in lazily so a `SPRITE_GENERATOR=stub` deployment doesn't
// have to provide PIXELLAB_API_KEY. Per-row overrides on `poses.generator`
// also force a real entry to be present — but those are forward-compat for
// post-Phase-1 mixed-provider rows; current Phase 1 inserts use the env
// default, so gating on `defaultSpriteGenerator` is sufficient.
export function buildGeneratorRegistry(
  stubBaseUrl: string,
  options: BuildRegistryOptions = {},
): GeneratorRegistry {
  const sprites: GeneratorRegistry['sprites'] = {
    stub: createStubSpriteGenerator(stubBaseUrl),
  };

  if (options.defaultSpriteGenerator === 'pixellab') {
    sprites.pixellab = createPixelLabFromEnv() as SpriteGenerator;
  }

  return {
    portraits: {
      stub: createStubPortraitGenerator(stubBaseUrl),
    },
    sprites,
  };
}
