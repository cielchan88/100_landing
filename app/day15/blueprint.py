"""Type Speed Mirror — Day 15.

Real-time typing rhythm visualizer. 100% client-side; Chart.js via CDN.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day15_type_speed_mirror",
    __name__,
    url_prefix="/day-15/type-speed-mirror",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day15/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
