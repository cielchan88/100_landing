"""Quick Diagrammer — Day 13.

Text-to-diagram utility. 100% client-side parsing, layout, and rendering.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day13_quick_diagrammer",
    __name__,
    url_prefix="/day-13/quick-diagrammer",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day13/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
