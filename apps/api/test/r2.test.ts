import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  presignPostUrl,
  publicUrlFor,
  resetR2Client,
} from '@sojourn/shared/storage/r2';

const TEST_ENV = {
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_BUCKET: 'sojourn-test',
  R2_PUBLIC_BASE_URL: 'https://assets.test.sojourn.app',
};

const SAVED: Record<string, string | undefined> = {};

describe('R2 storage helper', () => {
  beforeAll(() => {
    for (const [k, v] of Object.entries(TEST_ENV)) {
      SAVED[k] = process.env[k];
      process.env[k] = v;
    }
    resetR2Client();
  });

  afterAll(() => {
    for (const k of Object.keys(TEST_ENV)) {
      if (SAVED[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED[k];
    }
    resetR2Client();
  });

  describe('publicUrlFor', () => {
    it('joins base URL and key with a single slash', () => {
      expect(publicUrlFor('uploads/abc.png')).toBe(
        'https://assets.test.sojourn.app/uploads/abc.png',
      );
    });

    it('strips leading slashes from the key', () => {
      expect(publicUrlFor('/uploads/abc.png')).toBe(
        'https://assets.test.sojourn.app/uploads/abc.png',
      );
      expect(publicUrlFor('///uploads/abc.png')).toBe(
        'https://assets.test.sojourn.app/uploads/abc.png',
      );
    });

    it('strips a trailing slash from R2_PUBLIC_BASE_URL', () => {
      // The cached client picked up the (un-trimmed) env at first call;
      // a fresh reset+re-read with a trailing slash should still produce
      // a single-slash join.
      process.env.R2_PUBLIC_BASE_URL = 'https://assets.test.sojourn.app/';
      resetR2Client();
      expect(publicUrlFor('foo.png')).toBe('https://assets.test.sojourn.app/foo.png');
      process.env.R2_PUBLIC_BASE_URL = TEST_ENV.R2_PUBLIC_BASE_URL;
      resetR2Client();
    });
  });

  describe('presignPostUrl', () => {
    it('returns a POST URL pointing at the R2 endpoint with signed fields', async () => {
      const post = await presignPostUrl('uploads/abc.png', 'image/png', 600, 5_242_880);

      expect(post.url).toContain('test-account.r2.cloudflarestorage.com');
      // Browser POSTs as multipart/form-data to this URL with `fields` as form fields.
      expect(typeof post.fields).toBe('object');
      // Must include the SigV4 envelope and the user-set Content-Type.
      expect(post.fields).toHaveProperty('Content-Type', 'image/png');
      expect(post.fields).toHaveProperty('Policy');
      expect(post.fields).toHaveProperty('X-Amz-Algorithm');
      expect(post.fields).toHaveProperty('X-Amz-Credential');
      expect(post.fields).toHaveProperty('X-Amz-Date');
      expect(post.fields).toHaveProperty('X-Amz-Signature');
    });

    it('encodes the content-length-range condition into the policy doc', async () => {
      const maxBytes = 1_048_576; // 1 MiB
      const post = await presignPostUrl('uploads/abc.png', 'image/png', 600, maxBytes);

      const policyJson = Buffer.from(post.fields.Policy!, 'base64').toString('utf8');
      const policy = JSON.parse(policyJson) as { conditions: unknown[] };
      const conditions = policy.conditions ?? [];

      // The policy MUST contain `["content-length-range", 0, maxBytes]` —
      // that's how R2 enforces the size cap server-side without trusting
      // the client's Content-Length.
      const lengthRange = conditions.find(
        (c): c is [string, number, number] =>
          Array.isArray(c) && c[0] === 'content-length-range',
      );
      expect(lengthRange).toBeDefined();
      expect(lengthRange).toEqual(['content-length-range', 0, maxBytes]);
    });
  });
});
