"""Ember-8 — Day 31. A fantasy console: 128x128, 16 colors, real Lua via Fengari."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day31_ember8",
    __name__,
    url_prefix="/day-31/ember-8",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day31/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
