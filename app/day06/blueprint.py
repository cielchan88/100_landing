"""The Shape of a Scam Flask blueprint — Day 6."""
from __future__ import annotations

import logging
from functools import lru_cache

from flask import Blueprint, abort, jsonify, render_template

from app import limiter

from .simulator import get_preset, list_presets, run_monte_carlo

log = logging.getLogger(__name__)

bp = Blueprint(
    "day06_shape_of_a_scam",
    __name__,
    url_prefix="/day-06/shape-of-a-scam",
    template_folder="../templates",
)


@lru_cache(maxsize=10)
def _cached_simulation(preset_id: str) -> dict:
    return run_monte_carlo(preset_id, n_trials=100, base_seed=42)


@bp.route("/")
def intro():
    return render_template(
        "day06/intro.html",
        presets=list_presets(),
    )


@bp.route("/simulate/<preset_id>")
@limiter.limit("30 per hour; 10 per minute")
def simulate(preset_id: str):
    preset = get_preset(preset_id)
    if not preset:
        abort(404)
    result = _cached_simulation(preset_id)
    other_presets = [p for p in list_presets() if p["id"] != preset_id]
    return render_template(
        "day06/results.html",
        result=result,
        preset_id=preset_id,
        other_presets=other_presets,
    )


@bp.route("/api/simulate/<preset_id>")
@limiter.limit("30 per hour; 10 per minute")
def api_simulate(preset_id: str):
    if not get_preset(preset_id):
        return jsonify({"error": "unknown_preset", "message": "Unknown preset."}), 404
    return jsonify(_cached_simulation(preset_id))


@bp.route("/healthz")
def healthz():
    return jsonify({
        "ok": True,
        "presets": [p["id"] for p in list_presets()],
    })


@bp.errorhandler(429)
def ratelimit_handler(e):
    description = getattr(e, "description", "Rate limit exceeded.")
    return jsonify({
        "error": "rate_limited",
        "message": (
            "Too many simulations in a short window. "
            "Each preset's result is deterministic — once you've seen it, the numbers won't change."
        ),
        "detail": str(description),
    }), 429
