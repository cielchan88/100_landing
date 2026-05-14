"""The Restless Earth Flask blueprint — Day 5."""
from __future__ import annotations

import logging
import time

from flask import Blueprint, jsonify, render_template, request

from app import limiter

from .usgs_client import USGSError, fetch_earthquakes, summarize_geojson, trim_features

log = logging.getLogger(__name__)

bp = Blueprint(
    "day05_restless_earth",
    __name__,
    url_prefix="/day-05/restless-earth",
    template_folder="../templates",
)

ALLOWED_WINDOWS = {"1h", "24h", "7d"}


@bp.route("/")
def page():
    return render_template("day05/restless_earth.html")


@bp.route("/api/quakes")
@limiter.limit("60 per hour; 12 per minute")
def api_quakes():
    window = (request.args.get("window") or "24h").strip()
    if window not in ALLOWED_WINDOWS:
        return jsonify({
            "error": "invalid_window",
            "message": f"window must be one of {sorted(ALLOWED_WINDOWS)}.",
        }), 400

    try:
        geojson = fetch_earthquakes(window)
    except USGSError as exc:
        log.warning("USGS unavailable: %s", exc)
        return jsonify({
            "error": "usgs_unavailable",
            "message": "USGS feed temporarily unavailable. Retrying in 5 minutes.",
        }), 503

    features = trim_features(geojson)
    summary = summarize_geojson(geojson)
    return jsonify({
        "features": features,
        "summary": summary,
        "fetched_at_ms": int(time.time() * 1000),
        "window": window,
    })


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True, "windows": sorted(ALLOWED_WINDOWS)})


@bp.errorhandler(429)
def ratelimit_handler(e):
    description = getattr(e, "description", "Rate limit exceeded.")
    return jsonify({
        "error": "rate_limited",
        "message": (
            "Too many requests in a short window. "
            "The Restless Earth refreshes automatically every 5 minutes — just wait."
        ),
        "detail": str(description),
    }), 429
