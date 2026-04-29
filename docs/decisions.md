# Decisions log

Append-only record of consequential decisions for Sojourn. Add an entry when a slice surfaces a call that wasn't pre-decided in the phase plan, or when an existing decision is revisited.

**Format per entry:**

```
## DNN — Short title (YYYY-MM-DD)

**Decision:** one sentence.
**Why:** 1–3 sentences.
**Alternatives considered:** bulleted list, one line each.
**Reversal cost:** low / medium / high — and a sentence on what makes it that.
```

Keep entries short. If a decision needs a long writeup, link out to a separate doc and summarize here.

---

## D01 — Frame-based animation, not rigged (2026-04-26)

**Decision:** sprites are PNG frames played as sprite sheets, not skeletal rigs.
**Why:** Nano banana's strength is character consistency across raster outputs; it doesn't produce rigs. Frame-based fits the model's grain. Rigged (Live2D / Spine / Rive) would make the AI image model a smaller part of the pipeline and require a manual rigging step per character.
**Alternatives considered:**
- Rigged via Live2D — high quality, but commercial license + manual rigging per character
- Rigged via Rive — designer-friendly, same rigging burden
- Hybrid (rigged base, generated textures) — most complex, deferred
**Reversal cost:** high — switching to rigs changes the renderer, the asset format, the schema, and the generation pipeline. Effectively a rewrite.

## D02 — Phaser stays as the renderer (2026-04-26)

**Decision:** use Phaser, sandboxed inside a single `<SpriteStage>` React component.
**Why:** User preference based on prior iteration's working code. Phaser is heavier than alternatives (PixiJS) but provides scenes, input, and animation primitives out of the box, and the prior repo proved it integrates cleanly when scoped to one component.
**Alternatives considered:**
- PixiJS — lighter, sprite-focused, no game-loop scaffolding; would require rebuilding scene/input glue
- Plain Canvas + custom loop — smallest bundle, most code to write
- CSS `animation: steps()` — works for static loops, fails for interactive scenes
**Reversal cost:** medium — the Phaser sandboxing means it lives behind one component's API, but porting that component is a real chunk of work.

## D03 — No accounts in Phase 0; edit-key-in-URL share model (2026-04-26)

**Decision:** characters are publicly readable at `/c/:slug`; editing requires `/c/:slug/edit?key=:editKey`. Edit key is a nanoid(24), hashed at rest, rotatable via API.
**Why:** "Shareable from day one" without the complexity of accounts. The rotation endpoint exists from Phase 0 so a leaked URL is recoverable. Accounts can layer on later by binding edit keys to users.
**Alternatives considered:**
- Magic-link auth from day one — more secure, slows down the share UX
- Open edit (anyone with URL can edit) — simpler, unsafe even for a prototype
- Cookie-only auth — breaks the "send a link to a friend" flow
**Reversal cost:** medium — adding accounts later means a migration to bind existing edit keys to users, but the URL scheme survives.

## D04 — Stack: Hono + Drizzle + Turso + R2 (2026-04-26)

**Decision:** Hono on Node for the API, Drizzle ORM, SQLite via Turso, Cloudflare R2 for assets.
**Why:** Lightweight TS-first stack with one obvious answer for each layer. Hono runs the same on Node and Bun, supports WebSocket for ElevenLabs streaming later. Turso lets dev (local SQLite file) and prod (libsql) share the same code. R2 has the cheapest egress for shared assets.
**Alternatives considered:**
- Express — older, larger surface, no real upside for this app
- Postgres (Neon, Supabase) — overkill for the data model; revisit if relational complexity grows
- Vercel Blob — simpler if hosting on Vercel, more expensive at scale, ties storage to one host
- S3 — more mature, more expensive egress
**Reversal cost:** medium per swap — Drizzle abstracts the DB, but R2/S3 SDK calls are everywhere.

## D05 — UX: reference-image-first + inspector panel + small AI-assist field (2026-04-26)

