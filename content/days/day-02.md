---
day: 2
title: "Forwarded-Message Origin Tracer"
tagline: "Trace where that viral forwarded message actually came from."
date: 2026-05-12
status: live
live_url:
repo_url:
tags: ["AI", "misinformation", "Python"]
---

## Problem

Messages forwarded through WhatsApp lose their origin the moment they leave the original sender. Claims about policy, health, or politics spread without context — and by the time they reach you, the source is unrecoverable.

## Approach

Paste any forwarded message. The app searches for its earliest appearance online, detects variant mutations across the chain, gathers fact-check verifications, and returns a verdict you can forward right back into the same group.

## Stack

- FastAPI + Jinja
- Anthropic API with the `web_search` tool
- SQLite cache keyed on a hash of each message already traced

## Lessons

The only way to fight misinformation that spreads through WhatsApp is to make the verification spread through WhatsApp too.
