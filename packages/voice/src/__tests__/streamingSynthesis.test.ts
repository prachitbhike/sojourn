import { describe, expect, it, vi } from "vitest";

import type { PersonaDefinition } from "@npc-creator/types";

import { ElevenLabsClient, type StreamingTextSource } from "../elevenLabsClient";
import type { CaptionSegment } from "../captions";

describe("ElevenLabsClient streaming synthesis", () => {
  const persona: PersonaDefinition = {
    id: "test-mentor",
    displayName: "Test Mentor",
    archetype: "mentor",
    summary: "Test persona for streaming synthesis.",
    tone: [],
    guardrails: [],
    catchphrases: [],
    voice: {
      provider: "elevenlabs",
      voiceId: "voice-id",
      defaultStyle: "default",
      captionLocale: "en-US"
    },
    visual: {
      spriteSheetPath: "/sprites/test.png",
      frameDimensions: { width: 64, height: 64 },
      animations: {
        idle: { startFrame: 0, endFrame: 1, frameRate: 6, loop: true },
        talk: { startFrame: 2, endFrame: 3, frameRate: 10, loop: true }
      }
    }
  };

  it("stitches chunked audio and emits caption segments while streaming", async () => {
    const chunkAudio = new Map<string, number[]>([
      ["Hello explorer.", [1, 1, 2]],
      ["Let's plan the next move.", [3, 5]],
      ["Stay curious!", [8]]
    ]);

    const fetchCalls: string[] = [];
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const text: string = body.text;
      fetchCalls.push(text);

      const bytes = chunkAudio.get(text);
      if (!bytes) {
        return new Response(null, { status: 404 });
      }

      return new Response(createAudioStream(bytes), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg"
        }
      });
    });

    const client = new ElevenLabsClient({
      apiKey: "test-key",
      fetchImpl: mockFetch as unknown as typeof fetch,
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      }
    });

    const textStream: StreamingTextSource = createStreamingSource([
      "Hello explorer. ",
      "Let's plan the next move.\nStay curious!"
    ]);

    const result = await client.synthesize({
      persona,
      textStream
    });

    expect(result.muted).toBe(false);
    expect(result.audioStream).toBeDefined();
    expect(result.captionStream).toBeDefined();
    const audioBytes = await readAudioStream(result.audioStream);
    expect(audioBytes).toEqual([1, 1, 2, 3, 5, 8]);

    expect(fetchCalls).toEqual([
      "Hello explorer.",
      "Let's plan the next move.",
      "Stay curious!"
    ]);

    const captionSegments = await readCaptionStream(result.captionStream);
    const captionTexts = captionSegments.map((segment) => segment.text);
    expect(captionTexts).toContain("Hello explorer.");
    expect(captionTexts).toContain("Let's plan the next move.");
    expect(captionTexts).toContain("Stay curious!");

    // Ensure the accumulated caption track matches the streaming emissions.
    expect(result.captions.segments.length).toBeGreaterThanOrEqual(captionSegments.length);
    expect(result.captions.vtt).toContain("Stay curious!");
  });
});

function createStreamingSource(chunks: readonly string[]): StreamingTextSource {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
}

function createAudioStream(bytes: readonly number[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    }
  });
}

async function readAudioStream(stream?: ReadableStream<Uint8Array>): Promise<number[]> {
  if (!stream) {
    return [];
  }
  const reader = stream.getReader();
  const collected: number[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    collected.push(...chunk.value);
  }
  reader.releaseLock();
  return collected;
}

async function readCaptionStream(
  stream?: ReadableStream<CaptionSegment>
): Promise<CaptionSegment[]> {
  if (!stream) {
    return [];
  }
  const reader = stream.getReader();
  const segments: CaptionSegment[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    segments.push(chunk.value);
  }
  reader.releaseLock();
  return segments;
}
