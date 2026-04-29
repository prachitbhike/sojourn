# Execution plan — kicking off Phase 1

How to run Phase 1 across multiple Claude Code threads without drift, conflicts, or runaway diffs. Pairs with `phase-1-plan.md` (the *what*) and `decisions.md` (the *why*) — this doc is the *how*.

## Slicing

Phase 1 is split into 6 PR-sized chunks. Slice 1 must land first; 2, 3, 4, and 5 run in parallel after; 6 is sequential at the end.

```
[1 Foundations] ──┬──> [2 PixelLab generator]      ──┐
                  ├──> [3 nano banana generator]    ──┤
                  ├──> [4 Reference upload + UX]    ──┼──> [6 E2E + deploy hardening]
                  └──> [5 Editor pending/failure UX]──┘
```

| Slice | Ships | Owns | ~Effort |
|---|---|---|---|
| 1 — Foundations | Drizzle migration (errorMessage cols + cap counters), in-process async refactor of `/portrait` and `/poses` handlers, 5-min startup sweep, per-character daily cap middleware + 429 surface, R2 helper module (`uploadObject` + `presignPutUrl`), provider env-var wiring (`PORTRAIT_GENERATOR` / `SPRITE_GENERATOR`) reading from registry | `apps/api/**`, `packages/shared/src/storage/**`, `packages/shared/src/generators/registry.ts`, `packages/shared/src/schema.ts`, drizzle migration | full day |
| 2 — PixelLab generator | Real `pixellab` `SpriteGenerator` impl with R2 upload, manifest translation, failure-mode mapping; vitest with mocked HTTP | `packages/shared/src/generators/pixellab/**`, env additions in `.env.example` | full day |
| 3 — Nano banana generator | Real `nano-banana` `PortraitGenerator` impl with multi-image reference fusion, R2 upload, failure-mode mapping; vitest with mocked Gemini SDK | `packages/shared/src/generators/nano-banana/**`, env additions in `.env.example` | full day |
| 4 — Reference upload + landing UX | `POST /api/uploads/reference` presigned-PUT endpoint with per-IP rate limit and size cap, drop-zone on `/`, preview thumbnail, refImageUrl flows into `POST /characters` | `apps/api/src/routes/uploads.ts`, `apps/web/src/routes/landing.tsx`, related contracts | half day |
| 5 — Editor pending/failure UX + rotate-key | Polling hook on editor while anything pending, skeleton/shimmer pending states, failure UI with retry, rotate-key affordance, 429 cap banner | `apps/web/src/routes/editor.tsx`, `apps/web/src/api/**`, `apps/web/src/lib/**` | full day |
| 6 — E2E + deploy hardening | New Playwright test for reference-upload flow, regression run with `*_GENERATOR=stub`, R2 CORS doc in `.env.example`, deliverables checklist run-through | `e2e/**`, `.env.example`, infra docs | half day |

Total: ~4 days. Slices 2 and 3 grew from "half day" to "full day" because each owns real network calls + R2 upload + failure-mapping vitest. Slice 5 grew because pending/failure/cap is multiple distinct UI states with their own polling and retry semantics.

## Prompts to send each thread

Each prompt is self-contained — designed to be pasted into a fresh Claude Code thread that hasn't seen any of this conversation. Always tell the thread to read the planning docs first; if it doesn't reference them, the slice will drift.

### Slice 1 — Foundations

