"""Permadeath — Day 25. Roguelike deckbuilder. 100% client-side."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day25_permadeath",
    __name__,
    url_prefix="/day-25/permadeath",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day25/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
