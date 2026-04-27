import type {
  CharacterAttributes,
  GenerationStatus,
  PortraitGenerator,
  PoseManifest,
  SpriteGenerator,
} from './types.js';
import type { PoseName } from './pose.js';

export type CharacterDto = {
  id: string;
  slug: string;
  name: string;
  basePrompt: string;
  refImageUrl: string | null;
  attributes: CharacterAttributes;
  portraitUrl: string | null;
  portraitGenerator: PortraitGenerator;
  portraitStatus: GenerationStatus;
  voiceId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PoseDto = {
  id: string;
  characterId: string;
  name: PoseName;
  spriteSheetUrl: string;
  manifest: PoseManifest;
  generator: SpriteGenerator;
  status: GenerationStatus;
  createdAt: number;
  updatedAt: number;
};

export type CreateCharacterRequest = { prompt: string };

export type CreateCharacterResponse = {
  character: CharacterDto;
  poses: PoseDto[];
  editKey: string;
};

export type GetCharacterResponse = {
  character: CharacterDto;
  poses: PoseDto[];
};

export type PatchCharacterRequest = {
  name?: string;
  attributes?: CharacterAttributes;
};

export type PatchCharacterResponse = { character: CharacterDto };

export type GeneratePortraitResponse = { character: CharacterDto };

export type GeneratePoseRequest = { name: PoseName };
export type GeneratePoseResponse = { pose: PoseDto };

export type GenerateVoiceRequest = { text: string };
export type GenerateVoiceResponse = { audioUrl: string };

export type RotateKeyResponse = { editKey: string };

export type ApiError = {
  error: string;
  message?: string;
};