```
Read AGENTS.md, then docs/phase-1-plan.md end to end, then docs/decisions.md
(especially D08, D09, D11, D13 for context — Phase 1 must honor these without
revisiting them).

Your job is the Phase 1 foundations that every other slice depends on:

1. Drizzle migration `apps/api/drizzle/0001_phase_1_failures_and_caps.sql`
   adding to `characters`:
     - portraitErrorMessage TEXT NULL
     - portraitGenerationsToday INTEGER NOT NULL DEFAULT 0
     - poseGenerationsToday INTEGER NOT NULL DEFAULT 0
     - generationsTodayDate TEXT NOT NULL DEFAULT ''
   and to `poses`:
     - errorMessage TEXT NULL
   Update packages/shared/src/schema.ts to declare the same fields. No data
   backfill — defaults are fine.

2. R2 helper module at packages/shared/src/storage/r2.ts exposing two
   functions:
     - uploadObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<string>
       — uploads to s3://${R2_BUCKET}/${key}, returns public URL using R2_PUBLIC_BASE_URL.
     - presignPutUrl(key: string, contentType: string, expiresInSeconds: number, maxBytes: number): Promise<string>
       — returns a presigned PUT URL with Content-Length-Range condition.
   Use @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner (S3-compatible, R2
   speaks this). NO direct R2 calls anywhere else — generators and routes
   must import from here.

3. Async generation refactor in apps/api/src/routes/characters.ts. The
   current /portrait and /poses handlers are synchronous (stub returns
   immediately). Phase 1 makes them genuinely async:
     - Handler writes status='pending', returns 202 immediately with the
       pending row.
     - Generation happens in a background Promise (don't await). On
       resolution, write status='ready' + generated URL/manifest. On
       rejection, write status='failed' + errorMessage (truncate to ~500
       chars; full error goes to pino).
     - All dispatch still goes through the existing PortraitGenerator /
       SpriteGenerator interfaces — DO NOT inline any provider logic.

4. Startup sweep in apps/api/src/index.ts: on boot, mark any character with
   portraitStatus='pending' older than 5 minutes as 'failed' with
   portraitErrorMessage='API restarted during generation'. Same for
   poses.status. Use updatedAt to determine age.

5. Daily cap middleware applied to POST /portrait and POST /poses (after
   the existing edit-key auth middleware). Logic:
     - If character.generationsTodayDate !== current UTC date (YYYY-MM-DD),
       reset both counters to 0 and set the date.
     - For /portrait: if portraitGenerationsToday >= 50, return 429 with
       Retry-After header pointing at next UTC midnight (ISO timestamp
       in seconds-from-now form per RFC 7231).
     - For /poses: same logic with poseGenerationsToday >= 100.
     - On success path, increment the relevant counter.
   The cap counter increments on attempt, not on success — failed real-API
   calls still cost money and still count.

6. Provider env-var wiring. Add to apps/api/src/env.ts:
     - PORTRAIT_GENERATOR (default 'stub' — real default flips to
       'nano-banana' in Slice 3 once it ships)
     - SPRITE_GENERATOR (default 'stub' — flips to 'pixellab' in Slice 2)
   The existing registry at packages/shared/src/generators/registry.ts (or
   wherever Slice 2 of Phase 0 placed it) reads these env vars to choose
   the default generator id when a row's `generator` field is the env
   default. Per-row override via `character.portraitGenerator` /
   `pose.generator` still wins. DO NOT add 'pixellab' or 'nano-banana'
   registry entries — those land in Slices 2 and 3. Just leave the seam.

7. Update .env.example with the new env vars and a comment block documenting
   the provider-selection model. Keep PIXELLAB_API_KEY and GEMINI_API_KEY
   entries that already exist.

8. Vitest covering: cap middleware (under-cap pass, at-cap 429, date-rollover
   reset), startup sweep (pending row older than 5min → failed; fresh pending
   row untouched), async handler returns 202 + writes pending immediately,
   stub generator still works end-to-end.

Existing Phase 0 Playwright happy-path MUST still pass with `*_GENERATOR=stub`
— don't break the regression net.

Stay out of packages/shared/src/generators/pixellab/ and
packages/shared/src/generators/nano-banana/ (Slices 2 and 3). Stay out of
apps/web/** entirely (Slices 4 and 5).

Hard rules from AGENTS.md still apply: don't add deps not in the plan
without justification (the AWS SDK packages ARE justified — they're called
out in section 3 above and in phase-1-plan.md). Don't run `git add -A`.

Open a PR titled "Slice 1: Phase 1 foundations".
```

### Slice 2 — PixelLab generator (parallel with 3, 4, 5)

