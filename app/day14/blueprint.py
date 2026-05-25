"""Decision Matrix — Day 14.

Weighted multi-criteria decision tool. 100% client-side; URL hash is state.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day14_decision_matrix",
    __name__,
    url_prefix="/day-14/decision-matrix",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day14/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
