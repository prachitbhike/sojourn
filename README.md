# Sojourn

A web app for creating animatable pixel-art sprites with a chat- and inspector-driven UX. Sprites and animations come from [PixelLab](https://www.pixellab.ai); character portraits and reference fusion run through nano banana (Gemini 2.5 Flash Image); voice runs through ElevenLabs. Frame-based sprite sheets, not rigged.

> The contributor / agent contract lives in [AGENTS.md](AGENTS.md). Read it before touching code.

## Status

Phase 0 — *shareable skeleton with stub generators* — is complete. The full create → edit → share loop works end-to-end against canned assets. Real generators land in Phase 1.

| Slice | What | State |
|---|---|---|
| 1 | pnpm workspace, Vite + Hono scaffold, Drizzle schema + migrations, stub fixtures | merged |
| 2 | API endpoints, edit-key auth, generator seam (stub impl), pino logging | merged |
| 3 | `<SpriteStage>` component + `/dev/stage` Phaser demo | merged |
| 4 | Landing / editor / public viewer UI, inspector, pose grid | merged |
| 5 | Playwright E2E happy-path, R2 stub-upload script, prod CORS | merged |

All generators currently return canned placeholder assets. No real PixelLab / nano banana / ElevenLabs calls yet — wiring those up is Phase 1+. R2 is wired (`pnpm --filter api stubs:upload` pushes the stub catalog) but the dev server still serves stubs from disk by default.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TS, Phaser sandboxed inside `<SpriteStage>` |
| API | Node + Hono + TS |
| DB | SQLite via Drizzle (Turso in prod, local file in dev) |
| Asset storage | Cloudflare R2 (S3-compatible) |
| Sprites | PixelLab (Phase 1+, stubbed in Phase 0) |
| Portraits | nano banana / Gemini 2.5 Flash Image (Phase 1+, stubbed) |
| Voice | ElevenLabs (Phase 2+) |
| Hosting | Vercel (frontend) + Fly/Railway (API) — choice deferred |

The full stack rationale lives in [docs/phase-0-plan.md](docs/phase-0-plan.md); decisions log in [docs/decisions.md](docs/decisions.md).

## Repo layout

```
apps/
  api/           Hono server, Drizzle migrations, stub fixtures, vitest
  web/           Vite + React + Phaser
packages/
  shared/        schema, contracts, pose vocabulary, generator interfaces
docs/            phase-0-plan, decisions log, execution plan
```

`packages/shared` is the only cross-app boundary — both apps import schema and contract types from there. Ownership and sandbox rules (Phaser stays in `<SpriteStage>`; provider SDKs stay in `packages/shared/generators/<provider>/`) are spelled out in [AGENTS.md](AGENTS.md).

## Getting started

**Prerequisites.** Node ≥ 20 and pnpm 10.15.1 (both pinned in [package.json](package.json) via `engines` and `packageManager`).

```bash
pnpm install
cp .env.example .env.local           # optional in dev; defaults are fine
pnpm --filter api db:migrate         # apply Drizzle migrations to local SQLite
pnpm dev                             # boots web + api in parallel
```

- Web: <http://localhost:5173> (landing page → create a character)
- API: <http://localhost:3000> (override with `PORT` in `.env.local`)
- Phaser demo (component sandbox): <http://localhost:5173/dev/stage>

`EDIT_KEY_PEPPER` is empty by default — the API logs a warning but still runs in dev. Set it in `.env.local` if you want hash parity with prod. R2 / PixelLab / Gemini / ElevenLabs keys can stay blank in Phase 0.

## Common commands

```bash
pnpm dev                            # web + api with hot reload
pnpm build                          # build both apps
pnpm typecheck                      # tsc --noEmit across workspaces
pnpm lint                           # eslint + prettier check
pnpm --filter api db:migrate        # apply Drizzle migrations
pnpm --filter api db:studio         # open Drizzle Studio
pnpm --filter api test              # vitest (api package)
pnpm --filter api stubs:upload      # one-shot push of stub catalog to R2
pnpm e2e:install                    # install Playwright's chromium (one-time)
pnpm e2e                            # Playwright happy-path (boots dev servers itself)
```

The canonical command list lives in [AGENTS.md](AGENTS.md#common-commands).

## API surface (current)

Implemented in [apps/api/src/routes/characters.ts](apps/api/src/routes/characters.ts). All `/api/characters/*` mutating routes require auth.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health`, `/api/health` | — | liveness |
| POST | `/api/characters` | — | creates character; auto-generates a stub portrait + idle pose; returns the `editKey` |
| GET | `/api/characters/:slug` | — | public read |
| PATCH | `/api/characters/:slug` | yes | update name / attributes |
| POST | `/api/characters/:slug/portrait` | yes | regenerate portrait |
| POST | `/api/characters/:slug/poses` | yes | body `{ name: 'idle' \| 'walk' \| 'attack' \| 'cast' }` |
| POST | `/api/characters/:slug/voice` | yes | stub — returns a fixed audio URL |
| POST | `/api/characters/:slug/rotate-key` | yes | rotates `editKey`, refreshes cookie |

**Auth.** Pass either an `X-Edit-Key: <key>` header or the slug-namespaced `HttpOnly` cookie set on creation. The full URL/share model (slug shape, edit-key lifecycle, cookie scoping) is in [docs/phase-0-plan.md](docs/phase-0-plan.md).

Quick smoke test once `pnpm dev` is up:

```bash
curl -X POST http://localhost:3000/api/characters \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a small wizard"}'
```

## URL & share model

```
/                          landing — prompt-driven create form
/c/:slug                   public read-only viewer
/c/:slug/edit?key=:editKey editor (portrait, stage, inspector, pose grid)
/dev/stage                 component sandbox for the Phaser <SpriteStage>
```

No accounts in Phase 0. The `editKey` is generated on create, returned in the response, embedded in the editor URL, and mirrored to a cookie. Lose the URL = lose edit access. See decision **D03** in [docs/decisions.md](docs/decisions.md) and the URL section of [docs/phase-0-plan.md](docs/phase-0-plan.md).

## Deploying (Railway)

Phase 0 ships as a **single Railway service**: the API serves `apps/web/dist` as static files, so the whole app is one origin and one URL. SQLite lives on a Railway-mounted volume; migrations run on boot.

**One-time setup:**

1. Install the Railway CLI: `brew install railway` (or `npm i -g @railway/cli`).
2. `railway login` (opens a browser).
3. From the repo root: `railway init` and pick a project name.
4. Attach a persistent volume mounted at `/data` (CLI: `railway volume add --mount-path /data`, or use the dashboard).
5. Set environment variables:
   ```bash
   railway variables \
     --set NODE_ENV=production \
     --set MIGRATE_ON_BOOT=1 \
     --set STUB_SOURCE=local \
     --set LOG_LEVEL=info \
     --set "DATABASE_URL=file:/data/sojourn.db" \
     --set "EDIT_KEY_PEPPER=$(node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))')"
   ```
6. `railway up` to deploy. `railway domain` issues a public `*.up.railway.app` URL.

**Build & runtime contract** — codified in [`railway.json`](railway.json):

- Build: `pnpm install --frozen-lockfile && pnpm build` (Nixpacks auto-detects pnpm from the lockfile + `packageManager`).
- Start: `pnpm --filter @sojourn/api start` (compiled JS, run with `node --import tsx`).
- Healthcheck: `GET /health`.

**Required env vars in production:**

| Var | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | flips cookies to `SameSite=None; Secure` |
| `DATABASE_URL` | `file:/data/sojourn.db` | path under the mounted volume |
| `EDIT_KEY_PEPPER` | random 32+ bytes (hex) | API refuses to boot if empty |
| `MIGRATE_ON_BOOT` | `1` | runs Drizzle migrations on startup |
| `STUB_SOURCE` | `local` | serves stubs from `apps/api/fixtures/stubs/v1/` |
| `PORT` | (auto) | provided by Railway |
| `LOG_LEVEL` | `info` | optional |

`CORS_ORIGIN` is **not** required while frontend + API share an origin. `R2_*` vars are unused with `STUB_SOURCE=local`.

**Verify after deploy:**

```bash
curl https://<your-url>.up.railway.app/health        # {"status":"ok",...}
curl https://<your-url>.up.railway.app/api/health    # same shape
open  https://<your-url>.up.railway.app/             # SPA loads
```

If `/health` works but DB writes fail, the volume probably isn't attached. If `/` 404s, `apps/web/dist` didn't build — check the Railway build log for the root `pnpm build` output.

## Documentation index

- [AGENTS.md](AGENTS.md) — agent / contributor conventions, ownership rules, recurring footguns
- [docs/phase-0-plan.md](docs/phase-0-plan.md) — current phase spec: stack, data model, API, URL strategy, deliverables checklist
- [docs/execution-plan.md](docs/execution-plan.md) — Phase 0 slice structure and per-slice acceptance criteria
- [docs/decisions.md](docs/decisions.md) — running decisions log (D01–D15)

## Contributing

The hard rules — stay in your slice, don't change the data model or URL scheme without approval, justify new dependencies, one PR per slice, log unplanned decisions — all live in [AGENTS.md](AGENTS.md). Read it before opening a PR.

## License

Private / unlicensed. No `LICENSE` file is included.