**Decision:** entry point is "describe character" or "upload reference image"; primary editor is a structured inspector panel; a single "describe a change" field is the open-ended escape hatch.
**Why:** Sprite creation has a bounded state space (character × poses × voice × scene), where structured UIs beat chat. Reference-image-first leans into nano banana's multi-image fusion — the actual differentiator vs. competitors using DALL-E/Imagen. The AI-assist field handles the long tail without being load-bearing.
**Alternatives considered:**
- Pure chat-driven — magical when it works, expensive to make work; intent routing, reference resolution, and undo are all hard
- Pure form/wizard — easy to build, no differentiation, feels like every other AI tool
- Game-style sliders — discrete generation doesn't match continuous controls
**Reversal cost:** low — UX is the most replaceable part of the app; the data model and APIs survive a rewrite.

## D06 — Hosting (Fly vs Railway) deferred (2026-04-26)

**Decision:** pick at first real deploy, not now. Build/start contract is `pnpm --filter api build && pnpm --filter api start` with `MIGRATE_ON_BOOT=1`.
**Why:** Both work for our needs (long-lived Node process, WebSocket support). Picking before deploying is theater — the actual choice depends on pricing tiers, region availability, and Vercel-side networking when we get there.
**Alternatives considered:**
- Vercel for everything — edge functions can't hold WebSocket connections needed for ElevenLabs streaming in Phase 2
- Self-host on a VPS — more ops burden than a single-developer project warrants
**Reversal cost:** low — both targets respect the same build/start contract; switching is a config change.

## D07 — Pixel art aesthetic (2026-04-26)

**Decision:** the target visual style is pixel art (Stardew / Undertale / classic 2D RPG lineage), not illustrated 2D or painterly.
**Why:** Forces the rest of the stack to a single coherent answer. Pixel art also tolerates the constraints of frame-based sprite generation better than illustrated styles — small canvases, discrete palettes, and clean silhouettes are *easier* to keep consistent across frames than painterly rendering.
**Alternatives considered:**
- Illustrated 2D (Hollow Knight / vtuber-style) — broader stylistic range, much harder to keep frame-coherent without pose-conditioned models
- Painterly / realistic — wrong fit for the sprite-sheet animation paradigm
- User-selectable per character — defers the decision but doubles every integration; revisit in Phase 3+
**Reversal cost:** medium — affects which generator(s) we integrate and the stub catalog dimensions, but the data model and renderer survive.

## D08 — PixelLab as primary sprite generator; nano banana reframed (2026-04-26, revises D04)

**Decision:** PixelLab is the primary generator for sprite poses and animations. Nano banana (Gemini 2.5 Flash Image) is retained for character *portraits* and reference-image fusion, not sprites.
**Why:** Nano banana is a general-purpose image model with strong character-identity consistency but no frame-to-frame coherence. Across an animation cycle it produces wobble (drifting proportions, palette shifts, framing variance), unreliable alpha, and unpredictable cropping — all especially fatal for pixel art, where viewers see every off-by-one pixel. PixelLab is purpose-built for sprites: native pixel-art output, animation as a single API primitive, skeleton-driven pose generation, sprite-sheet-ready dimensions. Nano banana still wins on portraits (high-fidelity static images for inspector cards / share previews) and reference fusion ("here's a photo + a style ref → one character design"), which then becomes the reference fed to PixelLab.
**Alternatives considered:**
- Nano banana alone — disappointing sprite results, would force significant post-processing (alpha cleanup, bounding-box re-cropping, frame alignment)
- Pose-conditioned diffusion (ControlNet + SDXL/Flux on Fal/Replicate) — would be the right call for *illustrated* sprites; wrong fit for pixel art where PixelLab is purpose-built
- Video model + frame extraction (Runway / Veo / Kling) — frame-coherent by construction, but expensive per output, less pose control, newer/less proven
- Scenario.gg or Layer.ai — game-asset focused but broader than sprites; PixelLab is more directly aimed at our use case
**Reversal cost:** medium — provider swap is contained behind the generator abstraction (D09), but switching aesthetics or generators later means re-running existing characters and reseeding the stub catalog.

## D09 — Generator abstraction in shared package (2026-04-26)

