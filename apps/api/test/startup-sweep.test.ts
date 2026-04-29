import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@sojourn/shared';
import {
  STUCK_PENDING_AGE_MS,
  STUCK_PENDING_ERROR,
  sweepStuckPending,
} from '../src/startup-sweep.js';
import { createLogger } from '../src/logger.js';
import { createCharacterFor, setupTestApp } from './setup.js';

describe('startup sweep', () => {
  it('marks pending characters older than 5 minutes as failed', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);

    const now = new Date();
    const stale = new Date(now.getTime() - STUCK_PENDING_AGE_MS - 1_000);
    await ctx.db
      .update(schema.characters)
      .set({ portraitStatus: 'pending', updatedAt: stale })
      .where(eq(schema.characters.slug, slug));

    const result = await sweepStuckPending(ctx.db, createLogger({ silent: true }), now);
    expect(result.characters).toBe(1);

    const row = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(row?.portraitStatus).toBe('failed');
    expect(row?.portraitErrorMessage).toBe(STUCK_PENDING_ERROR);
  });

  it('leaves fresh pending characters alone (≤5min old)', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);

    const now = new Date();
    const fresh = new Date(now.getTime() - 60_000); // 1 minute old
    await ctx.db
      .update(schema.characters)
      .set({ portraitStatus: 'pending', updatedAt: fresh })
      .where(eq(schema.characters.slug, slug));

    const result = await sweepStuckPending(ctx.db, createLogger({ silent: true }), now);
    expect(result.characters).toBe(0);

    const row = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(row?.portraitStatus).toBe('pending');
    expect(row?.portraitErrorMessage).toBeNull();
  });

  it('marks pending poses older than 5 minutes as failed', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);

    const character = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    const now = new Date();
    const stale = new Date(now.getTime() - STUCK_PENDING_AGE_MS - 1_000);
    await ctx.db
      .update(schema.poses)
      .set({ status: 'pending', updatedAt: stale })
      .where(eq(schema.poses.characterId, character!.id));

    const result = await sweepStuckPending(ctx.db, createLogger({ silent: true }), now);
    expect(result.poses).toBeGreaterThanOrEqual(1);

    const poses = await ctx.db
      .select()
      .from(schema.poses)
      .where(eq(schema.poses.characterId, character!.id))
      .all();
    for (const p of poses) {
      expect(p.status).toBe('failed');
      expect(p.errorMessage).toBe(STUCK_PENDING_ERROR);
    }
  });

  it('leaves fresh pending poses alone', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);

    const character = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    const now = new Date();
    const fresh = new Date(now.getTime() - 30_000);
    await ctx.db
      .update(schema.poses)
      .set({ status: 'pending', updatedAt: fresh })
      .where(eq(schema.poses.characterId, character!.id));

    const result = await sweepStuckPending(ctx.db, createLogger({ silent: true }), now);
    expect(result.poses).toBe(0);

    const poses = await ctx.db
      .select()
      .from(schema.poses)
      .where(eq(schema.poses.characterId, character!.id))
      .all();
    for (const p of poses) {
      expect(p.status).toBe('pending');
      expect(p.errorMessage).toBeNull();
    }
  });
});
