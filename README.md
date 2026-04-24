# NPC Creator Monorepo

NPC Creator is a browser-based authoring toolkit for building believable non-player characters. It combines persona authoring, real-time dialogue orchestration, procedurally generated sprite art, and ElevenLabs powered speech so storytellers can prototype interactive characters without writing code.

## Highlights

- **Author ready personas** – Curated JSON personas with catchphrases, tone guidance, guardrails, and synced sprite metadata sourced from `/Users/prachitbhike/Code/npc-creator/data/personas` and `/Users/prachitbhike/Code/npc-creator/packages/assets/sprites`.
- **Dialogue orchestration** – Streaming dialogue engine with pluggable generators, rate limiting, and safety fallbacks under `/Users/prachitbhike/Code/npc-creator/packages/dialogue`.
- **Phaser runtime** – Lightweight Phaser 3 integration that consumes persona sprite metadata and dialogue timeline cues from `/Users/prachitbhike/Code/npc-creator/packages/phaser-runtime`.
- **Voice pipeline** – ElevenLabs client helpers with streaming, captions, and graceful degradation implemented in `/Users/prachitbhike/Code/npc-creator/packages/voice`.
- **Playground experience** – React and Vite playground for live testing conversations located at `/Users/prachitbhike/Code/npc-creator/apps/playground`.
- **Instrumentation and reporting** – Local metrics export tools and companion tests via `/Users/prachitbhike/Code/npc-creator/scripts` and `/Users/prachitbhike/Code/npc-creator/packages/metrics-cli-tests`.

## Repository Layout

```
.
├── apps/                    # Front-end applications (React playground)
├── packages/                # Shared TypeScript libraries (dialogue, personas, voice, runtime, types)
├── data/                    # Persona definitions and generated metadata
├── docs/                    # High-level design notes, pipelines, and architecture guides
├── scripts/                 # Sprite generator, metrics CLI, and supporting utilities
├── config/                  # Reserved for environment-specific configuration
├── node_modules/            # pnpm workspace dependencies (managed)
├── package.json             # Workspace scripts
├── pnpm-workspace.yaml      # Workspace package globs
└── tsconfig.base.json       # Shared TypeScript configuration
```

## Getting Started

1. Install prerequisites
   - Node.js 20.0.0 or newer (see `engines.node` in `/Users/prachitbhike/Code/npc-creator/package.json`).
   - pnpm 9.x (enable through Corepack for convenience).
2. Install dependencies
   ```bash
   pnpm install
   ```
3. Rebuild procedural sprites when palettes or animation rules change
   ```bash
   pnpm exec python scripts/generate_sprite_sheets.py
   ```

## Development Workflows

- Run the playground
  ```bash
  pnpm --filter @npc-creator/playground dev
  ```
  This command starts the Vite development server with hot reloading. The playground exercises personas, dialogue streaming, animation timelines, and voice controls described in `/Users/prachitbhike/Code/npc-creator/docs/multimodal-sync.md`.

- Build every package
  ```bash
  pnpm build
  ```
  Each package executes its TypeScript project build, producing `dist` outputs that bundlers can consume.

- Type checking, linting, and tests
  ```bash
  pnpm typecheck
  pnpm lint
  pnpm test
  ```
  Package scoped runs are available through pnpm filters, for example `pnpm --filter @npc-creator/dialogue test`.

- Metrics CLI
  ```bash
  pnpm exec node scripts/playground-metrics.mjs data/playground-metrics.jsonl
  ```
  Supporting helpers live in `/Users/prachitbhike/Code/npc-creator/scripts/metrics-utils.mjs`, with Vitest coverage under `/Users/prachitbhike/Code/npc-creator/packages/metrics-cli-tests/__tests__`.

## Key Packages

