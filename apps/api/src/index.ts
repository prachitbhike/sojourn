import { serve } from '@hono/node-server';
import { db } from './db/client.js';
import { runMigrations } from './db/migrate-runner.js';
import { env, isDev, resolveStubBaseUrl } from './env.js';
import { createApp } from './app.js';
import { buildGeneratorRegistry } from './generators.js';
import { createLogger } from './logger.js';

const logger = createLogger({ level: env.LOG_LEVEL });

if (env.MIGRATE_ON_BOOT) {
  const folder = await runMigrations();
  logger.info({ event: 'migrations.applied', folder });
}

const stubBaseUrl = resolveStubBaseUrl();
const generators = buildGeneratorRegistry(stubBaseUrl);

const app = createApp({
  db,
  generators,
  pepper: env.EDIT_KEY_PEPPER,
  logger,
  isProduction: !isDev,
  corsOrigin: env.CORS_ORIGIN,
  stubBaseUrl,
  nodeEnv: env.NODE_ENV,
});

const port = env.PORT;
serve({ fetch: app.fetch, port }, ({ port: actual }) => {
  logger.info({
    event: 'api.listening',
    url: `http://localhost:${actual}`,
    env: env.NODE_ENV,
    dev: isDev,
  });
});

export type AppType = typeof app;
