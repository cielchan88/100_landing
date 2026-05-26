"""The Adventure Engine — Day 17.

Interactive-fiction generator. Reuses Day 16's Gemini setup: the same model
resolution (GEMINI_MODEL override + auto-pick of a supported model), the same
graceful-degradation import guard, the same friendly error mapping, and the
shared app rate limiter. No persistence: stories live only in the browser.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from flask import (
    Blueprint,
    Response,
    jsonify,
    render_template,
    request,
    stream_with_context,
)

from app import limiter

# Reuse Day 16's Gemini plumbing so both days share one (working) model choice.
from app.day16.blueprint import _friendly_error, _get_gemini, _get_model_name

try:
    import google.generativeai as genai
except ImportError:
    genai = None

log = logging.getLogger("day17_adventure_engine")

bp = Blueprint(
    "day17_adventure_engine",
    __name__,
    url_prefix="/day-17/adventure-engine",
    template_folder="../templates",
)

VALID_GENRES = {"Sci-fi", "Fantasy", "Noir", "Horror", "Romance", "Adventure"}

daily_quota = {
    "date": None,
    "count": 0,
    "max_per_day": 1200,
}


def _get_today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _check_quota():
    today = _get_today_str()
    if daily_quota["date"] != today:
        daily_quota["date"] = today
        daily_quota["count"] = 0
    if daily_quota["count"] >= daily_quota["max_per_day"]:
        return False, "daily_quota_exceeded"
    return True, None


def _increment_quota():
    daily_quota["count"] += 1


SYSTEM_PROMPT_TEMPLATE = """\
You are The Adventure Engine, an interactive fiction writer for a Choose-Your-Own-Adventure style game.

GAME PARAMETERS FOR THIS SESSION:
- Genre: {genre}
- Protagonist: {protagonist}
- Total turns in this story: 6 (THIS IS FIXED — do not extend or shorten)

YOUR TASK:
You will write a six-turn story for this protagonist in this genre. Each turn (1-5) consists of:
1. A short narrative passage (100-200 words) advancing the story
2. EXACTLY THREE choices for what the protagonist does next

Turn 6 is the FINAL turn and must CONCLUDE the story — no choices, just an ending.

STRICT RULES:
1. Each story passage must be 100-200 words. No more, no less.
2. For turns 1-5: after the story passage, output EXACTLY THREE choices on separate lines, formatted as:
   CHOICE 1: [short action, max 12 words]
   CHOICE 2: [short action, max 12 words]
   CHOICE 3: [short action, max 12 words]
3. Choices must be specific actions, not vague feelings. Tease the action, not the outcome.
4. Story arc: turn 1 establishes the situation, turns 2-3 build tension, turn 4 raises stakes, turn 5 brings the climax, turn 6 RESOLVES.
5. Turn 6 must NOT end with "to be continued" or open-ended. Write a satisfying conclusion within 100-200 words. NO CHOICES at the end of turn 6 — just narrative.
6. Maintain consistent genre tone throughout:
   - Sci-fi: speculative tech, future settings, scientific or philosophical themes
   - Fantasy: magic, mythic creatures, otherworldly settings
   - Noir: shadowy mood, moral ambiguity, urban or detective settings
   - Horror: dread, unease, supernatural or psychological threats
   - Romance: emotional stakes, relationships, internal/external obstacles between people
   - Adventure: action, exploration, physical or geographic stakes
7. Reference the protagonist description directly in your writing.
8. Each turn must reference and build on the previous choice the user made (it will be in the conversation history).
9. NEVER break the fourth wall. NEVER add disclaimers. Write the story straight.
10. Begin turn 1 directly with the story passage. No preamble.

OUTPUT FORMAT FOR TURNS 1-5:
[Story passage 100-200 words, plain prose]

CHOICE 1: [action under 12 words]
CHOICE 2: [action under 12 words]
CHOICE 3: [action under 12 words]

OUTPUT FORMAT FOR TURN 6:
[Story passage 100-200 words ending the story conclusively. Use the words "The End" only if natural to the narrative.]

The conversation history will tell you which turn you're on. Count user messages: turn 1 is your response to the initial setup message; each subsequent user message represents a choice for turns 2-6.

Begin the requested turn now.
"""


@bp.route("/")
def index():
    return render_template("day17/index.html")


@bp.route("/story", methods=["POST"])
@limiter.limit("15 per minute")
def story():
    """Streaming story endpoint. Returns an SSE stream of `data: {json}` lines."""
    client = _get_gemini()
    if not client:
        return jsonify({
            "error": "service_misconfigured",
            "message": "The AI service isn't configured yet. Please try again later.",
        }), 503

    ok, reason = _check_quota()
    if not ok:
        return jsonify({
            "error": reason,
            "message": "Daily quota exceeded. Try again tomorrow.",
        }), 429

    data = request.get_json(silent=True) or {}

    genre = str(data.get("genre", "")).strip()
    protagonist = str(data.get("protagonist", "")).strip()
    history = data.get("history", [])
    turn_number = data.get("turn", 1)

    if genre not in VALID_GENRES:
        return jsonify({"error": "invalid_genre", "message": "Pick a valid genre."}), 400
    if not protagonist or len(protagonist) > 500:
        return jsonify({"error": "invalid_protagonist", "message": "Describe a protagonist (under 500 chars)."}), 400
    if not isinstance(turn_number, int) or turn_number < 1 or turn_number > 6:
        return jsonify({"error": "invalid_turn"}), 400
    if not isinstance(history, list) or len(history) > 15:
        return jsonify({"error": "history_too_long"}), 400

    total_chars = sum(len(str(m.get("content", ""))) for m in history)
    if total_chars > 10000:
        return jsonify({"error": "history_too_large"}), 400

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(genre=genre, protagonist=protagonist)

    setup_msg = f"Genre: {genre}\nProtagonist: {protagonist}\n\nWrite turn {turn_number} of 6."
    gemini_messages = [{"role": "user", "parts": [setup_msg]}]
    for m in history:
        role = "user" if m.get("role") == "user" else "model"
        content = str(m.get("content", ""))[:3000]
        gemini_messages.append({"role": role, "parts": [content]})

    model_name = _get_model_name()
    _increment_quota()

    def generate():
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_prompt,
                generation_config={
                    "temperature": 0.85,
                    "top_p": 0.95,
                    "max_output_tokens": 500,
                },
            )

            response = model.generate_content(gemini_messages, stream=True)

            any_text = False
            for chunk in response:
                try:
                    text = chunk.text
                except Exception:
                    text = None
                if text:
                    any_text = True
                    yield f"data: {json.dumps({'text': text})}\n\n"

            if not any_text:
                yield f"data: {json.dumps({'error': 'empty_response', 'message': 'The model returned no text (the response may have been blocked).'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as exc:
            log.exception("Adventure stream failed (model=%s)", model_name)
            yield f"data: {json.dumps({'error': 'stream_failed', 'message': _friendly_error(exc, model_name)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@bp.route("/healthz")
def healthz():
    return jsonify({
        "ok": True,
        "api_configured": bool(genai is not None and os.environ.get("GEMINI_API_KEY")),
        "model": _get_model_name(),
        "daily_quota_used": daily_quota["count"],
        "daily_quota_max": daily_quota["max_per_day"],
    })


@bp.errorhandler(429)
def ratelimit_handler(e):
    description = getattr(e, "description", "Rate limit exceeded.")
    return jsonify({
        "error": "rate_limited",
        "message": "Too many requests in a short window. Wait a minute and try again.",
        "detail": str(description),
    }), 429
