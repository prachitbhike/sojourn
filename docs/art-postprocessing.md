# Sprite Post-Processing & Atlas Assembly

## Objectives
- Convert Nano Banana output into Phaser-ready atlases with consistent metadata and naming.
- Ensure assets meet performance and quality KPIs across browsers.

## File Structure
```
assets/
  raw/<archetype>/<state>/<frame>.png
  processed/<archetype>/
    atlas.png
    atlas.json
    metadata.json
```

## Processing Steps
1. **Normalization**
   - Downscale/crop each raw frame to 256×256 (or 128×128 for low-spec mode) using nearest-neighbor to preserve sharp edges.
   - Apply color profile conversion to sRGB, remove alpha fringe via 1px inward shrink if needed.
2. **Padding & Alignment**
   - Enforce 8px transparent padding for idle/talk frames, 12px vertical padding for action/emote frames to prevent clipping during tweening.
   - Align pivot (origin) at character’s feet (x: frame width/2, y: frame height - 12px) and record in metadata.
3. **Atlas Packing**
   - Use TexturePacker CLI (`--trim --multipack false --format phaser3 --size-constraints POT`) to pack frames into a single atlas per archetype.
   - Generate Phaser-compatible JSON including frame names like `mentor_idle_00`.
4. **Metadata Layer**
   - Create `metadata.json` capturing animation sequences:
```
{
  "animations": {
    "idle": {"frames": ["mentor_idle_00", ...], "frameRate": 6, "repeat": -1},
    "walk": {"frames": [...], "frameRate": 10, "repeat": -1},
    "talk": {"frames": [...], "frameRate": 12, "repeat": -1, "visemes": ["rest", "A", "E", "O"]},
    "emote_joy": {"frames": [...], "frameRate": 8, "repeat": 0}
  },
  "pivot": {"x": 0.5, "y": 0.92},
  "scaleVariants": {"hiDPI": 1.0, "loDPI": 0.5}
}
```
5. **Validation**
   - Automated script to load atlas, render frames off-screen, and flag missing frames or misaligned pivots.
   - Visual spot check in Phaser sandbox scene.

## Tooling Recommendations
- TexturePacker (CLI) or FreeTexPacker for FOSS workflow.
- Node-based post-processing script (Sharp/Canvas) for resizing and padding.
- Optional Aseprite CLI for timeline exports if manual animation edits required.

## Deliverables
- Reusable Node script located in `tools/atlas-builder`.
- CI task that validates atlases on pull requests.
- Documentation on asset naming and regeneration process.
