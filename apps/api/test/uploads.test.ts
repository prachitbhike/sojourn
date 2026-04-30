import { describe, expect, it, vi } from 'vitest';
import { createInMemoryRateLimiter } from '../src/routes/uploads.js';
import { setupTestApp } from './setup.js';

vi.mock('@sojourn/shared/storage/r2', () => ({
  presignPostUrl: vi.fn(async (key: string, contentType: string) => ({
    url: `https://test-account.r2.cloudflarestorage.com/sojourn-test`,
    fields: {
      key,
      'Content-Type': contentType,
      Policy: 'eyJtb2NrIjp0cnVlfQ==',
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': 'mock/20260429/auto/s3/aws4_request',
      'X-Amz-Date': '20260429T000000Z',
      'X-Amz-Signature': 'mocksignature',
    },
  })),
  publicUrlFor: vi.fn((key: string) => `https://assets.test.sojourn.app/${key}`),
}));

async function postSlot(
  ctx: Awaited<ReturnType<typeof setupTestApp>>,
  contentType: unknown,
  init?: { ip?: string },
): Promise<Response> {
  return ctx.fetch('/api/uploads/reference', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.ip ? { 'X-Forwarded-For': init.ip } : {}),
    },
    body: JSON.stringify({ contentType }),
  });
}

describe('POST /api/uploads/reference', () => {
  it('returns a presigned slot for a PNG and the public URL ends with .png', async () => {
    const ctx = await setupTestApp();
    const res = await postSlot(ctx, 'image/png');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      uploadUrl: string;
      fields: Record<string, string>;
      refImageUrl: string;
    };
    expect(body.uploadUrl).toContain('r2.cloudflarestorage.com');
    expect(body.fields).toHaveProperty('Policy');
    expect(body.fields).toHaveProperty('X-Amz-Signature');
    expect(body.fields['Content-Type']).toBe('image/png');
    expect(body.refImageUrl).toMatch(/^https:\/\/assets\.test\.sojourn\.app\/uploads\/refs\/[A-Za-z0-9]+\.png$/);
  });

  it('returns a .jpg key for image/jpeg and a .webp key for image/webp', async () => {
    const ctx = await setupTestApp();
    const jpegRes = await postSlot(ctx, 'image/jpeg');
    const jpegBody = (await jpegRes.json()) as { refImageUrl: string };
    expect(jpegBody.refImageUrl).toMatch(/\.jpg$/);

    const webpRes = await postSlot(ctx, 'image/webp');
    const webpBody = (await webpRes.json()) as { refImageUrl: string };
    expect(webpBody.refImageUrl).toMatch(/\.webp$/);
  });

  it('rejects unsupported content types with 400', async () => {
    const ctx = await setupTestApp();
    for (const ct of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain', '']) {
      const res = await postSlot(ctx, ct);
      expect(res.status, `contentType=${ct}`).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('bad_request');
    }
  });

  it('rejects malformed JSON bodies with 400', async () => {
    const ctx = await setupTestApp();
    const res = await ctx.fetch('/api/uploads/reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('rate-limits a single IP after the configured cap', async () => {
    const limiter = createInMemoryRateLimiter({ max: 3, windowMs: 60_000 });
    const ctx = await setupTestApp({ uploadsRateLimiter: limiter });

    for (let i = 0; i < 3; i += 1) {
      const res = await postSlot(ctx, 'image/png', { ip: '203.0.113.7' });
      expect(res.status, `request ${i + 1}`).toBe(200);
    }
    const blocked = await postSlot(ctx, 'image/png', { ip: '203.0.113.7' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();

    // A different IP is unaffected by the first IP's bucket.
    const otherIp = await postSlot(ctx, 'image/png', { ip: '198.51.100.4' });
    expect(otherIp.status).toBe(200);
  });

  it('uses the first hop in X-Forwarded-For for rate limiting', async () => {
    const limiter = createInMemoryRateLimiter({ max: 1, windowMs: 60_000 });
    const ctx = await setupTestApp({ uploadsRateLimiter: limiter });

    const first = await postSlot(ctx, 'image/png', {
      ip: '203.0.113.9, 10.0.0.1',
    });
    expect(first.status).toBe(200);

    // Same client IP, different upstream proxy → still rate-limited.
    const blocked = await postSlot(ctx, 'image/png', {
      ip: '203.0.113.9, 10.0.0.2',
    });
    expect(blocked.status).toBe(429);
  });
});

describe('createInMemoryRateLimiter', () => {
  it('expires entries after the window', () => {
    const limiter = createInMemoryRateLimiter({ max: 2, windowMs: 1_000 });
    const ip = '203.0.113.1';
    expect(limiter.allow(ip, 0)).toBe(true);
    expect(limiter.allow(ip, 100)).toBe(true);
    expect(limiter.allow(ip, 200)).toBe(false);
    // Past the window → bucket resets.
    expect(limiter.allow(ip, 1_500)).toBe(true);
  });
});
