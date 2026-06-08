"""Pluck — Day 29. Karplus-Strong string instrument. 100% client-side."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day29_pluck",
    __name__,
    url_prefix="/day-29/pluck",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day29/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
