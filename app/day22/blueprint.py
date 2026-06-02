"""Riba & Risk — Day 22.

Comparative macro simulation (conventional vs Islamic monetary system).
Pure client-side math; Gemini is used only for the post-run narrative,
reusing the Day 16 helpers (model resolution, friendly errors, guarded import).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, render_template, request

from app import limiter
from app.day16.blueprint import _friendly_error, _get_gemini, _get_model_name

try:
    import google.generativeai as genai
except ImportError:
    genai = None

log = logging.getLogger("day22_riba_and_risk")

bp = Blueprint(
    "day22_riba_and_risk",
    __name__,
    url_prefix="/day-22/riba-and-risk",
    template_folder="../templates",
)

daily_quota = {"date": None, "count": 0, "max_per_day": 1200}


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _check_quota():
    today = _today_str()
    if daily_quota["date"] != today:
        daily_quota["date"] = today
        daily_quota["count"] = 0
    return daily_quota["count"] < daily_quota["max_per_day"]


SYSTEM_PROMPT = """\
You are an economics explainer for an interactive simulation called "Riba & Risk" that compares a stylized conventional (interest-based) monetary system against a stylized Islamic (profit-sharing / asset-backed) monetary system facing the same macroeconomic shock.

You will receive a JSON summary of one simulation run: the shock type, the parameters, and the resulting time series for both economies (output gap, inflation, and a stability metric).

Write a balanced, academically honest explanation (3-4 short paragraphs) of WHY the two economies diverged in THIS run. Follow these rules strictly:

1. NEVER declare a winner. Both systems have genuine trade-offs. Your job is to explain mechanisms, not to advocate.
2. Explain the divergence in terms of the actual mechanisms: the conventional interest-rate channel and debt accumulation vs. the Islamic profit-sharing risk-absorption and real-economy-linked returns.
3. Reference the specific shock and what you see in the numbers (e.g., "the conventional economy's deeper trough reflects debt amplification").
4. Be explicit that this is a STYLIZED PEDAGOGICAL MODEL, not a prediction or a representation of any real economy, and that real Islamic finance operates in dual-banking systems with imperfect risk-sharing.
5. Use accurate terminology: riba (interest), mudharabah and musyarakah (profit-and-loss sharing contracts), asset-backing. Do not misuse terms.
6. Neutral, measured tone. No religious endorsement, no critique of either system's legitimacy. Pure mechanism.
7. Keep it tight: 3-4 paragraphs, readable by an informed general audience.

Output plain text (no markdown headers, no bullet lists). Just the paragraphs.
"""


@bp.route("/")
def index():
    return render_template("day22/index.html")


@bp.route("/explain", methods=["POST"])
@limiter.limit("10 per minute")
def explain():
    client = _get_gemini()
    if not client:
        return jsonify({
            "error": "service_misconfigured",
            "message": "The AI service isn't configured yet. The simulation above is still valid.",
        }), 503

    if not _check_quota():
        return jsonify({
            "error": "daily_quota_exceeded",
            "message": "Daily quota exceeded. Try again tomorrow.",
        }), 429

    data = request.get_json(silent=True) or {}
    summary = data.get("summary")
    if not summary:
        return jsonify({"error": "no_summary", "message": "Missing simulation summary."}), 400

    summary_str = json.dumps(summary)[:6000]

    model_name = _get_model_name()
    daily_quota["count"] += 1

    try:
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=SYSTEM_PROMPT,
            generation_config={
                "temperature": 0.5,
                "top_p": 0.9,
                "max_output_tokens": 700,
            },
        )
        resp = model.generate_content(
            f"Here is the simulation run summary:\n{summary_str}\n\nExplain why the two economies diverged."
        )
        try:
            narrative = (resp.text or "").strip()
        except Exception:
            narrative = ""
        if not narrative:
            return jsonify({
                "error": "empty_response",
                "message": "The model returned no text. The simulation above is still valid.",
            }), 502
        return jsonify({"ok": True, "narrative": narrative})
    except Exception as exc:
        log.exception("Riba&Risk explain failed (model=%s)", model_name)
        return jsonify({
            "error": "explain_failed",
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
    return jsonify({
        "error": "rate_limited",
        "message": "Too many requests in a short window. Try again in a minute.",
    }), 429
