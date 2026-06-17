"""Bastion — Day 38. A grid tower-defense game with A* as the core mechanic."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day38_bastion",
    __name__,
    url_prefix="/day-38/bastion",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day38/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