```
Read AGENTS.md, then docs/phase-1-plan.md (focus on "Generator
implementations" → PixelLab, and the section on failure modes), then
docs/decisions.md (especially D08, D11, D12, D13).

Your job is the real PixelLab SpriteGenerator:

1. Implement packages/shared/src/generators/pixellab/index.ts as a
   SpriteGenerator (the interface shape comes from
   packages/shared/src/generators/types.ts — read it first; don't change it).

2. The generatePose method must:
     - Call PixelLab with the character reference (use character.portraitUrl
       if set, plus an attributes summary), pose name, and target
       dimensions (64×64 frames per the Phase 0 stub catalog).
     - Translate PixelLab's response metadata into our PoseManifest shape
       { frameWidth, frameHeight, frameCount, frameRate, loop } per D12.
       PixelLab's actual frame count may differ from the stub catalog
       (e.g. 6 walk frames instead of 8) — pass through whatever PixelLab
       returns. The <SpriteStage> already takes manifest as a prop.
     - Upload the sprite sheet to R2 via the helper in
       packages/shared/src/storage/r2.ts (delivered by Slice 1) at
       characters/<slug>/<poseName>-<timestamp>.png.
     - Return { spriteSheetUrl, manifest }.

3. Failure mapping. Throw with a structured error type that downstream
   handlers can map to status='failed' + errorMessage:
     - 4xx / 5xx from PixelLab → throw { kind: 'provider', message }
     - Timeout (>60s) → throw { kind: 'timeout' }
     - Rate-limit (429) → throw { kind: 'rate_limit', retryAfterSeconds }
     - Malformed response (missing sheetUrl or unparseable metadata) →
       throw { kind: 'malformed', message }
   Caller (the /poses handler from Slice 1) does the actual DB write — your
   generator just throws; Slice 1's handler catches and persists.

4. Register the generator in packages/shared/src/generators/registry.ts as
   `'pixellab'`. Use lazy import or env-guarded import so missing
   PIXELLAB_API_KEY at boot doesn't crash a `*_GENERATOR=stub` deployment.

5. Add to .env.example:
     PIXELLAB_API_BASE=          # optional, default to PixelLab's prod URL
   PIXELLAB_API_KEY already exists from Phase 0 — just confirm it's read.

6. Once your generator is registered, flip the SPRITE_GENERATOR default
   in apps/api/src/env.ts from 'stub' to 'pixellab'. Keep the env-var
   override path so test/CI can still set 'stub'.

7. Vitest covering: success path (mock HTTP returns valid sheet+metadata,
   generator returns expected manifest+URL), each of the four failure
   modes maps to the right thrown error kind, manifest translation handles
   varying frame counts (verify a 6-frame walk doesn't get padded to 8).
   Mock @aws-sdk/client-s3's PutObjectCommand for the upload — don't hit R2
   from tests.

Don't touch apps/api/** beyond the env-var default flip in step 6 (Slice 1
owns the handlers). Don't touch apps/web/**. Don't touch
packages/shared/src/generators/nano-banana/** (Slice 3).

Open a PR titled "Slice 2: Real PixelLab sprite generator".
```

### Slice 3 — Nano banana generator (parallel with 2, 4, 5)

```
Read AGENTS.md, then docs/phase-1-plan.md (focus on "Generator
implementations" → nano banana, and reference-image fusion), then
docs/decisions.md (especially D05, D08, D09, D13).

Your job is the real nano banana (Gemini 2.5 Flash Image) PortraitGenerator:

1. Implement packages/shared/src/generators/nano-banana/index.ts as a
   PortraitGenerator (interface in packages/shared/src/generators/types.ts —
   don't change it).

2. The generatePortrait method must:
     - Build a Gemini 2.5 Flash Image request from { prompt, attributes,
       refImageUrl? }.
     - When refImageUrl is present, use multi-image reference fusion —
       this is D05's actual differentiator. Fetch the reference image,
       attach it to the request alongside the text prompt and any style
       refs implied by attributes (palette, expression, archetype).
     - Receive the generated portrait, upload to R2 via
       packages/shared/src/storage/r2.ts at
       characters/<slug>/portrait-<timestamp>.png.
     - Return the portrait URL.

3. Failure mapping — same shape as Slice 2:
     - 4xx / 5xx from Gemini → throw { kind: 'provider', message }
     - Timeout (>60s) → throw { kind: 'timeout' }
     - Rate limited → throw { kind: 'rate_limit', retryAfterSeconds }
     - Malformed response (no image bytes, unparseable) →
       throw { kind: 'malformed', message }
     - Reference image fetch failure (URL 404 / network) →
       throw { kind: 'malformed', message: 'reference unreachable' }
   Caller persists; you throw.

4. Register the generator in packages/shared/src/generators/registry.ts as
   `'nano-banana'`. Use lazy import so missing GEMINI_API_KEY at boot doesn't
   crash a `*_GENERATOR=stub` deployment.

5. Once registered, flip the PORTRAIT_GENERATOR default in
   apps/api/src/env.ts from 'stub' to 'nano-banana'. Keep the override path.
   GEMINI_API_KEY already exists in .env.example from Phase 0 — confirm it's
   read.

6. Vitest covering: prompt-only success path (no refImage), prompt+refImage
   path (verify the request includes multi-image content), each failure
   kind maps correctly, reference-fetch failure surfaces as 'malformed'
   (not 'provider' — the model never got called). Mock the Gemini SDK
   and the HTTP fetch for refImage; mock @aws-sdk/client-s3 for the upload.

Don't touch apps/api/** beyond the env-var default flip. Don't touch
apps/web/**. Don't touch packages/shared/src/generators/pixellab/**
(Slice 2).

If you and the Slice 2 thread both edit
packages/shared/src/generators/registry.ts at the same time and conflict,
resolve by keeping BOTH new entries — they're additive, no overwrite.

Open a PR titled "Slice 3: Real nano banana portrait generator".
```

