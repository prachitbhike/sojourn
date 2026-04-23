import type { SpriteSheetMetadata } from "@npc-creator/types";

import mentorSprite from "../../packages/assets/sprites/mentor-nano-banana.png";
import mentorMetadata from "../../packages/assets/sprites/mentor-nano-banana.json";
import tricksterSprite from "../../packages/assets/sprites/trickster-nano-banana.png";
import tricksterMetadata from "../../packages/assets/sprites/trickster-nano-banana.json";
import merchantSprite from "../../packages/assets/sprites/merchant-nano-banana.png";
import merchantMetadata from "../../packages/assets/sprites/merchant-nano-banana.json";

export interface SpriteManifestEntry {
  readonly texture: string;
  readonly metadata: SpriteSheetMetadata;
}

export const spriteManifest: Record<string, SpriteManifestEntry> = {
  "mentor-aurora": {
    texture: mentorSprite,
    metadata: mentorMetadata as SpriteSheetMetadata
  },
  "trickster-pip": {
    texture: tricksterSprite,
    metadata: tricksterMetadata as SpriteSheetMetadata
  },
  "merchant-vela": {
    texture: merchantSprite,
    metadata: merchantMetadata as SpriteSheetMetadata
  }
};

export const spriteMetadataByPersona: Record<string, SpriteSheetMetadata> = {
  "mentor-aurora": mentorMetadata as SpriteSheetMetadata,
  "trickster-pip": tricksterMetadata as SpriteSheetMetadata,
  "merchant-vela": merchantMetadata as SpriteSheetMetadata
};
