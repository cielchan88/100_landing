"""Ink — Day 35. A real-time GPU fluid simulation (stable fluids in GLSL)."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day35_ink",
    __name__,
    url_prefix="/day-35/ink",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day35/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
