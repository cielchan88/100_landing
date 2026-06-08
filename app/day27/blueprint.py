"""Bloom — Day 27. Gray-Scott reaction-diffusion simulator. 100% client-side."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day27_bloom",
    __name__,
    url_prefix="/day-27/bloom",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day27/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
