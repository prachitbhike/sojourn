import type {
  CharacterAttributes,
  GenerationStatus,
  PortraitGenerator as PortraitGeneratorId,
  PoseManifest,
  SpriteGenerator as SpriteGeneratorId,
} from '../types.js';
import type { PoseName } from '../pose.js';

export type PortraitGenerationInput = {
  characterId: string;
  slug: string;
  prompt: string;
  attributes: CharacterAttributes;
  refImageUrl?: string | null;
};

export type PortraitGenerationResult = {
  url: string;
  status: GenerationStatus;
};

export type PoseGenerationInput = {
  characterId: string;
  slug: string;
  poseName: PoseName;
  prompt: string;
  attributes: CharacterAttributes;
  refImageUrl?: string | null;
};

export type PoseGenerationResult = {
  spriteSheetUrl: string;
  manifest: PoseManifest;
  status: GenerationStatus;
};

export interface PortraitGenerator {
  readonly id: PortraitGeneratorId;
  generatePortrait(input: PortraitGenerationInput): Promise<PortraitGenerationResult>;
}

export interface SpriteGenerator {
  readonly id: SpriteGeneratorId;
  generatePose(input: PoseGenerationInput): Promise<PoseGenerationResult>;
}

export type GeneratorRegistry = {
  portraits: Partial<Record<PortraitGeneratorId, PortraitGenerator>>;
  sprites: Partial<Record<SpriteGeneratorId, SpriteGenerator>>;
};

export function getPortraitGenerator(
  registry: GeneratorRegistry,
  id: PortraitGeneratorId,
): PortraitGenerator {
  const gen = registry.portraits[id];
  if (!gen) {
    throw new Error(`No portrait generator registered for id "${id}"`);
  }
  return gen;
}

export function getSpriteGenerator(
  registry: GeneratorRegistry,
  id: SpriteGeneratorId,
): SpriteGenerator {
  const gen = registry.sprites[id];
  if (!gen) {
    throw new Error(`No sprite generator registered for id "${id}"`);
  }
  return gen;
}

export type { PortraitGeneratorId, SpriteGeneratorId };
