"""Pure Noise — Day 11.

Soundscape composer. All audio synthesized client-side via Web Audio API.
Flask serves only the HTML shell + static JS/CSS.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day11_pure_noise",
    __name__,
    url_prefix="/day-11/pure-noise",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day11/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
