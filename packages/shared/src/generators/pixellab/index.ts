import { PNG } from 'pngjs';
import type { CharacterAttributes, PoseManifest } from '../../types.js';
import type { PoseName } from '../../pose.js';
import { uploadObject as defaultUploadObject } from '../../storage/r2.js';
import type {
  PoseGenerationInput,
  PoseGenerationResult,
  SpriteGenerator,
} from '../types.js';

const DEFAULT_API_BASE = 'https://api.pixellab.ai/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const FRAME_DIMENSION = 64;

// PixelLab's animate-with-text returns N frames as separate base64 PNGs and
// does not communicate frame-rate or loop semantics. We map those from pose
// name (matches the Phase 0 stub catalog and the renderer's expectations) and
// pass through whatever frame count PixelLab actually returns. nFrames here
// is the *requested* count; the response is authoritative.
const POSE_DEFAULTS: Record<
  PoseName,
  { nFrames: number; frameRate: number; loop: boolean }
> = {
  idle: { nFrames: 4, frameRate: 4, loop: true },
  walk: { nFrames: 8, frameRate: 10, loop: true },
  attack: { nFrames: 6, frameRate: 12, loop: false },
  cast: { nFrames: 6, frameRate: 10, loop: false },
};

export type PixelLabErrorKind = 'provider' | 'timeout' | 'rate_limit' | 'malformed';

export class PixelLabGeneratorError extends Error {
  readonly kind: PixelLabErrorKind;
  readonly retryAfterSeconds?: number;
  readonly status?: number;

  constructor(opts: {
    kind: PixelLabErrorKind;
    message: string;
    retryAfterSeconds?: number;
    status?: number;
  }) {
    super(opts.message);
    this.name = 'PixelLabGeneratorError';
    this.kind = opts.kind;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.status = opts.status;
  }
}

export type PixelLabUploader = (
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) => Promise<string>;

export type PixelLabConfig = {
  apiKey: string;
  apiBase?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  uploader?: PixelLabUploader;
  nowMs?: () => number;
};

export function createPixelLabSpriteGenerator(config: PixelLabConfig): SpriteGenerator {
  if (!config.apiKey) {
    throw new Error('createPixelLabSpriteGenerator requires apiKey');
  }
  const apiBase = (config.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = config.fetchImpl ?? fetch;
  const uploader: PixelLabUploader = config.uploader ?? defaultUploadObject;
  const nowMs = config.nowMs ?? (() => Date.now());

  return {
    id: 'pixellab',
    async generatePose(input: PoseGenerationInput): Promise<PoseGenerationResult> {
      const defaults = POSE_DEFAULTS[input.poseName];
      if (!defaults) {
        throw new PixelLabGeneratorError({
          kind: 'malformed',
          message: `pixellab generator has no defaults for pose "${input.poseName}"`,
        });
      }
      const referenceBase64 = input.refImageUrl
        ? await fetchReferenceAsBase64(input.refImageUrl, fetchImpl, timeoutMs)
        : null;

      const requestBody = {
        image_size: { width: FRAME_DIMENSION, height: FRAME_DIMENSION },
        description: buildDescription(input.prompt, input.attributes),
        action: input.poseName,
        n_frames: defaults.nFrames,
        ...(referenceBase64
          ? { reference_image: { type: 'base64', base64: referenceBase64 } }
          : {}),
      };

      const responseBody = await callPixelLab({
        url: `${apiBase}/animate-with-text`,
        apiKey: config.apiKey,
        body: requestBody,
        timeoutMs,
        fetchImpl,
      });

      const frames = parseFrames(responseBody);
      const sheet = composeSpriteSheet(frames, FRAME_DIMENSION, FRAME_DIMENSION);

      const key = `characters/${input.slug}/${input.poseName}-${nowMs()}.png`;
      const spriteSheetUrl = await uploader(key, sheet, 'image/png');

      const manifest: PoseManifest = {
        frameWidth: FRAME_DIMENSION,
        frameHeight: FRAME_DIMENSION,
        frameCount: frames.length,
        frameRate: defaults.frameRate,
        loop: defaults.loop,
      };
      return { spriteSheetUrl, manifest, status: 'ready' };
    },
  };
}

function buildDescription(prompt: string, attributes: CharacterAttributes): string {
  const parts: string[] = [];
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt) parts.push(trimmedPrompt);
  if (typeof attributes.archetype === 'string' && attributes.archetype.trim()) {
    parts.push(attributes.archetype.trim());
  }
  if (typeof attributes.outfit === 'string' && attributes.outfit.trim()) {
    parts.push(attributes.outfit.trim());
  }
  if (typeof attributes.expression === 'string' && attributes.expression.trim()) {
    parts.push(attributes.expression.trim());
  }
  if (Array.isArray(attributes.palette) && attributes.palette.length > 0) {
    const palette = attributes.palette.filter((c): c is string => typeof c === 'string');
    if (palette.length > 0) parts.push(`palette: ${palette.join(', ')}`);
  }
  return parts.join(', ');
}

