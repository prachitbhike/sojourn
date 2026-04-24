# Agent Guidelines for NPC Creator

## Scope
These guidelines apply to the entire repository at `/Users/prachitbhike/Code/npc-creator`.

## Development Workflow
- Use `pnpm` for all install, build, lint, test, and dev commands. Avoid `npm` or `yarn` to keep lockfiles consistent.
- Target Node.js `>=20.0.0`. When scripts require Python (e.g., sprite generation), prefer the system Python that already has Pillow installed or document additional steps.
- Run the narrowest relevant script when validating changes. Examples:
  - `pnpm --filter @npc-creator/playground dev` for playground work.
  - `pnpm --filter @npc-creator/dialogue test` for dialogue-specific changes.
  - `pnpm typecheck` after touching shared TypeScript types.
- Generated artifacts (`dist`, `node_modules`, `*.tsbuildinfo`, sprite atlases) must not be committed manually. Use `scripts/generate_sprite_sheets.py` if sprite assets need regeneration and commit the results produced by that script only when requirements change.

## Coding Conventions
- Treat all packages as ECMAScript modules (`"type": "module"`); prefer explicit file extensions when importing local code.
- Keep TypeScript definitions (`packages/types`) authoritative. Update shared types first, then adjust consuming packages.
- Avoid introducing new runtime dependencies without adding them to the relevant `package.json`. Use workspace references (`workspace:*`) for internal packages.
- Favor small, composable modules. Reuse utilities from `packages/dialogue`, `packages/personas`, `packages/phaser-runtime`, and `packages/voice` instead of duplicating logic.

## Documentation Standards
- When referencing files or directories in markdown, use absolute workspace paths (e.g., `/Users/prachitbhike/Code/npc-creator/apps/playground/src/index.tsx`) to align with Codex viewer expectations.
- Keep docs synchronized with the actual repository structure (`apps/`, `packages/`, `scripts/`, `data/`). If a layout diagram changes, update every document that references it.
- Update timestamps or status notes when describing time-sensitive context (e.g., append the current date when summarizing implementation status).

## Testing & Quality Gates
- Prefer Vitest for package-level testing. Use `pnpm --filter <package> test` to scope runs.
- Before merging substantial changes, run `pnpm lint`, `pnpm typecheck`, and the targeted `pnpm test` suites that cover the modified packages.
- Maintain the accessibility checklist at `/Users/prachitbhike/Code/npc-creator/docs/accessibility-checklist.md` whenever UI changes affect the playground.
- Capture notable telemetry or metrics changes inside `/Users/prachitbhike/Code/npc-creator/docs/playground-metrics-cli.md` or related documentation to assist future automation.

## Asset & Voice Pipelines
- Use `/Users/prachitbhike/Code/npc-creator/scripts/generate_sprite_sheets.py` for sprite updates and keep palettes centralized inside that script.
- Voice pipeline stubs live in `/Users/prachitbhike/Code/npc-creator/packages/voice`; when adding new providers, follow the existing ElevenLabs client shape and document integration steps under `/Users/prachitbhike/Code/npc-creator/docs/voice-pipeline.md`.

## Pull Request Expectations
- Provide a short summary of affected areas and mention any documentation updates performed.
- Highlight follow-up tasks or open questions in the README roadmap or relevant doc so downstream contributors (human or LLM) can continue efficiently.
