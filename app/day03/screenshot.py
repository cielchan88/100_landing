"""ScreenshotOne API wrapper with SSRF guards."""
from __future__ import annotations

import ipaddress
import logging
import os
import socket
from urllib.parse import urlparse

import requests

log = logging.getLogger(__name__)

SCREENSHOTONE_BASE = "https://api.screenshotone.com/take"

_BLOCKED_HOSTS = {"localhost", "ip6-localhost", "ip6-loopback"}


class URLValidationError(ValueError):
    pass


def _host_is_private(host: str) -> bool:
    if host.lower() in _BLOCKED_HOSTS:
        return True
    # Block bare-IP private/loopback ranges without DNS lookup (cheap, deterministic)
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast
    except ValueError:
        return False


def validate_url(url: str) -> str:
    if not url or not isinstance(url, str):
        raise URLValidationError("URL is required.")
    url = url.strip()
    if len(url) > 2048:
        raise URLValidationError("URL is too long (max 2048 characters).")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise URLValidationError("URL must start with http:// or https://.")
    try:
        parsed = urlparse(url)
    except ValueError as exc:
        raise URLValidationError("Could not parse URL.") from exc
    if not parsed.hostname:
        raise URLValidationError("URL is missing a host.")
    if _host_is_private(parsed.hostname):
        raise URLValidationError("URLs targeting local or private networks are not allowed.")
    return url


def capture_url(url: str) -> bytes:
    """Render the URL via ScreenshotOne. Returns PNG bytes.

    Raises RuntimeError if SCREENSHOTONE_ACCESS_KEY is not set.
    Raises requests.HTTPError on 4xx/5xx responses.
    """
    key = os.getenv("SCREENSHOTONE_ACCESS_KEY")
    if not key:
        raise RuntimeError("SCREENSHOTONE_ACCESS_KEY not configured")

    params = {
        "access_key": key,
        "url": url,
        "viewport_width": 1280,
        "viewport_height": 800,
        "device_scale_factor": 1,
        "format": "png",
        "block_ads": "true",
        "block_cookie_banners": "true",
        "block_trackers": "true",
        "cache": "true",
        "cache_ttl": 86400,
        "timeout": 30,
    }
    response = requests.get(SCREENSHOTONE_BASE, params=params, timeout=45)
    response.raise_for_status()
    return response.content
