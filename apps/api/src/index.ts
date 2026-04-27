import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { runMigrations } from './db/migrate-runner.js';
import { env, isDev } from './env.js';

if (env.MIGRATE_ON_BOOT) {
  const folder = await runMigrations();
  console.log(`[api] migrations applied at boot from ${folder}`);
}

const stubsRoot = fileURLToPath(new URL('../fixtures/stubs/v1', import.meta.url));

const app = new Hono();

function healthBody() {
  return { status: 'ok', env: env.NODE_ENV, time: new Date().toISOString() };
}

app.get('/health', (c) => c.json(healthBody()));
app.get('/api/health', (c) => c.json(healthBody()));

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

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

const port = env.PORT;
serve({ fetch: app.fetch, port }, ({ port: actual }) => {
  console.log(
    `[api] listening on http://localhost:${actual} (${env.NODE_ENV})${isDev ? ' [dev]' : ''}`,
  );
});

export type AppType = typeof app;
