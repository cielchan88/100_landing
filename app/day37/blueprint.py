"""Singularity — Day 37. An orbitable black hole with screen-space lensing."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day37_singularity",
    __name__,
    url_prefix="/day-37/singularity",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day37/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
