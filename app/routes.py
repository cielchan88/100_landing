"""Route handlers."""
from __future__ import annotations

import markdown as md
from flask import Blueprint, abort, current_app, jsonify, render_template

from .content import get_day, get_live_days

bp = Blueprint("main", __name__)


def _site_ctx():
    return {
        "site_url": current_app.config["SITE_URL"],
        "repo_url": current_app.config["REPO_URL"],
        "total_days": current_app.config["TOTAL_DAYS"],
    }


@bp.route("/")
def index():
    days = get_live_days()
    return render_template(
        "index.html",
        page_title="100 Days with Claude",
        days=days,
        live_count=len(days),
        **_site_ctx(),
    )


@bp.route("/days/<slug>")
def day(slug: str):
    entry = get_day(slug)
    if entry is None or not entry.is_live:
        abort(404)

    body_html = md.markdown(
        entry.body,
        extensions=["fenced_code", "tables", "codehilite"],
        extension_configs={"codehilite": {"guess_lang": False, "css_class": "codehilite"}},
    )

    return render_template(
        "day.html",
        page_title=f"{entry.title} · 100 Days with Claude",
        entry=entry,
        body_html=body_html,
        live_count=len(get_live_days()),
        **_site_ctx(),
    )


@bp.route("/about")
def about():
    return render_template(
        "about.html",
        page_title="About · 100 Days with Claude",
        live_count=len(get_live_days()),
        **_site_ctx(),
    )


@bp.route("/healthz")
def healthz():
    return jsonify({"ok": True})


@bp.app_errorhandler(404)
def not_found(_e):
    return (
        render_template(
            "404.html",
            page_title="Not found · 100 Days with Claude",
            live_count=len(get_live_days()),
            **_site_ctx(),
        ),
        404,
    )
