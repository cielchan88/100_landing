"""Color Heist Flask blueprint — Day 3."""
from __future__ import annotations

import logging
import re
from typing import List

import requests
from flask import Blueprint, Response, jsonify, render_template, request

from app import limiter

from . import color_theory
from .extractor import extract_dominant_colors
from .screenshot import URLValidationError, capture_url, validate_url

log = logging.getLogger(__name__)

bp = Blueprint(
    "day03_color_heist",
    __name__,
    url_prefix="/day-03/color-heist",
    template_folder="../templates",
)

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_ALLOWED_MIMETYPES = {"image/png", "image/jpeg", "image/webp", "image/jpg"}


@bp.route("/")
def page():
    return render_template("day03/color_heist.html")


def _build_payload(extracted_hex: List[str], source: str) -> dict:
    annotated = [color_theory.annotate_swatch(h) for h in extracted_hex]
    seed = annotated[0]["hex"] if annotated else "#000000"
    suggestions = color_theory.generate_all_palettes(seed)
    return {
        "extracted": annotated,
        "suggestions": suggestions,
        "seed": seed,
        "source": source,
    }


@bp.route("/api/extract/url", methods=["POST"])
@limiter.limit("10 per hour; 3 per minute")
def extract_url():
    body = request.get_json(silent=True) or {}
    raw_url = (body.get("url") or "").strip()
    try:
        url = validate_url(raw_url)
    except URLValidationError as exc:
        return jsonify({"error": "invalid_url", "message": str(exc)}), 400

    try:
        png_bytes = capture_url(url)
    except RuntimeError as exc:
        return jsonify({
            "error": "missing_key",
            "message": (
                "URL mode needs a ScreenshotOne API key. Set it in your environment "
                "to enable this feature. Image and Color Picker modes still work."
            ),
        }), 503
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else 502
        log.warning("ScreenshotOne HTTPError: %s", exc)
        return jsonify({
            "error": "screenshot_failed",
            "message": f"ScreenshotOne returned an error (HTTP {status}). Try a different URL.",
        }), 502
    except requests.RequestException as exc:
        log.warning("ScreenshotOne request failed: %s", exc)
        return jsonify({
            "error": "screenshot_failed",
            "message": "Could not reach ScreenshotOne. Try again in a moment.",
        }), 502

    try:
        extracted = extract_dominant_colors(png_bytes)
    except ValueError as exc:
        return jsonify({"error": "extract_failed", "message": str(exc)}), 500

    return jsonify(_build_payload(extracted, "url"))


@bp.route("/api/extract/image", methods=["POST"])
@limiter.limit("10 per hour; 3 per minute")
def extract_image():
    file = request.files.get("image")
    if file is None or not file.filename:
        return jsonify({"error": "no_file", "message": "Please attach an image."}), 400
    mt = (file.mimetype or "").lower()
    if mt not in _ALLOWED_MIMETYPES:
        return jsonify({
            "error": "bad_mimetype",
            "message": "Only PNG, JPG, or WebP images are supported.",
        }), 400

    data = file.read()
    if not data:
        return jsonify({"error": "empty", "message": "The uploaded file is empty."}), 400

    try:
        extracted = extract_dominant_colors(data)
    except ValueError as exc:
        return jsonify({"error": "invalid_image", "message": str(exc)}), 400
    except Exception as exc:
        log.exception("Image extraction failed")
        return jsonify({"error": "extract_failed", "message": "Could not extract colors from that image."}), 500

    return jsonify(_build_payload(extracted, "image"))


@bp.route("/api/extract/picker", methods=["POST"])
@limiter.limit("30 per hour; 10 per minute")
def extract_picker():
    body = request.get_json(silent=True) or {}
    seed = (body.get("seed") or "").strip()
    if not _HEX_RE.match(seed):
        return jsonify({
            "error": "invalid_hex",
            "message": "Seed must be a 6-digit HEX color like #22C55E.",
        }), 400

    # "Extracted" palette for picker mode = the monochromatic ladder, primary first.
    mono = color_theory.generate_monochromatic(seed)
    # Put seed at index 0 to keep seed as the dominant color.
    extracted = [seed.lower(), *[c for c in mono if c.lower() != seed.lower()]][:8]
    while len(extracted) < 8:
        extracted.append(extracted[-1])
    return jsonify(_build_payload(extracted, "picker"))


@bp.route("/api/export/svg", methods=["GET"])
def export_svg():
    colors: List[str] = []
    for i in range(1, 9):
        c = request.args.get(f"c{i}", "").strip()
        if not _HEX_RE.match(c):
            return jsonify({"error": "invalid_hex", "message": f"c{i} is not a valid HEX color."}), 400
        colors.append(c.lower())

    sw = 160  # swatch width
    sh = 400
    label_h = 60
    total_w = sw * 8
    total_h = sh + label_h

    rects = []
    labels = []
    for i, c in enumerate(colors):
        x = i * sw
        rects.append(f'<rect x="{x}" y="0" width="{sw}" height="{sh}" fill="{c}"/>')
        labels.append(
            f'<rect x="{x}" y="{sh}" width="{sw}" height="{label_h}" fill="#0F0F0E"/>'
            f'<text x="{x + sw / 2}" y="{sh + label_h / 2 + 5}" '
            f'font-family="monospace" font-size="18" fill="#FAFAF7" text-anchor="middle">{c.upper()}</text>'
        )

    svg = (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}" '
        f'viewBox="0 0 {total_w} {total_h}">'
        + "".join(rects)
        + "".join(labels)
        + "</svg>"
    )

    headers = {
        "Content-Disposition": 'attachment; filename="color-heist-palette.svg"',
        "Cache-Control": "no-store",
    }
    return Response(svg, mimetype="image/svg+xml", headers=headers)


@bp.errorhandler(429)
def ratelimit_handler(e):
    description = getattr(e, "description", "Rate limit exceeded.")
    return jsonify({
        "error": "rate_limited",
        "message": (
            "Too many requests in a short window. "
            "Take a breath and try again in a minute — this keeps Color Heist free for everyone."
        ),
        "detail": str(description),
    }), 429


@bp.errorhandler(413)
def too_large(e):
    return jsonify({
        "error": "too_large",
        "message": "Image too large. Max upload size is 5MB.",
    }), 413
