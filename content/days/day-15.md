---
day: 15
title: "Type Speed Mirror"
tagline: "Your typing rhythm, made visible."
date: 2026-05-25
status: live
live_url: /day-15/type-speed-mirror
repo_url: https://github.com/cielchan88/100_landing
tags: ["self-tracking", "typing", "rhythm"]
---

## Problem

Typing tests have been measuring the same two numbers since 1888: speed and accuracy. Both are fine. Both are also boring. They tell you what you already roughly knew about yourself, and they don't tell you anything about HOW you type — only how much.

The interesting data is in the rhythm. Where you pause. Where you accelerate. Which words your fingers know cold and which words make you slow down without realizing it. That data exists. It's just not what typing tests typically surface.

## Approach

Type a curated passage. Five short ones to choose from — narrative, abstract, list, punctuation-heavy, lyrical — each producing a different kind of typing experience. As you go, a line chart fills in beneath the passage: your instantaneous typing pace, smoothed over the last five keystrokes, plotted against time.

When you finish, the chart freezes and three things appear: a consistency score (what percentage of your typing stayed within thirty percent of your average), some supporting stats, and two or three specific moments — "you paused for 1.4s after 'philosophical'" — that turn the chart back into a story. Not WPM. Not accuracy. Your rhythm.

## Stack

- Flask blueprint at /day-15/type-speed-mirror on the existing 100_landing app
- Vanilla JS for the typing loop, pace calculation, and moment surfacing
- Chart.js for the live line chart (already in stack from earlier days)
- Five curated passages embedded in the JS
- No localStorage, no API, no server-side logic
- Zero ongoing cost, zero external dependencies

## Lessons

The five passages do most of the work. I wrote two and curated three from public domain sources, and each one produces a noticeably different shape on the chart. The "context switching" passage (a list of unrelated images) always produces a saw-tooth — quick during each item, slow at every period. The "punctuation" passage produces visible drops at every em-dash. None of this is surprising once you see it, but seeing it is the entire point. Speed is a number. Rhythm is a shape.
