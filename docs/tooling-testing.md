# Tooling, Testing, and Delivery Plan

## Repository Layout
```
.
├── docs/
├── web/             # Phaser front-end
├── services/
│   ├── dialogue/
│   └── voice/
├── tools/
│   ├── prompt-runner/
│   └── atlas-builder/
└── tests/
    ├── e2e/
    └── integration/
```

## Automation & CI
- Use GitHub Actions (or equivalent) for lint/test/build per push.
- Steps:
  1. Install dependencies (pnpm).
  2. Run lint (`eslint`, `stylelint`).
  3. Execute unit tests (Vitest/Jest) and integration stubs.
  4. Build web bundle with Vite.
  5. Validate assets via scripted atlas check.

## Testing Pyramid
- **Unit**: animation state machine, dialogue schema validation, voice service response handlers.
- **Integration**: mock ElevenLabs websocket, verify audio chunk handling and lip-sync event emission.
- **E2E**: Playwright-based browser tests simulating conversations, verifying animation/audio alignment using synthetic timestamps.
- **Load/Latency**: k6 or Artillery tests to benchmark dialogue+voice pipeline under concurrent sessions.

## Developer Tooling
- Storybook-style NPC gallery route inside Phaser app for rapid asset review.
- CLI utilities:
  - `prompt-runner`: trigger Nano Banana batches, log credit usage.
  - `atlas-builder`: pack atlases, validate metadata.
- Pre-commit hooks via lint-staged to enforce code style and JSON schema compliance.

## Observability & Deployment
- Deploy staging build to Netlify/Vercel (static) with backend services on Fly.io/Render.
- Instrument services with OpenTelemetry; ship traces/metrics to Grafana Cloud or Datadog.
- Create dashboards for latency, error rates, asset generation throughput.

## Documentation & Training
- Maintain `/docs` portal with onboarding, prompt guides, troubleshooting.
- Record short Loom-style walkthroughs for artists and writers (hosted externally).

## Release & Export Strategy
- Version assets and configuration; tag releases with semantic versioning.
- Provide export command that bundles NPC config (atlas, metadata, voice settings, persona JSON) into portable zip.
- Outline go-live checklist: cross-browser QA, load test sign-off, legal compliance review.
