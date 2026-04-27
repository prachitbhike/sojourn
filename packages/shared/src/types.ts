export type PoseManifest = {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameRate: number;
  loop: boolean;
};

export type CharacterAttributes = {
  archetype?: string;
  outfit?: string;
  palette?: string[];
  expression?: string;
  [key: string]: unknown;
};

export type PortraitGenerator = 'stub' | 'nano-banana';
export type SpriteGenerator = 'stub' | 'pixellab';
export type GenerationStatus = 'pending' | 'ready' | 'failed';