**Decision:** sprite and portrait generation routes through a `Generator` interface in `packages/shared`. Concrete implementations (`stub`, `pixellab`, `nano-banana`) are dispatched by a `generator` field on the relevant DB rows.
**Why:** D08 commits us to a multi-provider pipeline (PixelLab for sprites, nano banana for portraits). Hard-coding either provider in the API handlers would force a refactor when Phase 1 lands or when we revisit D08. Adding the abstraction in Phase 0 — while everything is stubbed — is the cheapest moment.
**Alternatives considered:**
- Hard-code in handlers, refactor later — classic shipping killer; the refactor lands exactly when the cost of churn matters most
- Plugin / strategy pattern with runtime registration — over-engineered for two providers
**Reversal cost:** low — interface lives in `packages/shared`, easy to extend or replace.

## D10 — Auth: cookie OR header, slug-namespaced (2026-04-26, refines D03)

**Decision:** the auth middleware accepts the edit key from EITHER the `X-Edit-Key` request header OR a slug-namespaced HttpOnly cookie `sojourn_edit_<slug>`. The cookie is set server-side at character creation and on every rotation. The URL `?key=…` remains the canonical shareable secret; the cookie is a UX convenience for refreshes and same-browser navigation.
**Why:** an earlier draft said cookies would be `HttpOnly` AND auth would be via the `X-Edit-Key` header, which is incoherent — JS can't read an `HttpOnly` cookie to populate the header. Accepting either solves it: the cookie carries auth automatically for browser sessions (HttpOnly survives, XSS can't steal it), the header path is for direct API calls / scripts / tools and for the very first request from a fresh browser (read from `?key=` in the URL once, then the response Set-Cookie takes over). Slug-namespacing the cookie prevents editing one character from logging you out of another.
**Alternatives considered:**
- Header only (drop `HttpOnly`) — exposes the key to any XSS
- Cookie only — breaks direct API use without a browser context
- Single un-namespaced cookie — overwrite collision when editing two characters
- localStorage — XSS-vulnerable, doesn't auto-attach to requests
**Reversal cost:** low — middleware change + one Set-Cookie call site.

## D11 — Fixed pose vocabulary in Phase 0 (2026-04-26)

**Decision:** Phase 0 supports exactly four pose names: `idle`, `walk`, `attack`, `cast`. The "+ Add pose" UI is constrained to a picker over this list; the API rejects unknown names with 400. Freeform pose names are deferred to Phase 2+.
**Why:** stubs are keyed by name (one PNG per pose), so freeform names would either need a fallback stub or fail confusingly. PixelLab in Phase 1 will likely have its own preferred vocabulary; freezing on a small known list now avoids inventing one we'll have to migrate. Validation at the API boundary also catches typos that would otherwise create orphan rows.
**Alternatives considered:**
- Freeform names with a default fallback stub — confusing UX, vague stub-asset semantics
- Larger preset list (run, jump, hurt, die, etc.) — premature; we don't have stubs for them and the catalog stays small
**Reversal cost:** low — vocabulary lives in one constant in `packages/shared`; expanding it is additive.

## D12 — Pose manifest shape: uniform spritesheet, not atlas (2026-04-26)

**Decision:** the per-pose manifest is `{ frameWidth, frameHeight, frameCount, frameRate, loop }` — a uniform sprite-sheet layout that maps directly onto Phaser's `load.spritesheet` + `anims.create`. Per-frame `{x, y, duration}` arrays are NOT used.
**Why:** an earlier sketch had per-frame `{x, y, duration}`, which is redundant when frames are uniform (every frame is `frameWidth × frameHeight` laid out in reading order) and is neither Phaser's spritesheet config nor its atlas format. The new shape is what Phaser actually consumes natively. Variable per-frame timing and non-uniform frame placement aren't needed for stub assets or, as far as we know, for PixelLab's output. If they ever are, extend `frameCount: number` to `frames: { duration: number }[]`.
**Alternatives considered:**
- Phaser atlas JSON (`{ frames: [{ filename, frame: {x,y,w,h} }] }`) — supports non-uniform layouts but PixelLab outputs uniform sheets, so the complexity buys nothing
- Per-frame durations from the start — over-built for current data
**Reversal cost:** low — additive extension if needed.

