from __future__ import annotations

from pathlib import Path
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Tuple

from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "packages" / "assets" / "sprites"
FRAME_SIZE: Tuple[int, int] = (128, 128)
IDLE_FRAMES = 4
TALK_FRAMES = 4


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
        lighting_angle=-35
    ),
    "trickster-nano-banana": PersonaStyle(
        persona_id="trickster-pip",
        body=(255, 136, 102, 255),
        accent=(153, 51, 255, 255),
        shadow=(230, 120, 90, 255),
        highlight=(255, 190, 160, 180),
        lighting_angle=30
    ),
    "merchant-nano-banana": PersonaStyle(
        persona_id="merchant-vela",
        body=(102, 221, 153, 255),
        accent=(255, 239, 128, 255),
        shadow=(90, 198, 137, 255),
        highlight=(206, 255, 204, 180),
        lighting_angle=-15
    )
}


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, palette in PERSONA_STYLES.items():
        persona_id = palette.persona_id
        sprite = Image.new(
            "RGBA",
            (FRAME_SIZE[0] * (IDLE_FRAMES + TALK_FRAMES), FRAME_SIZE[1]),
            (0, 0, 0, 0)
        )

        for idx in range(IDLE_FRAMES + TALK_FRAMES):
            mode = "idle" if idx < IDLE_FRAMES else "talk"
            frame_index = idx if idx < IDLE_FRAMES else idx - IDLE_FRAMES
            frame = render_frame(mode, frame_index, palette)
            sprite.paste(frame, (idx * FRAME_SIZE[0], 0), frame)

        output_path = OUTPUT_DIR / f"{filename}.png"
        sprite.save(output_path)
        print(f"Wrote {output_path.relative_to(REPO_ROOT)}")

        metadata_path = OUTPUT_DIR / f"{filename}.json"
        metadata = build_metadata(filename, persona_id, palette.lighting_angle)
        metadata_path.write_text(json.dumps(metadata, indent=2))
        print(f"Wrote {metadata_path.relative_to(REPO_ROOT)}")


def render_frame(
    mode: str,
    frame_index: int,
    palette: PersonaStyle
) -> Image.Image:
    frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)

    body_color = palette.body
    shadow_color = palette.shadow
    accent_color = palette.accent
    highlight_color = palette.highlight

    # Draw banana body
    draw.ellipse((24, 12, 104, 120), fill=body_color)
    draw.ellipse((28, 24, 100, 116), fill=body_color)

    # Add shadow for depth
    draw.ellipse((34, 40, 94, 118), fill=shadow_color)

    apply_lighting(frame, frame_index, highlight_color)

    # Facial expression adjustments per frame
    eye_offset = [-4, 0, 4, 0][frame_index % 4] if mode == "idle" else [0, -2, 2, -1][frame_index % 4]
    mouth_height = 6 if mode == "idle" else 10 + (frame_index % 2) * 4

    left_eye_center = (54 + eye_offset, 60)
    right_eye_center = (74 + eye_offset, 60)

    draw_eye(draw, left_eye_center, accent_color)
    draw_eye(draw, right_eye_center, accent_color)

    # Mouth dynamics
    mouth_top = 80
    mouth_width = 24
    draw.rounded_rectangle(
        (
            left_eye_center[0] - 4,
            mouth_top,
            left_eye_center[0] - 4 + mouth_width,
            mouth_top + mouth_height
        ),
        radius=mouth_height // 2,
        fill=(48, 48, 48, 255)
    )

    # Small accent star/glimmer to indicate persona
    draw_star(draw, (32 + frame_index * 2) % 96 + 16, 32 + (frame_index % 3) * 4, accent_color)

    # Add soft ambient occlusion at the base for grounding
    apply_ground_shadow(frame)

    return frame


def draw_eye(draw: ImageDraw.ImageDraw, center: Tuple[int, int], color: Tuple[int, int, int, int]) -> None:
    x, y = center
    draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(255, 255, 255, 255))
    draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)


def draw_star(draw: ImageDraw.ImageDraw, x: int, y: int, color: Tuple[int, int, int, int]) -> None:
    radius = 6
    points = [
        (x, y - radius),
        (x + radius // 2, y - radius // 2),
        (x + radius, y),
        (x + radius // 2, y + radius // 2),
        (x, y + radius),
        (x - radius // 2, y + radius // 2),
        (x - radius, y),
        (x - radius // 2, y - radius // 2)
    ]
    draw.polygon(points, fill=color)


def apply_lighting(frame: Image.Image, frame_index: int, highlight_color: Tuple[int, int, int, int]) -> None:
    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Sweep highlight subtly across frames to imply motion
    sweep = math.sin((frame_index / 4) * math.pi)
    highlight_width = 56
    highlight_height = 90
    offset_x = int(12 + sweep * 8)
    offset_y = 18

    draw.ellipse(
        (
            36 + offset_x,
            offset_y,
            36 + offset_x + highlight_width,
            offset_y + highlight_height
        ),
        fill=highlight_color
    )

    softened = overlay.filter(ImageFilter.GaussianBlur(radius=6))
    frame.alpha_composite(softened)


def apply_ground_shadow(frame: Image.Image) -> None:
    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((36, 104, 92, 118), fill=(0, 0, 0, 60))
    softened = overlay.filter(ImageFilter.GaussianBlur(radius=4))
    frame.alpha_composite(softened)


def build_metadata(filename: str, persona_id: str, lighting_angle: int) -> Dict[str, object]:
    return {
        "personaId": persona_id,
        "texture": f"packages/assets/sprites/{filename}.png",
        "frameSize": {
            "width": FRAME_SIZE[0],
            "height": FRAME_SIZE[1]
        },
        "animations": {
            "idle": {
                "startFrame": 0,
                "endFrame": IDLE_FRAMES - 1,
                "frameRate": 6,
                "loop": True,
                "frameCount": IDLE_FRAMES
            },
            "talk": {
                "startFrame": IDLE_FRAMES,
                "endFrame": IDLE_FRAMES + TALK_FRAMES - 1,
                "frameRate": 10,
                "loop": True,
                "frameCount": TALK_FRAMES
            }
        },
        "lighting": {
            "primaryAngleDegrees": lighting_angle,
            "technique": "procedural-soft-highlight",
            "notes": "Highlight sweeps subtly across frames to increase perceived depth."
        },
        "generatedAt": datetime.now(timezone.utc).isoformat()
    }


if __name__ == "__main__":
    main()
