"""Antipodes — Day 28. Equirectangular world map + antipode math. Self-contained."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day28_antipodes",
    __name__,
    url_prefix="/day-28/antipodes",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day28/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
