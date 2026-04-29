# Phase 1 — Real generators + reference-image upload

The point of Phase 1 is to swap the stub generators for real ones — **PixelLab** for sprite poses, **nano banana (Gemini 2.5 Flash Image)** for portraits — and add the reference-image upload UX that was deferred from Phase 0. The data model, URL/share/edit-key flow, and Phaser rendering loop all survive Phase 0 unchanged. Phase 1 is integration work, not redesign — the generator seam (D09, D13) was built specifically so this would be a contained change.

## Stack additions

| Layer | Phase 0 | Phase 1 |
|---|---|---|
| Sprites | `stub` generator only | `pixellab` generator (real PixelLab API) + `stub` retained as offline-dev fallback |
| Portraits | `stub` generator only | `nano-banana` generator (Gemini 2.5 Flash Image) + `stub` retained |
| R2 | wired, stubs uploaded once | exercised for real per-character/per-pose asset writes |
| Reference images | not in Phase 0 | drop-zone UI on landing → presigned R2 PUT → `refImageUrl` flows into nano banana |
| Async generation | endpoints returned 202 but stubs were synchronous | endpoints actually return 202; generation runs in background; `status` transitions `pending → ready | failed` mean something |

Generator boundaries from D08, D09, and D13 are unchanged. PixelLab code lives only in `packages/shared/generators/pixellab/`; nano banana code lives only in `packages/shared/generators/nano-banana/`. API handlers continue to dispatch through the `PortraitGenerator` and `SpriteGenerator` interfaces — no provider SDK imports outside their own folder.

## What's *not* changing

- Schema shape — Phase 0 schema already declared every field Phase 1 needs (`portraitGenerator`, `poses[].generator`, `portraitStatus`, `poses[].status`, `refImageUrl`). The enum strings `'pixellab'` and `'nano-banana'` are already in the type definitions; Phase 1 just starts emitting rows that use them.
- URL/share/edit-key model (D03, D10) — public read at `/c/:slug`, edit at `/c/:slug/edit?key=…`, slug-namespaced HttpOnly cookie or `X-Edit-Key` header. Same as Phase 0.
- Pose vocabulary (D11) — fixed at `['idle','walk','attack','cast']`. Freeform names still deferred to Phase 2+.
- `PoseManifest` shape (D12) — `{ frameWidth, frameHeight, frameCount, frameRate, loop }`. PixelLab output must conform; if it doesn't natively, the adapter in `packages/shared/generators/pixellab/` translates.
- Generator interfaces (D13) — two distinct `PortraitGenerator` and `SpriteGenerator` interfaces. New impls slot in; the seam doesn't move.
- `<SpriteStage>` (D02) — Phaser stays sandboxed in the one component. Real sprite sheets must round-trip through the same load path stubs use.

## Data model deltas

One small additive change: an optional `errorMessage: text | null` column on both `characters` (for portrait failures) and `poses` (for sprite failures). Surfaces in pino logs and in the editor's failure UI. Nullable so Phase 0 rows don't need backfill.

```ts
characters: {
  // ... all Phase 0 fields ...
  portraitErrorMessage: text | null         // populated when portraitStatus = 'failed'
  portraitGenerationsToday: integer         // counter for portrait cap (default 0)
  poseGenerationsToday: integer             // counter for pose cap (default 0)
  generationsTodayDate: text                // YYYY-MM-DD; both counters reset when this !== current UTC date
}

poses: {
  // ... all Phase 0 fields ...
  errorMessage: text | null                 // populated when status = 'failed'
}
```

A single Drizzle migration (`0001_phase_1_failures_and_caps.sql`) adds these four columns. No data backfill — defaults (`null`, `0`, `''`) are fine. The two counters are separate so the portrait cap (50/day) and pose cap (100/day) don't fight each other.

## API surface deltas

```
POST   /api/uploads/reference          (auth: rate-limited unauth OK)  → { uploadUrl, refImageUrl }
POST   /api/characters                 { prompt, refImageUrl? }        → { slug, editKey }   *refImage returns*
POST   /api/characters/:slug/portrait  (auth)                          → 202   *now genuinely async*
POST   /api/characters/:slug/poses     (auth) { name }                 → 202   *now genuinely async*
```

Everything else (`GET /:slug`, `PATCH`, `POST /voice`, `POST /rotate-key`, `GET /api/stubs/v1/*`) unchanged from Phase 0.

