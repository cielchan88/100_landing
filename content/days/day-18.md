---
day: 18
title: "Plant Doctor"
tagline: "Show me your plant."
date: 2026-05-28
status: live
live_url: /day-18/plant-doctor
repo_url: https://github.com/cielchan88/100_landing
tags: ["ai", "vision", "plants"]
---

## Problem

Plant care advice on the internet is mostly written at the species level — "water your Pothos when the top inch of soil is dry." That's fine if you already know it's a Pothos. If you don't, or if your plant is stressed in a way the generic advice doesn't address, you're stuck. You can post a photo to r/houseplants and wait for the kindness of strangers, or you can flip through enough Google image searches to maybe figure it out. Neither is fast.

The interesting thing about LLMs with vision is that they collapse this gap. A model that has read every plant care guide on the internet, looking at the plant in front of you, is something most plant owners would have wanted ten years ago.

## Approach

Single photo upload. Optional context if the user has noticed something specific. Client resizes the image to fit within 1024px, sends it as a multipart upload, server hands it to Gemini with a strict system prompt that demands JSON output. Five sections come back: species, health, observations, care recommendations, light/water/humidity. Plus a disclaimer that this isn't a substitute for a real horticulturist on serious cases.

The interesting design constraint was the confidence indicator. The bot is told to label its species identification as Confident, Likely, or Uncertain — so the user can tell when to trust it. This matters more than the identification itself.

## Stack

- Flask blueprint at /day-18/plant-doctor on the existing 100_landing app
- Google Gemini Vision via `google-generativeai`
- Client-side image resize via Canvas API before upload (~1MB target)
- Server-side fallback resize via Pillow
- JSON-mode output from Gemini, parsed and validated on server
- Mobile camera capture via `<input capture="environment">`
- Vanilla JS for everything else
- Zero ongoing cost (Gemini free tier)

## Lessons

JSON mode from Gemini is dramatically more reliable than asking for "structured output" in plain text. With `response_mime_type: 'application/json'` and a schema in the system prompt, the model returns valid JSON something like 95% of the time. The other 5% — where it wraps the JSON in markdown fences or adds a preamble — required a forgiving parser on the server. The lesson is universal: when integrating with LLMs, design for the bad cases as carefully as the good ones, because the bad cases will happen.
