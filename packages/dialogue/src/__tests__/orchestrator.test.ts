import { describe, expect, it, vi } from "vitest";

import type { DialogueGenerator } from "../orchestrator";
import { DialogueOrchestrator } from "../orchestrator";

const persona = {
  id: "mentor-aurora",
  displayName: "Aurora the Guide",
  archetype: "mentor",
  summary: "Seasoned sage offering practical wisdom.",
  tone: [],
  guardrails: [],
  catchphrases: ["Every trailblazer was once a beginner."],
  voice: {
    provider: "elevenlabs",
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
} as const;

const baseRequest = {
  conversationId: "conv-1",
  personaId: persona.id,
  turnId: "turn-1",
  user: {
    text: "Hello there!",
    locale: "en-US",
    timestamp: new Date().toISOString()
  }
} as const;

describe("DialogueOrchestrator", () => {
  it("prefers generator output when available", async () => {
    const generatorResult = {
      text: "Hello from the LLM",
      animation: "idle" as const,
      metadata: { modelLatencyMs: 210 },
      source: "mock-llm"
    };

    const generators: DialogueGenerator[] = [
      { generate: vi.fn().mockResolvedValue(generatorResult) }
    ];

    const orchestrator = new DialogueOrchestrator({
      personas: [persona],
      generators,
      random: () => 0.5
    });

    const result = await orchestrator.respond(baseRequest);

    expect(result.response.text).toBe(generatorResult.text);
    expect(result.response.animation).toBe("idle");
    expect(result.response.metadata).toMatchObject({
      modelLatencyMs: 210,
      responseSource: "mock-llm",
      canned: false
    });
    expect(generators[0].generate).toHaveBeenCalledTimes(1);
  });

  it("falls back to canned responses when generators miss", async () => {
    const orchestrator = new DialogueOrchestrator({
      personas: [persona],
      generators: [
        {
          generate: vi.fn().mockResolvedValue(null)
        }
      ],
      random: () => 0
    });

    const result = await orchestrator.respond(baseRequest);

    expect(result.response.text).toBe(
      "Remember: steady steps beat frantic leaps. What's your next tiny experiment?"
    );
    expect(result.response.metadata?.responseSource).toBe("canned");
    expect(result.response.metadata?.canned).toBe(true);
  });

  it("logs safety flags for risky requests", async () => {
    const warn = vi.fn();
    const orchestrator = new DialogueOrchestrator({
      personas: [persona],
      warn,
      random: () => 0
    });

    const result = await orchestrator.respond({
      ...baseRequest,
      user: {
        ...baseRequest.user,
        text: "I want to plan a fight, maybe stab someone."
      }
    });

    expect(result.safetyFlags).toHaveLength(1);
    expect(result.safetyFlags[0]).toMatchObject({ category: "violence" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[safety]"),
      expect.arrayContaining([
        expect.objectContaining({ category: "violence" })
      ])
    );
  });

  it("warns and continues when a generator throws", async () => {
    const warn = vi.fn();
    const generators: DialogueGenerator[] = [
      {
        generate: vi.fn().mockRejectedValue(new Error("LLM offline"))
      }
    ];

    const orchestrator = new DialogueOrchestrator({
      personas: [persona],
      generators,
      warn,
      random: () => 0.75
    });

    const result = await orchestrator.respond(baseRequest);

    expect(warn).toHaveBeenCalledWith(
      "[dialogue] Generator threw, falling back to canned response.",
      expect.any(Error)
    );
    expect(result.response.text).toBe(
      "Let's anchor this feeling, then pilot toward the smallest useful change."
    );
    expect(result.response.metadata?.responseSource).toBe("canned");
  });
});

