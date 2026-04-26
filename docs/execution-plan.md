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
| 1 — Scaffold | pnpm workspace, Vite shell, Hono health check, Drizzle schema + migration, stub fixtures (portrait + sprites), `.env.example`, `pnpm dev` | new files only | half day |
| 2 — API + auth + generators | All 7 endpoints, edit-key auth + rotation, pino, CORS, `Generator` interface in `packages/shared/generators` with `stub` impl, vitest for auth | `apps/api/**` and `packages/shared/generators/**` | full day |
| 3 — SpriteStage | `<SpriteStage>` React component wrapping Phaser, imperative handle, demo route loading stub manifests | `apps/web/src/components/SpriteStage/**` + demo route | half day |
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
- Drizzle schema matching docs/phase-0-plan.md exactly: `characters` table
  with `portraitUrl` + `portraitGenerator`, `poses` table with `generator`
  field, indexes and ON DELETE CASCADE per the plan
- First migration committed under apps/api/drizzle/
- `.env.example` matching the env vars table in the plan, including the
  PIXELLAB_API_KEY placeholder
- Stub asset catalog committed at apps/api/fixtures/stubs/v1/ — use
  solid-color placeholder PNGs at the documented dimensions (portrait
  512×512, sprites 64×64 frame). Each pose ships with manifest.json in
  the Phaser-native shape.
- `pnpm dev` boots web and api with hot reload; Vite proxies /api to
  the Node server so dev is same-origin
- Hono server has only a /health endpoint — no business logic yet

Stop when `pnpm dev` works, `pnpm --filter api db:migrate` runs cleanly,
and the stub fixtures are in place. Open a PR titled "Slice 1: Phase 0
scaffold" and link to docs/phase-0-plan.md in the description.

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
   - POST   /api/characters
   - GET    /api/characters/:slug
   - PATCH  /api/characters/:slug                  (auth: editKey)
   - POST   /api/characters/:slug/portrait         (auth: editKey)
   - POST   /api/characters/:slug/poses            (auth: editKey)
   - POST   /api/characters/:slug/voice            (auth: editKey)
   - POST   /api/characters/:slug/rotate-key       (auth: current editKey)

4. Edit-key flow: nanoid(24) on creation, store hash + EDIT_KEY_PEPPER,
   middleware checks header `X-Edit-Key`. Rotation invalidates old hash,
   returns new key.

5. pino structured logs on every auth check (success and failure).
   Failed editKey attempts log a hashed prefix only — never the raw key.

6. CORS configured per the infra section: dev uses Vite proxy
   (same-origin, no CORS), prod uses CORS_ORIGIN env var with
   credentials=true.

7. Vitest covering: auth middleware happy path, 3 failure cases (missing
   header, wrong key, rotated key), generator dispatch picking the right
   impl by `generator` field.

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
  `{ baseUrl, manifest, currentPose }` as props, and exposes
  `setPose(name)`, `play()`, `pause()` via `useImperativeHandle`
- Build a /dev/stage demo route that loads the stub manifests directly
  from /fixtures/stubs/v1/ and lets you flip between idle/walk/attack
  via buttons
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

- `/` — landing/entry. Single text field ("describe your character") OR
  upload a reference image. On submit, POST /characters, then redirect
  to /c/:slug/edit?key=…
- `/c/:slug/edit?key=…` — editor:
  - Stage center: <SpriteStage> from Slice 3, plays the currently
    selected pose
  - Inspector right: name, archetype, outfit, palette chips, expression,
    voice (placeholder dropdown). Debounced PATCH on each change, no
    auto-regen.
  - Above the stage: portrait preview from `portraitUrl` (plain <img>,
    NOT through Phaser — portraits are illustrated, not pixel art).
    Button to re-run portrait generation (POST /portrait).
  - Pose grid below stage: cards per pose with status. "+ Add pose"
    button POSTs /poses. Each card shows thumbnail + status.
  - AI-assist field top-right: stub for Phase 0, just appends to a
    transcript and shows it.
- `/c/:slug` — public viewer: portrait header, <SpriteStage> with pose
  dropdown, voice play button. No inspector, no edit affordances. Works
  without cookies or edit key.
- Edit-key handling: on first visit to /c/:slug/edit?key=…, read the
  query param into a SameSite=Lax cookie so refreshes work. Show a
  one-time banner: "this is the edit URL — keep it private".

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
    1. POST / with a description → redirected to edit URL
    2. Editor renders portrait + idle sprite
    3. Edit an inspector field → debounced save → portrait re-fetch
    4. Add a "walk" pose → appears in grid → plays on stage
    5. Open /c/:slug in fresh browser context → public viewer renders,
       no edit UI visible
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
