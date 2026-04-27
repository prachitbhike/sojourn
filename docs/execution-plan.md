# Execution plan — kicking off Phase 0

How to run Phase 0 across multiple Claude Code threads without drift, conflicts, or runaway diffs. Pairs with `phase-0-plan.md` (the *what*) and `decisions.md` (the *why*) — this doc is the *how*.

## Slicing

Phase 0 is split into 5 PR-sized chunks. Slice 1 must land first; 2 and 3 run in parallel; 4 and 5 are sequential after.

```
[1 Scaffold] ──┬──> [2 API + auth + generators] ──┐
               │                                    ├──> [4 Editor + viewer] ──> [5 E2E + deploy]
               └──> [3 SpriteStage] ────────────────┘
```

| Slice | Ships | Owns | ~Effort |
|---|---|---|---|
| 1 — Scaffold | pnpm workspace, Vite shell, Hono `/health` + `/api/stubs/v1/*` static serve, Drizzle schema + migration, stub fixtures (portrait + sprites + per-pose `.json` manifests), `.env.example`, `pnpm dev` | new files only | half day |
| 2 — API + auth + generators | All 7 endpoints, edit-key auth (header OR slug-namespaced HttpOnly cookie), rotation, pose-name validation, pino, CORS, `Generator` interface in `packages/shared/generators` with `stub` impl, vitest for auth | `apps/api/**` and `packages/shared/generators/**` | full day |
| 3 — SpriteStage | `<SpriteStage>` React component wrapping Phaser, imperative handle, `/dev/stage` demo route loading stub manifests | `apps/web/src/components/SpriteStage/**` + `apps/web/src/routes/dev/**` | half day |
| 4 — Editor + viewer | Editor page (inspector + portrait panel + pose grid + AI-assist stub), public viewer, edit-key URL→cookie, "this is the edit URL" banner | `apps/web/src/routes/**` | full day |
| 5 — E2E + deploy | Playwright happy-path, R2 wired with stubs uploaded once, prod CORS config, deliverables checklist run-through | `e2e/`, infra config | half day |

Total: ~3 days. Slice 2 grew from "half day" to "full day" because it now owns the generator interface and the additional `/portrait` endpoint.

## Prompts to send each thread

Each prompt is self-contained — designed to be pasted into a fresh Claude Code thread that hasn't seen any of this conversation. Always tell the thread to read the planning docs first; if it doesn't reference them, the slice will drift.

### Slice 1 — Scaffold

