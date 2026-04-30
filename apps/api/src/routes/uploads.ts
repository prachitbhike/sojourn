import { Hono, type Context } from 'hono';
import { customAlphabet } from 'nanoid';
import { presignPostUrl, publicUrlFor } from '@sojourn/shared/storage/r2';
import type { UploadReferenceResponse } from '@sojourn/shared/contracts';
import type { Logger } from '../logger.js';

export type UploadsDeps = {
  logger: Logger;
  maxBytes: number;
  rateLimiter?: RateLimiter;
};

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateUploadId = customAlphabet(ID_ALPHABET, 21);

const PRESIGN_EXPIRES_SECONDS = 5 * 60;

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export type RateLimiter = {
  allow(ip: string, now?: number): boolean;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
// Safety net so a flood of unique IPs can't grow the bucket map without bound.
const RATE_LIMIT_MAX_TRACKED_IPS = 10_000;

export function createInMemoryRateLimiter(opts: {
  windowMs?: number;
  max?: number;
} = {}): RateLimiter {
  const windowMs = opts.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const max = opts.max ?? RATE_LIMIT_MAX;
  const buckets = new Map<string, number[]>();
  return {
    allow(ip: string, now = Date.now()): boolean {
      const cutoff = now - windowMs;
      const existing = buckets.get(ip) ?? [];
      const fresh = existing.filter((t) => t > cutoff);
      if (fresh.length >= max) {
        buckets.set(ip, fresh);
        return false;
      }
      fresh.push(now);
      buckets.set(ip, fresh);
      if (buckets.size > RATE_LIMIT_MAX_TRACKED_IPS) {
        // Drop the oldest entry — Map iteration is insertion-order.
        const firstKey = buckets.keys().next().value;
        if (firstKey !== undefined && firstKey !== ip) buckets.delete(firstKey);
      }
      return true;
    },
  };
}

function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp.trim();
  // @hono/node-server attaches the incoming Node request to c.env.
  const env = c.env as
    | { incoming?: { socket?: { remoteAddress?: string | null } } }
    | undefined;
  const remote = env?.incoming?.socket?.remoteAddress;
  if (remote) return remote;
  return 'unknown';
}

export function createUploadsRoutes(deps: UploadsDeps): Hono {
  const app = new Hono();
  const limiter = deps.rateLimiter ?? createInMemoryRateLimiter();

  app.post('/reference', async (c) => {
    const ip = getClientIp(c);
    if (!limiter.allow(ip)) {
      deps.logger.warn({ event: 'upload.rate_limited', ip });
      c.header('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
      return c.json(
        { error: 'rate_limited', message: 'too many upload requests, try again shortly' },
        429,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
    }

    const contentType =
      body && typeof body === 'object' && 'contentType' in body
        ? String((body as { contentType: unknown }).contentType ?? '').trim()
        : '';

    const ext = ALLOWED_CONTENT_TYPES[contentType];
    if (!ext) {
      return c.json(
        {
          error: 'bad_request',
          message: `contentType must be one of: ${Object.keys(ALLOWED_CONTENT_TYPES).join(', ')}`,
        },
        400,
      );
    }

    const key = `uploads/refs/${generateUploadId()}.${ext}`;

    let presigned;
    try {
      presigned = await presignPostUrl(
        key,
        contentType,
        PRESIGN_EXPIRES_SECONDS,
        deps.maxBytes,
      );
    } catch (err) {
      deps.logger.error({
        event: 'upload.presign_failed',
        err: serializeError(err),
      });
      return c.json({ error: 'internal_error', message: 'failed to issue upload slot' }, 500);
    }

    const refImageUrl = publicUrlFor(key);

    deps.logger.info({
      event: 'upload.slot_issued',
      key,
      contentType,
      maxBytes: deps.maxBytes,
    });

    const payload: UploadReferenceResponse = {
      uploadUrl: presigned.url,
      fields: presigned.fields,
      refImageUrl,
    };
    return c.json(payload, 200);
  });

  return app;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { value: String(err) };
}
