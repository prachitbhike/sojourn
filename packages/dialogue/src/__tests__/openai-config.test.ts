import { describe, expect, it } from "vitest";

import {
  buildOpenAIRequestPayload,
  loadOpenAIConfig,
  type OpenAIConfig
} from "../providers/openai";

const mockContext = {
  persona: {
    id: "mentor-aurora",
    displayName: "Aurora the Guide",
    archetype: "mentor",
    summary: "Seasoned sage offering practical wisdom.",
    tone: [
      { mood: "warm", description: "Encouraging without sounding patronizing." }
    ],
    guardrails: [
      { topic: "Boundaries", instruction: "Decline to discuss real-world violence." }
    ],
    catchphrases: [],
    voice: {
      provider: "elevenlabs" as const,
      voiceId: "mentor_aurora_voice_v1",
      captionLocale: "en-US"
    },
    visual: {
      spriteSheetPath: "path/to/sprite.png",
      frameDimensions: { width: 128, height: 128 },
      animations: {
        idle: { startFrame: 0, endFrame: 1, frameRate: 6, loop: true },
        talk: { startFrame: 2, endFrame: 3, frameRate: 10, loop: true }
      }
    }
  },
  request: {
    conversationId: "conv-1",
    personaId: "mentor-aurora",
    turnId: "turn-1",
    user: {
      text: "Hello there!",
      locale: "en-US",
      timestamp: new Date().toISOString()
    },
    context: {
      recentTurns: [
        {
          turnId: "turn-0",
          userText: "Previously we discussed courage.",
          npcText: "Yes, courage that grows from practice."
        }
      ]
    }
  }
} as const;

describe("loadOpenAIConfig", () => {
  it("returns null when API key is missing", () => {
    const config = loadOpenAIConfig({ env: {} as NodeJS.ProcessEnv });
    expect(config).toBeNull();
  });

  it("provides defaults and trims overrides", () => {
    const env = {
      OPENAI_API_KEY: " test-key ",
      OPENAI_BASE_URL: "https://example.com",
      OPENAI_RESPONSES_MODEL: "  gpt-4o-mini ",
      OPENAI_ORG_ID: " org-1 "
    } as NodeJS.ProcessEnv;

    const config = loadOpenAIConfig({ env }) as OpenAIConfig;
    expect(config.apiKey).toBe("test-key");
    expect(config.baseUrl).toBe("https://example.com");
    expect(config.model).toBe("gpt-4o-mini");
    expect(config.organization).toBe("org-1");
    expect(config.temperature).toBeGreaterThan(0);
  });
});

describe("buildOpenAIRequestPayload", () => {
  const config: OpenAIConfig = {
    apiKey: "key",
    baseUrl: "https://api.openai.com",
    model: "gpt-4o-mini",
    organization: undefined,
    project: undefined,
    temperature: 0.7
  };

  it("creates a streaming payload with persona context", () => {
    const payload = buildOpenAIRequestPayload(config, mockContext, 512);
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.stream).toBe(true);
    expect(payload.input[0].role).toBe("system");
    expect(payload.input.at(-1)?.content).toBe("Hello there!");
    expect(payload.max_output_tokens).toBe(512);
  });
});
