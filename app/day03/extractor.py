"""Image color extraction via k-means clustering."""
from __future__ import annotations

import logging
from io import BytesIO
from typing import List

log = logging.getLogger(__name__)


def extract_dominant_colors(image_bytes: bytes, k: int = 8) -> List[str]:
    """Return k dominant colors as HEX strings, sorted by cluster size desc."""
    # Local imports — Pillow + sklearn are heavy; only load when needed.
    import numpy as np
    from PIL import Image
    from sklearn.cluster import KMeans

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
    arr = np.asarray(img, dtype=np.uint8).reshape(-1, 3)

    if arr.shape[0] < k:
        k = max(1, arr.shape[0])

    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    km.fit(arr)

    labels = km.labels_
    counts = np.bincount(labels, minlength=k)
    order = np.argsort(counts)[::-1]
    centers = km.cluster_centers_[order]

    out: List[str] = []
    for c in centers:
        r, g, b = [max(0, min(255, int(round(v)))) for v in c]
        out.append(f"#{r:02x}{g:02x}{b:02x}")
    # Pad if fewer than 8 by repeating the dominant
    while len(out) < 8 and out:
        out.append(out[-1])
    return out[:8]
