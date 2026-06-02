"""Riba & Risk: Open Economy — Day 23.

Open-economy successor to Day 22. Adds floating exchange rate, cross-border
capital flows, and current account. Two new external shocks (global rate,
sudden stop). Gemini narrative reuses Day 16's working model resolution.
Day 22's closed-economy blueprint stays untouched.
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

log = logging.getLogger("day23_open_economy")

bp = Blueprint(
    "day23_open_economy",
    __name__,
    url_prefix="/day-23/open-economy",
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
You are an economics explainer for an interactive simulation called "Riba & Risk: Open Economy" that compares a stylized conventional (interest-based) monetary system against a stylized Islamic (profit-sharing / asset-backed) monetary system — now as OPEN economies with a floating exchange rate, cross-border capital flows, and a current account — facing the same shock.

You will receive a JSON summary of one simulation run: the shock type, parameters, and resulting time series for both economies (output gap, inflation, stability metric, exchange rate, and capital/current-account).

Write a balanced, academically honest explanation (3-4 short paragraphs) of WHY the two economies diverged in THIS run. Rules, strictly:

1. NEVER declare a winner. Both systems face genuine open-economy trade-offs that economists still debate.
2. Explain via actual mechanisms: the conventional interest-rate channel doubling as a capital magnet (uncovered interest parity intuition), exchange-rate pass-through, and FX-denominated balance-sheet effects; versus the Islamic system's lack of a policy-rate lever, capital flows responding to expected real returns, equity-like/profit-sharing flows being structurally stickier, and the absence of an FX-debt spiral.
3. Be explicit and even-handed about the Islamic system's open-economy DOWNSIDES too: no interest lever to defend the currency in a sudden stop, so the currency can move more on impact; and that real dual-banking systems host many instruments that mimic debt, so it is NOT immune to capital flight.
4. Be explicit about the conventional system's costs: defending the currency by raising rates deepens the domestic downturn; FX debt creates balance-sheet fragility on depreciation.
5. Reference the specific shock and what the numbers show (which currency moved more, which trough was deeper, capital-flow behaviour).
6. State clearly this is a STYLIZED PEDAGOGICAL MODEL with a floating exchange rate only, not a prediction or a representation of any real economy, and that no system escapes the impossible trinity.
7. Accurate terminology: riba (interest), mudharabah/musyarakah (profit-and-loss sharing), uncovered interest parity, current account, sudden stop, exchange-rate pass-through. Do not misuse terms.
8. Neutral, measured tone. No religious endorsement, no critique of legitimacy. Pure mechanism.

Output plain text (no markdown headers, no bullet lists). 3-4 paragraphs.
"""


@bp.route("/")
def index():
    return render_template("day23/index.html")


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
            generation_config={"temperature": 0.5, "top_p": 0.9, "max_output_tokens": 800},
        )
        resp = model.generate_content(
            f"Here is the open-economy simulation run summary:\n{summary_str}\n\nExplain why the two economies diverged."
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
        log.exception("Day23 explain failed (model=%s)", model_name)
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
