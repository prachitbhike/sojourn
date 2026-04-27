import type { PoseManifest } from '../types.js';
import type { PoseName } from '../pose.js';
import type {
  PortraitGenerator,
  PortraitGenerationInput,
  PortraitGenerationResult,
  SpriteGenerator,
  PoseGenerationInput,
  PoseGenerationResult,
} from './types.js';

export const STUB_POSE_MANIFESTS: Readonly<Record<PoseName, PoseManifest>> = Object.freeze({
  idle: { frameWidth: 64, frameHeight: 64, frameCount: 4, frameRate: 4, loop: true },
  walk: { frameWidth: 64, frameHeight: 64, frameCount: 8, frameRate: 10, loop: true },
  attack: { frameWidth: 64, frameHeight: 64, frameCount: 6, frameRate: 12, loop: false },
  cast: { frameWidth: 64, frameHeight: 64, frameCount: 6, frameRate: 10, loop: false },
});

export const STUB_PORTRAIT_FILENAME = 'portrait.png';

function joinUrl(base: string, path: string): string {
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/${path}`;
}

export function createStubPortraitGenerator(stubBaseUrl: string): PortraitGenerator {
  return {
    id: 'stub',
    async generatePortrait(_input: PortraitGenerationInput): Promise<PortraitGenerationResult> {
      return {
        url: joinUrl(stubBaseUrl, STUB_PORTRAIT_FILENAME),
        status: 'ready',
      };
    },
  };
}

export function createStubSpriteGenerator(stubBaseUrl: string): SpriteGenerator {
  return {
    id: 'stub',
    async generatePose(input: PoseGenerationInput): Promise<PoseGenerationResult> {
      const manifest = STUB_POSE_MANIFESTS[input.poseName];
      return {
        spriteSheetUrl: joinUrl(stubBaseUrl, `${input.poseName}.png`),
        manifest,
        status: 'ready',
      };
    },
  };
}
