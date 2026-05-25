---
day: 16
title: "The 5-Whys Partner"
tagline: "Most problems are not the real problem."
date: 2026-05-26
status: live
live_url: /day-16/five-whys-partner
repo_url: https://github.com/cielchan88/100_landing
tags: ["ai", "conversation", "problem-solving"]
---

## Problem

The Five Whys framework, developed at Toyota in the 1950s, is one of the cleanest problem-solving tools that exists. You state a problem. You ask why. You take the answer and ask why again. Five times. By the end, you have either reached the actual root cause or learned that what you thought was the problem isn't.

Doing it alone fails most of the time. Your own reasoning runs out before you've gone deep enough, or you treat the first plausible answer as the final one and stop. A partner helps — one who pushes back on shallow answers, references your specific words, and refuses to offer solutions until the synthesis. Most chatbots, asked to "do Five Whys with me," will start advising you by the second question. This one won't.

## Approach

A custom-configured conversational partner powered by Gemini 2.0 Flash. Three dimensions to tune before starting: tone (Gentle, Direct, Socratic, Investigative), domain perspective (Business, Personal, Technical, Philosophical, Therapeutic), and depth style (Root cause, Hidden assumptions, Underlying emotions). State your problem. The bot asks exactly five "why" questions, each one referencing what you actually said. At the end, it synthesizes — surface problem, the path, the root, an honest assessment of whether this is actually the root, and one first step you could take.

The conversation isn't saved. Closing the tab erases it. If something matters, you copy it.

## Stack

- Flask blueprint at /day-16/five-whys-partner on the existing 100_landing app
- Google Gemini 2.0 Flash via `google-generativeai` (first non-Anthropic LLM in the stack)
- Server-Sent Events streaming for token-by-token response display
- Flask-Limiter for per-IP rate limits (10 req/min)
- In-memory daily quota tracking against the free tier limit
- Vanilla JS with EventSource-style stream parsing
- No localStorage, no database, no saved sessions
- Zero ongoing cost (Gemini free tier)

## Lessons

The hardest part of the system prompt wasn't the framework — it was forbidding the bot from offering solutions during questions 1 through 5. LLMs want to be helpful. They want to advise. Holding them back from premature solving, especially when the user is clearly struggling, took several iterations to get right. The trick that worked: not just "don't offer solutions" but "your job is to make them articulate the next level, and they cannot articulate it if you do their thinking for them."
