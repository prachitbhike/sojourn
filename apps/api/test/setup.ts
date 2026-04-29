import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createApp } from '../src/app.js';
import { buildGeneratorRegistry } from '../src/generators.js';
import { createLogger } from '../src/logger.js';
import { createBackgroundTracker, type BackgroundTracker } from '../src/background.js';
import type { DB } from '../src/db/client.js';
import type {
  GeneratorRegistry,
  PortraitGeneratorId,
  SpriteGeneratorId,
} from '@sojourn/shared/generators';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export type TestContext = {
  app: ReturnType<typeof createApp>;
  db: DB;
  pepper: string;
  stubBaseUrl: string;
  generators: GeneratorRegistry;
  background: BackgroundTracker;
  drain: () => Promise<void>;
  fetch: (
    path: string,
    init?: RequestInit & { cookieJar?: CookieJar },
  ) => Promise<Response>;
};

export type CookieJar = Map<string, string>;

export type SetupOptions = {
  generators?: GeneratorRegistry;
  stubBaseUrl?: string;
  defaultPortraitGenerator?: PortraitGeneratorId;
  defaultSpriteGenerator?: SpriteGeneratorId;
};

export async function setupTestApp(options: SetupOptions = {}): Promise<TestContext> {
  const stubBaseUrl = options.stubBaseUrl ?? 'http://stubs.test/stubs/v1';
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client) as DB;
  await migrate(db, { migrationsFolder });

  const generators = options.generators ?? buildGeneratorRegistry(stubBaseUrl);
  const logger = createLogger({ silent: true });
  const pepper = 'test-pepper';
  const background = createBackgroundTracker();

  const app = createApp({
    db,
    generators,
    pepper,
    logger,
    isProduction: false,
    corsOrigin: 'http://localhost:5173',
    stubBaseUrl,
    nodeEnv: 'test',
    defaultPortraitGenerator: options.defaultPortraitGenerator ?? 'stub',
    defaultSpriteGenerator: options.defaultSpriteGenerator ?? 'stub',
    background,
  });

  return {
    app,
    db,
    pepper,
    stubBaseUrl,
    generators,
    background,
    drain: () => background.drain(),
    async fetch(path, init = {}) {
      const url = `http://test.local${path}`;
      const headers = new Headers(init.headers);
      if (init.cookieJar && init.cookieJar.size > 0) {
        const cookieHeader = [...init.cookieJar.entries()]
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
        headers.set('Cookie', cookieHeader);
      }
      const response = await app.fetch(new Request(url, { ...init, headers }));
      if (init.cookieJar) {
        absorbSetCookies(response, init.cookieJar);
      }
      return response;
    },
  };
}

function absorbSetCookies(response: Response, jar: CookieJar) {
  const setCookieValues = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookieValues) {
    const firstPair = raw.split(';')[0];
    if (!firstPair) continue;
    const eqIdx = firstPair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = firstPair.slice(0, eqIdx).trim();
    const value = firstPair.slice(eqIdx + 1).trim();
    if (!name) continue;
    if (value === '' || /Max-Age=0/i.test(raw)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

export function makeCookieJar(): CookieJar {
  return new Map();
}

export async function createCharacterFor(
  ctx: TestContext,
  prompt = 'a brave knight',
): Promise<{
  slug: string;
  editKey: string;
  cookies: CookieJar;
}> {
  const cookies = makeCookieJar();
  const response = await ctx.fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    cookieJar: cookies,
  });
  if (response.status !== 200) {
    throw new Error(`character creation failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { character: { slug: string }; editKey: string };
  return { slug: body.character.slug, editKey: body.editKey, cookies };
}
