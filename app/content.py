"""Markdown loader for content/days/*.md with frontmatter."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional

import frontmatter
import markdown as md

log = logging.getLogger(__name__)

_CONTENT_DIR = Path(__file__).parent.parent / "content" / "days"

_REQUIRED_FIELDS = ("day", "title", "tagline", "date", "status")
_VALID_STATUSES = ("live", "draft")
_MD_EXTENSIONS = ["fenced_code", "tables", "codehilite"]


@dataclass
class DayEntry:
    day: int
    slug: str
    title: str
    tagline: str
    date: date
    status: str
    body_html: str
    live_url: Optional[str] = None
    repo_url: Optional[str] = None
    tags: List[str] = field(default_factory=list)


_cache: Dict[str, DayEntry] = {}
_cache_mtime: float = 0.0
_loaded_once: bool = False


def _coerce_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return datetime.strptime(value, "%Y-%m-%d").date()
    raise ValueError(f"Invalid date value: {value!r}")


def _dir_latest_mtime() -> float:
    if not _CONTENT_DIR.is_dir():
        return 0.0
    latest = 0.0
    for path in _CONTENT_DIR.glob("*.md"):
        try:
            mtime = path.stat().st_mtime
            if mtime > latest:
                latest = mtime
        except OSError:
            continue
    return latest


def _parse_file(path: Path) -> Optional[DayEntry]:
    try:
        with path.open("r", encoding="utf-8") as fh:
            post = frontmatter.load(fh)
    except Exception as exc:
        log.warning("Cannot read %s: %s", path.name, exc)
        return None

    meta = post.metadata
    missing = [f for f in _REQUIRED_FIELDS if f not in meta]
    if missing:
        log.warning("Skipping %s: missing fields %s", path.name, missing)
        return None

    status = str(meta["status"]).strip().lower()
    if status not in _VALID_STATUSES:
        log.warning("Skipping %s: invalid status %r", path.name, status)
        return None

    try:
        day_num = int(meta["day"])
        entry_date = _coerce_date(meta["date"])
    except (TypeError, ValueError) as exc:
        log.warning("Skipping %s: %s", path.name, exc)
        return None

    slug = f"day-{day_num:02d}"
    body_html = md.markdown(
        post.content,
        extensions=_MD_EXTENSIONS,
        extension_configs={"codehilite": {"guess_lang": False, "css_class": "codehilite"}},
    )

    return DayEntry(
        day=day_num,
        slug=slug,
        title=str(meta["title"]).strip(),
        tagline=str(meta["tagline"]).strip(),
        date=entry_date,
        status=status,
        body_html=body_html,
        live_url=(str(meta["live_url"]).strip() if meta.get("live_url") else None),
        repo_url=(str(meta["repo_url"]).strip() if meta.get("repo_url") else None),
        tags=list(meta.get("tags") or []),
    )


def _load_all() -> None:
    global _cache, _cache_mtime, _loaded_once
    entries: Dict[str, DayEntry] = {}
    if _CONTENT_DIR.is_dir():
        for path in sorted(_CONTENT_DIR.glob("*.md")):
            entry = _parse_file(path)
            if entry is not None:
                entries[entry.slug] = entry
    _cache = entries
    _cache_mtime = _dir_latest_mtime()
    _loaded_once = True


def _should_reload() -> bool:
    if not _loaded_once:
        return True
    if os.environ.get("FLASK_ENV") == "production":
        return False
    return _dir_latest_mtime() > _cache_mtime


def _ensure_loaded() -> None:
    if _should_reload():
        _load_all()


def get_live_days() -> List[DayEntry]:
    _ensure_loaded()
    today = date.today()
    return sorted(
        (e for e in _cache.values() if e.status == "live" and e.date <= today),
        key=lambda e: e.day,
    )


def get_day(slug: str) -> Optional[DayEntry]:
    _ensure_loaded()
    entry = _cache.get(slug)
    if entry is None or entry.status != "live" or entry.date > date.today():
        return None
    return entry


def get_live_count() -> int:
    _ensure_loaded()
    today = date.today()
    return sum(1 for e in _cache.values() if e.status == "live" and e.date <= today)
