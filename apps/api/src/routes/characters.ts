import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { schema } from '@sojourn/shared';
import {
  isPoseName,
  POSE_NAMES,
  type PoseName,
} from '@sojourn/shared/pose';
import {
  getPortraitGenerator,
  getSpriteGenerator,
  type GeneratorRegistry,
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
import {
  cookieNameForSlug,
  generateEditKey,
  generateRowId,
  generateSlug,
  hashEditKey,
} from '../auth/edit-key.js';

export type RoutesDeps = {
  db: DB;
  generators: GeneratorRegistry;
  pepper: string;
  logger: Logger;
  isProduction: boolean;
  stubBaseUrl: string;
};

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function createCharacterRoutes(deps: RoutesDeps): Hono {
  const app = new Hono();
  const auth = editKeyAuth({ db: deps.db, pepper: deps.pepper, logger: deps.logger });

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

    const id = generateRowId();
    const slug = generateSlug();
    const editKey = generateEditKey();
    const editKeyHash = hashEditKey(editKey, deps.pepper);
    const name = prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt;

    await deps.db.insert(schema.characters).values({
      id,
      slug,
      editKeyHash,
      name,
      basePrompt: prompt,
      attributes: {},
    });

    const portraitGen = getPortraitGenerator(deps.generators, 'stub');
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

    const spriteGen = getSpriteGenerator(deps.generators, 'stub');
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

  app.post('/:slug/portrait', auth, async (c) => {
    const character = c.get('character');
    const gen = getPortraitGenerator(deps.generators, character.portraitGenerator);
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
        updatedAt: new Date(),
      })
      .where(eq(schema.characters.id, character.id));
    const updated = await deps.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, character.id))
      .get();
    const payload: GeneratePortraitResponse = { character: toCharacterDto(updated!) };
    return c.json(payload, 202);
  });

  app.post('/:slug/poses', auth, async (c) => {
    const character = c.get('character');
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
    const poseName: PoseName = rawName;

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

    const generatorId = existing?.generator ?? 'stub';
    const gen = getSpriteGenerator(deps.generators, generatorId);
    const result = await gen.generatePose({
      characterId: character.id,
      slug: character.slug,
      poseName,
      prompt: character.basePrompt,
      attributes: character.attributes,
      refImageUrl: character.refImageUrl,
    });

    let row;
    if (existing) {
      await deps.db
        .update(schema.poses)
        .set({
          spriteSheetUrl: result.spriteSheetUrl,
          manifest: result.manifest,
          status: result.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.poses.id, existing.id));
      row = await deps.db
        .select()
        .from(schema.poses)
        .where(eq(schema.poses.id, existing.id))
        .get();
    } else {
      const newId = generateRowId();
      await deps.db.insert(schema.poses).values({
        id: newId,
        characterId: character.id,
        name: poseName,
        spriteSheetUrl: result.spriteSheetUrl,
        manifest: result.manifest,
        generator: gen.id,
        status: result.status,
      });
      row = await deps.db
        .select()
        .from(schema.poses)
        .where(eq(schema.poses.id, newId))
        .get();
    }

    const payload: GeneratePoseResponse = { pose: toPoseDto(row!) };
    return c.json(payload, 202);
  });

  app.post('/:slug/voice', auth, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
    }
    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as { text: unknown }).text !== 'string'
    ) {
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
