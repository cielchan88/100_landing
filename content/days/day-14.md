---
day: 14
title: "Decision Matrix"
tagline: "Make the decision visible."
date: 2026-05-24
status: live
live_url: /day-14/decision-matrix
repo_url: https://github.com/cielchan88/100_landing
tags: ["decision", "personal", "matrix"]
---

## Problem

Most decisions in life don't get the same scrutiny as the spreadsheets at work. We weigh job offers, apartments, vacation destinations, and major purchases mostly by gut. That isn't always wrong — intuition compresses a lot of information. But sometimes intuition is reacting to the wrong thing, and a structured comparison would surface it. The barrier is that decision matrices feel like overkill for personal decisions until they don't.

## Approach

Six options maximum. Five criteria maximum. Hard limits, on purpose — if your decision needs more than five criteria or six options, the tool isn't going to help, and you probably have a different problem. Rate each option-criterion pair 1 to 5. Set a weight on each criterion based on how much it matters. The total score for each option is the sum of rating times weight across all criteria.

A bar chart ranks the options. The winner is whichever has the highest score. Below it, a single reflection prompt: does this match your gut? If not, which rating or weight might be off? The tool isn't telling you what to choose — it's showing you the structure of how you'd choose if you trusted these numbers, so you can either trust them or notice why you don't.

State encodes into the URL hash, which means you can share the matrix with a friend by sharing a link — useful when you want a second pair of eyes on what you've laid out.

## Stack

- Flask blueprint at /day-14/decision-matrix on the existing 100_landing app
- Vanilla JS state machine for the matrix
- Pure CSS for the result bars (no chart library)
- URL hash for shareable state — no server-side storage
- ~450 lines of JavaScript total
- Zero ongoing cost, zero external dependencies

## Lessons

The temptation was to add features: notes per cell, confidence intervals on ratings, sensitivity analysis, exportable PDF reports. Every one of them would have made the tool feel more "professional" and less useful. The hardest UX problem in a decision-matrix tool isn't the math — it's keeping the user inside the small, awkward window where structure helps thinking rather than replacing it.
