import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { schema } from '@sojourn/shared';
import type { DB } from '../db/client.js';
import type { Logger } from '../logger.js';

export const PORTRAIT_DAILY_CAP = 50;
export const POSE_DAILY_CAP = 100;

export type CapKind = 'portrait' | 'pose';

export type CapDeps = {
  db: DB;
  logger: Logger;
  now?: () => Date;
};

export function utcDateString(d: Date): string {
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function secondsUntilNextUtcMidnight(d: Date): number {
  const next = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return Math.max(1, Math.ceil((next.getTime() - d.getTime()) / 1000));
}

// Daily cap middleware. Counters increment on attempt — a failed real-API
// call still cost money and still counts. Mounted after editKeyAuth, which
// has already populated `c.character`.
export function dailyCap(deps: CapDeps, kind: CapKind): MiddlewareHandler {
  const cap = kind === 'portrait' ? PORTRAIT_DAILY_CAP : POSE_DAILY_CAP;
  return async (c, next) => {
    const character = c.get('character');
    const now = (deps.now ?? (() => new Date()))();
    const today = utcDateString(now);

    let portraitCount = character.portraitGenerationsToday;
    let poseCount = character.poseGenerationsToday;

    if (character.generationsTodayDate !== today) {
      portraitCount = 0;
      poseCount = 0;
    }

    const counter = kind === 'portrait' ? portraitCount : poseCount;
    if (counter >= cap) {
      const retryAfter = secondsUntilNextUtcMidnight(now);
      c.header('Retry-After', String(retryAfter));
      deps.logger.warn({
        event: 'cap.exceeded',
        slug: character.slug,
        kind,
        counter,
        cap,
        retryAfter,
      });
      return c.json(
        {
          error: 'rate_limited',
          message: `daily ${kind} cap reached (${cap}/day)`,
        },
        429,
      );
    }

    if (kind === 'portrait') portraitCount += 1;
    else poseCount += 1;

    await deps.db
      .update(schema.characters)
      .set({
        portraitGenerationsToday: portraitCount,
        poseGenerationsToday: poseCount,
        generationsTodayDate: today,
        updatedAt: now,
      })
      .where(eq(schema.characters.id, character.id));

    c.set('character', {
      ...character,
      portraitGenerationsToday: portraitCount,
      poseGenerationsToday: poseCount,
      generationsTodayDate: today,
    });

    await next();
  };
}