## D13 — Generator shape: two distinct interfaces, not one polymorphic method (2026-04-26, refines D09)

**Decision:** `packages/shared/generators` exposes two separate interfaces, `PortraitGenerator` and `SpriteGenerator`, each with a single method (`generatePortrait` / `generatePose`). The registry stores them in two separate maps keyed by their respective generator-id enum (`'stub' | 'nano-banana'` for portraits, `'stub' | 'pixellab'` for sprites). Handlers dispatch via `getPortraitGenerator(reg, character.portraitGenerator)` and `getSpriteGenerator(reg, pose.generator)`.
**Why:** D08 commits us to a per-artifact-type provider split — PixelLab will only ever produce sprites, nano banana will only ever produce portraits. A single polymorphic `generate(input)` method would force every impl to either implement an unused branch or throw at runtime, and the input/output unions would lose the type narrowing that's the whole point of having a typed interface. Two interfaces also mirror the schema field naming exactly (`characters.portraitGenerator`, `poses.generator`), so dispatch reads naturally.
**Alternatives considered:**
- Single interface with a polymorphic `generate({ type: 'portrait' | 'pose', ... })` — looks tidy in the abstract but every concrete impl would throw on the wrong branch and the result type would be a union the caller has to discriminate
- Single interface with both `generatePortrait` and `generatePose` methods, requiring impls to throw on the unsupported one — same runtime hazard, no type benefit
- Class hierarchy with abstract base — adds inheritance for no payoff; functions returning interface objects are simpler
**Reversal cost:** low — collapsing into one interface later is a mechanical refactor, the call sites are few and live in one slice.

## D14 — Web app routing + styling stack (2026-04-27)

**Decision:** Slice 4 introduces `react-router-dom` v7 (declarative API, equivalent to v6) for client-side routing, and CSS Modules + a single `global.css` for page-level styling. Component-internal styles stay inline (matching the Slice 3 demo).
**Why:** Three real routes (`/`, `/c/:slug`, `/c/:slug/edit`) plus a programmatic redirect after `POST /characters` is exactly the inflection where hand-rolling pathname checks costs more code than the dependency. CSS Modules give scoped class names, pseudo-class support, and grid layouts without a utility framework or styled-components. Component-level inline styles stay honest with Slice 3's pattern.
**Alternatives considered:**
- Hand-rolled pathname-switching (continues Slice 3's `App.tsx` style) — gets ugly with three routes plus search-params and programmatic navigation
- TanStack Router / Wouter / React Router v6 — `react-router-dom` is the de facto standard with no peer-dep cost; pinning to v6 would require a manual constraint that v7 already satisfies API-wise
- Tailwind / styled-components — both heavier than the slice needs and add justification debt
- Inline styles only (continue Slice 3) — workable but pseudo-classes and the editor's grid layout would balloon style objects
**Reversal cost:** low — routing is concentrated in `App.tsx` + `main.tsx`; style files are scoped per page.

## D17 — Slice 1 review hardening: atomic cap, sweep timing, presigned POST (2026-04-29)

**Decision:** four follow-up fixes on top of D16's Slice 1 work, surfaced by code review of [PR #12](https://github.com/prachitbhike/sojourn/pull/12). (1) The daily-cap middleware no longer writes `updatedAt` on the character row — that column is the startup sweep's "pending status changed N min ago" signal, and bumping it on every cap-passing request masked stuck portraits. (2) Cap check + counter bump moved into a single conditional `UPDATE … RETURNING` statement so concurrent requests can't both read N and both write N+1. (3) `POST /poses` body validation moved into a `validatePoseBody` middleware ahead of the cap so a 400 (bad pose name / malformed JSON) doesn't burn a daily-cap slot. (4) The R2 helper's `presignPutUrl` was replaced with `presignPostUrl` using `@aws-sdk/s3-presigned-post`'s `createPresignedPost` — the previous PUT + signed `content-length-range` *request header* approach doesn't work for browser uploads (browsers don't send that header), so we switched to the standard pattern of presigned POST + multipart form-data with a `content-length-range` *policy condition*.
**Why:** these four came out of a single review pass and are scoped to Slice 1 — better to land them inside the same Phase 1 foundations PR than to ship known footguns into Slices 2/3/4.
**Alternatives considered:**
- Add a dedicated `*StatusChangedAt` column for the sweep — more correct, but a schema migration beyond the review's scope; the simpler "don't bump `updatedAt` from the cap" fix lands the same property without a migration
- Keep `presignPutUrl` and document it as "Slice 4 will figure it out" — leaves a known-broken signature shape in place that Slice 4 would have to revisit anyway
- SQL-side cap check via two UPDATEs (rollover, then increment) — racy across concurrent requests; the single-statement CASE WHEN is genuinely atomic
**Reversal cost:** low — each fix is contained inside one file (cap.ts, characters.ts, r2.ts) and doesn't touch the public response shape; the R2 helper signature change matters only to as-yet-unwritten Slice 4 callers.

