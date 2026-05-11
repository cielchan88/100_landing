"""Route handlers."""
from __future__ import annotations

from flask import Blueprint, abort, jsonify, render_template

from .content import get_day, get_live_count, get_live_days

bp = Blueprint("main", __name__)


@bp.route("/")
def index():
    days = get_live_days()
    return render_template("index.html", days=days, count=len(days))


@bp.route("/days/<slug>")
def day(slug: str):
    entry = get_day(slug)
    if entry is None:
        abort(404)
    return render_template("day.html", day=entry)


@bp.route("/about")
def about():
    return render_template("about.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})


@bp.app_errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404
