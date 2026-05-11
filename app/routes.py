"""Route handlers."""
from __future__ import annotations

from flask import Blueprint, abort, jsonify, render_template, request

from .content import get_day, get_live_count, get_live_days
from .scrabble.engine import MoveError
from .scrabble.game import store as scrabble_store

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


# ----- Scrabble game (Day 1) -----

@bp.route("/days/day-01/play")
def scrabble_play():
    return render_template("scrabble.html")


@bp.route("/days/day-01/play/api/new", methods=["POST"])
def scrabble_new():
    game = scrabble_store.create()
    return jsonify(game.to_dict())


def _get_game_or_404(game_id: str):
    game = scrabble_store.get(game_id)
    if game is None:
        abort(404, description="Game not found or expired.")
    return game


@bp.route("/days/day-01/play/api/state/<game_id>")
def scrabble_state(game_id: str):
    game = _get_game_or_404(game_id)
    return jsonify(game.to_dict())


@bp.route("/days/day-01/play/api/move", methods=["POST"])
def scrabble_move():
    data = request.get_json(silent=True) or {}
    game_id = data.get("game_id")
    tiles = data.get("tiles") or []
    if not game_id:
        return jsonify({"error": "Missing game_id."}), 400
    game = _get_game_or_404(game_id)
    try:
        scored = game.submit_human_move(tiles)
    except MoveError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({
        "ok": True,
        "scored": {
            "main_word": scored.main_word,
            "words": [{"word": w.word, "score": w.score} for w in scored.words],
            "score": scored.score,
            "tiles": scored.tiles,
            "direction": scored.direction,
        },
        "state": game.to_dict(),
    })


@bp.route("/days/day-01/play/api/pass", methods=["POST"])
def scrabble_pass():
    data = request.get_json(silent=True) or {}
    game_id = data.get("game_id")
    if not game_id:
        return jsonify({"error": "Missing game_id."}), 400
    game = _get_game_or_404(game_id)
    try:
        game.human_pass()
    except MoveError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, "state": game.to_dict()})


@bp.route("/days/day-01/play/api/exchange", methods=["POST"])
def scrabble_exchange():
    data = request.get_json(silent=True) or {}
    game_id = data.get("game_id")
    indices = data.get("indices") or []
    if not game_id:
        return jsonify({"error": "Missing game_id."}), 400
    game = _get_game_or_404(game_id)
    try:
        game.human_exchange(indices)
    except MoveError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, "state": game.to_dict()})


@bp.route("/days/day-01/play/api/ai-turn", methods=["POST"])
def scrabble_ai_turn():
    data = request.get_json(silent=True) or {}
    game_id = data.get("game_id")
    if not game_id:
        return jsonify({"error": "Missing game_id."}), 400
    game = _get_game_or_404(game_id)
    try:
        log = game.play_ai_turn()
    except MoveError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({
        "ok": True,
        "ai_action": {
            "kind": log.kind,
            "word": log.word,
            "score": log.score,
            "tiles": log.tiles,
            "direction": log.direction,
            "words": log.words,
        },
        "state": game.to_dict(),
    })


@bp.app_errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404
