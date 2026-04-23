# Multimodal Synchronization & Interaction UX

## Objectives
- Keep sprite animations, audio playback, and subtitles tightly aligned.
- Offer responsive UI controls for testing and accessibility.

## Synchronization Strategy
- Central `TimelineController` receives events from Dialogue Orchestrator and Voice Pipeline.
- Maintain playhead time in milliseconds; update animation and captions based on audio timestamps.

### Lip-Sync
- Map ElevenLabs alignment data (word start/end) to viseme frames:
```
const visemeMap = {
  rest: 'talk_00',
  A: 'talk_01',
  E: 'talk_02',
  O: 'talk_03'
};
```
- Interpolate between visemes every 80 ms; fall back to talk loop if alignment missing.

### Animation Queueing
- When `emotion` changes, enqueue corresponding animation (`emote_joy`) with priority above idle/talk loops.
- After emote completes, return to talk loop while audio playing, then idle.
- Use Phaser timeline events or custom scheduler to avoid abrupt transitions.

### Subtitle & UI Handling
- Render captions in Web Component overlay; support size/color preferences and auto-language detection.
- Provide conversation log panel with persona tags and timecodes.

## Interaction UX
- Controls: push-to-talk mic button, text input, preset prompts, emotion overrides for testing.
- Display latency HUD showing LLM + ElevenLabs timings.
- Allow camera controls (pan/zoom) without disrupting sync.

## Error States
- If audio stream stalls: display toast, pause animation at idle, offer retry.
- If animation assets missing: swap to fallback silhouette sprite and log error.

## Metrics & Telemetry
- Track A/V drift (|audioTime - animationTime|) per turn; alert if > 120 ms.
- Capture subtitle usage, language switches, user satisfaction prompts.

## Next Steps
- Implement `TimelineController` skeleton in Phaser scene.
- Prototype with mocked audio timestamps.
- Integrate latency HUD once live pipelines wired.