## D16 — Async generation: background tracker + stub-catalog placeholder for pending pose rows (2026-04-29)

**Decision:** Slice 1 of Phase 1 makes `POST /portrait` and `POST /poses` genuinely async — the handler writes status='pending', returns 202, and runs the generator in a fire-and-forget Promise. New pose rows insert with the stub catalog URL + manifest as placeholders so the NOT NULL columns are satisfied and the renderer has a coherent (if temporary) asset. A `BackgroundTracker` exposed via app deps lets vitest `drain()` in-flight work deterministically.
**Why:** Real PixelLab / nano-banana calls take seconds to minutes; the Phase 0 synchronous handler can't survive that without HTTP timeouts. The placeholder choice means a `pending` walk pose still loads through Phaser instead of throwing on an empty URL — the user sees a stand-in until the real asset lands. The tracker exists because fire-and-forget Promises are otherwise un-awaitable from tests, and "did it land?" assertions need a join point.
**Alternatives considered:**
- Make `spriteSheetUrl` / `manifest` nullable for pending rows — schema churn beyond the prompt's scope, and forces every reader to handle null
- Job queue (BullMQ / pg-boss) — overkill for a single Node process; reintroduce in Phase 2+ if generation needs durability across restarts
- Tests poll for status with timeouts — flaky, slow, hides ordering bugs
**Reversal cost:** low — the tracker is a single small module; flipping back to synchronous handlers (or to a real queue) is a contained change inside `routes/characters.ts`.

## D15 — Production `start` uses tsx as the runtime loader (2026-04-27)

**Decision:** the API's `start` script is `node --import tsx dist/index.js`. tsx moves from devDependency to runtime dependency. `@sojourn/shared` keeps its `exports` pointing at `.ts` source.
**Why:** `@sojourn/shared` ships TypeScript source (no build step). The api compiles fine to `dist/`, but `node dist/index.js` cannot resolve `@sojourn/shared/generators` because Node's ESM loader can't import `.ts`. Two options: (a) add a build step + dual-conditional `exports` to shared so it emits to `dist/`, or (b) keep shared as source-only and bridge with tsx at runtime. (b) is one line in `apps/api/package.json` and preserves dev/prod symmetry (tsx is already used in dev). (a) doubles the build surface and forces every consumer of shared to rebuild on changes. The runtime cost of tsx is a one-shot esbuild transform per file at startup — negligible for a single long-lived Node process.
**Alternatives considered:**
- Build shared to `dist/` with conditional exports (`{ "import": "./dist/...", "default": "./src/..." }`) — clean conceptually, but Vite/tsx/node all match `"import"` first, so dev paths break unless every consumer opts into a non-default condition. More moving parts than the bridge solves.
- Bundle shared into the api at build (esbuild) — adds a bundler dep just for one workspace import.
- `node --experimental-strip-types` — strips types but doesn't rewrite `./types.js` → `./types.ts`, so the cross-file imports inside shared still fail.
**Reversal cost:** low — flipping back to `node dist/index.js` is one line; the cost is paid only when shared grows a build step for unrelated reasons.

