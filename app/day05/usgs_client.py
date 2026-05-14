"""USGS Earthquake Hazards GeoJSON feed wrapper with in-memory caching."""
from __future__ import annotations

import logging
import time
from threading import Lock
from typing import Dict, Tuple

import requests

log = logging.getLogger(__name__)

USGS_FEEDS = {
    "1h":  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    "24h": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "7d":  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
}

CACHE_TTL_SECONDS = 60

_cache: Dict[str, Tuple[float, dict]] = {}
_cache_lock = Lock()


class USGSError(Exception):
    pass


def fetch_earthquakes(window: str) -> dict:
    """Return the parsed GeoJSON for the given window ('1h', '24h', '7d').

    Caches each window for 60 seconds (USGS feeds update ~minutely).
    """
    if window not in USGS_FEEDS:
        raise ValueError(f"Unknown window: {window}")

    with _cache_lock:
        cached = _cache.get(window)
        if cached and (time.time() - cached[0]) < CACHE_TTL_SECONDS:
            return cached[1]

    url = USGS_FEEDS[window]
    try:
        response = requests.get(
            url,
            timeout=15,
            headers={
                "User-Agent": (
                    "RestlessEarth/1.0 "
                    "(+https://100dayswithclaude.pythonanywhere.com)"
                )
            },
        )
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("USGS feed fetch failed for %s: %s", window, exc)
        raise USGSError(str(exc)) from exc

    with _cache_lock:
        _cache[window] = (time.time(), data)
    return data


def summarize_geojson(geojson: dict) -> dict:
    """Compute summary stats: total count, biggest quake, strongest region."""
    features = geojson.get("features") or []
    if not features:
        return {"total_count": 0, "biggest": None, "strongest_region": None}

    biggest = None
    for f in features:
        props = f.get("properties") or {}
        mag = props.get("mag")
        if mag is None:
            continue
        if biggest is None or mag > biggest["mag"]:
            biggest = {
                "mag": float(mag),
                "place": props.get("place") or "Unknown",
                "time_ms": int(props.get("time") or 0),
            }

    strongest_region = None
    if biggest and biggest.get("place"):
        parts = biggest["place"].split(",")
        strongest_region = parts[-1].strip() if len(parts) > 1 else biggest["place"]

    return {
        "total_count": len(features),
        "biggest": biggest,
        "strongest_region": strongest_region,
    }


def trim_features(geojson: dict) -> list:
    """Return a minimal list of features for the frontend."""
    out = []
    for f in geojson.get("features") or []:
        props = f.get("properties") or {}
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or [None, None, None]
        if coords[0] is None or coords[1] is None:
            continue
        mag = props.get("mag")
        if mag is None:
            continue
        try:
            depth_km = float(coords[2]) if coords[2] is not None else 0.0
        except (TypeError, ValueError):
            depth_km = 0.0
        out.append({
            "id": f.get("id") or "",
            "mag": float(mag),
            "place": props.get("place") or "Unknown",
            "time_ms": int(props.get("time") or 0),
            "coordinates": [float(coords[0]), float(coords[1])],
            "depth_km": depth_km,
        })
    return out
