import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import {
  createPixelLabSpriteGenerator,
  PixelLabGeneratorError,
  type PixelLabUploader,
} from '@sojourn/shared/generators';

const REF_IMAGE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function makeFramePng(width = 64, height = 64, alpha = 0xff): string {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      png.data[idx] = (x * 4) & 0xff;
      png.data[idx + 1] = (y * 4) & 0xff;
      png.data[idx + 2] = 0x80;
      png.data[idx + 3] = alpha;
    }
  }
  return PNG.sync.write(png).toString('base64');
}

function pixelLabResponseWithFrames(count: number): unknown {
  return {
    images: Array.from({ length: count }, () => ({
      type: 'base64',
      base64: makeFramePng(),
      format: 'png',
    })),
    usage: { type: 'usd', usd: 0.01 },
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function refFetch(): Response {
  return new Response(REF_IMAGE_BYTES, {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  });
}

const baseInput = {
  characterId: 'cid',
  slug: 'abc12345',
  prompt: 'a brave knight',
  attributes: { archetype: 'warrior', palette: ['#0a0', '#fff'] },
  refImageUrl: 'https://r2.test/characters/abc12345/portrait-1.png',
};

describe('createPixelLabSpriteGenerator — success path', () => {
  it('calls PixelLab with the expected request shape and uploads a composed sprite sheet', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) {
        return refFetch();
      }
      expect(target).toBe('https://api.pixellab.test/v1/animate-with-text');
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-key');
      expect(headers.get('Content-Type')).toBe('application/json');

      const body = JSON.parse(init!.body as string);
      expect(body.image_size).toEqual({ width: 64, height: 64 });
      expect(body.action).toBe('idle');
      expect(body.n_frames).toBe(4);
      expect(body.description).toContain('a brave knight');
      expect(body.description).toContain('warrior');
      expect(body.description).toContain('palette: #0a0, #fff');
      expect(body.reference_image).toEqual({
        type: 'base64',
        base64: Buffer.from(REF_IMAGE_BYTES).toString('base64'),
      });
      return jsonResponse(pixelLabResponseWithFrames(4));
    });

    const uploader = vi
      .fn()
      .mockResolvedValue('https://assets.test.sojourn.app/characters/abc12345/idle-1700000000000.png');

    const gen = createPixelLabSpriteGenerator({
      apiKey: 'test-key',
      apiBase: 'https://api.pixellab.test/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader,
      nowMs: () => 1_700_000_000_000,
    });

    const result = await gen.generatePose({ ...baseInput, poseName: 'idle' });

    expect(gen.id).toBe('pixellab');
    expect(result.spriteSheetUrl).toBe(
      'https://assets.test.sojourn.app/characters/abc12345/idle-1700000000000.png',
    );
    expect(result.status).toBe('ready');
    expect(result.manifest).toEqual({
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 4,
      frameRate: 4,
      loop: true,
    });

    expect(uploader).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = uploader.mock.calls[0]!;
    expect(key).toBe('characters/abc12345/idle-1700000000000.png');
    expect(contentType).toBe('image/png');

    const sheet = PNG.sync.read(body as Buffer);
    expect(sheet.width).toBe(64 * 4);
    expect(sheet.height).toBe(64);
  });

  it('skips reference_image when refImageUrl is null', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(typeof url === 'string' ? url : url.toString()).toBe(
        'https://api.pixellab.ai/v1/animate-with-text',
      );
      const body = JSON.parse(init!.body as string);
      expect(body.reference_image).toBeUndefined();
      return jsonResponse(pixelLabResponseWithFrames(4));
    });
    const uploader = vi.fn().mockResolvedValue('https://r2.test/sheet.png');
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader,
    });
    await gen.generatePose({ ...baseInput, poseName: 'idle', refImageUrl: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('createPixelLabSpriteGenerator — manifest translation', () => {
  it('passes through PixelLab’s actual frame count even when it differs from the stub catalog', async () => {
    // The stub catalog declares walk has 8 frames; PixelLab responds with 6.
    // The manifest must reflect 6, not pad/truncate to 8.
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return jsonResponse(pixelLabResponseWithFrames(6));
    });
    const uploader = vi.fn().mockResolvedValue('https://r2.test/sheet.png');
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader,
    });

    const result = await gen.generatePose({ ...baseInput, poseName: 'walk' });
    expect(result.manifest.frameCount).toBe(6);
    // Frame rate / loop still come from pose-name defaults.
    expect(result.manifest.frameRate).toBe(10);
    expect(result.manifest.loop).toBe(true);

    const [, body] = uploader.mock.calls[0]!;
    const sheet = PNG.sync.read(body as Buffer);
    // 6 frames laid out horizontally — 6 * 64 = 384.
    expect(sheet.width).toBe(64 * 6);
    expect(sheet.height).toBe(64);
  });
});

