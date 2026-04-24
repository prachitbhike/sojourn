import type { PersonaDefinition, DialogueResponse } from "@npc-creator/types";

import {
  generateCaptionTrack,
  createCaptionTrackFromSegments,
  renderCaptionVtt,
  type CaptionSegment,
  type CaptionTrack
} from "./captions";

export interface ElevenLabsClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly defaultModelId?: string;
  readonly defaultOptimizeStreamingLatency?: number;
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Pick<typeof console, "warn" | "error" | "info">;
}

interface SynthesisRequestBase {
  readonly persona: PersonaDefinition;
  readonly responseMetadata?: Pick<DialogueResponse, "metadata">;
  readonly signal?: AbortSignal;
}

export interface TextSynthesisRequest extends SynthesisRequestBase {
  readonly text: string;
  readonly textStream?: undefined;
}

export type StreamingTextSource = AsyncIterable<string> | ReadableStream<string>;

export interface StreamingSynthesisRequest extends SynthesisRequestBase {
  readonly textStream: StreamingTextSource;
  readonly text?: undefined;
}

export type SynthesisRequest = TextSynthesisRequest | StreamingSynthesisRequest;

export interface SynthesisResult {
  audioStream?: ReadableStream<Uint8Array>;
  captions: CaptionTrack;
  captionStream?: ReadableStream<CaptionSegment>;
  muted: boolean;
  error?: Error;
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
    if (isStreamingRequest(request)) {
      return this.synthesizeStreaming(request);
    }

    return this.synthesizeImmediate(request);
  }

  private async synthesizeImmediate(request: TextSynthesisRequest): Promise<SynthesisResult> {
    const captions = generateCaptionTrack(
      { text: request.text },
      resolveCaptionLanguage(request.persona)
    );

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

  private async synthesizeStreaming(
    request: StreamingSynthesisRequest
  ): Promise<SynthesisResult> {
    const language = resolveCaptionLanguage(request.persona);

    const aggregatedParts: string[] = [];
    const captionSegments: CaptionSegment[] = [];
    const pendingCaptionSegments: CaptionSegment[] = [];
    let captionController: any = null;

    const emitCaption = (segment: CaptionSegment) => {
      if (captionController) {
        captionController.enqueue(segment);
      } else {
        pendingCaptionSegments.push(segment);
      }
    };

    const captionStream = new ReadableStream<CaptionSegment>({
      start(controller) {
        captionController = controller;
        while (pendingCaptionSegments.length > 0) {
          captionController.enqueue(pendingCaptionSegments.shift()!);
        }
      },
      cancel() {
        captionController = null;
        pendingCaptionSegments.length = 0;
      }
    });

    const segmentIterator = streamTextSegments(request.textStream);
    const first = await segmentIterator.next();

    if (first.done) {
      const emptyTrack = createCaptionTrackFromSegments(language, captionSegments);
      const controllerRef = captionController;
      if (controllerRef) {
        controllerRef.close();
      }
      captionController = null;
      return {
        captions: emptyTrack,
        captionStream,
        muted: true
      };
    }

    const firstChunkText = first.value.trim();
    if (!firstChunkText) {
      await collectRemainingSegments(segmentIterator, aggregatedParts);
      const fallbackCaptions = generateCaptionTrack(
        { text: aggregatedParts.join(" ") },
        language
      );
      const controllerRef = captionController;
      if (controllerRef) {
        controllerRef.close();
      }
      captionController = null;
      return { captions: fallbackCaptions, captionStream, muted: true };
    }

    aggregatedParts.push(firstChunkText);

    const firstResult = await this.synthesizeImmediate({
      persona: request.persona,
      text: firstChunkText,
      responseMetadata: request.responseMetadata,
      signal: request.signal
    });

    if (firstResult.muted || !firstResult.audioStream) {
      this.logger.warn("[voice] Streaming synthesis failed on first chunk; using mute fallback.");
      await collectRemainingSegments(segmentIterator, aggregatedParts);
      const fallbackCaptions = generateCaptionTrack(
        { text: aggregatedParts.join(" ") },
        language
      );
      const controllerRef = captionController;
      if (controllerRef) {
        controllerRef.close();
      }
      captionController = null;
      return {
        captions: fallbackCaptions,
        captionStream,
        muted: true,
        error: firstResult.error
      };
    }

    const captionTrack = createCaptionTrackFromSegments(language, captionSegments);
    let captionOffset = appendCaptionSegments({
      destination: captionSegments,
      source: firstResult.captions,
      offset: 0,
      emit: emitCaption,
      update: () => {
        captionTrack.vtt = renderCaptionVtt(captionSegments);
      }
    });

    let resultRef: SynthesisResult | undefined;

    const audioStream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          await pipeAudioStream(firstResult.audioStream!, controller);

          for await (const segmentText of segmentIterator) {
            const trimmed = segmentText.trim();
            if (!trimmed) {
              continue;
            }

            aggregatedParts.push(trimmed);

            const chunkResult = await this.synthesizeImmediate({
              persona: request.persona,
              text: trimmed,
              responseMetadata: request.responseMetadata,
              signal: request.signal
            });

            if (chunkResult.muted || !chunkResult.audioStream) {
              throw chunkResult.error ?? new Error("Streaming chunk synthesis failed.");
            }

            captionOffset = appendCaptionSegments({
              destination: captionSegments,
              source: chunkResult.captions,
              offset: captionOffset,
              emit: emitCaption,
              update: () => {
                captionTrack.vtt = renderCaptionVtt(captionSegments);
              }
            });

            await pipeAudioStream(chunkResult.audioStream, controller);
          }

          captionTrack.vtt = renderCaptionVtt(captionSegments);
          controller.close();
          const controllerRef = captionController;
          if (controllerRef) {
            controllerRef.close();
          }
          captionController = null;
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(
            "[voice] Streaming synthesis interrupted. Switching to muted captions.",
            failure
          );
          const fallbackCaptions = generateCaptionTrack(
            { text: aggregatedParts.join(" ") },
            language
          );
          const controllerRef = captionController;
          if (controllerRef) {
            controllerRef.close();
          }
          captionController = null;
          controller.close();

          if (resultRef) {
            resultRef.audioStream = undefined;
            resultRef.captions = fallbackCaptions;
            resultRef.captionStream = undefined;
            resultRef.muted = true;
            resultRef.error = failure;
          }
        }
      }
    });

    const result: SynthesisResult = {
      audioStream,
      captions: captionTrack,
      captionStream,
      muted: false
    };

    resultRef = result;

    return result;
  }
}

