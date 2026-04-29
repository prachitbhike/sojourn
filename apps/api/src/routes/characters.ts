import { and, eq } from 'drizzle-orm';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { setCookie } from 'hono/cookie';
import { schema } from '@sojourn/shared';
import {
  isPoseName,
  POSE_NAMES,
  type PoseName,
} from '@sojourn/shared/pose';

declare module 'hono' {
  interface ContextVariableMap {
    poseName: PoseName;
  }
}
import {
  getPortraitGenerator,
  getSpriteGenerator,
  STUB_POSE_MANIFESTS,
  type GeneratorRegistry,
  type PortraitGeneratorId,
  type SpriteGeneratorId,
} from '@sojourn/shared/generators';
import type {
  CharacterDto,
  CreateCharacterResponse,
  GeneratePoseResponse,
  GeneratePortraitResponse,
  GenerateVoiceResponse,
  GetCharacterResponse,
  PatchCharacterResponse,
  PoseDto,
  RotateKeyResponse,
} from '@sojourn/shared/contracts';
import type { DB } from '../db/client.js';
import type { Logger } from '../logger.js';
import { editKeyAuth } from '../auth/middleware.js';
import { dailyCap } from '../auth/cap.js';
import {
  cookieNameForSlug,
  generateEditKey,
  generateRowId,
  generateSlug,
  hashEditKey,
} from '../auth/edit-key.js';
import type { BackgroundTracker } from '../background.js';

export type RoutesDeps = {
  db: DB;
  generators: GeneratorRegistry;
  pepper: string;
  logger: Logger;
  isProduction: boolean;
  stubBaseUrl: string;
  defaultPortraitGenerator: PortraitGeneratorId;
  defaultSpriteGenerator: SpriteGeneratorId;
  background: BackgroundTracker;
};

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const MAX_PROMPT_LENGTH = 4000;
const SLUG_INSERT_MAX_ATTEMPTS = 5;
const ERROR_MESSAGE_TRUNCATE = 500;

function isUniqueSlugError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE/i.test(message) && /slug/i.test(message);
}

function truncateError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.length <= ERROR_MESSAGE_TRUNCATE) return message;
  return `${message.slice(0, ERROR_MESSAGE_TRUNCATE - 1)}…`;
}

function placeholderSpriteUrl(stubBaseUrl: string, name: PoseName): string {
  const trimmed = stubBaseUrl.endsWith('/') ? stubBaseUrl.slice(0, -1) : stubBaseUrl;
  return `${trimmed}/${name}.png`;
}

// Parses + validates the POST /poses JSON body and stashes the pose name on
// the context. Mounted before the cap middleware so a malformed body 400s
// without burning a daily-cap slot.
const validatePoseBody: MiddlewareHandler = async (c, next) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }
  const rawName =
    body && typeof body === 'object' && 'name' in body
      ? (body as { name: unknown }).name
      : undefined;
  if (typeof rawName !== 'string' || !isPoseName(rawName)) {
    return c.json(
      {
        error: 'bad_request',
        message: `pose name must be one of: ${POSE_NAMES.join(', ')}`,
      },
      400,
    );
  }
  c.set('poseName', rawName);
  await next();
};

