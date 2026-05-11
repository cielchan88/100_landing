---
day: 2
title: "Title Doctor"
tagline: "Paste a draft title. Get 15 honest alternatives, streamed live."
date: 2026-05-12
status: live
live_url: /day-02/title-doctor
repo_url: https://github.com/cielchan88/100_landing
tags: ["AI", "writing", "streaming"]
---

## Problem

Every writer, marketer, and creator drafts a title that is *almost* there — vague verb, buried subject, no stakes. Existing AI title generators give 5 variants that all sound the same and all score themselves 9/10.

## Approach

Title Doctor returns 15 alternatives across 5 deliberately distinct strategies (Curiosity Gap, Contrarian, Specific Number, Question, Declarative). It scores them honestly — most land in the 6-8 range, weak variants get 4s, and clickbait gets called out by name in the rationale. The user's draft also gets a verdict so they know whether the original is salvageable.

## Stack

- Flask blueprint mounted at `/day-02/title-doctor` on the existing `100_landing` app
- Anthropic API with `claude-sonnet-4-5`, single call returning structured JSON
- Server-Sent Events to stream the verdict + variants progressively for a live feel
- Vanilla JS on the frontend — no framework, ~150 lines
- No database, no auth, no rate limit page (free tier handles the throttling naturally)

## Lessons

The screenshot-worthy output came from *honest scoring*. Every previous AI title tool I've seen gives all 9s and 10s. The moment some variants score 4 and 5, the tool starts feeling trustworthy — which is what makes the high-scoring ones actually useful.
