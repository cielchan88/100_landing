"""Nusa TCG — Day 32. A pocket trading-card battler with an original Nusantara roster."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day32_nusa_tcg",
    __name__,
    url_prefix="/day-32/nusa-tcg",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day32/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
