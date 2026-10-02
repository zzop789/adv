"""Regenerate the original, silent demo clip. Optional: numpy + opencv-python.

The committed video is ready to use; players and normal development do not
require Python or these packages. No external footage, fonts or artwork used.
"""

from pathlib import Path
import math
import cv2
import numpy as np

WIDTH, HEIGHT, FPS, SECONDS = 960, 540, 24, 12
TARGET = Path(__file__).resolve().parents[1] / "games/demo/media/opening.webm"


def main():
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(TARGET), cv2.VideoWriter_fourcc(*"VP80"), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise RuntimeError("This OpenCV build does not support VP8 WebM encoding")
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    rng = np.random.default_rng(42)
    stars = rng.random((55, 3))
    horizon = 302
    for frame in range(FPS * SECONDS):
        time = frame / FPS
        glow = np.exp(-(((xx - 655) / 280) ** 2 + ((yy - 213) / 190) ** 2))
        haze = 0.5 + 0.5 * np.sin(xx / 175 + yy / 96 - time * 0.2)
        image = np.stack([
            25 + glow * 31 + haze * 3,
            20 + glow * 28 + haze * 2,
            14 + glow * 27,
        ], axis=-1)
        image[yy > horizon] *= 0.62
        image = np.uint8(np.clip(image, 0, 255))
        for sx, sy, strength in stars:
            lum = int(55 + strength * 90 + 12 * math.sin(time + sx * 12))
            cv2.circle(image, (int(sx * WIDTH), int(sy * 235)), 1, (lum, lum, lum), -1, cv2.LINE_AA)
        cv2.circle(image, (655, 188), 37, (116, 157, 178), -1, cv2.LINE_AA)
        cv2.circle(image, (645, 177), 37, (48, 45, 39), -1, cv2.LINE_AA)
        cv2.line(image, (0, horizon), (WIDTH, horizon), (45, 57, 61), 1, cv2.LINE_AA)
        for line in range(28):
            y = horizon + 8 + line * 8
            xs = np.arange(0, WIDTH, 3)
            ys = y + np.sin(xs / (50 + line * 2) + time * 0.8 + line) * (1 + line * 0.09)
            points = np.stack([xs, ys], axis=1).astype(np.int32)
            cv2.polylines(image, [points], False, (33 + line // 3, 34 + line // 4, 29), 1, cv2.LINE_AA)
            reflection_x = int(655 + math.sin(time * 0.7 + line * 1.7) * (line + 4))
            half_width = int(6 + line * 1.1)
            color = max(30, 120 - line * 3)
            cv2.line(image, (reflection_x - half_width, y), (reflection_x + half_width, y),
                     (int(color * 0.65), int(color * 0.86), color), 1, cv2.LINE_AA)
        # Slow silhouettes and a thin framing line make motion obvious when seeking.
        cv2.line(image, (76, 389), (76, 273), (11, 14, 12), 3)
        cv2.line(image, (76, 273), (123, 273), (11, 14, 12), 3)
        cv2.circle(image, (120, 280), 4, (108, 161, 190), -1, cv2.LINE_AA)
        cv2.line(image, (24, HEIGHT - 24), (int(24 + (WIDTH - 48) * frame / (FPS * SECONDS - 1)), HEIGHT - 24),
                 (113, 153, 176), 1, cv2.LINE_AA)
        writer.write(image)
    writer.release()
    print(f"Generated {TARGET.name}: {TARGET.stat().st_size:,} bytes, {SECONDS}s, {WIDTH}x{HEIGHT}, VP8, silent")


if __name__ == "__main__":
    main()
