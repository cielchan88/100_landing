"""Plant Doctor — Day 18.

First vision-modality project. Reuses Day 16's Gemini plumbing (model
resolution, key handling, friendly errors) and the shared app rate limiter.
Accepts a plant photo (multipart or base64), resizes server-side via Pillow,
and asks Gemini for a structured JSON assessment. No image is persisted.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, render_template, request

from app import limiter

# Reuse Day 16's Gemini plumbing so all Gemini days share one working model.
from app.day16.blueprint import _friendly_error, _get_gemini, _get_model_name

try:
    import google.generativeai as genai
except ImportError:
    genai = None

from PIL import Image

log = logging.getLogger("day18_plant_doctor")

bp = Blueprint(
    "day18_plant_doctor",
    __name__,
    url_prefix="/day-18/plant-doctor",
    template_folder="../templates",
)

daily_quota = {
    "date": None,
    "count": 0,
    "max_per_day": 1200,
}


def _get_today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _check_quota():
    today = _get_today_str()
    if daily_quota["date"] != today:
        daily_quota["date"] = today
        daily_quota["count"] = 0
    if daily_quota["count"] >= daily_quota["max_per_day"]:
        return False, "daily_quota_exceeded"
    return True, None


def _increment_quota():
    daily_quota["count"] += 1


SYSTEM_PROMPT = """\
You are Plant Doctor, an AI assistant that analyzes photos of plants and provides care guidance.

Your task: examine the provided image of a plant and return a structured JSON response with your assessment.

STRICT OUTPUT FORMAT — return ONLY valid JSON, no markdown fences, no preamble, no commentary:

{
  "species": {
    "name": "Best guess species name (use common name + scientific name in parentheses if known)",
    "confidence": "Confident" | "Likely" | "Uncertain"
  },
  "health": "Thriving" | "Healthy" | "Stressed" | "Struggling",
  "observations": [
    "First observation about what you see",
    "Second observation",
    "Third observation (3-4 total)"
  ],
  "care_recommendations": [
    "First actionable recommendation",
    "Second recommendation",
    "Third recommendation (3-4 total)"
  ],
  "light_water_humidity": {
    "light": "One-line description of light needs",
    "water": "One-line description of watering needs",
    "humidity": "One-line description of humidity needs"
  },
  "disclaimer": "Brief disclaimer if relevant (e.g., 'For severe issues, consult a horticulturist.')"
}

CONFIDENCE GUIDELINES:
- "Confident" = clearly a recognizable common houseplant (Monstera, Pothos, Snake Plant, Spider Plant, etc.)
- "Likely" = recognizable family but specific species uncertain (e.g., "a type of Philodendron")
- "Uncertain" = limited identification possible from this image

HEALTH GUIDELINES:
- "Thriving" = visibly healthy, growing well, no problems
- "Healthy" = doing fine, no major issues
- "Stressed" = visible signs of stress (yellowing, drooping, etc.) but recoverable
- "Struggling" = serious issues, significant intervention needed

OBSERVATIONS must be specific to THIS image — not generic plant facts. Describe what you actually see in the photo.

RECOMMENDATIONS must be actionable — things the user can DO, not facts they should know.

If the image is NOT a plant (e.g., unclear, blurry, not a plant), return:
{
  "species": {"name": "Unable to identify", "confidence": "Uncertain"},
  "health": "Healthy",
  "observations": ["Image is unclear or doesn't appear to show a plant."],
  "care_recommendations": ["Try a clearer photo with the plant in good light."],
  "light_water_humidity": {"light": "—", "water": "—", "humidity": "—"},
  "disclaimer": "Please upload a clearer plant photo."
}

