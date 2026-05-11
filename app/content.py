"""Content loader: parse Markdown + YAML frontmatter from content/days/."""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Dict, List, Optional

import frontmatter


REQUIRED_FIELDS = ("day", "title", "tagline", "date", "status")
VALID_STATUSES = ("live", "draft")


@dataclass
class DayEntry:
    day: int
    title: str
    tagline: str
    date: date
    status: str
    slug: str
    body: str
    live_url: Optional[str] = None
    repo_url: Optional[str] = None
    tags: List[str] = field(default_factory=list)

    @property
    def is_live(self) -> bool:
        return self.status == "live"


class ContentStore:
    def __init__(self, content_dir: str, auto_reload: bool = False) -> None:
        self.content_dir = content_dir
        self.auto_reload = auto_reload
        self._entries: Dict[str, DayEntry] = {}
        self._last_signature: tuple = ()
        self._lock = threading.Lock()
        self.reload()

    # ---- internal helpers ---------------------------------------------------

    def _directory_signature(self) -> tuple:
        if not os.path.isdir(self.content_dir):
            return ()
        sig = []
        for name in sorted(os.listdir(self.content_dir)):
            if not name.endswith(".md"):
                continue
            path = os.path.join(self.content_dir, name)
            try:
                sig.append((name, os.path.getmtime(path)))
            except OSError:
                continue
        return tuple(sig)

    @staticmethod
    def _coerce_date(value) -> date:
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str):
            return datetime.strptime(value, "%Y-%m-%d").date()
        raise ValueError(f"Invalid date value: {value!r}")

    def _parse_file(self, path: str) -> DayEntry:
        with open(path, "r", encoding="utf-8") as fh:
            post = frontmatter.load(fh)

        meta = post.metadata
        missing = [f for f in REQUIRED_FIELDS if f not in meta]
        if missing:
            raise ValueError(
                f"{os.path.basename(path)} missing required frontmatter: {missing}"
            )

        status = str(meta["status"]).strip().lower()
        if status not in VALID_STATUSES:
            raise ValueError(
                f"{os.path.basename(path)} has invalid status: {status!r}"
            )

        day_num = int(meta["day"])
        slug = f"day-{day_num:02d}"

        return DayEntry(
            day=day_num,
            title=str(meta["title"]).strip(),
            tagline=str(meta["tagline"]).strip(),
            date=self._coerce_date(meta["date"]),
            status=status,
            slug=slug,
            body=post.content,
            live_url=(str(meta["live_url"]).strip() if meta.get("live_url") else None),
            repo_url=(str(meta["repo_url"]).strip() if meta.get("repo_url") else None),
            tags=list(meta.get("tags") or []),
        )

    # ---- public API ---------------------------------------------------------

    def reload(self) -> None:
        with self._lock:
            entries: Dict[str, DayEntry] = {}
            if os.path.isdir(self.content_dir):
                for name in sorted(os.listdir(self.content_dir)):
                    if not name.endswith(".md"):
                        continue
                    path = os.path.join(self.content_dir, name)
                    try:
                        entry = self._parse_file(path)
                    except Exception as exc:
                        print(f"[content] Skipping {name}: {exc}")
                        continue
                    entries[entry.slug] = entry
            self._entries = entries
            self._last_signature = self._directory_signature()

    def _maybe_reload(self) -> None:
        if not self.auto_reload:
            return
        sig = self._directory_signature()
        if sig != self._last_signature:
            self.reload()

    def get_live_days(self) -> List[DayEntry]:
        self._maybe_reload()
        return sorted(
            (e for e in self._entries.values() if e.is_live),
            key=lambda e: e.day,
        )

    def get_day(self, slug: str) -> Optional[DayEntry]:
        self._maybe_reload()
        return self._entries.get(slug)


_store: Optional[ContentStore] = None


def init_content(app) -> None:
    global _store
    auto_reload = app.config.get("FLASK_ENV") == "development"
    _store = ContentStore(app.config["CONTENT_DIR"], auto_reload=auto_reload)
    app.extensions["content_store"] = _store


def get_store() -> ContentStore:
    if _store is None:
        raise RuntimeError("ContentStore not initialized. Call init_content(app) first.")
    return _store


def get_live_days() -> List[DayEntry]:
    return get_store().get_live_days()


def get_day(slug: str) -> Optional[DayEntry]:
    return get_store().get_day(slug)
