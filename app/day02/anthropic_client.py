"""Thin wrapper around the Anthropic Python SDK for Title Doctor."""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv

from .prompts import SYSTEM_PROMPT, user_prompt

load_dotenv()

log = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-5"
MAX_TOKENS = 2000
TEMPERATURE = 0.8

_GROUP_ORDER = (
    "Curiosity Gap",
    "Contrarian",
    "Specific Number / Data",
    "Question",
    "Declarative / Bold Claim",
)

_client = None


class TitleDoctorError(Exception):
    pass


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise TitleDoctorError(
            "The Title Doctor needs an Anthropic API key. "
            "Set it in your environment and reload."
        )
    try:
        import anthropic
    except ImportError as exc:
        raise TitleDoctorError(
            "The 'anthropic' package is not installed. Run: pip install anthropic"
        ) from exc
    _client = anthropic.Anthropic(api_key=api_key)
    return _client


def _strip_fences(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    return s.strip()


def _validate_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise TitleDoctorError("Model returned non-object JSON.")
    verdict = data.get("verdict")
    groups = data.get("groups")
    if not isinstance(verdict, dict) or not isinstance(groups, list):
        raise TitleDoctorError("Model JSON missing 'verdict' or 'groups'.")
    if "score" not in verdict or "diagnosis" not in verdict:
        raise TitleDoctorError("Verdict missing required fields.")
    try:
        verdict["score"] = max(1, min(10, int(verdict["score"])))
    except (TypeError, ValueError) as exc:
        raise TitleDoctorError("Verdict score must be an integer.") from exc
    verdict["diagnosis"] = str(verdict["diagnosis"]).strip()

    if len(groups) != 5:
        raise TitleDoctorError(f"Expected 5 groups, got {len(groups)}.")
    for i, group in enumerate(groups):
        if not isinstance(group, dict):
            raise TitleDoctorError(f"Group {i} is not an object.")
        expected = _GROUP_ORDER[i]
        group["name"] = expected
        variants = group.get("variants")
        if not isinstance(variants, list) or len(variants) != 3:
            raise TitleDoctorError(f"Group {i} ({expected}) needs exactly 3 variants.")
        for j, v in enumerate(variants):
            if not isinstance(v, dict):
                raise TitleDoctorError(f"Variant {i}/{j} not an object.")
            for key in ("title", "score", "rationale"):
                if key not in v:
                    raise TitleDoctorError(f"Variant {i}/{j} missing '{key}'.")
            v["title"] = str(v["title"]).strip()
            v["rationale"] = str(v["rationale"]).strip()
            try:
                v["score"] = max(1, min(10, int(v["score"])))
            except (TypeError, ValueError) as exc:
                raise TitleDoctorError(f"Variant {i}/{j} score must be int.") from exc
    return data


def generate_titles(draft: str, content_type: Optional[str], audience: str) -> dict:
    """Call Claude and return a parsed dict matching the Title Doctor schema."""
    client = _get_client()
    prompt = user_prompt(draft, content_type, audience)

    last_exc: Optional[Exception] = None
    for attempt in range(2):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            text_blocks = [b.text for b in response.content if getattr(b, "type", None) == "text"]
            raw = _strip_fences("".join(text_blocks))
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise TitleDoctorError(f"Model returned invalid JSON: {exc}") from exc
            return _validate_payload(data)
        except TitleDoctorError:
            raise
        except Exception as exc:
            last_exc = exc
            log.warning("Anthropic call failed (attempt %d/2): %s", attempt + 1, exc)
            if attempt == 0:
                time.sleep(0.6)
                continue
    raise TitleDoctorError(f"Anthropic API failed: {last_exc}")
