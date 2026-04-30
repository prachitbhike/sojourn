import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  const GoogleGenAI = vi.fn().mockImplementation(() => ({
    models: { generateContent },
  }));

  const send = vi.fn();
  const S3Client = vi.fn().mockImplementation(() => ({ send }));
  const PutObjectCommand = vi.fn().mockImplementation((params: unknown) => ({
    __cmd: 'PutObjectCommand',
    input: params,
  }));

  return { generateContent, GoogleGenAI, send, S3Client, PutObjectCommand };
});

vi.mock('@google/genai', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    GoogleGenAI: mocks.GoogleGenAI,
  };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mocks.S3Client,
  PutObjectCommand: mocks.PutObjectCommand,
}));

import {
  createNanoBananaPortraitGenerator,
  NanoBananaError,
  resetNanoBananaCache,
} from '../src/generators/nano-banana/index.js';
import { resetR2Client } from '../src/storage/r2.js';

const SAVED_ENV: Record<string, string | undefined> = {};
const TEST_ENV = {
  GEMINI_API_KEY: 'test-gemini-key',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_BUCKET: 'sojourn-test',
  R2_PUBLIC_BASE_URL: 'https://assets.test.sojourn.app',
};

const PNG_BYTES_BASE64 = Buffer.from('generated-png-bytes').toString('base64');

function geminiOk(data: string = PNG_BYTES_BASE64, mimeType = 'image/png') {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: { mimeType, data },
            },
          ],
        },
      },
    ],
  };
}

beforeEach(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) {
    SAVED_ENV[k] = process.env[k];
    process.env[k] = v;
  }
  resetR2Client();
  resetNanoBananaCache();

  // Re-seat mock implementations every test: vi.restoreAllMocks() in afterEach
  // strips them off, and the GoogleGenAI / S3Client constructors must hand back
  // objects whose `models.generateContent` / `send` resolve to our hoisted vi.fn()s.
  mocks.generateContent.mockReset();
  mocks.GoogleGenAI.mockReset().mockImplementation(() => ({
    models: { generateContent: mocks.generateContent },
  }));

  mocks.send.mockReset().mockResolvedValue({});
  mocks.S3Client.mockReset().mockImplementation(() => ({ send: mocks.send }));
  mocks.PutObjectCommand.mockReset().mockImplementation((params: unknown) => ({
    __cmd: 'PutObjectCommand',
    input: params,
  }));
});

afterEach(() => {
  for (const k of Object.keys(TEST_ENV)) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
  // Restores any vi.spyOn'd globals (fetch). Mock impls for vi.fn()s above
  // are re-seated in beforeEach.
  vi.restoreAllMocks();
});

