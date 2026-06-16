"""Swarm — Day 36. A GPGPU particle system: ~1M particles in float textures."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day36_swarm",
    __name__,
    url_prefix="/day-36/swarm",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day36/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
