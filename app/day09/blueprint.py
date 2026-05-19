"""Read Time — Day 9.

Pure client-side text-metrics calculator. Flask only serves the HTML shell;
all counting happens in the browser. No persistence, no API.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day09_read_time",
    __name__,
    url_prefix="/day-09/read-time",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day09/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
