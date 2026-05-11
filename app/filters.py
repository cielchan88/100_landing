"""Custom Jinja filters."""
from __future__ import annotations

from datetime import date, datetime


_EN_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

_ID_MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]


def _to_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def format_date(value, locale: str = "en") -> str:
    d = _to_date(value)
    if d is None:
        return ""
    if locale == "id":
        return f"{d.day} {_ID_MONTHS[d.month - 1]} {d.year}"
    return f"{_EN_MONTHS[d.month - 1]} {d.day}, {d.year}"


def pad2(value) -> str:
    try:
        return f"{int(value):02d}"
    except (TypeError, ValueError):
        return str(value)


def register_filters(app) -> None:
    app.jinja_env.filters["format_date"] = format_date
    app.jinja_env.filters["pad2"] = pad2
