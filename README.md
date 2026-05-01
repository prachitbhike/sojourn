# Sojourn

A web app for creating animatable pixel-art sprites with a chat- and inspector-driven UX. Sprites and animations come from [PixelLab](https://www.pixellab.ai); character portraits and reference fusion run through nano banana (Gemini 2.5 Flash Image); voice runs through ElevenLabs. Frame-based sprite sheets, not rigged.

> The contributor / agent contract lives in [AGENTS.md](AGENTS.md). Read it before touching code.

## Status

Phase 0 — *shareable skeleton with stub generators* — is complete. Phase 1 — *real generators + reference upload* — is mid-flight: the foundations, PixelLab sprite generator, nano-banana portrait generator, and reference-upload landing UX have merged; the editor's pending/failure UX and the Phase 1 E2E pass are still in flight.

| Phase | Slice | What | State |
|---|---|---|---|
| 0 | 1 | pnpm workspace, Vite + Hono scaffold, Drizzle schema + migrations, stub fixtures | merged |
| 0 | 2 | API endpoints, edit-key auth, generator seam (stub impl), pino logging | merged |
| 0 | 3 | `<SpriteStage>` component + `/dev/stage` Phaser demo | merged |
| 0 | 4 | Landing / editor / public viewer UI, inspector, pose grid | merged |
| 0 | 5 | Playwright E2E happy-path, R2 stub-upload script, prod CORS | merged |
| 1 | 1 | `errorMessage` cols + daily-cap counters, async `/portrait` & `/poses` (202), 5-min startup sweep, R2 helper, provider env-var wiring | merged |
| 1 | 2 | Real PixelLab `SpriteGenerator` with R2 upload + manifest translation; `SPRITE_GENERATOR=pixellab` is the default | merged |
| 1 | 3 | Real nano banana `PortraitGenerator` (Gemini 2.5 Flash Image) with multi-image reference fusion; lazy registry entry | merged |
| 1 | 4 | `POST /api/uploads/reference` presigned-PUT endpoint + landing drop-zone | merged |
| 1 | 5 | Editor pending/failure UX, polling, 429 cap banner, rotate-key affordance | pending |
| 1 | 6 | New Playwright tests (reference-upload, pending/failure), R2 CORS docs, deploy hardening | pending |

`SPRITE_GENERATOR` defaults to `pixellab` (real PixelLab). `PORTRAIT_GENERATOR` defaults to `stub` for now — the nano-banana entry is registered but not yet wired into the API's `buildGeneratorRegistry`; flip it on by setting `PORTRAIT_GENERATOR=nano-banana` once a `GEMINI_API_KEY` is available. Either generator can be forced to `stub` for offline dev.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TS, Phaser sandboxed inside `<SpriteStage>` |
| API | Node + Hono + TS |
| DB | SQLite via Drizzle (Turso in prod, local file in dev) |
| Asset storage | Cloudflare R2 (S3-compatible), via `packages/shared/src/storage/r2.ts` |
| Sprites | PixelLab (real, default in Phase 1); `stub` retained for offline dev |
| Portraits | nano banana / Gemini 2.5 Flash Image (registered; wire-up flips default to `nano-banana` in Slice 5/6); `stub` retained |
| Voice | ElevenLabs (Phase 2+) |
| Hosting | Railway single-service (API serves `apps/web/dist`); Fly/Vercel split deferred |

The full stack rationale lives in [docs/phase-0-plan.md](docs/phase-0-plan.md) and [docs/phase-1-plan.md](docs/phase-1-plan.md); decisions log in [docs/decisions.md](docs/decisions.md).

## Repo layout

```
apps/
  api/           Hono server, Drizzle migrations (0000 + 0001), stub fixtures, vitest
  web/           Vite + React + Phaser
packages/
  shared/        schema, contracts, pose vocabulary, generator interfaces, R2 helper
                 generators/{stub,pixellab,nano-banana}/, storage/r2.ts
docs/            phase-0-plan, phase-1-plan, execution plans, decisions log
```

`packages/shared` is the only cross-app boundary — both apps import schema and contract types from there. Ownership and sandbox rules (Phaser stays in `<SpriteStage>`; provider SDKs stay in `packages/shared/generators/<provider>/`; `@aws-sdk/client-s3` stays in `packages/shared/src/storage/r2.ts`) are spelled out in [AGENTS.md](AGENTS.md).

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

`EDIT_KEY_PEPPER` is empty by default — the API logs a warning but still runs in dev. Set it in `.env.local` if you want hash parity with prod. With `PORTRAIT_GENERATOR=stub` and `SPRITE_GENERATOR=stub`, all provider / R2 keys can stay blank for offline dev. Otherwise:

- `SPRITE_GENERATOR=pixellab` (the default) requires `PIXELLAB_API_KEY` plus the four `R2_*` vars (the generator uploads sprite sheets straight to R2).
- `PORTRAIT_GENERATOR=nano-banana` requires `GEMINI_API_KEY` plus the same `R2_*` vars.
- `POST /api/uploads/reference` (the landing-page drop-zone) issues presigned R2 PUT URLs and therefore needs `R2_*` configured before reference uploads work — set `*_GENERATOR=stub` *and* skip the drop-zone for fully-offline dev.

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

Implemented in [apps/api/src/routes/characters.ts](apps/api/src/routes/characters.ts) and [apps/api/src/routes/uploads.ts](apps/api/src/routes/uploads.ts). All `/api/characters/*` mutating routes require auth.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health`, `/api/health` | — | liveness |
| POST | `/api/uploads/reference` | — | per-IP rate-limited; returns `{ uploadUrl, refImageUrl }` for direct R2 PUT |
| POST | `/api/characters` | — | accepts `{ prompt, refImageUrl? }`; creates character + kicks off portrait + idle pose; returns the `editKey` |
| GET | `/api/characters/:slug` | — | public read; the editor polls this every 2s while anything is `pending` |
| PATCH | `/api/characters/:slug` | yes | update name / attributes |
| POST | `/api/characters/:slug/portrait` | yes | 202 — async regeneration; row goes `pending → ready \| failed` |
| POST | `/api/characters/:slug/poses` | yes | 202 — body `{ name: 'idle' \| 'walk' \| 'attack' \| 'cast' }`, async |
| POST | `/api/characters/:slug/voice` | yes | stub — returns a fixed audio URL |
| POST | `/api/characters/:slug/rotate-key` | yes | rotates `editKey`, refreshes cookie |

**Async generation.** `POST /portrait` and `POST /poses` write `status: 'pending'` and return `202` immediately; the real generator runs in a background Promise and writes back `status: 'ready'` (with the asset URL) or `status: 'failed'` (with `errorMessage`). On boot, the API marks any `pending` row older than 5 minutes as `failed` so a process restart doesn't strand work.

**Daily caps.** Per character, per UTC day: 50 portrait regens and 100 pose regens. Counters increment on attempt (failed real-API calls still cost money). Over-cap returns `429` with `Retry-After`. See [docs/phase-1-plan.md](docs/phase-1-plan.md#cost-guardrails).

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
| `MIGRATE_ON_BOOT` | `1` | runs Drizzle migrations on startup (`0000` + `0001`) |
| `STUB_SOURCE` | `local` | serves stubs from `apps/api/fixtures/stubs/v1/` |
| `PORT` | (auto) | provided by Railway |
| `LOG_LEVEL` | `info` | optional |
| `PORTRAIT_GENERATOR` | `stub` (default) or `nano-banana` | `nano-banana` requires `GEMINI_API_KEY` + `R2_*` |
| `SPRITE_GENERATOR` | `pixellab` (default) or `stub` | `pixellab` requires `PIXELLAB_API_KEY` + `R2_*` |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | — | required whenever a real generator runs or the reference-upload endpoint is exposed |
| `REFERENCE_UPLOAD_MAX_BYTES` | `8388608` | server-side cap baked into the presigned PUT policy |

`CORS_ORIGIN` is **not** required while frontend + API share an origin. With every `*_GENERATOR=stub` and `STUB_SOURCE=local`, R2 / PixelLab / Gemini keys are unused — useful for a single-service smoke deploy.

**Verify after deploy:**

```bash
curl https://<your-url>.up.railway.app/health        # {"status":"ok",...}
curl https://<your-url>.up.railway.app/api/health    # same shape
open  https://<your-url>.up.railway.app/             # SPA loads
```

If `/health` works but DB writes fail, the volume probably isn't attached. If `/` 404s, `apps/web/dist` didn't build — check the Railway build log for the root `pnpm build` output.

## Documentation index

- [AGENTS.md](AGENTS.md) — agent / contributor conventions, ownership rules, recurring footguns
- [docs/phase-0-plan.md](docs/phase-0-plan.md) — Phase 0 spec: stack, data model, API, URL strategy, deliverables checklist
- [docs/phase-1-plan.md](docs/phase-1-plan.md) — Phase 1 spec: real generators, reference upload, async generation, cost caps
- [docs/execution-plan.md](docs/execution-plan.md) — Phase 0 slice structure and per-slice acceptance criteria
- [docs/phase-1-execution-plan.md](docs/phase-1-execution-plan.md) — Phase 1 slicing, per-thread prompts, parallel-work hygiene
- [docs/decisions.md](docs/decisions.md) — running decisions log

## Contributing

The hard rules — stay in your slice, don't change the data model or URL scheme without approval, justify new dependencies, one PR per slice, log unplanned decisions — all live in [AGENTS.md](AGENTS.md). Read it before opening a PR.

## License

[MIT](LICENSE) © Prachit Bhike.
