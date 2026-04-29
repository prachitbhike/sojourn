import { describe, expect, it } from 'vitest';
import { POSE_NAMES } from '@sojourn/shared/pose';
import { createCharacterFor, setupTestApp } from './setup.js';

describe('POST /poses — name validation', () => {
  it('rejects unknown pose names with 400', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const response = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': editKey,
      },
      body: JSON.stringify({ name: 'potato' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message?: string };
    expect(body.error).toBe('bad_request');
    expect(body.message).toContain('idle');
  });

  it('rejects missing name with 400', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const response = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': editKey,
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  it('accepts every name in the fixed vocabulary', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    for (const name of POSE_NAMES) {
      const response = await ctx.fetch(`/api/characters/${slug}/poses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Edit-Key': editKey,
        },
        body: JSON.stringify({ name }),
      });
      expect(response.status, `pose ${name} should be accepted`).toBe(202);
      const body = (await response.json()) as { pose: { name: string; status: string } };
      expect(body.pose.name).toBe(name);
      // Async refactor: handler returns 202 with status='pending' immediately,
      // background promise flips it to 'ready' after the (stub) generator resolves.
      expect(body.pose.status).toBe('pending');
    }

    await ctx.drain();
    const final = await ctx.fetch(`/api/characters/${slug}`);
    const finalBody = (await final.json()) as { poses: Array<{ name: string; status: string }> };
    for (const name of POSE_NAMES) {
      const row = finalBody.poses.find((p) => p.name === name);
      expect(row?.status, `pose ${name} should be ready after drain`).toBe('ready');
    }
  });

  it('case-sensitive vocabulary: "Idle" with capital I is rejected', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const response = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': editKey,
      },
      body: JSON.stringify({ name: 'Idle' }),
    });
    expect(response.status).toBe(400);
  });
});
