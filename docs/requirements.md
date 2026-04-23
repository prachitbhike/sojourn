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

## Next Deliverables
- Prompt template library & art guidelines (Step 2).
- Animation atlas specification and tooling plan (Step 3).
- System architecture diagram for multimodal orchestration (Step 7).
