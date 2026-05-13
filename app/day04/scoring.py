"""Pure-function scoring + URL state helpers for Reasoning Reps."""
from __future__ import annotations

from typing import List, Optional, Union

SKILL_LABELS = {
    "working_memory": "Working Memory",
    "source_evaluation": "Source Evaluation",
    "inference": "Inference",
    "pattern_recognition": "Pattern Recognition",
    "estimation": "Estimation",
}

SKILL_ICONS = {
    "working_memory": "🧠",
    "source_evaluation": "🔍",
    "inference": "🧩",
    "pattern_recognition": "➿",
    "estimation": "📐",
}


def parse_answers(a_string: str) -> List[int]:
    """Parse '1,0,1,1,0' into [1,0,1,1,0]. Defensive against bad input."""
    if not a_string:
        return []
    try:
        parts = a_string.split(",")
        out: List[int] = []
        for p in parts:
            p = p.strip()
            if p in ("0", "1"):
                out.append(int(p))
        return out
    except Exception:
        return []


def answers_to_query_string(answers: List[int]) -> str:
    """[1,0,1] -> '1,0,1'"""
    return ",".join(str(int(bool(a))) for a in answers)


def answers_to_score_string(answers: List[int]) -> str:
    """[1,0,1,1,0] -> '10110'. Pads/truncates to 5 chars."""
    bits = [str(int(bool(a))) for a in answers[:5]]
    while len(bits) < 5:
        bits.append("0")
    return "".join(bits)


def score_string_to_answers(s: str) -> List[int]:
    """'10110' -> [1,0,1,1,0]. Defensive — returns [0]*5 on bad input."""
    if not s or len(s) != 5 or any(c not in "01" for c in s):
        return [0, 0, 0, 0, 0]
    return [int(c) for c in s]


def grade_answer(puzzle: dict, user_input: Optional[Union[str, int]]) -> int:
    """Return 1 if correct, 0 otherwise."""
    if user_input is None or user_input == "":
        return 0
    answer_type = puzzle.get("answer_type")
    if answer_type == "multiple_choice":
        try:
            return 1 if int(user_input) == int(puzzle["correct_index"]) else 0
        except (ValueError, TypeError, KeyError):
            return 0
    if answer_type == "numeric_estimation":
        try:
            val = float(user_input)
            low, high = puzzle["correct_range"]
            return 1 if float(low) <= val <= float(high) else 0
        except (ValueError, TypeError, KeyError):
            return 0
    return 0