### Slice 4 — Reference upload + landing UX (parallel with 2, 3, 5)

```
Read AGENTS.md, then docs/phase-1-plan.md (focus on "Reference upload" in
the API section and "UI shell deltas" → landing page), then docs/decisions.md
(especially D05).

Your job is the reference-image upload flow end-to-end:

1. Backend: POST /api/uploads/reference at apps/api/src/routes/uploads.ts.
   Returns { uploadUrl, refImageUrl }.
     - uploadUrl: presigned R2 PUT URL via the helper at
       packages/shared/src/storage/r2.ts (Slice 1 ships this). 5-minute
       expiry. Content-Length-Range condition enforces
       REFERENCE_UPLOAD_MAX_BYTES (default 8 MiB; add to .env.example).
     - refImageUrl: the public URL the client passes back to POST
       /characters once the upload completes.
     - Object key: uploads/refs/<random-nanoid>.<ext> — extension from
       Content-Type ('image/png' → 'png', 'image/jpeg' → 'jpg',
       'image/webp' → 'webp'; reject other types with 400).
   Endpoint is unauthed (no edit key exists yet — character not created)
   but rate-limited per-IP (in-memory token bucket: 10 req / 60s / IP is
   fine for Phase 1). 429 on over-limit.

2. Update POST /api/characters in apps/api/src/routes/characters.ts to
   accept { prompt, refImageUrl? } and store refImageUrl on
   characters.refImageUrl (the column already exists from Phase 0).

3. Frontend: drop-zone on apps/web/src/routes/landing.tsx.
     - Sits next to the prompt textarea (don't redesign the whole page —
       additive layout change).
     - Accepts PNG / JPEG / WebP up to 8 MiB. Reject others client-side
       with an inline error.
     - On file drop: shows a thumbnail preview. Behind the scenes:
         a) POST /api/uploads/reference to get { uploadUrl, refImageUrl }.
         b) PUT the image bytes to uploadUrl with the matching
            Content-Type header.
         c) Stash refImageUrl in component state.
     - On form submit: include refImageUrl in the POST /characters body
       when present.
     - Show a small "remove" affordance to clear an attached reference.

4. Update packages/shared/src/contracts.ts to reflect the new request
   shape (refImageUrl optional on createCharacter; new contract for the
   upload-slot response).

5. Vitest for the upload-slot endpoint: happy path, content-type rejection,
   per-IP rate limit. Mock packages/shared/src/storage/r2.ts.

Don't touch the editor route, viewer route, or any generator code. Don't
modify the auth middleware. The upload endpoint is intentionally unauthed
per phase-1-plan.md.

If you need an additional dep for image preview (you shouldn't — URL.createObjectURL
is sufficient), justify in PR description.

Open a PR titled "Slice 4: Reference upload + landing drop-zone".
```

### Slice 5 — Editor pending/failure UX + rotate-key (parallel with 2, 3, 4)

