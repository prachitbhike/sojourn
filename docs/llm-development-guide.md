# LLM Development Guide

Date: 2026-04-23
Maintainers: NPC Creator core team

This guide distills the minimum context an LLM-based coding assistant needs to contribute effectively to `/Users/prachitbhike/Code/npc-creator`.

## 1. Quick Orientation

- Root README (`/Users/prachitbhike/Code/npc-creator/README.md`) – high-level overview and links to domain docs.
- Agent instructions (`/Users/prachitbhike/Code/npc-creator/AGENTS.md`) – enforced conventions for every directory.
- Documentation portal (`/Users/prachitbhike/Code/npc-creator/docs/`) – design specs, pipelines, testing strategy.
- Workspace packages:
  - `apps/` – runnable front-end surfaces (currently `@npc-creator/playground`).
  - `packages/` – reusable TypeScript libraries (`dialogue`, `voice`, `phaser-runtime`, `personas`, `types`).
  - `scripts/` – utility scripts (sprite generator, metrics CLI helpers).
  - `data/` – canonical persona JSON and payloads consumed by packages.

## 2. Standard Workflow for LLM Agents

1. **Establish scope** – Read README and the relevant doc under `/Users/prachitbhike/Code/npc-creator/docs`. Capture assumptions in the user-visible plan (`update_plan`).
2. **Locate source files** – Prefer `rg` or `pnpm --filter ... exec tree` to discover modules. Respect the directory-specific guidance in `AGENTS.md`.
3. **Modify code safely** – Use the `apply_patch` helper for edits. Avoid touching generated assets (`dist`, `node_modules`, `packages/assets/sprites/*.png`).
4. **Validate** – Run the smallest necessary `pnpm` commands:
   - `pnpm lint` / `pnpm typecheck` for cross-cutting changes.
   - `pnpm --filter <package> test` for package-level updates.
   - `pnpm --filter @npc-creator/playground dev` when manual UI confirmation is needed (only if environment supports it).
5. **Document** – Update or create markdown entries alongside code changes, using absolute paths for references.
6. **Summarize** – In the final hand-off, mention the commands run/not run and call out any follow-up work.

## 3. Documentation Expectations

- Every new feature or workflow requires an accompanying note in `/Users/prachitbhike/Code/npc-creator/docs` and, if user-facing, an update to the README documentation portal.
- Path references must be written as absolute workspace paths to stay clickable in Codex (`/Users/prachitbhike/Code/npc-creator/...`).
- Include the current calendar date when describing time-sensitive states (e.g., latency targets, roadmap decisions) so future contributors know the context.

## 4. Testing & Quality Checklist

Before finishing a change, confirm the following (adapt as needed):

- [ ] Source files compile under TypeScript strictness (`pnpm typecheck`).
- [ ] Unit or integration tests covering the touched packages pass (`pnpm --filter <package> test`).
- [ ] No stray edits exist in generated directories (`dist`, `node_modules`, `apps/playground/node_modules/.vite`).
- [ ] Documentation has been refreshed to reflect code changes.
- [ ] Accessibility checklist (`/Users/prachitbhike/Code/npc-creator/docs/accessibility-checklist.md`) is still accurate when UI changes occur.

## 5. Common Tasks & Recipes

| Task | Command | Notes |
| --- | --- | --- |
| Regenerate sprite metadata | `pnpm exec python scripts/generate_sprite_sheets.py` | Produces PNG/JSON pairs in `/Users/prachitbhike/Code/npc-creator/packages/assets/sprites`. Commit only when palettes change. |
| Run dialogue tests | `pnpm --filter @npc-creator/dialogue test` | Uses Vitest; covers orchestrator, generator stubs, rate limiter. |
| Build all packages | `pnpm build` | Generates `dist/` artifacts using project references. |
| Preview playground | `pnpm --filter @npc-creator/playground dev` | Exposes React playground with live dialogue, animation, and voice controls. |
| Export metrics report | `pnpm exec node scripts/playground-metrics.mjs data/playground-metrics.jsonl` | Summarizes local instrumentation for latency/safety. |

## 6. Troubleshooting Tips

- **`pnpm install` mismatch** – Ensure Corepack is enabled. If lockfile drift occurs, rerun `pnpm install` and commit the updated `pnpm-lock.yaml` only when dependency changes are intentional.
- **Missing sprite metadata** – Run the generator script; the persona loader (`/Users/prachitbhike/Code/npc-creator/packages/personas/src/index.ts`) throws when metadata is absent.
- **Voice tests fail** – Verify ElevenLabs API stubs or mocks in `/Users/prachitbhike/Code/npc-creator/packages/voice/src` are up to date before running integration tests.
- **Docs out of sync** – Audit `README.md`, `/Users/prachitbhike/Code/npc-creator/docs/requirements.md`, and this guide to keep repository diagrams accurate.

## 7. When in Doubt

- Cross-check requirements and roadmap in `/Users/prachitbhike/Code/npc-creator/docs/requirements.md` before introducing new scope.
- Prefer chat-based clarification in the README roadmap section rather than guessing at production expectations.
- Leave clear TODO or follow-up bullets in docs if further human validation is required.
