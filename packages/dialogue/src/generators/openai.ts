import type {
  DialogueGenerationContext,
  DialogueResponseDraft,
  DialogueGenerator,
  DialogueStreamEmitter
} from "../orchestrator";
import {
  buildOpenAIRequestPayload,
  loadOpenAIConfig,
  type OpenAIConfig,
  type OpenAIResponseStreamEvent
} from "../providers/openai";
import { createRateLimiter, type RateLimiter } from "../rate-limiter";

export interface OpenAIStreamingGeneratorOptions {
  readonly config?: OpenAIConfig | null;
  readonly maxOutputTokens?: number;
  readonly rateLimiter?: RateLimiter;
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Pick<typeof console, "warn" | "debug">;
}

const RESPONSES_ENDPOINT = "/v1/responses";

export class OpenAIStreamingGenerator implements DialogueGenerator {
  private readonly options: OpenAIStreamingGeneratorOptions;
  private readonly rateLimiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIStreamingGeneratorOptions = {}) {
    this.options = options;
    this.rateLimiter = options.rateLimiter ?? createRateLimiter();
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;

    if (typeof this.fetchImpl !== "function") {
      throw new Error("Fetch implementation is required for OpenAIStreamingGenerator.");
    }
  }

  async generate(
    context: DialogueGenerationContext,
    emitChunk?: DialogueStreamEmitter
  ): Promise<DialogueResponseDraft | null> {
    const config = this.options.config ?? loadOpenAIConfig();

    if (!config) {
      this.options.logger?.debug?.(
        "[openai-generator] OPENAI_API_KEY missing; skipping generator."
      );
      return null;
    }

    const startedAt = Date.now();
    const payload = buildOpenAIRequestPayload(config, context, this.options.maxOutputTokens);
    const endpoint = new URL(RESPONSES_ENDPOINT, config.baseUrl).toString();

    const response = await this.rateLimiter.schedule(() =>
      this.fetchImpl(endpoint, {
        method: "POST",
        headers: buildHeaders(config),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000)
      })
    );

    if (!response.ok || !response.body) {
      const text = await safeReadBody(response);
      this.options.logger?.warn?.(
        "[openai-generator] Non-ok response received",
        response.status,
        text
      );
      return null;
    }

    const { text, deltaCount } = await readOpenAIStream(response.body, emitChunk);

    if (!text) {
      this.options.logger?.warn?.("[openai-generator] Empty stream detected");
      return null;
    }

    const modelLatencyMs = Math.max(Date.now() - startedAt, 0);

    return {
      text,
      animation: "talk",
      metadata: {
        responseSource: "openai",
        modelId: config.model,
        deltaCount,
        modelLatencyMs
      }
    };
  }
}

function buildHeaders(config: OpenAIConfig): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`
  };

  if (config.organization) {
    headers["OpenAI-Organization"] = config.organization;
  }

  if (config.project) {
    headers["OpenAI-Project"] = config.project;
  }

  return headers;
}

async function safeReadBody(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch (error) {
    return `[read_failed:${error instanceof Error ? error.message : "unknown"}]`;
  }
}

async function readOpenAIStream(
  stream: ReadableStream<Uint8Array>,
  emitChunk?: DialogueStreamEmitter
): Promise<{
  text: string;
  deltaCount: number;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let deltaCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }

      let event: OpenAIResponseStreamEvent;
      try {
        event = JSON.parse(payload) as OpenAIResponseStreamEvent;
      } catch (error) {
        continue;
      }

      if (event.type === "response.output_text.delta") {
        const delta = event.delta;
        text += delta;
        deltaCount += 1;
        if (emitChunk) {
          await emitChunk(delta);
        }
      } else if (event.type === "error") {
        throw new Error(event.error?.message ?? "OpenAI stream returned an error.");
      }
    }
  }

  if (buffer.trim().startsWith("data:")) {
    try {
      const payload = buffer.trim().slice(5).trim();
      if (payload && payload !== "[DONE]") {
        const event = JSON.parse(payload) as OpenAIResponseStreamEvent;
        if (event.type === "response.output_text.delta") {
          const delta = event.delta;
          text += delta;
          deltaCount += 1;
          if (emitChunk) {
            await emitChunk(delta);
          }
        } else if (event.type === "error") {
          throw new Error(event.error?.message ?? "OpenAI stream returned an error.");
        }
      }
    } catch {
      // ignore trailing parse errors
    }
  }

  return { text: text.trim(), deltaCount };
}