```
Read AGENTS.md, then docs/phase-1-plan.md (focus on "UI shell deltas" →
editor and "Cost guardrails"), then docs/decisions.md (especially D03, D10
for rotate-key context).

This is the largest UI slice. Use plan mode before writing code — show me
your plan for the polling hook and pending/failure state machine first.

Your job is the editor's pending/failure/cap UX and the rotate-key
affordance:

1. Polling hook at apps/web/src/lib/usePollWhilePending.ts (or similar):
     - Takes the current character state (with portraitStatus and
       poses[].status fields).
     - When ANY of those fields === 'pending', polls
       GET /api/characters/:slug every 2 seconds.
     - Stops polling when nothing is pending.
     - Returns the latest character state and an isPolling flag.
   Use this hook in apps/web/src/routes/editor.tsx — replace the static
   character state with the polled version.

2. Pending UI in apps/web/src/routes/editor.tsx:
     - Portrait panel: when portraitStatus === 'pending', show the
       previous portrait (if any) at reduced opacity with a spinner
       overlay; else show a skeleton box.
     - Pose grid: when a card's status === 'pending', show a shimmer
       (CSS animation) over the thumbnail position.
   Match the existing CSS Modules pattern in editor.module.css (see D14).

3. Failure UI:
     - When portraitStatus === 'failed': inline error text under the
       portrait ("regen failed — retry"), retry button calls POST
       /portrait. Show truncated portraitErrorMessage as hover tooltip.
     - When pose.status === 'failed': same inline error on the card,
       retry button calls POST /poses with that pose's name.

4. 429 cap surfacing:
     - Catch 429 responses from POST /portrait and POST /poses in the
       existing fetch helpers at apps/web/src/api/**.
     - On 429, show a banner: "daily generation limit reached — resets at
       midnight UTC". Include a Retry-After-derived countdown if practical
       (cheap).
     - Disable explicit Regenerate buttons while the cap banner is up;
       pause the visual-field auto-regen debounce.

5. Rotate-key affordance:
     - Add a small "Leaked your edit URL? Rotate key" link in the editor's
       footer or settings menu (your choice — match existing layout).
     - On click: confirm via window.confirm (no need for a custom modal in
       Phase 1), then call POST /api/characters/:slug/rotate-key. The
       endpoint already exists from Phase 0.
     - On success: response includes the new editKey. Server also issues
       a fresh Set-Cookie for the slug-namespaced cookie. Navigate
       (window.location.assign) to /c/:slug/edit?key=<newKey>. The
       browser is auth'd by the new cookie + new URL key on landing.

6. The visual-field auto-regen debounce (1.5s) from Phase 0 stays as-is —
   it just costs real money now. The cap counter is the safety net
   (Slice 1's middleware enforces it server-side).

Use the API surface as it exists after Slice 1 lands. Don't invent new
endpoints. The polling endpoint is the existing GET /api/characters/:slug —
no new endpoint needed.

Don't touch apps/api/** (Slice 1's territory). Don't touch
packages/shared/src/generators/** (Slices 2, 3). Don't touch the landing
page (Slice 4 — coordinate via .env.example if both slices add env vars,
but you shouldn't need any).

Stub-friendly: this slice must work end-to-end against
`PORTRAIT_GENERATOR=stub` and `SPRITE_GENERATOR=stub` (transitions are
near-instant but the UI states still flicker through pending → ready). Test
this manually before opening PR — don't wait for Slices 2/3.

Open a PR titled "Slice 5: Editor pending/failure UX + rotate-key".
```

### Slice 6 — E2E + deploy hardening

```
Read AGENTS.md, then docs/phase-1-plan.md (focus on "Concrete deliverables
to call Phase 1 done"), then docs/decisions.md.

Your job is verification + deploy prep for Phase 1:

1. Add a Playwright test at e2e/tests/phase-1-reference-upload.spec.ts
   exercising the new reference-upload flow:
     a) Visit /, drop a fixture image into the drop-zone (use a small
        committed PNG at e2e/fixtures/reference.png).
     b) Wait for the thumbnail preview to render.
     c) Fill in the prompt, submit.
     d) Redirected to /c/:slug/edit?key=… with the cookie set.
     e) refImageUrl is reflected in the GET /api/characters/:slug response
        (assert via a follow-up fetch, not just the URL).
   Run with `*_GENERATOR=stub` so this is deterministic and free.

2. Add a Playwright test at
   e2e/tests/phase-1-pending-and-failure.spec.ts using a deliberately
   slow stub variant (env STUB_DELAY_MS=2000 — ask Slice 1's thread or
   add it yourself if missing) to verify:
     a) Adding a pose shows the pending shimmer.
     b) When generation completes, the shimmer is replaced by the played
        pose.
     c) A failed pose (force via STUB_FAIL=walk env) shows the retry
        affordance and clicking retry works after STUB_FAIL is cleared.

3. The Phase 0 happy-path Playwright test (e2e/tests/phase-0-happy-path.spec.ts
   or wherever it lives — Slice 5 of Phase 0 added it) MUST still pass
   under `*_GENERATOR=stub`. Run it; if it fails, that's a regression
   from Slice 1, 4, or 5 — open an issue, don't fix-and-bundle.

4. R2 CORS docs in .env.example. Add a comment block above R2 vars
   documenting the bucket-CORS JSON required for cross-origin presigned
   PUT from the frontend domain (AllowedOrigins = frontend prod URL,
   AllowedMethods = ['PUT'], AllowedHeaders = ['Content-Type'],
   ExposeHeaders = ['ETag'], MaxAgeSeconds = 3600).

5. Run the deliverables checklist from docs/phase-1-plan.md by hand
   against a real-provider config (PORTRAIT_GENERATOR=nano-banana,
   SPRITE_GENERATOR=pixellab) once you have keys. Report which items
   pass and which need fixes — open issues for fixes, don't bundle into
   this slice.

6. Confirm the build/start contract still works:
   `pnpm --filter api build && pnpm --filter api start` boots cleanly
   with MIGRATE_ON_BOOT=1 and the new 0001 migration applies.

Don't pick Fly vs Railway (still deferred per D06). Don't add monitoring
/ APM yet — pino stdout is fine through Phase 1.

Open a PR titled "Slice 6: Phase 1 E2E + deploy hardening".
```