describe('nano-banana PortraitGenerator', () => {
  describe('prompt-only success path', () => {
    it('calls Gemini with text-only content, uploads to R2, returns the public URL', async () => {
      mocks.generateContent.mockResolvedValue(geminiOk());

      const gen = createNanoBananaPortraitGenerator({
        now: () => new Date(1_700_000_000_000),
      });

      const result = await gen.generatePortrait({
        characterId: 'c1',
        slug: 'kira',
        prompt: 'a wise wizard with a long beard',
        attributes: { archetype: 'mage', palette: ['#222', '#aaa'] },
      });

      expect(result.status).toBe('ready');
      expect(result.url).toBe(
        'https://assets.test.sojourn.app/characters/kira/portrait-1700000000000.png',
      );

      // Gemini was called once, with a single text part (no reference image).
      expect(mocks.generateContent).toHaveBeenCalledTimes(1);
      const callArgs = mocks.generateContent.mock.calls[0]![0];
      expect(callArgs.model).toBe('gemini-2.5-flash-image');
      const parts = callArgs.contents[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0]).toHaveProperty('text');
      expect(parts[0].text).toContain('a wise wizard with a long beard');
      expect(parts[0].text).toContain('Archetype: mage');
      expect(parts[0].text).toContain('Palette: #222, #aaa');
      expect(parts.some((p: unknown) => (p as { inlineData?: unknown }).inlineData)).toBe(false);

      // R2 upload happened with the right key + content type.
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'sojourn-test',
          Key: 'characters/kira/portrait-1700000000000.png',
          ContentType: 'image/png',
        }),
      );
    });

    it('derives the R2 key extension from the returned MIME type (jpeg)', async () => {
      mocks.generateContent.mockResolvedValue(geminiOk(PNG_BYTES_BASE64, 'image/jpeg'));

      const gen = createNanoBananaPortraitGenerator({
        now: () => new Date(1_700_000_000_000),
      });

      const result = await gen.generatePortrait({
        characterId: 'c1',
        slug: 'kira',
        prompt: 'x',
        attributes: {},
      });

      expect(result.url).toBe(
        'https://assets.test.sojourn.app/characters/kira/portrait-1700000000000.jpg',
      );
      expect(mocks.PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'characters/kira/portrait-1700000000000.jpg',
          ContentType: 'image/jpeg',
        }),
      );
    });
  });

  describe('prompt + refImageUrl path (multi-image fusion)', () => {
    it('fetches the reference, attaches it as inlineData alongside the text prompt', async () => {
      const refBytes = Buffer.from('a-reference-photo');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(refBytes, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );
      mocks.generateContent.mockResolvedValue(geminiOk());

      const gen = createNanoBananaPortraitGenerator({
        now: () => new Date(42_000),
      });

      const result = await gen.generatePortrait({
        characterId: 'c1',
        slug: 'orin',
        prompt: 'fuse this with a fantasy style',
        attributes: { expression: 'stoic' },
        refImageUrl: 'https://refs.test/photo.jpg',
      });

      expect(result.status).toBe('ready');
      expect(result.url).toBe(
        'https://assets.test.sojourn.app/characters/orin/portrait-42000.png',
      );

      expect(fetchSpy).toHaveBeenCalledWith('https://refs.test/photo.jpg');

      // Gemini request must include the multi-image content: text + inlineData.
      const callArgs = mocks.generateContent.mock.calls[0]![0];
      const parts = callArgs.contents[0].parts;
      expect(parts.length).toBeGreaterThanOrEqual(2);

      const textPart = parts.find((p: { text?: string }) => p.text);
      expect(textPart).toBeDefined();
      expect(textPart!.text).toContain('fuse this with a fantasy style');
      expect(textPart!.text).toContain('Expression: stoic');

      const inlinePart = parts.find(
        (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData,
      );
      expect(inlinePart).toBeDefined();
      expect(inlinePart!.inlineData!.mimeType).toBe('image/jpeg');
      expect(inlinePart!.inlineData!.data).toBe(refBytes.toString('base64'));
    });
  });

  describe('failure mapping', () => {
    it('maps a 4xx error to { kind: "provider" }', async () => {
      const err = Object.assign(new Error('bad request'), { status: 400 });
      mocks.generateContent.mockRejectedValue(err);

      const gen = createNanoBananaPortraitGenerator();
      const promise = gen.generatePortrait({
        characterId: 'c1',
        slug: 'kira',
        prompt: 'x',
        attributes: {},
      });

      await expect(promise).rejects.toBeInstanceOf(NanoBananaError);
      await expect(promise).rejects.toMatchObject({ kind: 'provider', message: 'bad request' });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('maps a 5xx error to { kind: "provider" }', async () => {
      const err = Object.assign(new Error('upstream exploded'), { status: 503 });
      mocks.generateContent.mockRejectedValue(err);

      const gen = createNanoBananaPortraitGenerator();
      await expect(
        gen.generatePortrait({
          characterId: 'c1',
          slug: 'kira',
          prompt: 'x',
          attributes: {},
        }),
      ).rejects.toMatchObject({ kind: 'provider', message: 'upstream exploded' });
    });

    it('maps a 429 error to { kind: "rate_limit", retryAfterSeconds }', async () => {
      const err = Object.assign(new Error('rate limited'), {
        status: 429,
        headers: { 'retry-after': '37' },
      });
      mocks.generateContent.mockRejectedValue(err);

      const gen = createNanoBananaPortraitGenerator();
      const promise = gen.generatePortrait({
        characterId: 'c1',
        slug: 'kira',
        prompt: 'x',
        attributes: {},
      });

      await expect(promise).rejects.toMatchObject({
        kind: 'rate_limit',
        retryAfterSeconds: 37,
      });
    });

    it('maps a >60s timeout to { kind: "timeout" }', async () => {
      // Never resolves — let the AbortController-driven timeout fire.
      mocks.generateContent.mockImplementation(
        () => new Promise<never>(() => {}),
      );

      const gen = createNanoBananaPortraitGenerator({ timeoutMs: 30 });
      const promise = gen.generatePortrait({
        characterId: 'c1',
        slug: 'kira',
        prompt: 'x',
        attributes: {},
      });

      await expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    });

    it('maps a malformed (no inlineData) response to { kind: "malformed" }', async () => {
      mocks.generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'sorry, no image' }] } }],
      });

      const gen = createNanoBananaPortraitGenerator();
      await expect(
        gen.generatePortrait({
          characterId: 'c1',
          slug: 'kira',
          prompt: 'x',
          attributes: {},
        }),
      ).rejects.toMatchObject({ kind: 'malformed' });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('maps an inlineData with empty base64 data to { kind: "malformed" } and never uploads', async () => {
      mocks.generateContent.mockResolvedValue({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: 'image/png', data: '' } }] } },
        ],
      });

      const gen = createNanoBananaPortraitGenerator();
      await expect(
        gen.generatePortrait({
          characterId: 'c1',
          slug: 'kira',
          prompt: 'x',
          attributes: {},
        }),
      ).rejects.toMatchObject({ kind: 'malformed', message: 'no image bytes in response' });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('maps a 404 reference fetch to { kind: "malformed", message: "reference unreachable" } and never calls Gemini', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('not found', { status: 404 }),
      );

      const gen = createNanoBananaPortraitGenerator();
      const promise = gen.generatePortrait({
        characterId: 'c1',
        slug: 'kira',
        prompt: 'x',
        attributes: {},
        refImageUrl: 'https://refs.test/missing.jpg',
      });

      await expect(promise).rejects.toMatchObject({
        kind: 'malformed',
        message: 'reference unreachable',
      });
      expect(mocks.generateContent).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('maps a network-error reference fetch to { kind: "malformed", message: "reference unreachable" }', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      const gen = createNanoBananaPortraitGenerator();
      await expect(
        gen.generatePortrait({
          characterId: 'c1',
          slug: 'kira',
          prompt: 'x',
          attributes: {},
          refImageUrl: 'https://refs.test/net-down.jpg',
        }),
      ).rejects.toMatchObject({
        kind: 'malformed',
        message: 'reference unreachable',
      });
      expect(mocks.generateContent).not.toHaveBeenCalled();
    });
  });
});
