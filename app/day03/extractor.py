"""Image color extraction via Pillow's median-cut quantizer.

We previously used scikit-learn KMeans, but it dragged ~80MB of dependencies
(sklearn + numpy + scipy) onto PythonAnywhere free tier and blew through the
disk quota. PIL's built-in median-cut quantizer produces equally usable
dominant colors at zero extra dependency cost.
"""
from __future__ import annotations

import logging
from io import BytesIO
from typing import List

log = logging.getLogger(__name__)


def extract_dominant_colors(image_bytes: bytes, k: int = 8) -> List[str]:
    """Return k dominant colors as HEX strings, sorted by frequency desc."""
    from PIL import Image

    try:
        img = Image.open(BytesIO(image_bytes))
    except Exception as exc:
        raise ValueError("Invalid image") from exc

    # Composite onto white if there's an alpha channel.
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")

    img.thumbnail((400, 400))

    # Median-cut quantize down to k palette entries.
    try:
        quantized = img.quantize(colors=k, method=Image.Quantize.MEDIANCUT)
    except AttributeError:
        # Older Pillow versions: integer constant
        quantized = img.quantize(colors=k, method=0)

    palette = quantized.getpalette() or []
    # palette is a flat list [r,g,b, r,g,b, ...] of length 256*3
    palette_rgb = [tuple(palette[i:i + 3]) for i in range(0, len(palette), 3)]

    # Count pixel frequency per palette index.
    color_counts = quantized.getcolors(maxcolors=k * 2) or []
    # color_counts is a list of (count, index) tuples — sort desc by count.
    color_counts.sort(key=lambda x: x[0], reverse=True)

    out: List[str] = []
    for count, idx in color_counts:
        if idx < len(palette_rgb):
            r, g, b = palette_rgb[idx]
            out.append(f"#{r:02x}{g:02x}{b:02x}")

    # Pad if fewer than k by repeating the dominant.
    while len(out) < 8 and out:
        out.append(out[-1])
    return out[:8]
