#!/usr/bin/env python3
"""Generate a monochrome glass-style macOS app icon using only the stdlib."""

import math
import os
import struct
import zlib


ICONSET = os.path.join(os.path.dirname(__file__), "..", "Resources", "AppIcon.iconset")
os.makedirs(ICONSET, exist_ok=True)


def rounded_square_distance(x, y, size, radius):
    center = size / 2
    qx = abs(x - center) - (center - radius)
    qy = abs(y - center) - (center - radius)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius


def pixel(x, y, size):
    scale = size / 1024
    outer = rounded_square_distance(x, y, size, 220 * scale)
    if outer > 0:
        return 0, 0, 0, 0

    background = int(13 + 14 * (y / size))
    color = [background, background, background]
    if outer > -5 * scale:
        color = [112, 112, 112]
    elif rounded_square_distance(x, y, size, 195 * scale) < -35 * scale:
        color = [21, 21, 21]

    center = size / 2
    dx, dy = x - center, y - center
    radius = math.hypot(dx, dy)
    angle = math.atan2(dy, dx)

    # Six clean spokes form the asterisk mark.
    nearest_spoke = min(
        abs(math.sin(angle - index * math.pi / 3)) * radius
        for index in range(6)
    )
    if radius < 255 * scale and radius > 72 * scale and nearest_spoke < 17 * scale:
        return 255, 255, 255, 255
    if radius <= 53 * scale:
        return 235, 235, 235, 255

    highlight = rounded_square_distance(x, y, size, 212 * scale)
    if -10 * scale < highlight < -7 * scale:
        color = [205, 205, 205]
    return color[0], color[1], color[2], 255


def png_chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def write_png(path, size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            rows.extend(pixel(x + 0.5, y + 0.5, size))
    header = struct.pack(">2I5B", size, size, 8, 6, 0, 0, 0)
    image = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + png_chunk(b"IEND", b"")
    )
    with open(path, "wb") as icon_file:
        icon_file.write(image)


ICON_SIZES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}

for filename, dimensions in ICON_SIZES.items():
    write_png(os.path.join(ICONSET, filename), dimensions)
