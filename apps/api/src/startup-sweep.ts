import { and, eq, lt } from 'drizzle-orm';
import { schema } from '@sojourn/shared';
import type { DB } from './db/client.js';
import type { Logger } from './logger.js';

export const STUCK_PENDING_AGE_MS = 5 * 60 * 1000;

export const STUCK_PENDING_ERROR = 'API restarted during generation';

// On boot, mark characters/poses stuck in `pending` longer than 5 minutes as
// `failed`. Anything younger is left alone — it could be a sibling instance's
// in-flight work (Phase 2+ multi-instance). Returns the counts swept so the
// caller can log them.
export async function sweepStuckPending(
  db: DB,
  logger: Logger,
  now: Date = new Date(),
): Promise<{ characters: number; poses: number }> {
  const cutoff = new Date(now.getTime() - STUCK_PENDING_AGE_MS);

  const stuckCharacters = await db
    .update(schema.characters)
    .set({
      portraitStatus: 'failed',
      portraitErrorMessage: STUCK_PENDING_ERROR,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.characters.portraitStatus, 'pending'),
        lt(schema.characters.updatedAt, cutoff),
      ),
    )
    .returning({ id: schema.characters.id });

  const stuckPoses = await db
    .update(schema.poses)
    .set({
      status: 'failed',
      errorMessage: STUCK_PENDING_ERROR,
      updatedAt: now,
    })
    .where(and(eq(schema.poses.status, 'pending'), lt(schema.poses.updatedAt, cutoff)))
    .returning({ id: schema.poses.id });

  if (stuckCharacters.length > 0 || stuckPoses.length > 0) {
    logger.warn({
      event: 'startup_sweep.swept',
      characters: stuckCharacters.length,
      poses: stuckPoses.length,
      cutoff: cutoff.toISOString(),
    });
  } else {
    logger.info({ event: 'startup_sweep.clean' });
  }

  return { characters: stuckCharacters.length, poses: stuckPoses.length };
}
