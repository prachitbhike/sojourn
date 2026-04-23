import type { SpriteSheetMetadata } from "@npc-creator/types";

import mentorMetadata from "../../../packages/assets/sprites/mentor-nano-banana.json";
import merchantMetadata from "../../../packages/assets/sprites/merchant-nano-banana.json";
import tricksterMetadata from "../../../packages/assets/sprites/trickster-nano-banana.json";

export const spriteMetadataByPersona: Record<string, SpriteSheetMetadata> = {
  "mentor-aurora": mentorMetadata as SpriteSheetMetadata,
  "merchant-vela": merchantMetadata as SpriteSheetMetadata,
  "trickster-pip": tricksterMetadata as SpriteSheetMetadata
};
