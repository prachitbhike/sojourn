import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import type {
  GeneratorRegistry,
  PortraitGeneratorId,
  SpriteGeneratorId,
} from '@sojourn/shared/generators';
import type { DB } from './db/client.js';
import type { Logger } from './logger.js';
import { createCharacterRoutes } from './routes/characters.js';
import { createBackgroundTracker, type BackgroundTracker } from './background.js';

export type AppDeps = {
  db: DB;
  generators: GeneratorRegistry;
  pepper: string;
  logger: Logger;
  isProduction: boolean;
  corsOrigin: string;
  stubBaseUrl: string;
  nodeEnv: string;
  defaultPortraitGenerator: PortraitGeneratorId;
  defaultSpriteGenerator: SpriteGeneratorId;
  background?: BackgroundTracker;
};

export type App = ReturnType<typeof createApp>;

const stubsRoot = fileURLToPath(new URL('../fixtures/stubs/v1', import.meta.url));
const webDistRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const background = deps.background ?? createBackgroundTracker();

  const healthBody = () => ({
    status: 'ok',
    env: deps.nodeEnv,
    time: new Date().toISOString(),
  });
  app.get('/health', (c) => c.json(healthBody()));
  app.get('/api/health', (c) => c.json(healthBody()));

  app.use(
    '/api/*',
    cors({
      origin: deps.corsOrigin,
      credentials: true,
      allowHeaders: ['Content-Type', 'X-Edit-Key'],
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    }),
  );

  app.use(
    '/api/stubs/v1/*',
    serveStatic({
      root: stubsRoot,
      rewriteRequestPath: (path) => path.replace(/^\/api\/stubs\/v1/, ''),
      onFound: (_path, c) => {
        c.header('Cache-Control', 'public, max-age=3600, must-revalidate');
      },
    }),
  );

  app.route(
    '/api/characters',
    createCharacterRoutes({
      db: deps.db,
      generators: deps.generators,
      pepper: deps.pepper,
      logger: deps.logger,
      isProduction: deps.isProduction,
      stubBaseUrl: deps.stubBaseUrl,
      defaultPortraitGenerator: deps.defaultPortraitGenerator,
      defaultSpriteGenerator: deps.defaultSpriteGenerator,
      background,
    }),
  );

  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    return serveStatic({ root: webDistRoot })(c, next);
  });

  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    return serveStatic({ path: 'index.html', root: webDistRoot })(c, next);
  });

  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

  app.onError((err, c) => {
    deps.logger.error({ event: 'unhandled_error', err: serializeError(err) });
    return c.json({ error: 'internal_error' }, 500);
  });

  // Surface the background tracker to tests / graceful shutdown.
  (app as unknown as { background: BackgroundTracker }).background = background;

  return app;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}
