"""Bend the Beam — Day 19.

Client-side physics puzzle (ray tracing, Snell's law). Flask serves the shell.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day19_bend_the_beam",
    __name__,
    url_prefix="/day-19/bend-the-beam",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day19/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
