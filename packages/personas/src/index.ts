import mentorDefinition from "../../../data/personas/mentor.json";
import tricksterDefinition from "../../../data/personas/trickster.json";
import merchantDefinition from "../../../data/personas/merchant.json";

import type {
  PersonaDefinition,
  PersonaVisualProfile,
  SpriteAnimationConfig,
  SpriteSheetMetadata
} from "@npc-creator/types";

import { spriteMetadataByPersona } from "./spriteMetadata";

const rawPersonas = [
  mentorDefinition,
  tricksterDefinition,
  merchantDefinition
] as const;

const personaList: readonly PersonaDefinition[] = rawPersonas.map((definition) => {
  const persona = validatePersona(definition);
  const metadata = spriteMetadataByPersona[persona.id];

  if (!metadata) {
    throw new Error(`Missing sprite metadata for persona "${persona.id}".`);
  }

  return {
    ...persona,
    visual: augmentVisualWithMetadata(persona.visual, metadata)
  };
});

const personaMap: Readonly<Record<string, PersonaDefinition>> = Object.freeze(
  personaList.reduce((acc, persona) => {
    acc[persona.id] = persona;
    return acc;
  }, {} as Record<string, PersonaDefinition>)
);

export function getPersonaById(id: string): PersonaDefinition | undefined {
  return personaMap[id];
}

export function getAllPersonas(): readonly PersonaDefinition[] {
  return personaList;
}

function validatePersona(candidate: unknown): PersonaDefinition {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid persona: expected object.");
  }

  const persona = candidate as PersonaDefinition;

  const requiredStrings: Array<keyof PersonaDefinition> = [
    "id",
    "displayName",
    "summary"
  ];

  for (const key of requiredStrings) {
    if (!persona[key] || typeof persona[key] !== "string") {
      throw new Error(`Invalid persona: missing string field "${String(key)}".`);
    }
  }

  if (!persona.catchphrases || !Array.isArray(persona.catchphrases)) {
    throw new Error(`Invalid persona "${persona.id}": catchphrases must be an array.`);
  }

  if (!persona.guardrails || !Array.isArray(persona.guardrails)) {
    throw new Error(`Invalid persona "${persona.id}": guardrails must be an array.`);
  }

  if (!persona.tone || !Array.isArray(persona.tone)) {
    throw new Error(`Invalid persona "${persona.id}": tone notes must be an array.`);
  }

  if (!persona.voice || persona.voice.provider !== "elevenlabs") {
    throw new Error(`Invalid persona "${persona.id}": voice configuration is missing or unsupported.`);
  }

  if (!persona.visual || typeof persona.visual.spriteSheetPath !== "string") {
    throw new Error(`Invalid persona "${persona.id}": visual sprite sheet path missing.`);
  }

  return persona;
}

export type { PersonaDefinition };

export { spriteMetadataByPersona } from "./spriteMetadata";

function augmentVisualWithMetadata(
  visual: PersonaVisualProfile,
  metadata: SpriteSheetMetadata
): PersonaVisualProfile {
  const idle = selectAnimation(metadata, "idle", visual.animations.idle);
  const talk = selectAnimation(metadata, "talk", visual.animations.talk);

  const walkDown = metadata.animations["walkDown"];
  const walkUp = metadata.animations["walkUp"];
  const walkLeft = metadata.animations["walkLeft"];
  const walkRight = metadata.animations["walkRight"];

  const walk =
    walkDown && walkUp && walkLeft && walkRight
      ? {
          down: toConfig(walkDown),
          up: toConfig(walkUp),
          left: toConfig(walkLeft),
          right: toConfig(walkRight)
        }
      : visual.animations.walk;

  return {
    ...visual,
    frameDimensions: {
      width: metadata.frameSize.width,
      height: metadata.frameSize.height
    },
    animations: {
      ...visual.animations,
      idle,
      talk,
      ...(walk ? { walk } : {})
    },
    metadata
  };
}

function selectAnimation(
  metadata: SpriteSheetMetadata,
  key: string,
  fallback: SpriteAnimationConfig
): SpriteAnimationConfig {
  const entry = metadata.animations[key];
  return entry ? toConfig(entry) : fallback;
}

function toConfig(entry: {
  startFrame: number;
  endFrame: number;
  frameRate: number;
  loop: boolean;
}): SpriteAnimationConfig {
  return {
    startFrame: entry.startFrame,
    endFrame: entry.endFrame,
    frameRate: entry.frameRate,
    loop: entry.loop
  };
}