## Per-slice review checklist

Run this on every slice's PR before merging. Don't merge if any item fails.

- [ ] Diff stays within the slice's documented file ownership (no surprise refactors)
- [ ] No new deps that aren't justified in the slice prompt or PR description
- [ ] Schema migration matches `phase-1-plan.md` exactly (Slice 1 only) — flag any drift loudly
- [ ] No PixelLab SDK imports outside `packages/shared/src/generators/pixellab/`
- [ ] No Gemini / nano banana SDK imports outside `packages/shared/src/generators/nano-banana/`
- [ ] No direct `@aws-sdk/client-s3` calls outside `packages/shared/src/storage/r2.ts`
- [ ] No Phaser imports outside `apps/web/src/components/SpriteStage/` (Phase 0 boundary preserved)
- [ ] Slice's acceptance criteria from `phase-1-plan.md` actually run locally — don't trust the PR description, run them
- [ ] `pnpm typecheck`, `pnpm lint`, and the relevant `pnpm test` filter pass
- [ ] Phase 0 happy-path Playwright still passes against `*_GENERATOR=stub` (regression net)
- [ ] If a new decision was made that wasn't in `phase-1-plan.md`, `docs/decisions.md` has a new entry (D16+)
- [ ] Run `/review` (Claude Code's built-in PR review skill) — read its output even if you disagree

## Order of operations

1. **Open Slice 1 thread.** This is the longest slice and gates everything else. While it runs, sort out PixelLab and Gemini API access (keys, billing, quota limits, region availability for nano banana).
2. **Review + merge Slice 1.** Run the deliverables locally before merging — async refactor + cap middleware are subtle, the vitest matters.
3. **Open four worktrees, kick off Slices 2, 3, 4, 5 in parallel.** Different threads, different branches off the merged Slice 1 base. Slice 5 should use plan mode (it's the largest UI slice).
4. **Review + merge each.** If 2 and 3 conflict in `packages/shared/src/generators/registry.ts`, keep both new entries — they're additive. If 4 and 5 conflict in shared web utility files (unlikely — different routes), resolve manually.
5. **Open Slice 6 thread.** Last one. Runs end-to-end against the merged stack.
6. **Run the deliverables checklist yourself end-to-end** against real providers before declaring Phase 1 done.

## What to do when a slice goes sideways

- **Thread invents a new generator interface shape:** stop the thread, point at D13 and `packages/shared/src/generators/types.ts`. The interface is locked from Phase 0; Phase 1 fills it in, doesn't remold it.
- **Thread tries to silently fall back to stub on real-API failure:** push back hard. Phase 1 commits to explicit failure (item 5 in "Decisions, push back if any are wrong"). Silent fallback hides bugs and obscures cost.
- **Thread proposes a queue / worker process for async generation:** push back hard. Phase 1 commits to in-process async (item 1). Queues land when horizontal scale forces them, not before.
- **Slice 2 or 3 starts importing R2 SDK directly instead of going through the helper:** stop the thread; the helper exists specifically so the swap surface stays small.
- **Slice 5 starts polling more aggressively than 2s, or polling when nothing is pending:** push back. Polling cost is small but non-zero, and the editor stays open for long stretches.
- **Stub generator stops working under `*_GENERATOR=stub` after a slice lands:** that's a regression — block the merge. Stub is the offline-dev fallback and the CI default.
- **Two parallel slices conflict in `packages/shared/`:** resolve once, then update the relevant ownership notes here so the next phase doesn't repeat it.
- **A decision surfaces that wasn't in the plan:** add it to `docs/decisions.md` *before* implementing. Decisions that only live in code are decisions you'll forget you made.
