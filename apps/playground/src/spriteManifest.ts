import mentorSprite from "../../packages/assets/sprites/mentor-nano-banana.png";
import tricksterSprite from "../../packages/assets/sprites/trickster-nano-banana.png";
import merchantSprite from "../../packages/assets/sprites/merchant-nano-banana.png";
import { spriteMetadataByPersona } from "@npc-creator/personas";

export const spriteManifest: Record<string, string> = {
  "mentor-aurora": mentorSprite,
  "trickster-pip": tricksterSprite,
  "merchant-vela": merchantSprite
};

export { spriteMetadataByPersona };