### Reference upload

Two-step presigned-PUT flow:

1. Client requests an upload slot — `POST /api/uploads/reference` returns `{ uploadUrl, refImageUrl }`. `uploadUrl` is a presigned R2 PUT URL valid for ~5 minutes; `refImageUrl` is the public URL the client will pass to `POST /characters` once the upload completes.
2. Client uploads the image bytes directly to R2 via the presigned URL (PUT, no auth, no API hop).
3. Client posts `POST /characters` with `{ prompt, refImageUrl }`. The API never streams binary.

Why two-step over multipart through the API: keeps Hono out of the binary-streaming business, makes it trivial to add client-side compression / format checks before upload, and gives us a natural rate-limit chokepoint at the upload-slot endpoint instead of mid-multipart. Slot endpoint is unauthed (no edit key yet — character doesn't exist) but rate-limited per-IP.

### Async generation

`POST /portrait` and `POST /poses` return `202` immediately, write `status: 'pending'`, and kick off background work. Mechanism in Phase 1: in-process async (start a Promise, write the result to the DB on resolution). No queue or worker process — single Node instance is sufficient until horizontal scale forces the issue. Document the limitation: if the API process restarts mid-generation, the row stays `pending` indefinitely. Phase 1 mitigation: a startup sweep that marks any `pending` rows older than 5 minutes as `failed` with `errorMessage = 'API restarted during generation'`. Phase 3+ revisit when we add multi-instance.

### Status updates

The editor polls `GET /api/characters/:slug` every 2 seconds whenever any tracked artifact (`portrait` or any pose) is in `pending` state. Polling stops when nothing is pending. SSE/WebSocket deferred to Phase 2, when ElevenLabs streaming forces a WS anyway — adding it now would be premature.

### Failure surface

All failure paths — rate limits, timeouts, malformed responses, invalid keys, network errors — terminate at `status: 'failed'` plus a structured pino log entry and an `errorMessage` on the row. **No silent fallback to stub.** Explicit failure is more debuggable than mystery-stub output. The UI's retry affordance simply re-calls the same endpoint.

## Generator implementations

### `packages/shared/generators/pixellab/`

Implements `SpriteGenerator.generatePose({ characterRef, poseName, attributes })`:

1. Calls PixelLab with the character reference (portrait URL + attributes summary), pose name, and target dimensions.
2. Receives a sprite sheet (PNG) + frame metadata.
3. Translates PixelLab's metadata into our `PoseManifest` shape — `{ frameWidth, frameHeight, frameCount, frameRate, loop }`. PixelLab's actual output frame count may not match the stub catalog (e.g. PixelLab might return 6 walk frames instead of 8); the adapter passes through whatever PixelLab returns, doesn't force stub-catalog dimensions. The `<SpriteStage>` already takes `manifest` as a prop — varying frame counts work without renderer changes.
4. Uploads the sheet to R2 at `s3://sojourn-assets/characters/<slug>/<poseName>-<timestamp>.png`.
5. Returns `{ spriteSheetUrl, manifest }`.

Failure modes:
- PixelLab API errors (4xx / 5xx) → throw, caller sets `status: 'failed'` + `errorMessage`.
- Timeout (>60s) → throw, same handling.
- Malformed response (missing sheet URL or unparseable metadata) → throw, same handling.
- Rate limited → throw with a distinct error code so callers can surface "try again in N seconds" in the UI.

### `packages/shared/generators/nano-banana/`

Implements `PortraitGenerator.generatePortrait({ prompt, attributes, refImageUrl? })`:

1. Builds a Gemini 2.5 Flash Image request. When `refImageUrl` is present, uses multi-image reference fusion (D05's actual differentiator) — PixelLab gets a high-fidelity reference for the sprite work that follows.
2. Receives the generated portrait.
3. Uploads to R2 at `s3://sojourn-assets/characters/<slug>/portrait-<timestamp>.png`.
4. Returns the portrait URL.

Failure modes match the PixelLab adapter — throw on any non-success, caller writes `status: 'failed'` + `errorMessage`.

### Provider selection

Two new env vars:

```
PORTRAIT_GENERATOR=nano-banana   # nano-banana | stub
SPRITE_GENERATOR=pixellab        # pixellab | stub
```

Defaults: `nano-banana` / `pixellab` in prod, `stub` in test/CI. Per-row `generator` field in the DB still overrides for forward-compat — if we ever ship a character with `portraitGenerator: 'stub'`, regen calls dispatch to stub regardless of env.

## UI shell deltas

### Landing page (`/`)

- Adds a drop-zone next to the prompt textarea. Accepts PNG/JPEG/WebP up to a few MB.
- On file drop: shows a thumbnail preview. Behind the scenes, calls `POST /api/uploads/reference`, PUTs to the presigned URL, stashes the resulting `refImageUrl` in component state.
- On submit: posts `{ prompt, refImageUrl? }` to `POST /api/characters`, redirects to `/c/:slug/edit?key=…` same as Phase 0. The cookie still gets set server-side at creation.

### Editor (`/c/:slug/edit`)

- **Pending states:** portrait panel renders a skeleton (or the previous portrait at reduced opacity with a spinner overlay) while `portraitStatus === 'pending'`. Pose cards in the grid show a pending shimmer when their `status === 'pending'`. The editor polls `GET /:slug` while anything is pending; updates render when the row transitions to `ready`.
- **Failure UI:** when `status === 'failed'`, the affected panel/card shows a small inline error ("regen failed — retry") with the `errorMessage` truncated as hover-text. The retry button calls the same `POST /portrait` or `POST /poses` it would normally call. Counter persists — failed retries count against the daily cap (see below).
- **Rotate-key affordance:** small "leaked your edit URL? rotate" link in the editor's footer or settings menu. Clicks call `POST /rotate-key` (which already exists from Phase 0), then navigate to `/c/:slug/edit?key=<new>`. The `Set-Cookie` from the rotate response means the browser is auth'd for the new key by the time the navigation lands.
- **Cap-exceeded UI:** when the API returns `429`, the inspector's auto-regen pauses and a banner shows "daily generation limit reached — resets at midnight UTC". Explicit Regenerate buttons gray out.

### Public viewer (`/c/:slug`)

No changes from Phase 0. Pending portraits render the skeleton (anonymous viewers might land while a regen is in flight); failed portraits render whatever the last successful one was, or a placeholder if none. No retry affordance in the public view.

## Cost guardrails

Phase 0's debounced auto-regen on visual fields (1.5s after edit) was free with stubs. Real nano banana costs money per call. **Keep the auto-regen** — it's the magic of Phase 0's UX — but cap it.

- Per-character daily cap: 50 portrait regens, 100 pose regens. Separate counters on `characters.portraitGenerationsToday` and `characters.poseGenerationsToday`, both reset when `generationsTodayDate !== today` (UTC).
- Soft-enforced server-side: the auth middleware checks the cap *after* validating the edit key. Over-cap returns `429` with a `Retry-After` header pointing at next UTC midnight.
- The cap is per-character, not per-IP or global — aligned with the no-accounts-yet model. If an attacker steals an edit URL, they can burn 150 generations per day per character; that's bounded and recoverable via rotate-key.
- Phase 3 (when accounts land) will add per-user budgets on top.

## Concrete deliverables to call Phase 1 done

- [ ] `POST /` with prompt only → real portrait via nano banana, no stub fallback (unless `PORTRAIT_GENERATOR=stub`)
- [ ] `POST /` with prompt + reference image → drop-zone uploads to R2 via presigned URL, nano banana fuses the reference, resulting portrait reflects the input
- [ ] Editor: editing a visual field debounces, fires `POST /portrait`, panel shows pending state, then renders the new real portrait when generation completes
- [ ] Editor: "+ Add pose" with name `walk` → pose card appears with pending state, real PixelLab sprite plays on the Phaser stage when generation completes
- [ ] Editor pending poll: while anything is pending, `GET /:slug` is polled every 2s; polling stops when nothing is pending
- [ ] Editor: `errorMessage` surfaces when generation fails; retry button re-calls the same endpoint
- [ ] Force a portrait failure (set `GEMINI_API_KEY=invalid`, regenerate) → `portraitStatus === 'failed'`, `errorMessage` populated, retry UI appears, retry succeeds when the key is restored
- [ ] Per-character daily cap returns `429` once exceeded; UI shows the "limit reached" banner; counter resets at next UTC midnight
- [ ] Rotate-key UI mints a new key, browser navigates to new edit URL, old key returns `401`
- [ ] Stub generator still works: `PORTRAIT_GENERATOR=stub` and `SPRITE_GENERATOR=stub` boots and runs end-to-end without API keys (offline dev path)
- [ ] Phase 0 Playwright happy-path still passes against `*_GENERATOR=stub` (regression net intact)
- [ ] One new Playwright test that exercises the reference-upload flow against stubs (drop image → presigned upload → character creation with `refImageUrl` → editor renders)
- [ ] Startup sweep: `pending` rows older than 5 minutes are marked `failed` with `errorMessage = 'API restarted during generation'`
- [ ] pino structured logs on every generator call (start, success, failure) including provider, character slug, and duration

## Decisions, push back if any are wrong

These are calls Phase 1 commits to. Each will land as an entry in `docs/decisions.md` (D16+) when the implementing thread starts.

1. **In-process async over a queue.** Single Node instance is fine for now; queue/worker lands when horizontal scale forces it (Phase 3+). Risk: process restart loses in-flight generations — mitigated by the 5-minute startup sweep.
2. **Two-step presigned R2 upload over multipart-through-API for reference images.** API stays out of binary streaming; rate-limit chokepoint is at the slot-issue endpoint.
3. **Polling over SSE/WebSocket for status.** SSE/WS comes in Phase 2 with ElevenLabs (which forces a WS connection regardless). Adding it now is premature.
4. **Per-character daily cap over per-IP or global rate-limit.** Aligned with no-accounts-yet and the share-by-URL model. Per-user budgets layer on in Phase 3.
5. **No silent fallback to stub on real-generator failure.** Failures surface explicitly with `errorMessage` — debuggability over magic.
6. **Provider env vars (`PORTRAIT_GENERATOR`, `SPRITE_GENERATOR`) with `'stub'` fallback for offline dev.** Per-row `generator` field still overrides for forward-compat.

## Infra glue

- **R2 CORS:** the bucket needs CORS for `PUT` from the frontend origin so presigned-URL uploads work cross-origin in prod. Document the bucket-CORS JSON in `.env.example` comments.
- **Env vars added:**
  ```
  PORTRAIT_GENERATOR=nano-banana
  SPRITE_GENERATOR=pixellab
  PIXELLAB_API_BASE=                  # if PixelLab needs a base URL override
  REFERENCE_UPLOAD_MAX_BYTES=8388608  # 8 MiB, enforced server-side via presigned URL conditions
  ```
  `PIXELLAB_API_KEY` and `GEMINI_API_KEY` placeholders already exist from Phase 0 — Phase 1 just starts reading them.
- **R2 prefix layout:** `stubs/v1/*` (Phase 0, unchanged) coexists with `characters/<slug>/*` (Phase 1). Lifecycle policies and bucket-level access patterns documented in `.env.example` comments.
- **R2 helper module:** a single `packages/shared/storage/r2.ts` (or equivalent) exposes `uploadObject(key, body, contentType)` and `presignPutUrl(key, expiresInSeconds)`. Both real generators (`pixellab`, `nano-banana`) and the reference-upload endpoint use this — no direct AWS SDK calls in handlers or generators.
- **Provider registry:** `packages/shared/generators/registry.ts` (already exists from Slice 2 of Phase 0) gains real entries for `'pixellab'` and `'nano-banana'`. The registry is the single dispatch point — handlers continue to call `getPortraitGenerator(reg, character.portraitGenerator)` / `getSpriteGenerator(reg, pose.generator)` exactly as in Phase 0.

## What's *not* in Phase 1 (and why)

- Real ElevenLabs / voice → Phase 2
- Lipsync of any kind → Phase 2
- AI-assist field actually working → Phase 2+ (still appends to a local transcript only)
- Freeform pose names → Phase 2+ (fixed `idle/walk/attack/cast` vocabulary stays — D11)
- SSE/WebSocket for status updates → Phase 2 (with ElevenLabs)
- Public gallery / discovery → Phase 3
- User accounts → Phase 3
- Background job queue / multi-instance scaling → Phase 3+
- Per-user / per-account budgets → Phase 3 (per-character cap is the Phase 1 answer)

## Estimated effort

~3–4 days of focused work. Two real generator integrations (≈1 day each, including failure-mode handling and R2 upload), reference-upload UX + presigned-PUT plumbing (~half a day), editor pending/failure states + rotate-key UI (~half a day), cost-cap counter + 429 surface + Playwright additions (~half a day). The seam was built in Phase 0 specifically so this lands as integration work — if any of the above feels like redesign, stop and re-read D08, D09, D13.
