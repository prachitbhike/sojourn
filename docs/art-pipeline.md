# Nano Banana Sprite Generation Pipeline

## Goals
- Produce consistent multi-pose NPC sprite sets ready for Phaser animation atlases.
- Minimize prompt drift across regenerations; store metadata for deterministic reruns.

## Reference Setup
- Create shared prompt library (JSON/YAML) with archetype descriptors: style, clothing, palette, personality cues.
- Maintain visual reference board (Figma/Notion) linked to prompt IDs to keep art direction aligned.
- Target output resolution: 512×512 PNG per frame before downscaling/cropping.

## Prompt Template Structure
```
<Archetype descriptor>, <emotion modifier>, full body sprite facing <direction>, clean background, flat lighting, cel-shaded, animation frame, sprite sheet friendly, consistent proportions, no text, high contrast outline
```
Parameters:
- **Style anchors**: "studio ghibli inspired", "modern pixel hybrid", etc.
- **Emotion modifiers**: joyful grin, stern glare, surprised gasp, sad frown.
- **Pose keywords**: neutral stance, walking stride (left leg forward), talk mouth open mid-phoneme, emote gestures.

## Batch Strategy
1. For each NPC archetype, generate base neutral pose in four facing directions (front, 3/4 left, left, rear) for design reference.
2. Generate sprite frame sequences by looping pose/emotion variants (8–12 images per emotion):
   - Idle loop (subtle breathing, blinking).
   - Walk cycle (4 or 8 frames, alternating contact/passing positions).
   - Talk viseme set (A, E, O, rest) for lip-sync blending.
   - Emote frames (joy jump, anger fists, sadness slouch, surprise recoil).
3. Use API pagination to request up to 10 images per call; throttle to stay within credit budget.

## Automation Hooks
- If Nano Banana exposes REST hooks, implement Node CLI that ingests prompt YAML and writes raw outputs to `assets/raw/<archetype>/<state>/<frame>.png`.
- Record metadata JSON alongside each frame:
```
{
  "prompt_id": "mentor_idle_01",
  "seed": 123456789,
  "emotion": "idle",
  "pose": "breathing",
  "lighting": "neutral",
  "timestamp": "2026-04-23T10:15:00-07:00"
}
```
- Store API responses (request/response) for auditability and re-run debugging.

## Quality Review Checklist
- Silhouette readability at 64×64 thumbnail.
- Consistent line weight and color palette across frames.
- No background artifacts or text.
- Limbs align between frames to avoid jitter; if necessary, retouch in Aseprite.
- Talk frames align jaw positions for smooth interpolation.

## Post-Generation Actions
- Downscale/crop to 256×256 safe frame, leaving 8px padding for animation bleed.
- Group frames per animation into dedicated folders ready for atlas packing.
- Flag any frames needing manual cleanup and assign to art touch-up queue.

## Tools & Roles
- **Automation**: Node script + Nano Banana API wrapper.
- **Manual QA**: Aseprite/Photoshop for retouching.
- **Asset Manager**: Maintains prompt library, version tags, and metadata storage (Git LFS or S3).

## Risks & Mitigations
- **Prompt drift**: lock seeds, maintain prompt templates, and re-use reference images when available.
- **API rate limits**: implement exponential backoff and nightly batch windows.
- **Cost overruns**: track credits per archetype; use low-res previews before committing to full sets.

## Next Steps
- Build prompt template repository (`content/prompts/*.yaml`).
- Prototype Node CLI for batch generation (Step 2 deliverable).
- Define manual cleanup workflow and asset approval checklist.