function isStreamingRequest(
  request: SynthesisRequest
): request is StreamingSynthesisRequest {
  return (request as StreamingSynthesisRequest).textStream !== undefined;
}

function resolveCaptionLanguage(persona: PersonaDefinition): string {
  return persona.voice.captionLocale ?? "en-US";
}

async function pipeAudioStream(
  stream: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const reader = stream.getReader();

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      if (chunk.value) {
        controller.enqueue(chunk.value);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function collectRemainingSegments(
  iterator: AsyncGenerator<string, void, unknown>,
  parts: string[]
): Promise<void> {
  for await (const segment of iterator) {
    const trimmed = segment.trim();
    if (trimmed) {
      parts.push(trimmed);
    }
  }
}

function streamTextSegments(source: StreamingTextSource): AsyncGenerator<string, void, void> {
  const iterable = toAsyncIterable(source);
  const segmenter = new TextSegmenter();

  return (async function* () {
    for await (const chunk of iterable) {
      const segments = segmenter.push(chunk);
      for (const segment of segments) {
        if (segment) {
          yield segment;
        }
      }
    }
    const finalSegment = segmenter.finish();
    if (finalSegment) {
      yield finalSegment;
    }
  })();
}

function toAsyncIterable(source: StreamingTextSource): AsyncIterable<string> {
  if ((source as AsyncIterable<string>)[Symbol.asyncIterator]) {
    return source as AsyncIterable<string>;
  }

  const stream = source as ReadableStream<string | Uint8Array>;
  return {
    async *[Symbol.asyncIterator]() {
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }
          if (chunk.value instanceof Uint8Array) {
            yield decoder.decode(chunk.value, { stream: true });
          } else {
            yield chunk.value;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  };
}

interface AppendCaptionArgs {
  readonly destination: CaptionSegment[];
  readonly source: CaptionTrack;
  readonly offset: number;
  readonly emit: (segment: CaptionSegment) => void;
  readonly update: () => void;
}

function appendCaptionSegments(args: AppendCaptionArgs): number {
  const { destination, source, offset, emit, update } = args;
  let currentOffset = offset;

  for (const segment of source.segments) {
    const shifted: CaptionSegment = {
      start: segment.start + currentOffset,
      end: segment.end + currentOffset,
      text: segment.text
    };
    destination.push(shifted);
    emit(shifted);
  }

  if (destination.length > 0) {
    currentOffset = destination[destination.length - 1].end;
  }

  update();
  return currentOffset;
}

class TextSegmenter {
  private buffer = "";

  constructor(private readonly minWordsPerChunk = 12) {}

  push(chunk: string): string[] {
    if (!chunk) {
      return [];
    }

    this.buffer += chunk;
    const segments: string[] = [];

    while (this.buffer.length > 0) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const segment = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        const trimmed = segment.trim();
        if (trimmed) {
          segments.push(trimmed);
        }
        this.buffer = this.buffer.trimStart();
        continue;
      }

      const sentenceBreak = findSentenceBreak(this.buffer);
      if (sentenceBreak !== -1) {
        const segment = this.buffer.slice(0, sentenceBreak + 1);
        const remainder = this.buffer.slice(sentenceBreak + 1);
        this.buffer = remainder;
        const trimmed = segment.trim();
        if (trimmed) {
          segments.push(trimmed);
        }
        this.buffer = this.buffer.trimStart();
        continue;
      }

      const trimmedBuffer = this.buffer.trim();
      if (!trimmedBuffer) {
        this.buffer = "";
        break;
      }

      const wordCount = trimmedBuffer.split(/\s+/).length;
      if (wordCount >= this.minWordsPerChunk) {
        segments.push(trimmedBuffer);
        this.buffer = "";
      }
      break;
    }

    return segments;
  }

  finish(): string | undefined {
    const trimmed = this.buffer.trim();
    this.buffer = "";
    return trimmed || undefined;
  }
}

function findSentenceBreak(buffer: string): number {
  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char === "." || char === "!" || char === "?") {
      const nextChar = buffer[index + 1];
      if (!nextChar || /\s/.test(nextChar)) {
        return index;
      }
    }
  }
  return -1;
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

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      totalBytes += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
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
