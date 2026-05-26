---
day: 17
title: "The Adventure Engine"
tagline: "Six turns. Three choices. One story."
date: 2026-05-27
status: live
live_url: /day-17/adventure-engine
repo_url: https://github.com/cielchan88/100_landing
tags: ["ai", "game", "fiction"]
---

## Problem

Choose-your-own-adventure books are out of print. Their digital descendants are either tiny one-page hypertext experiments or massive multi-hour interactive fiction with skill trees and inventories. There's a sweet spot between them — a story that feels substantial but ends in under ten minutes, with branches that feel real but constraints that keep the writing tight.

Most attempts at "AI-generated fiction" fail because they wander. The AI doesn't know when to end, so it doesn't. Stories meander, escalate without payoff, lose their thread. The fix is structural: tell the AI explicitly that turn six is the last turn, and the story must conclude there.

## Approach

Pick a genre from six presets. Describe a protagonist in one or two sentences. The AI writes turn one — a hundred-and-fifty-ish words of story, ending with three short choices. You pick. The AI writes turn two, continuing from your pick. After turn five's choice, the AI writes turn six as a conclusion, not a continuation. No "to be continued." The story ends.

Each turn streams in token by token, like watching the AI think out loud. The whole session is under ten minutes. The token economy is around 1,500 tokens per story — about 250 stories per day fit comfortably in Gemini's free tier.

## Stack

- Flask blueprint at /day-17/adventure-engine on the existing 100_landing app
- Google Gemini via `google-generativeai` (same setup as Day 16)
- Server-Sent Events streaming for token-by-token story delivery
- Flask-Limiter for per-IP rate limits (15 req/min)
- In-memory daily quota tracking against the free tier limit
- Vanilla JS with EventSource-style stream parsing
- No localStorage, no database, no saved sessions
- Zero ongoing cost (Gemini free tier)

## Lessons

The hardest part wasn't structuring the prompts — it was the choice parser. The AI was supposed to end turns 1-5 with `CHOICE 1: ...`, `CHOICE 2: ...`, `CHOICE 3: ...` exactly. Most of the time it did. Sometimes it added a fourth choice. Sometimes it numbered them in roman numerals. Sometimes it put the choices inside a paragraph. The fix was tighter system prompt rules combined with a forgiving regex parser that extracts the first three choice-shaped patterns from the response. LLMs are creative partners; defensive parsing is the price of that creativity.
