"""Title Doctor Flask blueprint — Day 2."""
from __future__ import annotations

import json
import logging
import time

from flask import Blueprint, Response, jsonify, render_template, request, stream_with_context

from .anthropic_client import TitleDoctorError, generate_titles

log = logging.getLogger(__name__)

bp = Blueprint(
    "day02_title_doctor",
    __name__,
    url_prefix="/day-02/title-doctor",
    template_folder="../templates",
)

_VALID_CONTENT_TYPES = {
    "essay", "blog post", "newsletter", "video", "podcast episode",
    "book chapter", "social post (X/LinkedIn)", "email subject line",
    "landing page headline", "talk title", "other",
}

_VARIANT_DELAY_SECONDS = 0.08


@bp.route("/")
def page():
    return render_template("day02/title_doctor.html")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _stream_events(payload: dict):
    """Generate SSE events from a fully-formed payload, with small delays for live feel."""
    yield _sse("verdict", payload["verdict"])
    for group in payload["groups"]:
        yield _sse("group_start", {"name": group["name"]})
        for variant in group["variants"]:
            time.sleep(_VARIANT_DELAY_SECONDS)
            yield _sse("variant", {
                "group": group["name"],
                "title": variant["title"],
                "score": variant["score"],
                "rationale": variant["rationale"],
            })
    yield _sse("done", {})


def _stream_error(message: str):
    yield _sse("error", {"message": message})


@bp.route("/api/improve", methods=["POST"])
def improve():
    body = request.get_json(silent=True) or {}
    draft = (body.get("draft") or "").strip()
    content_type_raw = body.get("content_type")
    audience = (body.get("audience") or "").strip()[:200]

    if not draft or len(draft) < 3 or len(draft) > 200:
        return jsonify({"error": "Draft must be 3-200 characters."}), 400

    content_type = None
    if content_type_raw:
        ct = str(content_type_raw).strip()
        if ct in _VALID_CONTENT_TYPES and ct != "other":
            content_type = ct

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }

    try:
        payload = generate_titles(draft, content_type, audience)
    except TitleDoctorError as exc:
        log.warning("Title Doctor error: %s", exc)
        return Response(
            stream_with_context(_stream_error(str(exc))),
            status=503,
            mimetype="text/event-stream",
            headers=headers,
        )
    except Exception as exc:
        log.exception("Unexpected error in /api/improve")
        return Response(
            stream_with_context(_stream_error("An unexpected error occurred. Please try again.")),
            status=500,
            mimetype="text/event-stream",
            headers=headers,
        )

    return Response(
        stream_with_context(_stream_events(payload)),
        mimetype="text/event-stream",
        headers=headers,
    )