export function createCharacterRoutes(deps: RoutesDeps): Hono {
  const app = new Hono();
  const auth = editKeyAuth({ db: deps.db, pepper: deps.pepper, logger: deps.logger });
  const portraitCap = dailyCap({ db: deps.db, logger: deps.logger }, 'portrait');
  const poseCap = dailyCap({ db: deps.db, logger: deps.logger }, 'pose');

  function setEditCookie(c: Context, slug: string, key: string) {
    setCookie(c, cookieNameForSlug(slug), key, {
      httpOnly: true,
      sameSite: deps.isProduction ? 'None' : 'Lax',
      secure: deps.isProduction,
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  app.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
    }

    const prompt =
      body && typeof body === 'object' && 'prompt' in body && typeof (body as { prompt: unknown }).prompt === 'string'
        ? ((body as { prompt: string }).prompt as string).trim()
        : '';

    if (!prompt) {
      return c.json({ error: 'bad_request', message: 'prompt required' }, 400);
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return c.json(
        {
          error: 'bad_request',
          message: `prompt must be ${MAX_PROMPT_LENGTH} characters or fewer`,
        },
        400,
      );
    }

    const id = generateRowId();
    const editKey = generateEditKey();
    const editKeyHash = hashEditKey(editKey, deps.pepper);
    const name = prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt;

    let slug = '';
    for (let attempt = 0; attempt < SLUG_INSERT_MAX_ATTEMPTS; attempt += 1) {
      slug = generateSlug();
      try {
        await deps.db.insert(schema.characters).values({
          id,
          slug,
          editKeyHash,
          name,
          basePrompt: prompt,
          attributes: {},
          portraitGenerator: deps.defaultPortraitGenerator,
        });
        break;
      } catch (err) {
        if (!isUniqueSlugError(err)) throw err;
        deps.logger.warn({ event: 'slug.collision', slug, attempt });
        if (attempt === SLUG_INSERT_MAX_ATTEMPTS - 1) throw err;
      }
    }

    const portraitGen = getPortraitGenerator(deps.generators, deps.defaultPortraitGenerator);
    const portraitResult = await portraitGen.generatePortrait({
      characterId: id,
      slug,
      prompt,
      attributes: {},
    });

    await deps.db
      .update(schema.characters)
      .set({
        portraitUrl: portraitResult.url,
        portraitGenerator: portraitGen.id,
        portraitStatus: portraitResult.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.characters.id, id));

    const spriteGen = getSpriteGenerator(deps.generators, deps.defaultSpriteGenerator);
    const idleResult = await spriteGen.generatePose({
      characterId: id,
      slug,
      poseName: 'idle',
      prompt,
      attributes: {},
    });

    await deps.db.insert(schema.poses).values({
      id: generateRowId(),
      characterId: id,
      name: 'idle',
      spriteSheetUrl: idleResult.spriteSheetUrl,
      manifest: idleResult.manifest,
      generator: spriteGen.id,
      status: idleResult.status,
    });

    const character = await deps.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, id))
      .get();
    const poses = await deps.db
      .select()
      .from(schema.poses)
      .where(eq(schema.poses.characterId, id))
      .all();

    setEditCookie(c, slug, editKey);

    const payload: CreateCharacterResponse = {
      character: toCharacterDto(character!),
      poses: poses.map(toPoseDto),
      editKey,
    };
    return c.json(payload, 200);
  });

  app.get('/:slug', async (c) => {
    const slug = c.req.param('slug');
    const character = await deps.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    if (!character) {
      return c.json({ error: 'not_found' }, 404);
    }
    const poses = await deps.db
      .select()
      .from(schema.poses)
      .where(eq(schema.poses.characterId, character.id))
      .all();
    const payload: GetCharacterResponse = {
      character: toCharacterDto(character),
      poses: poses.map(toPoseDto),
    };
    return c.json(payload);
  });

  app.patch('/:slug', auth, async (c) => {
    const character = c.get('character');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
    }

    if (!body || typeof body !== 'object') {
      return c.json({ error: 'bad_request' }, 400);
    }

    const update: Partial<typeof schema.characters.$inferInsert> = {
      updatedAt: new Date(),
    };
    const patch = body as { name?: unknown; attributes?: unknown };
    if (typeof patch.name === 'string') {
      update.name = patch.name;
    }
    if (patch.attributes && typeof patch.attributes === 'object' && !Array.isArray(patch.attributes)) {
      update.attributes = {
        ...(character.attributes ?? {}),
        ...(patch.attributes as Record<string, unknown>),
      };
    }

    await deps.db
      .update(schema.characters)
      .set(update)
      .where(eq(schema.characters.id, character.id));

    const updated = await deps.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, character.id))
      .get();
    const payload: PatchCharacterResponse = { character: toCharacterDto(updated!) };
    return c.json(payload);
  });

  app.post('/:slug/portrait', auth, portraitCap, async (c) => {
    const character = c.get('character');
    const generatorId = character.portraitGenerator;
    const gen = getPortraitGenerator(deps.generators, generatorId);
    const now = new Date();

    await deps.db
      .update(schema.characters)
      .set({
        portraitStatus: 'pending',
        portraitErrorMessage: null,
        updatedAt: now,
      })
      .where(eq(schema.characters.id, character.id));

    const pendingRow = await deps.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, character.id))
      .get();

    deps.background.run(
      (async () => {
        try {
          const result = await gen.generatePortrait({
            characterId: character.id,
            slug: character.slug,
            prompt: character.basePrompt,
            attributes: character.attributes,
            refImageUrl: character.refImageUrl,
          });
          await deps.db
            .update(schema.characters)
            .set({
              portraitUrl: result.url,
              portraitStatus: result.status,
              portraitErrorMessage: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.characters.id, character.id));
          deps.logger.info({
            event: 'portrait.generated',
            slug: character.slug,
            generator: gen.id,
            status: result.status,
          });
        } catch (err) {
          deps.logger.error({
            event: 'portrait.failed',
            slug: character.slug,
            generator: gen.id,
            err: serializeError(err),
          });
          await deps.db
            .update(schema.characters)
            .set({
              portraitStatus: 'failed',
              portraitErrorMessage: truncateError(err),
              updatedAt: new Date(),
            })
            .where(eq(schema.characters.id, character.id));
        }
      })(),
    );

    const payload: GeneratePortraitResponse = { character: toCharacterDto(pendingRow!) };
    return c.json(payload, 202);
  });

  app.post('/:slug/poses', auth, validatePoseBody, poseCap, async (c) => {
    const character = c.get('character');
    const poseName = c.get('poseName');

    const existing = await deps.db
      .select()
      .from(schema.poses)
      .where(
        and(
          eq(schema.poses.characterId, character.id),
          eq(schema.poses.name, poseName),
        ),
      )
      .get();

    const generatorId = existing?.generator ?? deps.defaultSpriteGenerator;
    const gen = getSpriteGenerator(deps.generators, generatorId);
    const now = new Date();
    let rowId: string;

    if (existing) {
      rowId = existing.id;
      await deps.db
        .update(schema.poses)
        .set({
          status: 'pending',
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(schema.poses.id, existing.id));
    } else {
      rowId = generateRowId();
      // Placeholder URL/manifest so the row satisfies the NOT NULL constraints
      // and renders something coherent during pending. Stub catalog assets are
      // valid for any pose name and round-trip through the renderer cleanly.
      await deps.db.insert(schema.poses).values({
        id: rowId,
        characterId: character.id,
        name: poseName,
        spriteSheetUrl: placeholderSpriteUrl(deps.stubBaseUrl, poseName),
        manifest: STUB_POSE_MANIFESTS[poseName],
        generator: gen.id,
        status: 'pending',
      });
    }

    const pendingRow = await deps.db
      .select()
      .from(schema.poses)
      .where(eq(schema.poses.id, rowId))
      .get();

    deps.background.run(
      (async () => {
        try {
          const result = await gen.generatePose({
            characterId: character.id,
            slug: character.slug,
            poseName,
            prompt: character.basePrompt,
            attributes: character.attributes,
            refImageUrl: character.refImageUrl,
          });
          await deps.db
            .update(schema.poses)
            .set({
              spriteSheetUrl: result.spriteSheetUrl,
              manifest: result.manifest,
              status: result.status,
              errorMessage: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.poses.id, rowId));
          deps.logger.info({
            event: 'pose.generated',
            slug: character.slug,
            poseName,
            generator: gen.id,
            status: result.status,
          });
        } catch (err) {
          deps.logger.error({
            event: 'pose.failed',
            slug: character.slug,
            poseName,
            generator: gen.id,
            err: serializeError(err),
          });
          await deps.db
            .update(schema.poses)
            .set({
              status: 'failed',
              errorMessage: truncateError(err),
              updatedAt: new Date(),
            })
            .where(eq(schema.poses.id, rowId));
        }
      })(),
    );

    const payload: GeneratePoseResponse = { pose: toPoseDto(pendingRow!) };
    return c.json(payload, 202);
  });

  app.post('/:slug/voice', auth, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
    }
    const rawText =
      body && typeof body === 'object'
        ? (body as { text: unknown }).text
        : undefined;
    if (typeof rawText !== 'string' || rawText.trim() === '') {
      return c.json({ error: 'bad_request', message: 'text required' }, 400);
    }

    const trimmedBase = deps.stubBaseUrl.endsWith('/')
      ? deps.stubBaseUrl.slice(0, -1)
      : deps.stubBaseUrl;
    const payload: GenerateVoiceResponse = { audioUrl: `${trimmedBase}/voice.mp3` };
    return c.json(payload);
  });

  app.post('/:slug/rotate-key', auth, async (c) => {
    const character = c.get('character');
    const newKey = generateEditKey();
    const newHash = hashEditKey(newKey, deps.pepper);
    await deps.db
      .update(schema.characters)
      .set({ editKeyHash: newHash, updatedAt: new Date() })
      .where(eq(schema.characters.id, character.id));
    setEditCookie(c, character.slug, newKey);
    const payload: RotateKeyResponse = { editKey: newKey };
    return c.json(payload);
  });

  return app;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}

function toCharacterDto(row: typeof schema.characters.$inferSelect): CharacterDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    basePrompt: row.basePrompt,
    refImageUrl: row.refImageUrl,
    attributes: row.attributes,
    portraitUrl: row.portraitUrl,
    portraitGenerator: row.portraitGenerator,
    portraitStatus: row.portraitStatus,
    voiceId: row.voiceId,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function toPoseDto(row: typeof schema.poses.$inferSelect): PoseDto {
  return {
    id: row.id,
    characterId: row.characterId,
    name: row.name as PoseName,
    spriteSheetUrl: row.spriteSheetUrl,
    manifest: row.manifest,
    generator: row.generator,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
