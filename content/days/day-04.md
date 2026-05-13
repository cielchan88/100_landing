---
day: 4
title: "Reasoning Reps"
tagline: "Five minutes of un-AI'd thinking, daily."
date: 2026-05-13
status: live
live_url: /day-04/reasoning-reps
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "daily", "cognitive"]
---

## Problem

Knowledge workers in 2026 increasingly outsource reasoning to AI assistants. Working memory, source evaluation, inference, pattern recognition, estimation — these atrophy without practice, like muscles that never lift. The Carnegie Mellon and Microsoft Research studies in 2024–2025 quantified the effect; the daily subjective experience is sharper still.

## Approach

A Wordle-style daily puzzle. Five short reps per day, one for each cognitive skill. Same puzzles for everyone on a given UTC date. Stateless: progress passes through URL query strings, results shareable via URL hash without spoilers. No timer (deep thinking over speed). No AI at runtime — puzzles are pre-generated as a static JSON file, so the game stays free and survives if Anthropic ever goes down.

## Stack

- Flask blueprint at /day-04/reasoning-reps on the existing 100_landing app
- Static JSON puzzle file pre-generated using Claude (one-time, curated daily content)
- Multi-page wizard (one puzzle per route), pure form POST + redirect, no JS framework
- localStorage for "played today" detection, otherwise fully stateless
- Share via URL hash — paste link, friend sees score and CTA without seeing answers

## Lessons

The trap with brain training is generic exercises that don't transfer to real life. Designing puzzles around the specific cognitive functions AI substitutes for — and not around generic IQ test patterns — is the bet that makes this different from Lumosity-style theater.