async function callPixelLab(opts: {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  let response: Response;
  try {
    response = await opts.fetchImpl(opts.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new PixelLabGeneratorError({
        kind: 'timeout',
        message: `pixellab request timed out after ${opts.timeoutMs}ms`,
      });
    }
    throw new PixelLabGeneratorError({
      kind: 'provider',
      message: `pixellab request failed: ${errorMessage(err)}`,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
    throw new PixelLabGeneratorError({
      kind: 'rate_limit',
      message: 'pixellab rate limit exceeded',
      retryAfterSeconds: retryAfter,
      status: 429,
    });
  }

  if (!response.ok) {
    const detail = await safeReadText(response);
    throw new PixelLabGeneratorError({
      kind: 'provider',
      message: `pixellab HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      status: response.status,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PixelLabGeneratorError({
      kind: 'malformed',
      message: 'pixellab response was not valid JSON',
    });
  }
  return body;
}

function parseFrames(body: unknown): Buffer[] {
  if (!body || typeof body !== 'object') {
    throw new PixelLabGeneratorError({
      kind: 'malformed',
      message: 'pixellab response body was not an object',
    });
  }
  const images = (body as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) {
    throw new PixelLabGeneratorError({
      kind: 'malformed',
      message: 'pixellab response missing images[]',
    });
  }
  const buffers: Buffer[] = [];
  for (const item of images) {
    if (!item || typeof item !== 'object') {
      throw new PixelLabGeneratorError({
        kind: 'malformed',
        message: 'pixellab frame entry was not an object',
      });
    }
    const b64 = (item as { base64?: unknown }).base64;
    if (typeof b64 !== 'string' || b64.length === 0) {
      throw new PixelLabGeneratorError({
        kind: 'malformed',
        message: 'pixellab frame missing base64 payload',
      });
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.byteLength === 0) {
      throw new PixelLabGeneratorError({
        kind: 'malformed',
        message: 'pixellab frame decoded to zero bytes',
      });
    }
    buffers.push(buf);
  }
  return buffers;
}

// Decodes each frame PNG and writes them side-by-side into a horizontal sprite
// sheet. Frames smaller/larger than `frameWidth × frameHeight` are clipped or
// padded so the resulting sheet has uniform cells matching the manifest.
function composeSpriteSheet(
  framePngs: Buffer[],
  frameWidth: number,
  frameHeight: number,
): Buffer {
  if (framePngs.length === 0) {
    throw new PixelLabGeneratorError({
      kind: 'malformed',
      message: 'cannot compose sprite sheet from zero frames',
    });
  }
  const sheetWidth = frameWidth * framePngs.length;
  const sheet = new PNG({ width: sheetWidth, height: frameHeight });
  // Default-fill transparent so undersized frames pad with alpha=0.
  sheet.data.fill(0);

  framePngs.forEach((pngBuffer, frameIdx) => {
    let frame: PNG;
    try {
      frame = PNG.sync.read(pngBuffer);
    } catch (err) {
      throw new PixelLabGeneratorError({
        kind: 'malformed',
        message: `pixellab frame ${frameIdx} was not a valid PNG: ${errorMessage(err)}`,
      });
    }
    const xOffset = frameIdx * frameWidth;
    const copyWidth = Math.min(frame.width, frameWidth);
    const copyHeight = Math.min(frame.height, frameHeight);
    for (let y = 0; y < copyHeight; y += 1) {
      for (let x = 0; x < copyWidth; x += 1) {
        const srcIdx = (y * frame.width + x) * 4;
        const dstIdx = (y * sheetWidth + xOffset + x) * 4;
        sheet.data[dstIdx] = frame.data[srcIdx]!;
        sheet.data[dstIdx + 1] = frame.data[srcIdx + 1]!;
        sheet.data[dstIdx + 2] = frame.data[srcIdx + 2]!;
        sheet.data[dstIdx + 3] = frame.data[srcIdx + 3]!;
      }
    }
  });

  return PNG.sync.write(sheet);
}

// Reference fetches hit R2 (or whatever storage backs the portrait URL), not
// PixelLab. We classify their failures as `provider` so the Slice 1 handler
// treats them as retryable transient issues rather than terminal `malformed`
// data — a 503 or DNS blip on R2 is an infrastructure problem, not a bad
// payload.
async function fetchReferenceAsBase64(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new PixelLabGeneratorError({
        kind: 'provider',
        message: `reference image fetch returned HTTP ${response.status}`,
        status: response.status,
      });
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (err) {
    if (err instanceof PixelLabGeneratorError) throw err;
    if (isAbortError(err)) {
      throw new PixelLabGeneratorError({
        kind: 'timeout',
        message: `reference image fetch timed out after ${timeoutMs}ms`,
      });
    }
    throw new PixelLabGeneratorError({
      kind: 'provider',
      message: `reference image fetch failed: ${errorMessage(err)}`,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    const delta = Math.max(0, Math.round((date - Date.now()) / 1000));
    return delta;
  }
  return undefined;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return truncate(text.trim(), 200);
  } catch {
    return '';
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError';
}
