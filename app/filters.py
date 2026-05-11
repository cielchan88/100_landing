"""Custom Jinja filters."""
from __future__ import annotations

import re
from datetime import date, datetime


_ID_MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

_EN_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _to_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return datetime.strptime(value, "%Y-%m-%d").date()
    return None


def format_date_id(value) -> str:
    d = _to_date(value)
    if d is None:
        return ""
    return f"{d.day} {_ID_MONTHS[d.month - 1]} {d.year}"


def format_date_en(value) -> str:
    d = _to_date(value)
    if d is None:
        return ""
    return f"{_EN_MONTHS[d.month - 1]} {d.day}, {d.year}"


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def pad2(value) -> str:
    try:
        return f"{int(value):02d}"
    except (TypeError, ValueError):
        return str(value)


def register_filters(app) -> None:
    app.jinja_env.filters["date_id"] = format_date_id
    app.jinja_env.filters["date_en"] = format_date_en
    app.jinja_env.filters["slugify"] = slugify
    app.jinja_env.filters["pad2"] = pad2
