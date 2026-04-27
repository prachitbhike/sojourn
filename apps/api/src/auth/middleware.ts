import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { schema } from '@sojourn/shared';
import type { DB } from '../db/client.js';
import type { Logger } from '../logger.js';
import { cookieNameForSlug, hashEditKey, hashedKeyPrefix } from './edit-key.js';

export type AuthDeps = {
  db: DB;
  pepper: string;
  logger: Logger;
};

type CharacterRow = typeof schema.characters.$inferSelect;

declare module 'hono' {
  interface ContextVariableMap {
    character: CharacterRow;
  }
}

export function editKeyAuth(deps: AuthDeps): MiddlewareHandler {
  return async (c, next) => {
    const slug = c.req.param('slug');
    if (!slug) {
      return c.json({ error: 'bad_request', message: 'missing slug' }, 400);
    }

    const character = await deps.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();

    if (!character) {
      deps.logger.info({ event: 'auth.fail', reason: 'character_not_found', slug });
      return c.json({ error: 'not_found' }, 404);
    }

    const headerKey = c.req.header('X-Edit-Key');
    const cookieKey = getCookie(c, cookieNameForSlug(slug));
    const provided = headerKey ?? cookieKey;
    const source: 'header' | 'cookie' | null = headerKey
      ? 'header'
      : cookieKey
        ? 'cookie'
        : null;

    if (!provided) {
      deps.logger.warn({
        event: 'auth.fail',
        reason: 'missing_credentials',
        slug,
      });
      return c.json({ error: 'unauthorized', message: 'edit key required' }, 401);
    }

    const hashed = hashEditKey(provided, deps.pepper);
    if (hashed !== character.editKeyHash) {
      deps.logger.warn({
        event: 'auth.fail',
        reason: 'invalid_key',
        slug,
        source,
        keyPrefix: hashedKeyPrefix(provided),
      });
      return c.json({ error: 'forbidden', message: 'invalid edit key' }, 403);
    }

    deps.logger.info({ event: 'auth.ok', slug, source });
    c.set('character', character);
    await next();
  };
}
