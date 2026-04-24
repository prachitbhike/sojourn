# Tooling, Testing, and Delivery Plan

Last updated: 2026-04-23

## Repository Layout

```
/Users/prachitbhike/Code/npc-creator
├── apps/
│   └── playground/              # React + Vite playground for live NPC testing
├── packages/
│   ├── dialogue/                # Dialogue orchestrator, generators, rate limiter
│   ├── personas/                # Persona loader/validator with sprite metadata
│   ├── phaser-runtime/          # Phaser helpers for animation + timeline control
│   ├── voice/                   # ElevenLabs client abstractions
│   ├── types/                   # Shared TypeScript contracts
│   └── assets/                  # Generated sprite atlases and metadata
├── scripts/                     # Sprite generator & metrics utilities
├── data/                        # Persona JSON definitions and related payloads
├── docs/                        # Product and technical documentation portal
├── package.json                 # Workspace scripts and Node version requirement
├── pnpm-workspace.yaml          # Workspace package globs
└── tsconfig.base.json           # Shared TypeScript compiler options
```

## Automation & CI

Use GitHub Actions (or an equivalent runner) with the following stages:

1. **Setup** – Enable Corepack and install dependencies with `pnpm install`.
2. **Lint** – Run `pnpm lint` to execute ESLint across the workspace. Add stylelint/prettier checks here if CSS or formatting rules are introduced later.
3. **Type Safety** – Execute `pnpm typecheck` (leverages project references for package-level TypeScript builds).
4. **Tests** – Call `pnpm test` for an aggregate run, or fan out with `pnpm --filter <package> test` when parallelizing.
5. **Build** – Generate distributable outputs using `pnpm build`; this compiles each package to its `dist/` folder and builds the playground with Vite.
6. **Asset Validation** – Invoke `pnpm exec python scripts/generate_sprite_sheets.py --dry-run` (add a dry-run flag before production use) and bespoke atlas checks to ensure sprite metadata remains deterministic.
7. **Artifact Publish** – Upload the built playground bundle and any generated reports (latency, safety) as workflow artifacts for QA review.

## Testing Pyramid

- **Unit Tests** –
  - Dialogue orchestrator, generator stubs, and rate limiting (Vitest in `/Users/prachitbhike/Code/npc-creator/packages/dialogue`).
  - Persona validation and metadata augmentation (tests to be added under `/Users/prachitbhike/Code/npc-creator/packages/personas`).
  - Voice client fallbacks and caption handling (Vitest in `/Users/prachitbhike/Code/npc-creator/packages/voice`).
- **Integration Tests** –
  - Mock ElevenLabs streaming via WebSocket fixtures; verify audio chunk streaming and caption alignment.
  - Exercise Phaser runtime animation wiring with synthetic metadata to confirm state transitions.
  - Located in `/Users/prachitbhike/Code/npc-creator/packages/metrics-cli-tests/__tests__` and future integration suites.
- **End-to-End Tests** –
  - Use Playwright against the playground (`/Users/prachitbhike/Code/npc-creator/apps/playground`) to simulate mic/text input, dialogue streaming, and sprite reactions.
  - Validate visual regressions with Percy or Playwright screenshots where feasible.
- **Performance & Load** –
  - Benchmark dialogue + voice latency with k6/Artillery. Capture metrics to feed into the playground metrics CLI (`/Users/prachitbhike/Code/npc-creator/scripts/playground-metrics.mjs`).

## Developer Tooling

- **Story Scenes** – Extend the playground with an internal route that enumerates all personas, sprites, and emotes for rapid visual QA.
- **CLI Utilities** –
  - `scripts/playground-metrics.mjs` converts Local Storage JSONL into reports; package tests live in `/Users/prachitbhike/Code/npc-creator/packages/metrics-cli-tests`.
  - `scripts/generate_sprite_sheets.py` procedurally rebuilds sprite atlases with palette lighting options.
- **Pre-commit Hooks** – Adopt lint-staged with ESLint, `pnpm typecheck -- --incremental false`, and optional markdown linting to enforce documentation consistency.
- **Editor Configuration** – Publish recommended VS Code settings (TypeScript SDK path, format on save, ESLint integration) under `.vscode/` if desired.

## Observability & Deployment

- Target deployment model: static playground on Vercel/Netlify, backed by dialogue/voice services hosted separately (Fly.io/Render).
- Instrument packages with OpenTelemetry-compatible logging; surface metrics through Grafana or Superset dashboards.
- Persist metrics CLI outputs (`*.jsonl` and generated summaries) to object storage for historical analysis.
- Track streaming latency (<600 ms goal), ElevenLabs TTFB, and animation/audio drift as first-class dashboards.

## Documentation & Training

- Keep onboarding material in `/Users/prachitbhike/Code/npc-creator/docs`, linking from the README and `docs/llm-development-guide.md`.
- Record short Loom-style demos (hosted externally) that walk through persona editing, sprite QA, and latency dashboards.
- Ensure the accessibility checklist at `/Users/prachitbhike/Code/npc-creator/docs/accessibility-checklist.md` is refreshed whenever UI flows change.

## Release & Export Strategy

- Version assets and configuration via semantic tags (e.g., `npc-creator@0.1.0`).
- Provide a command or script that bundles persona config, sprite metadata, and voice presets into a portable archive for downstream game engines.
- Maintain a go-live checklist covering cross-browser QA, load testing, compliance review, and documentation updates (README, requirements, LLM guide).
