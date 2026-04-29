import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@sojourn/shared';
import { POSE_DAILY_CAP, PORTRAIT_DAILY_CAP } from '../src/auth/cap.js';
import { createCharacterFor, setupTestApp } from './setup.js';

describe('daily cap middleware', () => {
  it('under-cap requests pass through and increment the per-kind counter', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const before = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(before?.portraitGenerationsToday).toBe(0);

    const res = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(res.status).toBe(202);

    const after = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(after?.portraitGenerationsToday).toBe(1);
    expect(after?.poseGenerationsToday).toBe(0);
    expect(after?.generationsTodayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns 429 with Retry-After header when the portrait cap is hit', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const todayUtc = new Date().toISOString().slice(0, 10);
    await ctx.db
      .update(schema.characters)
      .set({
        portraitGenerationsToday: PORTRAIT_DAILY_CAP,
        generationsTodayDate: todayUtc,
      })
      .where(eq(schema.characters.slug, slug));

    const res = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();
    const seconds = Number(retryAfter);
    expect(Number.isFinite(seconds)).toBe(true);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(86_400);

    // Counter must NOT increment on a 429 — the request never actually attempted generation.
    const row = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(row?.portraitGenerationsToday).toBe(PORTRAIT_DAILY_CAP);
  });

  it('returns 429 when the pose cap is hit (independent counter)', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const todayUtc = new Date().toISOString().slice(0, 10);
    await ctx.db
      .update(schema.characters)
      .set({
        poseGenerationsToday: POSE_DAILY_CAP,
        generationsTodayDate: todayUtc,
      })
      .where(eq(schema.characters.slug, slug));

    const res = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ name: 'walk' }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();

    // Portrait cap is independent — it should still pass.
    const portraitRes = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(portraitRes.status).toBe(202);
  });

  it('rolls counters over to 0 when generationsTodayDate is stale', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    // Yesterday-shaped state: at-cap counters but a stale date.
    await ctx.db
      .update(schema.characters)
      .set({
        portraitGenerationsToday: PORTRAIT_DAILY_CAP,
        poseGenerationsToday: POSE_DAILY_CAP,
        generationsTodayDate: '1999-01-01',
      })
      .where(eq(schema.characters.slug, slug));

    const res = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(res.status).toBe(202);

    const after = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    // Both counters reset on rollover, then the requested kind increments.
    expect(after?.portraitGenerationsToday).toBe(1);
    expect(after?.poseGenerationsToday).toBe(0);
    expect(after?.generationsTodayDate).not.toBe('1999-01-01');
    expect(after?.generationsTodayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