User-provided context (if any) will follow. Use it to inform your assessment but don't overweight it — the photo is primary evidence.
"""


@bp.route("/")
def index():
    return render_template("day18/index.html")


def _read_image_and_context():
    """Returns (image_bytes, context_text, error_response_or_None)."""
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        file = request.files.get("image")
        if not file:
            return None, "", (jsonify({"error": "no_image", "message": "No image provided"}), 400)
        return file.read(), request.form.get("context", "").strip(), None

    data = request.get_json(silent=True) or {}
    image_data_url = data.get("image", "")
    if not isinstance(image_data_url, str) or not image_data_url.startswith("data:image/"):
        return None, "", (jsonify({"error": "invalid_image", "message": "Invalid image format"}), 400)
    try:
        _, b64data = image_data_url.split(",", 1)
        return base64.b64decode(b64data), str(data.get("context", "")).strip(), None
    except Exception:
        return None, "", (jsonify({"error": "invalid_image", "message": "Could not decode image"}), 400)


@bp.route("/diagnose", methods=["POST"])
@limiter.limit("10 per minute")
def diagnose():
    """Analyze a plant image. Accepts multipart/form-data or base64 JSON."""
    client = _get_gemini()
    if not client:
        return jsonify({
            "error": "service_misconfigured",
            "message": "The AI service isn't configured yet. Please try again later.",
        }), 503

    ok, reason = _check_quota()
    if not ok:
        return jsonify({"error": reason, "message": "Daily quota exceeded. Try again tomorrow."}), 429

    image_bytes, context_text, err = _read_image_and_context()
    if err:
        return err

    if not image_bytes:
        return jsonify({"error": "no_image", "message": "No image provided"}), 400
    if len(image_bytes) > 5 * 1024 * 1024:
        return jsonify({"error": "image_too_large", "message": "Image is too large (max 5MB)"}), 400

    try:
        probe = Image.open(io.BytesIO(image_bytes))
        probe.verify()
    except Exception:
        return jsonify({"error": "invalid_image", "message": "File is not a valid image"}), 400

    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        max_dim = 1024
        if img.width > max_dim or img.height > max_dim:
            img.thumbnail((max_dim, max_dim), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        final_image_bytes = buf.getvalue()
    except Exception:
        return jsonify({"error": "invalid_image", "message": "Could not process the image"}), 400

    if len(context_text) > 1000:
        context_text = context_text[:1000]

    user_message = "Analyze this plant photo."
    if context_text:
        user_message += f"\n\nUser-provided context: {context_text}"

    model_name = _get_model_name()
    _increment_quota()

    try:
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=SYSTEM_PROMPT,
            generation_config={
                "temperature": 0.4,
                "top_p": 0.9,
                "max_output_tokens": 800,
                "response_mime_type": "application/json",
            },
        )

        response = model.generate_content([
            user_message,
            {"mime_type": "image/jpeg", "data": final_image_bytes},
        ])

        try:
            raw_text = (response.text or "").strip()
        except Exception:
            raw_text = ""

        if not raw_text:
            return jsonify({
                "error": "empty_response",
                "message": "The model returned no assessment (the response may have been blocked). Try another photo.",
            }), 502

        cleaned = raw_text
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            parsed = json.loads(cleaned)
            return jsonify({"ok": True, "result": parsed})
        except json.JSONDecodeError:
            log.warning("Gemini did not return valid JSON: %s", raw_text[:200])
            return jsonify({
                "ok": True,
                "result": None,
                "raw_text": raw_text,
                "warning": "Could not parse a structured response. Showing the raw assessment.",
            })
    except Exception as exc:
        log.exception("Plant diagnosis failed (model=%s)", model_name)
        return jsonify({
            "error": "diagnosis_failed",
            "message": _friendly_error(exc, model_name),
        }), 502


@bp.route("/healthz")
def healthz():
    return jsonify({
        "ok": True,
        "api_configured": bool(genai is not None and os.environ.get("GEMINI_API_KEY")),
        "model": _get_model_name(),
        "daily_quota_used": daily_quota["count"],
        "daily_quota_max": daily_quota["max_per_day"],
    })


@bp.errorhandler(429)
def ratelimit_handler(e):
    description = getattr(e, "description", "Rate limit exceeded.")
    return jsonify({
        "error": "rate_limited",
        "message": "Too many requests in a short window. Wait a minute and try again.",
        "detail": str(description),
    }), 429
