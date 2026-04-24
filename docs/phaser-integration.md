# Phaser Integration Plan

Last updated: 2026-04-23

This document describes how the Phaser runtime inside `/Users/prachitbhike/Code/npc-creator/apps/playground` interacts with shared packages and sprite metadata.

## Project Structure

```
/Users/prachitbhike/Code/npc-creator/apps/playground
├── src/
│   ├── main.tsx                # React entry point, bootstraps Phaser experience
│   ├── phaser/                 # Phaser-specific scenes, systems, and helpers
│   │   ├── BootScene.ts        # Preloads atlases + persona metadata
│   │   ├── NPCScene.ts         # Core scene rendering NPC state
│   │   ├── TimelineController.ts
│   │   └── AnimationRegistry.ts
│   ├── spriteManifest.ts       # Maps persona IDs to atlas metadata (auto-generated)
│   └── components/             # React UI surrounding the canvas
├── public/                     # Static assets (Phaser config JSON, icons)
└── vite.config.ts              # Build configuration
```

Supporting packages:

- `/Users/prachitbhike/Code/npc-creator/packages/phaser-runtime` – Shared helpers (`nanoBananaRig`, animation utilities) consumed by the playground.
- `/Users/prachitbhike/Code/npc-creator/packages/personas` – Persona loader that attaches sprite metadata (frame sizes, animation ranges).
- `/Users/prachitbhike/Code/npc-creator/packages/voice` – Emits timing cues for the timeline controller.

## Boot & Asset Loading

1. `BootScene` loads sprite atlases and metadata emitted by `scripts/generate_sprite_sheets.py`.
2. Persona metadata is imported from `@npc-creator/personas`, ensuring frame dimensions match `packages/assets/sprites` JSON.
3. `AnimationRegistry` registers animations (`idle`, `talk`, walk directions, emotes) using consistent naming: `${personaId}:${state}`.
4. After preload, control passes to `NPCScene` which creates sprite instances via helpers from `packages/phaser-runtime`.

## Animation Registry Strategy

```ts
this.anims.create({
  key: `${personaId}:talk`,
  frames: this.anims.generateFrameNumbers(atlasKey, { start: talk.startFrame, end: talk.endFrame }),
  frameRate: talk.frameRate,
  repeat: talk.loop ? -1 : 0
});
```

- Registrations occur once per persona; guards prevent duplicate creation when hot reloading.
- Additional animation packs can be enqueued by extending the manifest and persona metadata in `packages/personas/src/spriteMetadata.ts`.

## NPC Scene Composition

- Core sprite derived from `Phaser.GameObjects.Sprite` plus optional overlays (caption bubbles, emotion flares).
- State machine (XState or custom finite state) manages transitions among `idle`, `talk`, `emote`, and directional `walk` states.
- Hooks into timeline events emitted by dialogue + voice pipelines:
  - Dialogue orchestrator dispatches `animationCue` and `emotion` via shared event bus.
  - Voice pipeline exposes word-level timestamps to update visemes.

## Timeline & Lip-Sync

- `TimelineController` keeps a millisecond playhead aligned with ElevenLabs alignment data.
- Viseme mapping leverages `talk` frames and optional `viseme` atlases when added.
- Fallback: revert to looping `talk` animation when alignment data is missing or audio stream stalls.

## Performance Considerations

- Use atlas-based sprites to minimize draw calls; atlases live under `/Users/prachitbhike/Code/npc-creator/packages/assets/sprites`.
- Disable expensive pipelines (e.g., `Light2D`) on low-spec devices. Offer resolution scaling (`scene.cameras.main.setZoom`).
- Pool audio and particle objects to avoid GC spikes during rapid dialogue turns.

## Debug & QA Tooling

- Add a `StoryboardScene` showcasing each persona’s animations for quick QA.
- Expose a debug HUD (FPS, animation state, audio latency) toggleable from the React UI.
- Integrate Phaser Inspector for runtime scene inspection when running `pnpm --filter @npc-creator/playground dev`.

## Next Steps

1. Flesh out `TimelineController` with integration tests using mocked timestamps.
2. Create automated visual regression snapshots for critical animations.
3. Document new animation states in `/Users/prachitbhike/Code/npc-creator/docs/requirements.md` when the scope expands beyond idle/talk.
