# NPC Creator Vision & Requirements

## Product Vision
- Deliver a browser-based NPC creator that lets storytellers configure personality, appearance, and real-time conversational behavior without touching code.
- Blend state-of-the-art generative tech (Nano Banana sprites, ElevenLabs voice, LLM dialogue engine) into a cohesive authoring experience that feels immediate and reliable.

## Target Users & Journeys
- **Indie game devs**: need fast iteration to populate worlds with believable characters; expect export hooks to engines (Phaser, Unity) and embeddable web widgets.
- **Narrative designers**: focus on persona tuning, emotional arcs, and script overrides; require timeline preview and easy re-generation of specific emotions.
- **Educators & storytellers**: prioritize accessibility, moderation, and multilingual output for classroom/interactive fiction use.

Primary journey:
1. Choose a base archetype (e.g., mentor, trickster, merchant) and mood palette.
2. Customize appearance: prompt tweaks, style presets, and sprite animation previews.
3. Define conversational traits: tone sliders, catchphrases, boundaries.
4. Test in browser: talk via mic/text, observe synced animation + voice, export configuration.

## Experience Principles
- **Trustworthy**: predictable regeneration with versioning, transparent licensing for voices/art.
- **Responsive**: conversational turns under 600 ms end-to-end; streaming audio and animation stay in sync.
- **Inclusive**: captions, adjustable speech rate, accessible color palettes, multilingual support (32+ languages priority).
- **Safe**: adopt proactive content filters, audit logs, and human-in-the-loop review for cloned voices.

## Visual & Audio Direction
- Stylized 2D sprites with clean silhouettes, vibrant but readable palette, 128×128 base frame (scaleable to 256×256 for hi-res).
- Animation set per NPC: idle, walk cycle, talk (viseme-friendly), 4 emotional emotes (joy, anger, sadness, surprise).
- Voice guidance: align emotional intensity tags to ElevenLabs presets, offer 3 default voices per archetype plus custom cloning (with consent).

## Technical KPIs
- Sprite atlas load per NPC ≤ 1.5 MB; animation idle loop ≤ 8 frames, talk/emotes ≤ 12 frames.
- ElevenLabs streaming latency (TTFB) ≤ 120 ms on Flash v2.5; complete utterance < 2 s for 15-word sentences.
- LLM response budget ≤ 500 ms processing (assume hosted inference with caching).
- Frontend target: 60 FPS on mid-tier laptop (Intel Iris GPU) and 30 FPS on mobile Safari.

## Accessibility & Compliance
- WCAG 2.1 AA alignment: captioning, keyboard navigation, contrast ratios.
- Voice usage logging with opt-in consent, GDPR/CCPA compliant data handling.
- Safety filters for prompts (NSFW, hate speech) before calling generation APIs.

## Open Questions & Assumptions
- Assume Nano Banana API access tokens and usage cost budgeting available.
- Need confirmation on preferred LLM provider (OpenAI GPT-5? Vertex?).
- Clarify export targets beyond Phaser (e.g., JSON schema for other engines?).
- Determine hosting stack (static site vs. server-rendered) for final deployment.

## MVP Implementation Plan
1. **Core foundations** — Establish repository structure, shared TypeScript schemas for persona and dialogue turns, and a single end-to-end vertical slice target (one archetype NPC in-browser).
2. **Persona & dialogue MVP** — Author three lightweight persona JSON templates (mentor, trickster, merchant) with tone notes, guardrails, and catchphrases; deliver a Dialogue Orchestrator stub returning canned responses while logging safety checks.
3. **Art & animation baseline** — Generate one Nano Banana sprite sheet per persona with idle/talk frames only, then connect to a Phaser state machine that reacts to `talk` versus `idle`.
4. **Voice path minimal** — Integrate ElevenLabs streaming for one default voice per persona, including captions and a mute fallback whenever the API call fails.
5. **Browser playground** — Ship a simple React panel that lets creators pick a persona, submit text, and observe synchronized speech plus sprite animation; keep transcripts locally for testing.
6. **Validation & instrumentation** — Add lightweight latency and safety logging, and run a manual accessibility checklist (captions toggle, keyboard navigation) before expanding scope.

## April 23, 2026 Updates
- **Dialogue hardening**: Added a pluggable `DialogueGenerator` interface with deterministic randomness injection and accompanying Vitest coverage for generator fallbacks and safety logging.
- **Persona flavor**: Expanded canned responses per mentor/trickster/merchant archetype to reduce conversational repetition while generator hooks are still stubbed.
- **Procedural sprites**: Sprite generator now applies soft lighting/ambient occlusion, outputs higher fidelity frames, and writes persona-aligned sprite metadata JSON files.
- **Voice polish**: Playground exposes playback speed (0.75–1.5×) and volume sliders, and surfaces a mute-state banner whenever ElevenLabs falls back to captions-only.
- **Metrics export**: Instrumentation keeps recent history in-memory and maintains a JSONL buffer that can be downloaded directly from the playground.

### Decisions
- LLM integration will pursue a streaming generator so animation and forthcoming voice buffers can stay aligned.
- JSONL metrics export remains a local-first artifact; we will accumulate requirements for a lightweight ingestion hook (e.g., CLI uploader or background sync) once sharing beyond local dev is needed.

### Follow-up Questions
1. Do we want persona definitions to reference the generated sprite metadata directly, or keep metadata as a tooling artifact?
2. What additional animation states (walk/emotes) should the procedural generator target next to match design goals?
