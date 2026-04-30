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

export type CreateCharacterRequest = { prompt: string; refImageUrl?: string };

// Two-step reference-image upload. Client POSTs to /api/uploads/reference for
// a slot, then POSTs the image bytes directly to R2 via `uploadUrl` as a
// multipart/form-data body containing every entry in `fields` plus the file
// as the final `file` field. Once the upload completes, the client passes
// `refImageUrl` back to POST /api/characters.
export type UploadReferenceRequest = { contentType: string };

export type UploadReferenceResponse = {
  uploadUrl: string;
  fields: Record<string, string>;
  refImageUrl: string;
};

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
