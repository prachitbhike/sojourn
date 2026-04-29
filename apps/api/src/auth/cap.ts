import { and, eq, sql } from 'drizzle-orm';
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
//
// The check + increment is one atomic SQL statement so concurrent requests for
// the same character can't both read N and both write N+1. We deliberately do
// NOT touch `updatedAt` here — that column is the startup sweep's "this row's
// status was last changed N min ago" signal, and bumping it on every cap-only
// write would mask hung pending rows.
export function dailyCap(deps: CapDeps, kind: CapKind): MiddlewareHandler {
  const cap = kind === 'portrait' ? PORTRAIT_DAILY_CAP : POSE_DAILY_CAP;
  return async (c, next) => {
    const character = c.get('character');
    const now = (deps.now ?? (() => new Date()))();
    const today = utcDateString(now);

    const portraitInc = kind === 'portrait' ? 1 : 0;
    const poseInc = kind === 'pose' ? 1 : 0;
    const counterCol =
      kind === 'portrait'
        ? schema.characters.portraitGenerationsToday
        : schema.characters.poseGenerationsToday;

    // Atomic: only the row matches if (date is stale) OR (counter < cap).
    // SET uses CASE WHEN to reset both counters on rollover, otherwise +1.
    // `.returning()` empty → at-cap → 429.
    const updated = await deps.db
      .update(schema.characters)
      .set({
        portraitGenerationsToday: sql`CASE WHEN ${schema.characters.generationsTodayDate} != ${today} THEN ${portraitInc} ELSE ${schema.characters.portraitGenerationsToday} + ${portraitInc} END`,
        poseGenerationsToday: sql`CASE WHEN ${schema.characters.generationsTodayDate} != ${today} THEN ${poseInc} ELSE ${schema.characters.poseGenerationsToday} + ${poseInc} END`,
        generationsTodayDate: today,
      })
      .where(
        and(
          eq(schema.characters.id, character.id),
          sql`(${schema.characters.generationsTodayDate} != ${today} OR ${counterCol} < ${cap})`,
        ),
      )
      .returning({
        portraitGenerationsToday: schema.characters.portraitGenerationsToday,
        poseGenerationsToday: schema.characters.poseGenerationsToday,
        generationsTodayDate: schema.characters.generationsTodayDate,
      });

    if (updated.length === 0) {
      const retryAfter = secondsUntilNextUtcMidnight(now);
      const counter = kind === 'portrait'
        ? character.portraitGenerationsToday
        : character.poseGenerationsToday;
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

    const row = updated[0]!;
    c.set('character', {
      ...character,
      portraitGenerationsToday: row.portraitGenerationsToday,
      poseGenerationsToday: row.poseGenerationsToday,
      generationsTodayDate: row.generationsTodayDate,
    });

    await next();
  };
}
