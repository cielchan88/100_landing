"""Flock — Day 24. Boids simulation. 100% client-side; Flask serves the shell."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day24_flock",
    __name__,
    url_prefix="/day-24/flock",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day24/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
