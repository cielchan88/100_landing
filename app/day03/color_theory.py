"""Color theory utilities for Day 3 — Color Heist.

Pure functions. No Flask, no IO. All HEX strings are lowercase 7 chars (#rrggbb).
"""
from __future__ import annotations

import colorsys
import re
from typing import Dict, List, Tuple

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

# Lightness clamp range — avoids pure white/black at extremes
_L_MIN = 0.05
_L_MAX = 0.95


def _norm_hex(h: str) -> str:
    if not _HEX_RE.match(h or ""):
        raise ValueError(f"Invalid HEX color: {h!r}")
    return "#" + h[1:].lower()


def hex_to_rgb(h: str) -> Tuple[int, int, int]:
    h = _norm_hex(h)
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    r, g, b = [max(0, min(255, int(round(v)))) for v in rgb]
    return f"#{r:02x}{g:02x}{b:02x}"


def rgb_to_hsl(rgb: Tuple[int, int, int]) -> Tuple[float, float, float]:
    r, g, b = [v / 255.0 for v in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360.0, s, l)


def hsl_to_rgb(hsl: Tuple[float, float, float]) -> Tuple[int, int, int]:
    h, s, l = hsl
    r, g, b = colorsys.hls_to_rgb((h % 360.0) / 360.0, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return (int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))


def _relative_luminance(rgb: Tuple[int, int, int]) -> float:
    def chan(c: int) -> float:
        sc = c / 255.0
        return sc / 12.92 if sc <= 0.03928 else ((sc + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)


def contrast_ratio(rgb1: Tuple[int, int, int], rgb2: Tuple[int, int, int]) -> float:
    l1 = _relative_luminance(rgb1)
    l2 = _relative_luminance(rgb2)
    lighter, darker = (l1, l2) if l1 >= l2 else (l2, l1)
    return (lighter + 0.05) / (darker + 0.05)


def wcag_level(ratio: float, large_text: bool = False) -> str:
    if ratio >= 7.0:
        return "AAA"
    if ratio >= 4.5:
        return "AA"
    if large_text and ratio >= 3.0:
        return "AA Large"
    return "Fail"


def _with_lightness(seed_hex: str, l: float) -> str:
    h, s, _ = rgb_to_hsl(hex_to_rgb(seed_hex))
    l = max(_L_MIN, min(_L_MAX, l))
    return rgb_to_hex(hsl_to_rgb((h, s, l)))


def _rotate_hue(seed_hex: str, delta_deg: float) -> str:
    h, s, l = rgb_to_hsl(hex_to_rgb(seed_hex))
    return rgb_to_hex(hsl_to_rgb(((h + delta_deg) % 360.0, s, l)))


def _tints(seed_hex: str, steps: List[float]) -> List[str]:
    """Mix seed toward white. step in (0..1), 1 = pure white."""
    r, g, b = hex_to_rgb(seed_hex)
    out = []
    for step in steps:
        nr = r + (255 - r) * step
        ng = g + (255 - g) * step
        nb = b + (255 - b) * step
        out.append(rgb_to_hex((int(nr), int(ng), int(nb))))
    return out


def _shades(seed_hex: str, steps: List[float]) -> List[str]:
    """Mix seed toward black. step in (0..1), 1 = pure black."""
    r, g, b = hex_to_rgb(seed_hex)
    out = []
    for step in steps:
        nr = r * (1 - step)
        ng = g * (1 - step)
        nb = b * (1 - step)
        out.append(rgb_to_hex((int(nr), int(ng), int(nb))))
    return out


def generate_complementary(seed_hex: str) -> List[str]:
    seed = _norm_hex(seed_hex)
    complement = _rotate_hue(seed, 180)
    return [
        seed,
        complement,
        *_tints(seed, [0.2, 0.4, 0.6]),
        *_shades(seed, [0.2, 0.4, 0.6]),
    ][:8]


def generate_analogous(seed_hex: str) -> List[str]:
    seed = _norm_hex(seed_hex)
    return [
        _rotate_hue(seed, -45),
        _rotate_hue(seed, -30),
        _rotate_hue(seed, -15),
        seed,
        _rotate_hue(seed, 15),
        _rotate_hue(seed, 30),
        _rotate_hue(seed, 45),
        _rotate_hue(seed, 60),
    ]


def generate_triadic(seed_hex: str) -> List[str]:
    seed = _norm_hex(seed_hex)
    t1 = _rotate_hue(seed, 120)
    t2 = _rotate_hue(seed, 240)
    return [
        seed,
        t1,
        t2,
        *_tints(seed, [0.3]),
        *_shades(seed, [0.3]),
        *_tints(t1, [0.3]),
        *_shades(t2, [0.3]),
    ][:8]


def generate_monochromatic(seed_hex: str) -> List[str]:
    seed = _norm_hex(seed_hex)
    h, s, _ = rgb_to_hsl(hex_to_rgb(seed))
    lightnesses = [0.15, 0.25, 0.35, 0.50, 0.65, 0.75, 0.85, 0.92]
    return [rgb_to_hex(hsl_to_rgb((h, s, max(_L_MIN, min(_L_MAX, l))))) for l in lightnesses]


def generate_all_palettes(seed_hex: str) -> Dict[str, List[str]]:
    return {
        "complementary": generate_complementary(seed_hex),
        "analogous": generate_analogous(seed_hex),
        "triadic": generate_triadic(seed_hex),
        "monochromatic": generate_monochromatic(seed_hex),
    }


_WHITE = (255, 255, 255)
_BLACK = (0, 0, 0)


def annotate_swatch(hex_color: str) -> Dict:
    """Return contrast info + WCAG levels for a single color."""
    rgb = hex_to_rgb(hex_color)
    cw = contrast_ratio(rgb, _WHITE)
    cb = contrast_ratio(rgb, _BLACK)
    return {
        "hex": _norm_hex(hex_color),
        "contrast_white": round(cw, 2),
        "contrast_black": round(cb, 2),
        "wcag_white": wcag_level(cw),
        "wcag_black": wcag_level(cb),
    }
