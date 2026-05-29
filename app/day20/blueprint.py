"""Forty — Day 20.

Hijri-age calculator. 100% client-side (Intl Umm al-Qura calendar).
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day20_forty",
    __name__,
    url_prefix="/day-20/forty",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day20/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
