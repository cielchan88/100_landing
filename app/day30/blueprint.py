"""QR Studio — Day 30. Styled static QR codes, generated entirely client-side."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template

bp = Blueprint(
    "day30_qr_studio",
    __name__,
    url_prefix="/day-30/qr-studio",
    template_folder="../templates",
)


@bp.route("/")
def index():
    return render_template("day30/index.html")


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})
