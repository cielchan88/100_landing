"""The Question Volley — Day 21.

Two-person async conversation. The entire conversation lives in the URL hash
(LZ-string compressed). 100% client-side; Flask serves only the shell.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day21_question_volley",
    __name__,
    url_prefix="/day-21/question-volley",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day21/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
