import { serve } from '@hono/node-server';
import { db } from './db/client.js';
import { runMigrations } from './db/migrate-runner.js';
import { env, isDev, resolveStubBaseUrl } from './env.js';
import { createApp } from './app.js';
import { buildGeneratorRegistry } from './generators.js';
import { createLogger } from './logger.js';
import { sweepStuckPending } from './startup-sweep.js';

const logger = createLogger({ level: env.LOG_LEVEL });

if (env.MIGRATE_ON_BOOT) {
  const folder = await runMigrations();
  logger.info({ event: 'migrations.applied', folder });
}

await sweepStuckPending(db, logger);

const stubBaseUrl = resolveStubBaseUrl();
const generators = buildGeneratorRegistry(stubBaseUrl, {
  defaultSpriteGenerator: env.SPRITE_GENERATOR,
});

const app = createApp({
  db,
  generators,
  pepper: env.EDIT_KEY_PEPPER,
  logger,
  isProduction: !isDev,
  corsOrigin: env.CORS_ORIGIN,
  stubBaseUrl,
  nodeEnv: env.NODE_ENV,
  defaultPortraitGenerator: env.PORTRAIT_GENERATOR,
  defaultSpriteGenerator: env.SPRITE_GENERATOR,
  assetPublicBaseUrl: env.R2_PUBLIC_BASE_URL ?? null,
  referenceUploadMaxBytes: env.REFERENCE_UPLOAD_MAX_BYTES,
});

const port = env.PORT;
serve({ fetch: app.fetch, port }, ({ port: actual }) => {
  logger.info({
    event: 'api.listening',
    url: `http://localhost:${actual}`,
    env: env.NODE_ENV,
    dev: isDev,
    portraitGenerator: env.PORTRAIT_GENERATOR,
    spriteGenerator: env.SPRITE_GENERATOR,
  });
});

export type AppType = typeof app;