describe('createPixelLabSpriteGenerator — failure mapping', () => {
  it('maps 4xx / 5xx into kind=provider', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return new Response('something broke', { status: 500 });
    });
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader: vi.fn(),
    });
    await expect(gen.generatePose({ ...baseInput, poseName: 'idle' })).rejects.toMatchObject({
      kind: 'provider',
      status: 500,
    });
    await expect(gen.generatePose({ ...baseInput, poseName: 'idle' })).rejects.toBeInstanceOf(
      PixelLabGeneratorError,
    );
  });

  it('maps a 429 response into kind=rate_limit and parses Retry-After', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return new Response('too many requests', {
        status: 429,
        headers: { 'Retry-After': '42' },
      });
    });
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader: vi.fn(),
    });
    const err = await gen
      .generatePose({ ...baseInput, poseName: 'idle' })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PixelLabGeneratorError);
    expect((err as PixelLabGeneratorError).kind).toBe('rate_limit');
    expect((err as PixelLabGeneratorError).retryAfterSeconds).toBe(42);
  });

  it('maps an aborted request into kind=timeout', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return await new Promise<Response>((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      timeoutMs: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader: vi.fn(),
    });
    const err = await gen
      .generatePose({ ...baseInput, poseName: 'idle' })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PixelLabGeneratorError);
    expect((err as PixelLabGeneratorError).kind).toBe('timeout');
  });

  it('maps a malformed body (missing images) into kind=malformed', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return jsonResponse({ usage: { type: 'usd', usd: 0 } });
    });
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader: vi.fn(),
    });
    await expect(gen.generatePose({ ...baseInput, poseName: 'idle' })).rejects.toMatchObject({
      kind: 'malformed',
    });
  });

  it('maps a frame with missing base64 into kind=malformed', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return jsonResponse({
        images: [{ type: 'base64' }],
        usage: { type: 'usd', usd: 0 },
      });
    });
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader: vi.fn(),
    });
    await expect(gen.generatePose({ ...baseInput, poseName: 'idle' })).rejects.toMatchObject({
      kind: 'malformed',
    });
  });

  it('maps a non-OK reference image fetch into kind=provider (retryable)', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) {
        return new Response('not found', { status: 503 });
      }
      throw new Error('PixelLab should not be called when ref fetch fails');
    });
    const uploader = vi.fn();
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader,
    });
    await expect(gen.generatePose({ ...baseInput, poseName: 'idle' })).rejects.toMatchObject({
      kind: 'provider',
      status: 503,
    });
    expect(uploader).not.toHaveBeenCalled();
  });

  it('maps a network-error reference image fetch into kind=provider', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) {
        throw new Error('ECONNRESET');
      }
      throw new Error('PixelLab should not be called when ref fetch fails');
    });
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader: vi.fn(),
    });
    await expect(gen.generatePose({ ...baseInput, poseName: 'idle' })).rejects.toMatchObject({
      kind: 'provider',
    });
  });

  it('does not call the uploader when generation fails', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return new Response('upstream is on fire', { status: 502 });
    });
    const uploader = vi.fn();
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader,
    });
    await expect(gen.generatePose({ ...baseInput, poseName: 'idle' })).rejects.toBeInstanceOf(
      PixelLabGeneratorError,
    );
    expect(uploader).not.toHaveBeenCalled();
  });
});

describe('createPixelLabSpriteGenerator — frame size mismatch', () => {
  it('clips oversized frames and pads undersized frames into uniform 64x64 cells', async () => {
    // Frame 0: 80x80 (oversized → clipped). Mark pixel (60,0) red, (70,0) green
    // so we can confirm only the (60,0) red survives in the sheet.
    const oversized = new PNG({ width: 80, height: 80 });
    oversized.data.fill(0);
    const setPixel = (png: PNG, x: number, y: number, r: number, g: number, b: number, a: number) => {
      const idx = (y * png.width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    };
    setPixel(oversized, 60, 0, 255, 0, 0, 255);
    setPixel(oversized, 70, 0, 0, 255, 0, 255); // outside the 64x64 cell — must be dropped
    const oversizedB64 = PNG.sync.write(oversized).toString('base64');

    // Frame 1: 32x32 (undersized → padded with transparent). Mark pixel (10,10).
    const undersized = new PNG({ width: 32, height: 32 });
    undersized.data.fill(0);
    setPixel(undersized, 10, 10, 0, 0, 255, 255);
    const undersizedB64 = PNG.sync.write(undersized).toString('base64');

    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = typeof url === 'string' ? url : url.toString();
      if (target === baseInput.refImageUrl) return refFetch();
      return jsonResponse({
        images: [
          { type: 'base64', base64: oversizedB64, format: 'png' },
          { type: 'base64', base64: undersizedB64, format: 'png' },
        ],
        usage: { type: 'usd', usd: 0 },
      });
    });
    let captured: Buffer | null = null;
    const uploader = vi.fn(async (_key: string, body: Buffer) => {
      captured = body;
      return 'https://r2.test/sheet.png';
    });
    const gen = createPixelLabSpriteGenerator({
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploader: uploader as unknown as PixelLabUploader,
    });

    await gen.generatePose({ ...baseInput, poseName: 'idle' });
    expect(captured).not.toBeNull();
    const sheet = PNG.sync.read(captured!);
    expect(sheet.width).toBe(64 * 2);
    expect(sheet.height).toBe(64);

    const pixelAt = (x: number, y: number) => {
      const idx = (y * sheet.width + x) * 4;
      return [sheet.data[idx], sheet.data[idx + 1], sheet.data[idx + 2], sheet.data[idx + 3]];
    };

    // Frame 0 cell starts at x=0. The (60,0) red pixel should survive.
    expect(pixelAt(60, 0)).toEqual([255, 0, 0, 255]);
    // The (70,0) green pixel was outside the 64x64 cell — it must be transparent
    // in frame 1's column (cell starts at x=64), not bleeding into the sheet.
    expect(pixelAt(70, 0)).toEqual([0, 0, 0, 0]);

    // Frame 1 cell starts at x=64. The (10,10) blue pixel of the 32x32 source
    // lands at sheet (74,10). Beyond the source's 32x32 footprint we expect
    // transparent padding.
    expect(pixelAt(74, 10)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(64 + 40, 40)).toEqual([0, 0, 0, 0]); // padded region
  });
});

describe('createPixelLabSpriteGenerator — registry / config guards', () => {
  it('throws synchronously when constructed without an apiKey', () => {
    expect(() =>
      createPixelLabSpriteGenerator({ apiKey: '' as unknown as string }),
    ).toThrow(/apiKey/);
  });
});
