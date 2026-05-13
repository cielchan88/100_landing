"""Puzzle loader for Reasoning Reps (Day 4).

Loads a static JSON file mapping ISO dates to lists of 5 puzzles.
No runtime AI calls — the file is pre-generated and committed to the repo.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

PUZZLES_PATH = Path(__file__).parent.parent.parent / "content" / "day04" / "puzzles.json"


@lru_cache(maxsize=1)
def load_puzzles() -> Dict[str, List[dict]]:
    """Load and cache the puzzles JSON file. Returns {} if missing."""
    if not PUZZLES_PATH.exists():
        return {}
    try:
        with PUZZLES_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def get_today_utc() -> str:
    """ISO date string in UTC."""
    return datetime.now(timezone.utc).date().isoformat()


def get_puzzles_for_date(iso_date: str) -> Optional[List[dict]]:
    """Return the 5-puzzle list for a date, or None if not present."""
    return load_puzzles().get(iso_date)


def get_available_dates() -> List[str]:
    """All dates present in the dataset, sorted ascending."""
    return sorted(load_puzzles().keys())


def get_puzzle(iso_date: str, rep_num: int) -> Optional[dict]:
    """Get a single puzzle by rep number (1-5)."""
    puzzles = get_puzzles_for_date(iso_date)
    if not puzzles or not (1 <= rep_num <= 5):
        return None
    if rep_num - 1 >= len(puzzles):
        return None
    return puzzles[rep_num - 1]


def latest_available_on_or_before(iso_date: str) -> Optional[str]:
    """Most recent date <= iso_date that has puzzles. Useful for fallback."""
    dates = get_available_dates()
    candidates = [d for d in dates if d <= iso_date]
    return candidates[-1] if candidates else None