| Package | Purpose | Notes |
| --- | --- | --- |
| `@npc-creator/types` | Shared TypeScript contracts for personas, dialogue turns, and timelines. | Source directory `/Users/prachitbhike/Code/npc-creator/packages/types`. |
| `@npc-creator/personas` | Validates persona JSON, augments visual metadata, and exposes lookup helpers. | Loads data from `/Users/prachitbhike/Code/npc-creator/data/personas` with sprite metadata defined in `/Users/prachitbhike/Code/npc-creator/packages/personas/src/spriteMetadata.ts`. |
| `@npc-creator/dialogue` | Dialogue orchestrator, OpenAI streaming generator, rate limiter utilities, and offline stubs. | Architectural context in `/Users/prachitbhike/Code/npc-creator/docs/conversational-layer.md`. |
| `@npc-creator/phaser-runtime` | Phaser helpers for sprite rigging, animation timelines, and scene integration. | Pair with `/Users/prachitbhike/Code/npc-creator/docs/phaser-integration.md` for usage guidance. |
| `@npc-creator/voice` | ElevenLabs client abstractions that support streaming audio, captions, and fallback logic. | Detailed design in `/Users/prachitbhike/Code/npc-creator/docs/voice-pipeline.md`. |
| `@npc-creator/playground` | React and Vite application that unifies personas, dialogue, voice, and animation for rapid iteration. | Entry point at `/Users/prachitbhike/Code/npc-creator/apps/playground/src`. |

## Data and Asset Pipeline

- Persona templates for mentor, trickster, and merchant live in `/Users/prachitbhike/Code/npc-creator/data/personas` and align with the experience principles in `/Users/prachitbhike/Code/npc-creator/docs/requirements.md` (last updated April 23, 2026).
- Procedural sprite sheets and metadata are stored in `/Users/prachitbhike/Code/npc-creator/packages/assets/sprites`. Use `/Users/prachitbhike/Code/npc-creator/scripts/generate_sprite_sheets.py` to rebuild them after adjusting palettes or animation rules.
- The Phaser runtime consumes sprite metadata to enrich persona visual configs, as seen in `/Users/prachitbhike/Code/npc-creator/packages/personas/src/index.ts`.

## Documentation Portal

Key references are collected in `/Users/prachitbhike/Code/npc-creator/docs`:

- `/Users/prachitbhike/Code/npc-creator/docs/requirements.md` – Product vision, success metrics, and current implementation status.
- `/Users/prachitbhike/Code/npc-creator/docs/conversational-layer.md` – Dialogue orchestration flow, schema design, and latency plan.
- `/Users/prachitbhike/Code/npc-creator/docs/voice-pipeline.md` – ElevenLabs streaming architecture and safeguards.
- `/Users/prachitbhike/Code/npc-creator/docs/multimodal-sync.md` – Timeline synchronization across audio, animation, and captions.
- `/Users/prachitbhike/Code/npc-creator/docs/phaser-integration.md` – Guidance for embedding the Phaser runtime and managing animation state.
- `/Users/prachitbhike/Code/npc-creator/docs/accessibility-checklist.md` – WCAG 2.1 AA compliance checklist for the authoring and playback flows.
- `/Users/prachitbhike/Code/npc-creator/docs/playground-metrics-cli.md` – Metrics export workflow and CLI usage reference.

Additional documents detail art pipelines, testing strategy, and tooling expectations for collaborators.

## Roadmap and Open Questions

Active priorities, captured in `/Users/prachitbhike/Code/npc-creator/docs/requirements.md`, include:

- Expanding procedural animation beyond idle and talk loops once emotion priorities are set.
- Finalizing LLM provider selection and streaming integration to reach the sub 600 millisecond turn latency budget.
- Building export hooks for engines beyond Phaser and tightening telemetry ingestion beyond local JSONL downloads.

Review the open questions at the end of the requirements document before proposing new features or integrations.

## Contributing

1. Branch from the main repository.
2. Use pnpm for dependency management and avoid mixing npm or yarn.
3. Run `pnpm lint`, `pnpm typecheck`, and relevant package level tests before proposing changes.
4. Document new developer workflows in `/Users/prachitbhike/Code/npc-creator/docs` and update this README when the project structure evolves.

For questions or design proposals, start with the documentation listed above so new work continues to align with accessibility, safety, and latency goals.
