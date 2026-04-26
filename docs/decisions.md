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
