# Phaser Integration Plan

## Project Structure
```
web/
  src/
    index.html
    main.ts
    scenes/
      BootScene.ts
      NPCScene.ts
    systems/
      AnimationRegistry.ts
      DialogueController.ts
      AudioSync.ts
    assets/
      atlases/
```
- Build with Vite + TypeScript for hot reload and modularity.
- Use Phaser 3.80+ (or latest LTS) for stable WebGL support, with optional Spine plugin toggle.

## Boot & Asset Loading
- BootScene preloads atlases (`this.load.atlas`) and metadata JSON.
- Inject config service that reads `metadata.json` to register animations via `AnimationRegistry` before NPC instantiation.

## Animation Registry
- Centralized module to create global animations using Phaser Animation Manager:
```
this.anims.create({
  key: `${npcId}:idle`,
  frames: this.anims.generateFrameNames(atlasKey, { prefix: 'idle_', end: 7 }),
  frameRate: 6,
  repeat: -1
});
```
- Supports dynamic loading of additional animation packs at runtime.
- Caches definitions to avoid re-registration.

## NPC Scene Composition
- NPC game objects composed of:
  - `Phaser.GameObjects.Sprite` for body animations.
  - Optional overlay containers (particles, speech bubbles).
  - State machine (XState or custom) handling transitions (idle↔talk↔emote↔walk).
- Input manager listens for user microphone events, text commands, or scripted triggers.

## Performance Considerations
- Use texture atlases to minimize draw calls; enable `setPipeline('Light2D')` only when required.
- Employ pooled tweens and objects; destroy animations when NPC unloaded.
- Offer resolution scaling toggle (e.g., `scene.cameras.main.setZoom`) for mobile devices.

## Tooling & Debugging
- Integrate Phaser Dev Tools overlay for runtime inspection.
- Build `StoryboardScene` showcasing all animation loops for QA.
- Include FPS and audio latency HUD for regression testing.

## Next Steps
- Scaffold Vite + Phaser template.
- Implement `AnimationRegistry` and `NPCSprite` class skeletons.
- Create mock atlases for initial wiring before real assets arrive.
