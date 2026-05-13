"""Reasoning Reps Flask blueprint — Day 4."""
from __future__ import annotations

import re
from datetime import date

from flask import Blueprint, abort, redirect, render_template, request, url_for

from .puzzles import (
    get_available_dates,
    get_puzzle,
    get_puzzles_for_date,
    get_today_utc,
    latest_available_on_or_before,
)
from .scoring import (
    SKILL_ICONS,
    SKILL_LABELS,
    answers_to_query_string,
    answers_to_score_string,
    grade_answer,
    parse_answers,
    score_string_to_answers,
)

bp = Blueprint(
    "day04_reasoning_reps",
    __name__,
    url_prefix="/day-04/reasoning-reps",
    template_folder="../templates",
)

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _normalize_date(raw: str) -> str:
    """Return a valid ISO date or fall back to today's UTC date."""
    if raw and _DATE_RE.match(raw):
        try:
            date.fromisoformat(raw)
            return raw
        except ValueError:
            pass
    return get_today_utc()


@bp.context_processor
def _inject_globals():
    return {
        "SKILL_LABELS": SKILL_LABELS,
        "SKILL_ICONS": SKILL_ICONS,
    }


@bp.route("/")
def intro():
    today = get_today_utc()
    puzzles = get_puzzles_for_date(today)
    fallback = None if puzzles else latest_available_on_or_before(today)
    return render_template(
        "day04/intro.html",
        today=today,
        has_today=puzzles is not None,
        fallback_date=fallback,
        available_dates=get_available_dates(),
    )


@bp.route("/play/<int:rep>", methods=["GET", "POST"])
def play(rep: int):
    if rep < 1 or rep > 5:
        return redirect(url_for("day04_reasoning_reps.intro"))

    iso_date = _normalize_date(request.args.get("d", ""))
    puzzles = get_puzzles_for_date(iso_date)
    if puzzles is None:
        return redirect(url_for("day04_reasoning_reps.intro"))

    answers_so_far = parse_answers(request.args.get("a", ""))[: rep - 1]

    if request.method == "POST":
        puzzle = get_puzzle(iso_date, rep)
        if puzzle is None:
            return redirect(url_for("day04_reasoning_reps.intro"))
        user_input = request.form.get("answer", "").strip()
        score = grade_answer(puzzle, user_input)
        new_answers = answers_so_far + [score]
        a_query = answers_to_query_string(new_answers)
        if rep < 5:
            return redirect(
                url_for("day04_reasoning_reps.play", rep=rep + 1, d=iso_date, a=a_query)
            )
        return redirect(url_for("day04_reasoning_reps.results", d=iso_date, a=a_query))

    puzzle = get_puzzle(iso_date, rep)
    if puzzle is None:
        return redirect(url_for("day04_reasoning_reps.intro"))

    return render_template(
        "day04/play.html",
        rep=rep,
        iso_date=iso_date,
        puzzle=puzzle,
        skill_label=SKILL_LABELS.get(puzzle["skill"], puzzle["skill"]),
        answers_so_far=answers_so_far,
        a_query=answers_to_query_string(answers_so_far),
        total_reps=5,
    )


@bp.route("/results")
def results():
    iso_date = _normalize_date(request.args.get("d", ""))
    puzzles = get_puzzles_for_date(iso_date)
    if puzzles is None:
        return redirect(url_for("day04_reasoning_reps.intro"))

    a_raw = request.args.get("a")
    s_raw = request.args.get("s")

    is_shared = a_raw is None and bool(s_raw)
    if is_shared:
        answers = score_string_to_answers(s_raw or "")
    else:
        parsed = parse_answers(a_raw or "")
        while len(parsed) < 5:
            parsed.append(0)
        answers = parsed[:5]

    total = sum(1 for a in answers if a == 1)
    score_string = answers_to_score_string(answers)

    breakdown = []
    for i, puzzle in enumerate(puzzles[:5]):
        breakdown.append({
            "rep": i + 1,
            "skill": puzzle["skill"],
            "skill_label": SKILL_LABELS.get(puzzle["skill"], puzzle["skill"]),
            "correct": answers[i] == 1,
            "puzzle": puzzle,
        })

    return render_template(
        "day04/results.html",
        iso_date=iso_date,
        total=total,
        score_string=score_string,
        is_shared=is_shared,
        breakdown=breakdown,
        today=get_today_utc(),
    )


@bp.route("/archive")
def archive():
    today = get_today_utc()
    dates = [d for d in get_available_dates() if d <= today]
    return render_template(
        "day04/archive.html",
        dates=dates,
        today=today,
    )
