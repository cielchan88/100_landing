"""The Tipping Point — Day 12.

Interactive visualization of Schelling's segregation model.
100% client-side simulation. Flask serves only the HTML shell.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day12_tipping_point",
    __name__,
    url_prefix="/day-12/tipping-point",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day12/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
