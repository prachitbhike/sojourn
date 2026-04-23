# ElevenLabs Real-Time Voice Pipeline

## Objectives
- Achieve low-latency, expressive speech aligned with NPC emotion cues.
- Provide resilience against API outages and enforce licensing/safety rules.

## Architecture Overview
- **Client**: Browser initiates WebSocket to backend voice service rather than ElevenLabs directly (protect API keys).
- **Voice Service**: Node/TypeScript server managing ElevenLabs WebSocket/Text-to-Speech streams, buffering, and caching.
- **Fallback**: Pre-rendered clips stored in CDN for critical lines or when streaming fails.

## Call Flow
1. Dialogue Orchestrator emits speech request `{ text, emotion, voiceId, modelId, chunkSchedule }`.
2. Voice Service opens ElevenLabs WebSocket `wss://api.elevenlabs.io/v1/text-to-speech/<voiceId>/stream-input?model_id=<modelId>`.
3. Stream text in segments:
   - Prime buffer with 120 characters to improve quality.
   - Apply `chunk_length_schedule` `[60, 120, 180]` for balanced latency.
   - Send `{ flush: true }` at end of turn to force completion.
4. Receive audio chunks, forward to browser via WebRTC data channel or custom WebSocket with playback queue.
5. Provide word-level timestamps (`alignment`) to animation system for lip-sync cues.

## Voice Selection & Emotion Mapping
- Maintain voice catalog metadata:
```
{
  "npcId": "mentor",
  "defaultVoice": "Xb7hH8MSUJpSbSDYk0k2",
  "model": "eleven_flash_v2_5",
  "emotions": {
    "joy": { "stability": 0.35, "style": 0.8 },
    "anger": { "stability": 0.6, "style": 0.5 },
    ...
  }
}
```
- Adjust `stability`, `similarity_boost`, and `style` per emotion.
- Support dynamic switching to multilingual models (Flash v2.5 multilingual) when user language changes.

## Latency Budget
- Connection setup: < 50 ms (keep-alive pool).
- TTFB: < 120 ms.
- Full sentence (15 words): < 2 s.
- Gracefully degrade by switching to cached clip if threshold exceeded.

## Reliability & Safeguards
- Circuit breaker: on repeated 5xx/timeout, short-circuit to fallback voice or offline mode.
- Rate limit monitoring (characters/minute) with alerts when reaching 80% threshold.
- Voice cloning governance: require consent token for custom voices; store proofs for audit.

## Implementation Tasks
- Build voice service using Fastify + ws, decode ElevenLabs binary chunks to PCM/Opus.
- Expose REST/WebSocket API to browser clients (`/speak` endpoint).
- Implement client-side audio player that handles jitter buffer, time stretching for lip-sync.
- Write integration tests mocking ElevenLabs WebSocket responses.
