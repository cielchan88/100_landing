---
day: 9
title: "Read Time"
tagline: "How long it takes to read what you wrote."
date: 2026-05-19
status: live
live_url: /day-09/read-time
repo_url: https://github.com/cielchan88/100_landing
tags: ["utility", "writing", "client-side"]
---

## Problem

Every writer ends up checking the same things: word count, character count, reading time, tweet count. Each one usually lives in a different tool. The information is simple, but the workflow isn't.

## Approach

One page, one textarea, eight numbers that update as you type. Reading speed and speaking speed both adjustable via sliders. A copy button that gives you a clean summary line for sharing or pasting into a message. Everything happens in the browser. The text never leaves the page.

## Stack

- Flask blueprint at `/day-09/read-time` on the existing 100_landing app
- One HTML page, one JS file (~250 lines), one CSS file
- Pure client-side calculation, no API, no server logic beyond serving the page
- Debounced input handler keeps it snappy even on long texts
- Zero ongoing cost, zero external dependencies

## Lessons

The hardest part wasn't the counting math — it was deciding what *not* to add. Reading-grade levels, complexity scores, sentiment analysis, keyword density — all tempting. None of them belonged. The product is the eight numbers a writer actually checks before publishing. Anything else dilutes the answer to "how long is this."
