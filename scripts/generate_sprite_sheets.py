from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Tuple

from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "packages" / "assets" / "sprites"

FRAME_SIZE: Tuple[int, int] = (128, 128)
IDLE_FRAMES = 4
TALK_FRAMES = 4
WALK_FRAMES = 4

ANIMATION_SEQUENCE: Tuple[Tuple[str, int], ...] = (
    ("idle", IDLE_FRAMES),
    ("talk", TALK_FRAMES),
    ("walk_down", WALK_FRAMES),
    ("walk_up", WALK_FRAMES),
    ("walk_left", WALK_FRAMES),
    ("walk_right", WALK_FRAMES),
)

METADATA_LABELS = {
    "walk_down": "walkDown",
    "walk_up": "walkUp",
    "walk_left": "walkLeft",
    "walk_right": "walkRight",
}


@dataclass(frozen=True)
class PersonaStyle:
    persona_id: str
    body: Tuple[int, int, int, int]
    accent: Tuple[int, int, int, int]
    shadow: Tuple[int, int, int, int]
    highlight: Tuple[int, int, int, int]
    lighting_angle: int


PERSONA_STYLES: Dict[str, PersonaStyle] = {
    "mentor-nano-banana": PersonaStyle(
        persona_id="mentor-aurora",
        body=(255, 214, 102, 255),
        accent=(76, 132, 255, 255),
        shadow=(230, 191, 85, 255),
        highlight=(255, 239, 170, 200),
        lighting_angle=-35,
    ),
    "trickster-nano-banana": PersonaStyle(
        persona_id="trickster-pip",
        body=(255, 136, 102, 255),
        accent=(153, 51, 255, 255),
        shadow=(230, 120, 90, 255),
        highlight=(255, 190, 160, 180),
        lighting_angle=30,
    ),
    "merchant-nano-banana": PersonaStyle(
        persona_id="merchant-vela",
        body=(102, 221, 153, 255),
        accent=(255, 239, 128, 255),
        shadow=(90, 198, 137, 255),
        highlight=(206, 255, 204, 180),
        lighting_angle=-15,
    ),
}

WALK_OFFSETS: Dict[str, Tuple[Tuple[int, int], ...]] = {
    "down": ((0, 0), (1, 1), (0, 2), (-1, 1)),
    "up": ((0, -1), (-1, 0), (0, 1), (1, 0)),
    "left": ((-2, 0), (-3, 1), (-2, 2), (-1, 1)),
    "right": ((2, 0), (3, 1), (2, 2), (1, 1)),
}

EYE_SWAY_IDLE = (-4, 0, 4, 0)
EYE_SWAY_TALK = (0, -2, 2, -1)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, palette in PERSONA_STYLES.items():
        sprite, metadata = build_sprite_sheet(filename, palette)

        png_path = OUTPUT_DIR / f"{filename}.png"
        json_path = OUTPUT_DIR / f"{filename}.json"

        sprite.save(png_path)
        json_path.write_text(json.dumps(metadata, indent=2))

        print(f"Wrote {png_path.relative_to(REPO_ROOT)}")
        print(f"Wrote {json_path.relative_to(REPO_ROOT)}")


