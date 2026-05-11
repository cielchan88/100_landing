"""Word list loading. Builds a set of valid words and a set of all prefixes."""
from __future__ import annotations

import logging
import urllib.request
from pathlib import Path
from typing import Set, Tuple

log = logging.getLogger(__name__)

_WORDS_PATH = Path(__file__).parent / "data" / "words.txt"
_FALLBACK_URL = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"

_words: Set[str] = set()
_prefixes: Set[str] = set()
_loaded = False


def _ensure_words_file(path: Path) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    log.info("Downloading word list from %s", _FALLBACK_URL)
    with urllib.request.urlopen(_FALLBACK_URL, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    lines = []
    for line in raw.splitlines():
        w = line.strip().lower()
        if 2 <= len(w) <= 15 and w.isalpha():
            lines.append(w)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_dictionary(path: Path = _WORDS_PATH) -> Tuple[Set[str], Set[str]]:
    global _words, _prefixes, _loaded
    if _loaded:
        return _words, _prefixes
    _ensure_words_file(path)
    words: Set[str] = set()
    prefixes: Set[str] = {""}
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            w = line.strip().lower()
            if not w or not w.isalpha():
                continue
            words.add(w)
            for i in range(1, len(w) + 1):
                prefixes.add(w[:i])
    _words = words
    _prefixes = prefixes
    _loaded = True
    return _words, _prefixes


def is_word(s: str) -> bool:
    if not _loaded:
        load_dictionary()
    return s.lower() in _words


def has_prefix(s: str) -> bool:
    if not _loaded:
        load_dictionary()
    return s.lower() in _prefixes
