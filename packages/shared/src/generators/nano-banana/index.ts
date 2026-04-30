import { GoogleGenAI, type GenerateContentResponse, type Part } from '@google/genai';

import type { CharacterAttributes } from '../../types.js';
import { uploadObject } from '../../storage/r2.js';
import type {
  PortraitGenerationInput,
  PortraitGenerationResult,
  PortraitGenerator,
} from '../types.js';

const MODEL_ID = 'gemini-2.5-flash-image';
const DEFAULT_TIMEOUT_MS = 60_000;

let cachedAi: GoogleGenAI | null = null;

export function resetNanoBananaCache(): void {
  cachedAi = null;
}

function getAi(): GoogleGenAI {
  if (cachedAi) return cachedAi;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new NanoBananaError({ kind: 'provider', message: 'GEMINI_API_KEY is not set' });
  }
  cachedAi = new GoogleGenAI({ apiKey });
  return cachedAi;
}

export type NanoBananaErrorBody =
  | { kind: 'provider'; message: string }
  | { kind: 'timeout' }
  | { kind: 'rate_limit'; retryAfterSeconds: number }
  | { kind: 'malformed'; message: string };

export class NanoBananaError extends Error {
  readonly kind: NanoBananaErrorBody['kind'];
  readonly retryAfterSeconds?: number;

  constructor(body: NanoBananaErrorBody) {
    super('message' in body ? body.message : body.kind);
    this.name = 'NanoBananaError';
    this.kind = body.kind;
    if (body.kind === 'rate_limit') {
      this.retryAfterSeconds = body.retryAfterSeconds;
    }
  }
}

export type NanoBananaOptions = {
  timeoutMs?: number;
  now?: () => Date;
};

export function createNanoBananaPortraitGenerator(
  options: NanoBananaOptions = {},
): PortraitGenerator {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());

  return {
    id: 'nano-banana',
    async generatePortrait(input: PortraitGenerationInput): Promise<PortraitGenerationResult> {
      const refImage = input.refImageUrl
        ? await fetchReferenceImage(input.refImageUrl)
        : undefined;

      const prompt = buildPrompt(input.prompt, input.attributes);
      const ai = getAi();

      const generated = await callWithTimeout(ai, { prompt, refImage }, timeoutMs);
      const key = `characters/${input.slug}/portrait-${now().getTime()}.png`;
      const url = await uploadObject(key, generated.bytes, generated.mimeType);

      return { url, status: 'ready' };
    },
  };
}

async function fetchReferenceImage(
  refImageUrl: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  let response: Response;
  try {
    response = await fetch(refImageUrl);
  } catch {
    throw new NanoBananaError({ kind: 'malformed', message: 'reference unreachable' });
  }
  if (!response.ok) {
    throw new NanoBananaError({ kind: 'malformed', message: 'reference unreachable' });
  }
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await response.arrayBuffer();
  } catch {
    throw new NanoBananaError({ kind: 'malformed', message: 'reference unreachable' });
  }
  const mimeType = response.headers.get('content-type') ?? 'image/png';
  return { bytes: Buffer.from(arrayBuffer), mimeType };
}

async function callWithTimeout(
  ai: GoogleGenAI,
  args: { prompt: string; refImage?: { bytes: Buffer; mimeType: string } },
  timeoutMs: number,
): Promise<{ bytes: Buffer; mimeType: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      didTimeout = true;
      reject(new NanoBananaError({ kind: 'timeout' }));
    }, timeoutMs);
  });

  try {
    const response = (await Promise.race([
      callGemini(ai, args),
      timeoutPromise,
    ])) as GenerateContentResponse;
    return extractImage(response);
  } catch (err) {
    throw mapError(err, didTimeout);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callGemini(
  ai: GoogleGenAI,
  args: { prompt: string; refImage?: { bytes: Buffer; mimeType: string } },
): Promise<GenerateContentResponse> {
  const parts: Part[] = [{ text: args.prompt }];
  if (args.refImage) {
    parts.push({
      inlineData: {
        mimeType: args.refImage.mimeType,
        data: args.refImage.bytes.toString('base64'),
      },
    });
  }
  return ai.models.generateContent({
    model: MODEL_ID,
    contents: [{ role: 'user', parts }],
  });
}

function extractImage(response: GenerateContentResponse): { bytes: Buffer; mimeType: string } {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.data) {
      const bytes = Buffer.from(inline.data, 'base64');
      if (bytes.length === 0) {
        throw new NanoBananaError({ kind: 'malformed', message: 'no image bytes in response' });
      }
      return { bytes, mimeType: inline.mimeType ?? 'image/png' };
    }
  }
  throw new NanoBananaError({ kind: 'malformed', message: 'no image bytes in response' });
}

function mapError(err: unknown, didTimeout: boolean): NanoBananaError {
  if (didTimeout) return new NanoBananaError({ kind: 'timeout' });
  if (err instanceof NanoBananaError) return err;
  const e = err as {
    status?: number;
    statusCode?: number;
    code?: number;
    message?: string;
    headers?: Record<string, string | undefined>;
    response?: { status?: number; headers?: Record<string, string | undefined> };
  };
  const status =
    typeof e?.status === 'number'
      ? e.status
      : typeof e?.statusCode === 'number'
        ? e.statusCode
        : typeof e?.response?.status === 'number'
          ? e.response.status
          : typeof e?.code === 'number'
            ? e.code
            : undefined;
  const message = e?.message ?? `Gemini error ${status ?? 'unknown'}`;
  if (status === 429) {
    const headers = e?.headers ?? e?.response?.headers ?? {};
    const retryAfter = parseRetryAfter(headers['retry-after']) ?? 0;
    return new NanoBananaError({ kind: 'rate_limit', retryAfterSeconds: retryAfter });
  }
  return new NanoBananaError({ kind: 'provider', message });
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function buildPrompt(prompt: string, attributes: CharacterAttributes): string {
  const lines = [prompt];
  if (attributes.archetype) lines.push(`Archetype: ${attributes.archetype}`);
  if (attributes.outfit) lines.push(`Outfit: ${attributes.outfit}`);
  if (attributes.expression) lines.push(`Expression: ${attributes.expression}`);
  if (attributes.palette && attributes.palette.length > 0) {
    lines.push(`Palette: ${attributes.palette.join(', ')}`);
  }
  return lines.join('\n');
}
