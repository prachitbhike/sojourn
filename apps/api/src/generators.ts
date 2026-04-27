import {
  createStubPortraitGenerator,
  createStubSpriteGenerator,
  type GeneratorRegistry,
} from '@sojourn/shared/generators';

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
