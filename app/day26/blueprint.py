"""Pitch — Day 26. 3v3 arcade soccer (Three.js)."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day26_pitch",
    __name__,
    url_prefix="/day-26/pitch",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day26/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
