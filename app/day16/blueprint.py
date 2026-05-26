"""The 5-Whys Partner — Day 16.

First Gemini integration in the project. Streaming (SSE) conversational
root-cause partner. No persistence: conversations live only in the browser.

The `google.generativeai` import is guarded so that a missing dependency (e.g.
before `pip install` has run on the server) degrades only this blueprint —
the rest of the site keeps working.
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

try:
    import google.generativeai as genai
except ImportError:
    genai = None

log = logging.getLogger("day16_five_whys")

bp = Blueprint(
    "day16_five_whys",
    __name__,
    url_prefix="/day-16/five-whys-partner",
    template_folder="../templates",
)

# Daily quota tracking (in-memory; resets on worker reload or UTC day rollover).
daily_quota = {
    "date": None,
    "count": 0,
    "max_per_day": 1200,  # Conservative; Gemini free tier is ~1500/day.
}


def _get_today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _check_quota():
    """Returns (ok, reason). ok=False means quota exceeded."""
    today = _get_today_str()
    if daily_quota["date"] != today:
        daily_quota["date"] = today
        daily_quota["count"] = 0
    if daily_quota["count"] >= daily_quota["max_per_day"]:
        return False, "daily_quota_exceeded"
    return True, None


def _increment_quota():
    daily_quota["count"] += 1


DEFAULT_MODEL = "gemini-2.0-flash"

# Preference order when auto-selecting from the models the key actually supports.
# Earlier = preferred. Flash-lite variants tend to have the most generous free tier.
_MODEL_PREFERENCE = [
    "flash-lite",
    "2.0-flash",
    "2.5-flash",
    "flash",
    "pro",
]

_resolved_model_cache = None


def _list_generate_models():
    """Return model ids (e.g. 'models/gemini-2.0-flash') that support generateContent."""
    if genai is None:
        return []
    try:
        out = []
        for m in genai.list_models():
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" in methods:
                out.append(m.name)
        return out
    except Exception:
        log.exception("list_models failed")
        return []


def _get_model_name() -> str:
    """Resolve the model id.

    - If GEMINI_MODEL is set, use it verbatim (lets the operator force a choice).
    - Otherwise ask the API which models the key supports and pick the most
      free-tier-friendly one, caching the result. Falls back to DEFAULT_MODEL.

    This avoids hardcoding a model id that a given key/region may not have
    (e.g. gemini-1.5-flash is retired for newer keys; gemini-2.0-flash may have
    a free-tier limit of 0 in some projects).
    """
    explicit = os.environ.get("GEMINI_MODEL", "").strip()
    if explicit:
        return explicit

    global _resolved_model_cache
    if _resolved_model_cache:
        return _resolved_model_cache

    available = _list_generate_models()
    if not available:
        return DEFAULT_MODEL

    for pref in _MODEL_PREFERENCE:
        for name in available:
            low = name.lower()
            if pref in low and "vision" not in low:
                _resolved_model_cache = name
                return name

    _resolved_model_cache = available[0]
    return available[0]


def _friendly_error(exc, model_name: str) -> str:
    """Map an SDK/gRPC exception to a short, user-facing message."""
    name = type(exc).__name__
    text = str(exc)
    lower = text.lower()
    if name == "ResourceExhausted" or "resource_exhausted" in lower or "quota" in lower or "429" in text:
        return (
            f"No free-tier quota available for the current model ({model_name}). "
            "Wait a minute and retry, or set GEMINI_MODEL to a model your key supports "
            "(e.g. gemini-1.5-flash)."
        )
    if name == "NotFound" or "not found" in lower:
        return (
            f"The model '{model_name}' isn't available for this API key. "
            "Open /day-16/five-whys-partner/models to see supported models, then set GEMINI_MODEL."
        )
    if name in ("PermissionDenied", "Unauthenticated") or "api key" in lower or "permission" in lower:
        return "The API key was rejected. Check the GEMINI_API_KEY value."
    return "The AI service returned an error. Please try again in a moment."


def _get_gemini():
    """Returns the configured genai module, or None if unavailable."""
    if genai is None:
        return None
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    genai.configure(api_key=api_key)
    return genai


SYSTEM_PROMPT_TEMPLATE = """\
You are The 5-Whys Partner, a conversational AI that helps people uncover the root of a problem using the Five Whys framework (Toyota, 1950s).

YOUR CUSTOMIZATION FOR THIS SESSION:
- Tone: {tone}
- Domain perspective: {domain}
- Depth style: {depth_style}

