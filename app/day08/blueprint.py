"""Snake — Day 8.

100% client-side game. Flask only serves the HTML shell; all logic, audio,
and rendering happen in the browser. No persistence, no API.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day08_snake",
    __name__,
    url_prefix="/day-08/snake",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day08/snake.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
