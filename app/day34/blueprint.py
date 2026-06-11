"""The Onion — Day 34. A scrollytelling dissection of one prompt-injection attack."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day34_the_onion",
    __name__,
    url_prefix="/day-34/the-onion",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day34/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
