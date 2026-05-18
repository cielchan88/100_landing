---
day: 8
title: "Snake"
tagline: "An old game, made with care."
date: 2026-05-18
status: live
live_url: /day-08/snake
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "arcade", "canvas"]
---

## Problem

Snake is the most-cloned game in browser history. Most clones are functional — grid moves, apple appears, snake grows. None of them feel particularly good. The mechanics aren't what need fixing. The texture is.

## Approach

Same game everyone knows. Continuous interpolated movement instead of grid-stepping. Soft glow on the snake, a pulsing apple, particle bursts on eat, hit-stop on death, synthesized Web Audio tones that rise in pitch with each apple. The difficulty adapts — speed creeps up every five apples until the rhythm becomes unforgiving.

No score persistence. No leaderboard. No social features. You play, you crash, you walk away with whatever number you got.

## Stack

- Flask blueprint at `/day-08/snake` on the existing 100_landing app
- HTML5 Canvas for rendering, ~600 lines of vanilla JS, no framework
- Web Audio API for synthesized sound (no audio files)
- Smooth interpolated movement separate from logical game tick
- Desktop (keyboard) + mobile (swipe) controls, full responsive
- Zero ongoing cost, zero external dependencies

## Lessons

The mechanics took an hour. The juice took five. Screen shake calibration alone — how much, how fast, how long — went through six iterations before it felt right instead of obnoxious. The line between "this feels alive" and "this is annoying" is narrower than I expected, and lives entirely in the timing.
