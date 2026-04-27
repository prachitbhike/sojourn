import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { env, isDev } from './env.js';

const app = new Hono();

function healthBody() {
  return { status: 'ok', env: env.NODE_ENV, time: new Date().toISOString() };
}

app.get('/health', (c) => c.json(healthBody()));
app.get('/api/health', (c) => c.json(healthBody()));

app.use(
  '/api/stubs/v1/*',
  serveStatic({
    root: './fixtures/stubs/v1',
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