```
Read AGENTS.md, then docs/phase-0-plan.md end to end, then docs/decisions.md (especially D03 share model, D08 generator split, D09 generator abstraction).

Your job is the Phase 0 scaffold:

- pnpm workspace with `apps/web` (Vite + React + TS), `apps/api` (Hono + TS),
  and `packages/shared` for cross-app types
- Drizzle SQLite schema matching docs/phase-0-plan.md exactly:
  `characters` (with `portraitUrl`, `portraitGenerator`, `portraitStatus`)
  and `poses` (with `generator`, `status`). JSON columns use
  `text({ mode: 'json' })` — NOT `jsonb` (that's Postgres). Indexes
  (`slug` unique, `(characterId, name)` unique on poses) and
  ON DELETE CASCADE per the plan.
- First migration committed under apps/api/drizzle/
- `.env.example` matching the env vars table in the plan, including the
  PIXELLAB_API_KEY placeholder
- Stub asset catalog committed at apps/api/fixtures/stubs/v1/ — use
  solid-color placeholder PNGs at the documented dimensions (portrait
  512×512, sprites 64×64 per frame). Each pose ships with `<name>.png`
  AND `<name>.json` matching the `PoseManifest` shape in the plan
  (`{ frameWidth, frameHeight, frameCount, frameRate, loop }`).
- Hono server has `/health` AND a static-file route `GET /api/stubs/v1/*`
  that serves files from `apps/api/fixtures/stubs/v1/` with appropriate
  cache headers and content types. This is the URL the SpriteStage and
  generators use in dev. NO business endpoints yet.
- `pnpm dev` boots web and api with hot reload; Vite proxies /api to
  the Node server so dev is same-origin (and the stub URLs work
  unchanged in prod when STUB_SOURCE=r2 takes over the same paths).

Stop when `pnpm dev` works, `pnpm --filter api db:migrate` runs cleanly,
and the stub fixtures are reachable in a browser at
http://localhost:5173/api/stubs/v1/portrait.png (proxied through Vite to
the API). Open a PR titled "Slice 1: Phase 0 scaffold" and link to
docs/phase-0-plan.md in the description.

Hard rules from AGENTS.md still apply: don't add deps not in the plan
without justification; don't run `git add -A`.
```

### Slice 2 — API + auth + generators (parallel with Slice 3)

```
Read AGENTS.md, then docs/phase-0-plan.md (focus on the API surface,
data model, and infra glue sections), then docs/decisions.md (especially
D03 edit-key model, D08 generator split, D09 generator abstraction).

Your job is the Phase 0 API + the generator seam:

1. Define the `Generator` interface in packages/shared/generators/types.ts.
   It should support both portrait generation (one image per character)
   and pose generation (sprite sheet + manifest per pose). Two distinct
   methods or one polymorphic — your call, but document the choice in
   docs/decisions.md as a new entry.

2. Ship one concrete impl: `stub` (returns assets from the catalog at
   apps/api/fixtures/stubs/v1/, dispatched by pose name for sprites).
   No real PixelLab or nano banana integration in this slice — that's
   Phase 1.

3. Implement all 7 endpoints in apps/api/, dispatching all generation
   through the Generator interface (no provider-specific code in handlers):
   - POST   /api/characters             { prompt }    (NO refImage in
     Phase 0 — reference upload is deferred to Phase 1)
   - GET    /api/characters/:slug
   - PATCH  /api/characters/:slug                     (auth)
   - POST   /api/characters/:slug/portrait            (auth)
   - POST   /api/characters/:slug/poses { name }      (auth) — VALIDATE
     `name` against the fixed vocabulary `['idle','walk','attack','cast']`,
     return 400 on anything else.
   - POST   /api/characters/:slug/voice               (auth) — editor only
   - POST   /api/characters/:slug/rotate-key          (auth: current key)

4. Edit-key flow: nanoid(24) on creation, store hash + EDIT_KEY_PEPPER,
   middleware accepts the key from EITHER:
     a) Header `X-Edit-Key: <editKey>`, OR
     b) Cookie `sojourn_edit_<slug>=<editKey>` (HttpOnly, SameSite=Lax;
        Secure in prod). Per-slug cookie name so editing a second
        character doesn't lock you out of the first.
   On `POST /characters` success, set the slug-namespaced cookie via
   Set-Cookie in the response so the browser is auth'd before the first
   redirect. Rotation invalidates old hash, returns new key, AND issues
   a fresh Set-Cookie for the same slug.

5. pino structured logs on every auth check (success and failure).
   Failed editKey attempts log a hashed prefix only — never the raw key.

6. CORS configured per the infra section: dev uses Vite proxy
   (same-origin, no CORS), prod uses CORS_ORIGIN env var with
   credentials=true so the cookie reaches the API cross-origin.

7. Vitest covering: auth middleware happy path via header, happy path
   via cookie, 4 failure cases (missing both, wrong key in header, wrong
   key in cookie, rotated old key), generator dispatch picking the right
   impl by `generator` field, pose-name validation rejecting unknown
   names.

Don't touch `apps/web`. Don't import any PixelLab or nano banana SDKs —
that's Phase 1. Generators are sandboxed in packages/shared/generators/
per AGENTS.md.

Open a PR titled "Slice 2: API, auth, generator seam".
```

### Slice 3 — SpriteStage (parallel with Slice 2)

```
Read AGENTS.md, then docs/phase-0-plan.md (focus on the UI shell and
stub asset catalog), then docs/decisions.md (especially D02 Phaser
sandboxing).

Your job is the Phaser rendering component:

- Build apps/web/src/components/SpriteStage/SpriteStage.tsx — a React
  component that mounts a Phaser scene, takes
  `{ spriteSheetUrl, manifest, currentPose }` as props (where `manifest`
  is the `PoseManifest` shape in docs/phase-0-plan.md:
  `{ frameWidth, frameHeight, frameCount, frameRate, loop }`), and
  exposes `setPose(name)`, `play()`, `pause()` via `useImperativeHandle`.
  Use Phaser's `load.spritesheet` + `anims.create` directly — no
  per-frame x/y because the layout is uniform.
- Build a /dev/stage demo route at apps/web/src/routes/dev/stage.tsx
  that loads the stub manifests via `GET /api/stubs/v1/<name>.json` and
  the sprite sheets via `GET /api/stubs/v1/<name>.png` (the API serves
  these from Slice 1, reached via the Vite proxy in dev). Buttons let
  you flip between idle/walk/attack/cast.
- The component must support pixel-art rendering crisply — disable
  texture smoothing, integer scaling, no anti-aliasing on the upscale
- Phaser must be sandboxed inside this one component. No Phaser imports
  anywhere else in apps/web — the rest of the app talks to it through
  the imperative handle only (per D02 and AGENTS.md)

Stub assets must round-trip through the real load path — don't
special-case stubs in the renderer. If real PixelLab assets work later,
they should drop in unchanged.

Don't touch apps/api or packages/shared/generators (Slice 2's territory).
Don't add routing beyond the /dev/stage demo route.

Open a PR titled "Slice 3: SpriteStage component + demo".
```

### Slice 4 — Editor + viewer (after Slices 2 and 3)

```
Read AGENTS.md, then docs/phase-0-plan.md (focus on URL & share model
and UI shell), then docs/decisions.md (especially D03 edit-key model,
D05 inspector-first UX, D08 portrait vs sprite distinction).

This is the largest slice. Use plan mode before writing code — show me
your plan for component structure and state flow first.

Your job is the user-facing pages:

- `/` — landing/entry. Single text field only ("describe your
  character"). NO reference-image upload in Phase 0 — that's deferred
  to Phase 1 with the drop-zone UX. On submit, POST /characters
  { prompt }, server returns { slug, editKey } AND sets the
  sojourn_edit_<slug> HttpOnly cookie via Set-Cookie. Redirect to
  /c/:slug/edit?key=… (key still in URL so the edit URL itself remains
  shareable as the credential — see D03).
- `/c/:slug/edit?key=…` — editor:
  - Stage center: <SpriteStage> from Slice 3, plays the currently
    selected pose
  - Portrait panel above the stage: plain <img> rendering portraitUrl
    (illustrated, NOT through Phaser). Explicit "Regenerate portrait"
    button calls POST /portrait — the primary control.
  - Inspector right: name, archetype, outfit, palette chips, expression,
    voice (placeholder dropdown). Each change calls PATCH immediately
    (no debounce on saves — closing the tab shouldn't lose edits).
    Visual fields (archetype, outfit, palette, expression) additionally
    debounce-trigger POST /portrait after ~1.5 s of inactivity. Sprite
    poses NEVER auto-regen — too expensive per call; user controls them
    via the pose grid. AI-assist field at top-right of inspector — stub
    for Phase 0, appends to a local transcript only.
  - Pose grid below stage: cards per pose with status. "+ Add pose"
    picker is constrained to the fixed vocabulary
    [idle, walk, attack, cast] — no freeform names. Per-card
    "Regenerate" affordance also calls POST /poses for that name.
- `/c/:slug` — public viewer: portrait (plain <img>) + <SpriteStage>
  with pose dropdown. NO voice button in Phase 0 (public-read voice
  isn't designed yet — reappears in Phase 2). No inspector, no edit
  affordances. Works without cookies or edit key.
- Edit-key handling: the cookie is set server-side at character
  creation, so the editor authenticates via cookie on subsequent
  requests automatically. The ?key=… in the URL is the
  shareable-secret; on first visit to a known edit URL from a fresh
  browser, send the first authed request with the X-Edit-Key header
  (read from the URL query param) — the server response will
  Set-Cookie for future requests in that browser. Show a one-time
  banner: "this is the edit URL — keep it private".

Auth wire-up: requests to /api/* must include `credentials: 'include'`
on fetch so cookies travel cross-origin in prod (per the CORS section
of the plan). When acting on the URL key for the first time in a
browser, also send `X-Edit-Key: <urlKey>` so the request is
authenticated even before the cookie is set.

Use the Generator-stubbed API from Slice 2 and the SpriteStage from
Slice 3 unchanged. Don't modify either — if you need a change, surface
it in the PR description and pause.

Don't conflate portraits and sprites: separate fields, separate render
paths (img vs Phaser), separate endpoints (per AGENTS.md footgun).

Open a PR titled "Slice 4: Editor + public viewer".
```

### Slice 5 — E2E + deploy

```
Read AGENTS.md, then docs/phase-0-plan.md (focus on the deliverables
checklist and infra glue).

Your job is verification + deploy prep:

- Add Playwright with one happy-path test that scripts the full
  deliverables checklist:
    1. POST / with a description → redirected to edit URL; cookie
       sojourn_edit_<slug> is set
    2. Editor renders portrait above + idle pose on the Phaser stage
    3. Edit a non-visual field (e.g. name) → PATCH persists, no portrait
       refetch
    4. Edit a visual field (e.g. outfit) → PATCH persists + debounced
       POST /portrait → portrait panel re-renders with the new stub
    5. Click "+ Add pose", pick "walk" from the constrained vocabulary
       picker → POST /poses → card appears in grid → pose plays on stage
    6. Try to call POST /poses with name "potato" via the API directly
       → 400 (pose-name validation)
    7. Open /c/:slug in fresh browser context → public viewer renders
       portrait + Phaser stage with pose dropdown, no edit UI, no voice
       button visible
- Wire R2: one-shot script that uploads the stub catalog under
  stubs/v1/. Flip STUB_SOURCE=r2 in a staging env file, confirm assets
  load.
- Production CORS values documented in .env.example with comments.
- Run the full deliverables checklist by hand. Report which items pass
  and which need fixes (open issues for fixes — don't bundle them into
  this slice).

Don't pick Fly vs Railway yet — that's at first real deploy (per D06).
Just confirm the build/start contract works:
`pnpm --filter api build && pnpm --filter api start`.

Open a PR titled "Slice 5: E2E happy-path + R2 wiring".
```

## Per-slice review checklist

Run this on every slice's PR before merging. Don't merge if any item fails.

- [ ] Diff stays within the slice's documented file ownership (no surprise refactors)
- [ ] No new deps that aren't in `phase-0-plan.md` (or PR description justifies them)
- [ ] Schema matches `phase-0-plan.md` exactly — flag any drift loudly
- [ ] No PixelLab / nano banana / ElevenLabs SDK imports outside `packages/shared/generators/<provider>/` (this is Phase 1+ anyway, but enforce the boundary)
- [ ] No Phaser imports outside `apps/web/src/components/SpriteStage/`
- [ ] Slice's acceptance criteria in `phase-0-plan.md` actually run locally — don't trust the PR description, run them
- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] If a new decision was made that wasn't in the plan, `docs/decisions.md` has a new entry
- [ ] Run `/review` (Claude Code's built-in PR review skill) — read its output even if you disagree

## Order of operations

1. **Open Slice 1 thread.** Paste the Slice 1 prompt. While it runs, set up the GitHub repo permissions, create an empty R2 bucket, provision a Turso DB. These are 10-min ops jobs that block deploy but not local dev.
2. **Review + merge Slice 1.** Run the deliverables locally before merging.
3. **Open two worktrees, kick off Slices 2 and 3 in parallel.** Different threads, different branches off the merged Slice 1 base.
4. **Review + merge both.** If they conflict in `packages/shared/`, resolve manually — don't let either thread "fix" the conflict.
5. **Open Slice 4 thread in plan mode.** It's the largest and most design-sensitive. Make Claude show you a plan before writing code.
6. **Review + merge Slice 4.**
7. **Open Slice 5 thread.** Last one.
8. **Run the deliverables checklist yourself end-to-end** before declaring Phase 0 done.

## What to do when a slice goes sideways

- **Thread invents a different schema:** stop the thread, point at the plan, ask it to revert and follow the spec. Don't merge a divergent schema — Slice 4 will break in surprising ways.
- **Thread stuck or flailing:** hand it to `codex:rescue` for a second-opinion diagnosis instead of jumping in yourself.
- **Thread refactors out of scope:** push back hard on the PR. Out-of-scope refactors hide behavior changes.
- **Two parallel slices conflict in `packages/shared`:** the conflict itself is a signal that the boundary wasn't clear. Resolve once, then update `phase-0-plan.md` to clarify the ownership for next time.
- **A decision surfaces that wasn't in the plan:** add it to `docs/decisions.md` *before* implementing it. Decisions that only live in code are decisions you'll forget you made.
