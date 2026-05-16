"""Distraction Inventory blueprint — Day 7.

This is a fully client-side app. The Flask blueprint serves static HTML/CSS/JS.
No POST routes, no API, no server-side storage. All entries live in the user's
browser localStorage. Privacy by structure: the server literally cannot see
your data because the code never sends it anywhere.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day07_distraction_inventory",
    __name__,
    url_prefix="/day-07/distraction-inventory",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day07/index.html")


@bp.route("/insights")
def insights():
    return render_template("day07/insights.html")


@bp.route("/about")
def about():
    return render_template("day07/about.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