YOUR STRICT RULES:
1. The user has stated a problem. You will ask exactly FIVE "why" questions, drilling deeper each time.
2. NEVER offer solutions, advice, recommendations, or interpretations during questions 1-5. Only ask questions. Your job is to make THEM articulate the next level; they cannot articulate it if you do their thinking for them.
3. Each question must reference SPECIFIC WORDS OR PHRASES the user just said. Never ask generic "why?" questions.
4. Each question must go DEEPER than the previous one — if the user gives a shallow answer, your next question must probe past the surface.
5. Acknowledge what the user said briefly (1 short sentence max) before asking the next why. Do not ramble.
6. Adapt your tone:
   - Gentle: warm, supportive, careful with phrasing
   - Direct: efficient, no softening, professional
   - Socratic: questions only, never declarative statements at all
   - Investigative: precise, evidence-seeking, almost like a careful interviewer
7. Apply your domain perspective:
   - Business: frame in terms of incentives, stakeholders, outcomes, systems
   - Personal: frame in terms of values, feelings, life situations
   - Technical: frame in terms of mechanisms, causes, systems behavior
   - Philosophical: frame in terms of assumptions, beliefs, meanings
   - Therapeutic: frame in terms of patterns, emotions, growth
8. Apply your depth style:
   - Root cause: probe for the foundational mechanism causing the symptom
   - Hidden assumptions: probe for unexamined beliefs underneath the user's answers
   - Underlying emotions: probe for what feelings are driving the situation

AFTER YOUR FIFTH QUESTION IS ANSWERED, SYNTHESIZE:
When the user responds to your fifth "why," your next message MUST be a structured synthesis (NOT another question). Format it as:

You started with: [the surface problem they originally described, in their words]

Through five rounds, we uncovered:
- [Level 1 insight, briefly]
- [Level 2 insight, briefly]
- [Level 3 insight, briefly]
- [Level 4 insight, briefly]
- [Level 5 insight — the root]

A reflection worth holding: [honest assessment — is this the actual root, or might there be more underneath? Be candid.]

One first action: [a single concrete first step they could take — NOT a full solution, just a starting point. Frame it as a question or a small concrete move.]

KEEP YOUR RESPONSES CONCISE. Each "why" question should be 1-3 sentences. The final synthesis should be the format above, no longer.

The user's stated problem will follow. Begin with Why 1 of 5 by briefly acknowledging the problem and asking your first why.
"""


@bp.route("/")
def index():
    return render_template("day16/index.html")


@bp.route("/chat", methods=["POST"])
@limiter.limit("10 per minute")
def chat():
    """Streaming chat endpoint. Returns an SSE stream of `data: {json}` lines."""
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

    messages = data.get("messages", [])
    tone = str(data.get("tone", "Direct"))[:40]
    domain = str(data.get("domain", "Business"))[:40]
    depth_style = str(data.get("depth_style", "Root cause"))[:40]

    if not messages or not isinstance(messages, list):
        return jsonify({"error": "no_messages"}), 400

    total_chars = sum(len(str(m.get("content", ""))) for m in messages)
    if total_chars > 8000:
        return jsonify({"error": "conversation_too_long"}), 400

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        tone=tone, domain=domain, depth_style=depth_style
    )

    gemini_messages = []
    for m in messages:
        role = "user" if m.get("role") == "user" else "model"
        content = str(m.get("content", ""))[:4000]
        gemini_messages.append({"role": role, "parts": [content]})

    _increment_quota()

    model_name = _get_model_name()

    def generate():
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_prompt,
                generation_config={
                    "temperature": 0.6,
                    "top_p": 0.9,
                    "max_output_tokens": 600,
                },
            )

            response = model.generate_content(gemini_messages, stream=True)

            any_text = False
            for chunk in response:
                try:
                    text = chunk.text
                except Exception:
                    text = None  # final/blocked chunks raise on .text
                if text:
                    any_text = True
                    yield f"data: {json.dumps({'text': text})}\n\n"

            if not any_text:
                yield f"data: {json.dumps({'error': 'empty_response', 'message': 'The model returned no text (the response may have been blocked).'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as exc:
            log.exception("Gemini stream failed (model=%s)", model_name)
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


@bp.route("/models")
def models():
    """Diagnostic: list the models this API key can use for generateContent."""
    if genai is None:
        return jsonify({"error": "library_missing", "message": "google-generativeai is not installed."}), 503
    if not os.environ.get("GEMINI_API_KEY"):
        return jsonify({"error": "no_key", "message": "GEMINI_API_KEY is not set."}), 503
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    available = _list_generate_models()
    return jsonify({
        "selected": _get_model_name(),
        "env_override": os.environ.get("GEMINI_MODEL", "").strip() or None,
        "available_for_generateContent": available,
    })


@bp.errorhandler(429)
def ratelimit_handler(e):
    description = getattr(e, "description", "Rate limit exceeded.")
    return jsonify({
        "error": "rate_limited",
        "message": "Too many requests in a short window. Wait a minute and try again — this keeps the partner free for everyone.",
        "detail": str(description),
    }), 429
