"""Mood Mosaic — Day 10.

Milestone visualization. 100% client-side. Flask serves the HTML shell only.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day10_mood_mosaic",
    __name__,
    url_prefix="/day-10/mood-mosaic",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day10/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
