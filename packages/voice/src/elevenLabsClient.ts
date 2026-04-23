import type { PersonaDefinition, DialogueResponse } from "@npc-creator/types";

import { generateCaptionTrack, type CaptionTrack } from "./captions";

export interface ElevenLabsClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly defaultModelId?: string;
  readonly defaultOptimizeStreamingLatency?: number;
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Pick<typeof console, "warn" | "error" | "info">;
}

export interface SynthesisRequest {
  readonly persona: PersonaDefinition;
  readonly text: string;
  readonly responseMetadata?: Pick<DialogueResponse, "metadata">;
  readonly signal?: AbortSignal;
}

export interface SynthesisResult {
  readonly audioStream?: ReadableStream<Uint8Array>;
  readonly captions: CaptionTrack;
  readonly muted: boolean;
  readonly error?: Error;
}

export class ElevenLabsClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly modelId: string;
  private readonly latencyLevel: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Pick<typeof console, "warn" | "error" | "info">;

  constructor(options: ElevenLabsClientOptions = {}) {
    this.apiKey = options.apiKey ?? getEnvironmentKey();
    this.baseUrl = options.baseUrl ?? "https://api.elevenlabs.io";
    this.modelId = options.defaultModelId ?? "eleven_turbo_v2";
    this.latencyLevel = options.defaultOptimizeStreamingLatency ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.logger = options.logger ?? console;
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const captions = generateCaptionTrack({ text: request.text });

    if (!this.apiKey) {
      this.logger.warn("[voice] Missing ElevenLabs API key. Falling back to muted captions only.");
      return { captions, muted: true };
    }

    const url = `${this.baseUrl}/v1/text-to-speech/${request.persona.voice.voiceId}/stream`;

    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": this.apiKey
        },
        body: JSON.stringify({
          text: request.text,
          model_id: this.modelId,
          optimize_streaming_latency: this.latencyLevel,
          voice_settings: buildVoiceSettings(request.persona),
          generation_config: {
            chunk_length_seconds: 12
          }
        }),
        signal: request.signal
      });

      if (!response.ok || !response.body) {
        const error = new Error(`ElevenLabs synthesis failed with status ${response.status}`);
        this.logger.warn("[voice] ElevenLabs responded with error; enabling mute fallback.", error);
        return { captions, muted: true, error };
      }

      const [resultStream, loggingStream] = response.body.tee();

      void logStreamDiagnostics(loggingStream, this.logger).catch((error) => {
        this.logger.warn("[voice] Failed to read ElevenLabs stream diagnostics.", error);
      });

      return {
        audioStream: resultStream,
        captions,
        muted: false
      };
    } catch (error) {
      this.logger.error("[voice] ElevenLabs request threw; enabling mute fallback.", error);
      return {
        captions,
        muted: true,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}

function buildVoiceSettings(persona: PersonaDefinition) {
  const style = persona.voice.defaultStyle ?? "default";
  return {
    stability: style.includes("relaxed") ? 0.75 : 0.55,
    similarity_boost: 0.75,
    style,
    use_speaker_boost: true
  };
}

async function logStreamDiagnostics(
  stream: ReadableStream<Uint8Array>,
  logger: Pick<typeof console, "warn" | "error" | "info">
): Promise<void> {
  const reader = stream.getReader();
  let totalBytes = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    totalBytes += chunk.value.byteLength;
  }

  logger.info?.("[voice] ElevenLabs audio stream completed.", {
    totalBytes
  });
}

function getEnvironmentKey(): string | undefined {
  if (typeof globalThis === "undefined") {
    return undefined;
  }

  const maybeProcess = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process;

  return maybeProcess?.env?.ELEVENLABS_API_KEY;
}
