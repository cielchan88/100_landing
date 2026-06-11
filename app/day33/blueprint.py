"""Cakrawala — Day 33. A semi-sim flight game over an endless procedural archipelago."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day33_cakrawala",
    __name__,
    url_prefix="/day-33/cakrawala",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day33/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