def build_sprite_sheet(filename: str, palette: PersonaStyle):
    total_frames = sum(count for _, count in ANIMATION_SEQUENCE)
    sprite = Image.new(
        "RGBA",
        (FRAME_SIZE[0] * total_frames, FRAME_SIZE[1]),
        (0, 0, 0, 0),
    )

    metadata_entries: Dict[str, Dict[str, object]] = {}
    cursor = 0

    for mode, frame_count in ANIMATION_SEQUENCE:
        for frame_index in range(frame_count):
            frame = render_frame(mode, frame_index, palette)
            sprite.paste(frame, (cursor * FRAME_SIZE[0], 0), frame)
            cursor += 1

        start_frame = cursor - frame_count
        end_frame = cursor - 1
        metadata_key = METADATA_LABELS.get(mode, mode)
        metadata_entries[metadata_key] = {
            "startFrame": start_frame,
            "endFrame": end_frame,
            "frameRate": 6 if mode.startswith("walk") or mode == "idle" else 10,
            "loop": True,
            "frameCount": frame_count,
        }

    metadata = {
        "personaId": palette.persona_id,
        "texture": f"packages/assets/sprites/{filename}.png",
        "frameSize": {
            "width": FRAME_SIZE[0],
            "height": FRAME_SIZE[1],
        },
        "animations": metadata_entries,
        "lighting": {
            "primaryAngleDegrees": palette.lighting_angle,
            "technique": "procedural-soft-highlight",
            "notes": "Highlight sweeps subtly across frames to increase perceived depth.",
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    return sprite, metadata


def render_frame(mode: str, frame_index: int, palette: PersonaStyle) -> Image.Image:
    frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)

    direction = mode.split("_", 1)[1] if mode.startswith("walk_") else None

    offsets = WALK_OFFSETS.get(direction or "", ((0, 0),))  # type: ignore[arg-type]
    body_dx, body_dy = offsets[frame_index % len(offsets)]

    eye_cycle = EYE_SWAY_IDLE if mode != "talk" else EYE_SWAY_TALK
    eye_offset = eye_cycle[frame_index % len(eye_cycle)]
    if direction == "left":
        eye_offset -= 2
    elif direction == "right":
        eye_offset += 2

    mouth_height = (
        10 + (frame_index % 2) * 4 if mode == "talk" else 6
    )

    draw_banana_body(draw, palette, body_dx, body_dy)
    apply_lighting(frame, frame_index, palette.highlight, body_dx, body_dy)

    left_eye_center = (54 + eye_offset + body_dx, 60 + body_dy)
    right_eye_center = (74 + eye_offset + body_dx, 60 + body_dy)

    draw_eye(draw, left_eye_center, palette.accent)
    draw_eye(draw, right_eye_center, palette.accent)

    draw_mouth(draw, left_eye_center, mouth_height, body_dx, body_dy)

    star_phase = frame_index % len(EYE_SWAY_IDLE)
    star_offset_x = (-6, 0, 6, 0)[star_phase]
    star_offset_y = (0, 2, 0, -2)[star_phase]
    if direction == "left":
        star_offset_x -= 4
    elif direction == "right":
        star_offset_x += 4

    draw_star(
        draw,
        48 + star_offset_x + body_dx,
        28 + star_offset_y + body_dy,
        palette.accent,
    )

    apply_ground_shadow(frame, body_dx)

    return frame


def draw_banana_body(
    draw: ImageDraw.ImageDraw,
    palette: PersonaStyle,
    dx: int,
    dy: int,
) -> None:
    draw.ellipse((24 + dx, 12 + dy, 104 + dx, 120 + dy), fill=palette.body)
    draw.ellipse((28 + dx, 24 + dy, 100 + dx, 116 + dy), fill=palette.body)
    draw.ellipse((34 + dx, 40 + dy, 94 + dx, 118 + dy), fill=palette.shadow)


def draw_mouth(
    draw: ImageDraw.ImageDraw,
    left_eye_center: Tuple[int, int],
    mouth_height: int,
    dx: int,
    dy: int,
) -> None:
    mouth_top = 80 + dy
    mouth_width = 24
    draw.rounded_rectangle(
        (
            left_eye_center[0] - 4,
            mouth_top,
            left_eye_center[0] - 4 + mouth_width,
            mouth_top + mouth_height,
        ),
        radius=max(1, mouth_height // 2),
        fill=(48, 48, 48, 255),
    )


def draw_eye(
    draw: ImageDraw.ImageDraw,
    center: Tuple[int, int],
    color: Tuple[int, int, int, int],
) -> None:
    x, y = center
    draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(255, 255, 255, 255))
    draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)


def draw_star(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    color: Tuple[int, int, int, int],
) -> None:
    radius = 6
    points = [
        (x, y - radius),
        (x + radius // 2, y - radius // 2),
        (x + radius, y),
        (x + radius // 2, y + radius // 2),
        (x, y + radius),
        (x - radius // 2, y + radius // 2),
        (x - radius, y),
        (x - radius // 2, y - radius // 2),
    ]
    draw.polygon(points, fill=color)


def apply_lighting(
    frame: Image.Image,
    frame_index: int,
    highlight_color: Tuple[int, int, int, int],
    dx: int,
    dy: int,
) -> None:
    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    sweep = math.sin((frame_index / 4) * math.pi)
    highlight_width = 56
    highlight_height = 90
    offset_x = int(12 + sweep * 8) + dx
    offset_y = 18 + dy

    draw.ellipse(
        (
            36 + offset_x,
            offset_y,
            36 + offset_x + highlight_width,
            offset_y + highlight_height,
        ),
        fill=highlight_color,
    )

    softened = overlay.filter(ImageFilter.GaussianBlur(radius=6))
    frame.alpha_composite(softened)


def apply_ground_shadow(frame: Image.Image, dx: int) -> None:
    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((36 + dx, 104, 92 + dx, 118), fill=(0, 0, 0, 60))
    softened = overlay.filter(ImageFilter.GaussianBlur(radius=4))
    frame.alpha_composite(softened)


if __name__ == "__main__":
    main()
