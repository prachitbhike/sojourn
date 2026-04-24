import type { PersonaDefinition, PersonaVisualProfile, SpriteAnimationConfig, SpriteSheetMetadata } from "@npc-creator/types";

export interface GeneratedSprite {
  readonly persona: PersonaDefinition;
  readonly spriteUrl: string;
  readonly metadata: SpriteSheetMetadata;
  readonly requestId: string;
  readonly prompt: string;
  readonly advisory?: string;
}

interface SpritePipelineResponse {
  readonly requestId?: string;
  readonly prompt?: string;
  readonly guidance?: string;
  readonly persona?: Partial<PersonaDefinition>;
  readonly sprite?: {
    readonly url?: string;
    readonly metadata?: SpriteSheetMetadata;
  };
  readonly spriteUrl?: string;
  readonly metadata?: SpriteSheetMetadata;
  readonly message?: string;
}

const DEFAULT_PIPELINE_BASE = "http://localhost:8787";
const DEFAULT_ENDPOINT = "/api/sprites";

export async function generateSpriteFromPrompt(prompt: string, signal?: AbortSignal): Promise<GeneratedSprite> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Please describe the NPC you want to generate.");
  }

  const baseUrl = import.meta.env.VITE_SPRITE_PIPELINE_URL ?? DEFAULT_PIPELINE_BASE;
  const endpoint = new URL(import.meta.env.VITE_SPRITE_PIPELINE_PATH ?? DEFAULT_ENDPOINT, ensureTrailingSlash(baseUrl)).toString();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt: trimmed }),
    signal
  });

  if (!response.ok) {
    const errorText = await safeRead(response);
    throw new Error(formatErrorMessage(response.status, errorText));
  }

  const payload = (await response.json()) as SpritePipelineResponse;
  const metadata = payload.sprite?.metadata ?? payload.metadata;
  const spriteUrl = payload.sprite?.url ?? payload.spriteUrl;

  if (!metadata || !spriteUrl) {
    throw new Error("Sprite pipeline response was missing sprite metadata.");
  }

  const persona = buildPersona(payload.persona, metadata, spriteUrl, payload);

  return {
    persona,
    spriteUrl,
    metadata,
    requestId: payload.requestId ?? persona.id,
    prompt: payload.prompt ?? trimmed,
    advisory: payload.guidance ?? payload.message
  };
}

function buildPersona(
  candidate: Partial<PersonaDefinition> | undefined,
  metadata: SpriteSheetMetadata,
  spriteUrl: string,
  payload: SpritePipelineResponse
): PersonaDefinition {
  const animations = resolveAnimations(metadata);
  const fallbackId = payload.requestId ?? `generated-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

  const visual: PersonaVisualProfile = {
    spriteSheetPath: spriteUrl,
    frameDimensions: {
      width: metadata.frameSize.width,
      height: metadata.frameSize.height
    },
    animations,
    metadata
  };

  return {
    id: candidate?.id ?? fallbackId,
    displayName: candidate?.displayName ?? "Generated NPC",
    archetype: candidate?.archetype ?? "mentor",
    summary:
      candidate?.summary ??
      payload.message ??
      "Sprite generated from the latest prompt.",
    tone: candidate?.tone ?? [],
    guardrails: candidate?.guardrails ?? [],
    catchphrases: candidate?.catchphrases ?? [],
    voice:
      candidate?.voice ?? {
        provider: "elevenlabs",
        voiceId: "npc-generator-default",
        captionLocale: "en-US"
      },
    visual
  };
}

function resolveAnimations(metadata: SpriteSheetMetadata): PersonaVisualProfile["animations"] {
  const idle = toAnimation(metadata, "idle");
  const talk = toAnimation(metadata, "talk") ?? idle;

  const walkUp = toAnimation(metadata, "walkUp");
  const walkDown = toAnimation(metadata, "walkDown");
  const walkLeft = toAnimation(metadata, "walkLeft");
  const walkRight = toAnimation(metadata, "walkRight");

  const walk = walkUp && walkDown && walkLeft && walkRight
    ? {
        up: walkUp,
        down: walkDown,
        left: walkLeft,
        right: walkRight
      }
    : undefined;

  if (!idle) {
    throw new Error("Sprite metadata did not include an idle animation block.");
  }

  return {
    idle,
    talk,
    ...(walk ? { walk } : {})
  };
}

function toAnimation(
  metadata: SpriteSheetMetadata,
  key: string
): SpriteAnimationConfig | undefined {
  const entry = metadata.animations[key];
  if (!entry) {
    return undefined;
  }
  return {
    startFrame: entry.startFrame,
    endFrame: entry.endFrame,
    frameRate: entry.frameRate,
    loop: entry.loop
  };
}

async function safeRead(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function formatErrorMessage(status: number, body?: string): string {
  if (!body) {
    return `Sprite pipeline rejected the request (status ${status}).`;
  }

  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    // fall through to raw body
  }

  return body;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
