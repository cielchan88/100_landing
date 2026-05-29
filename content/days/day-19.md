---
day: 19
title: "Bend the Beam"
tagline: "Twelve puzzles, all about light."
date: 2026-05-29
status: live
live_url: /day-19/bend-the-beam
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "physics", "puzzle"]
---

## Problem

After three consecutive days of LLM-powered projects, the stack needed a variety break. Pure physics — no API calls, no rate limits, no system prompts to iterate on. Just math.

Most puzzle games invent their own rules. Real physics gives you better rules for free. Light bends when it enters glass at an angle. Light reflects off mirrors at the angle of incidence. Walls block light. Once you internalize those three rules, every puzzle becomes a matter of geometric reasoning. The game stays small because the physics does the work of complexity.

## Approach

Twelve hand-crafted levels. Five element types — light source, glass prism, mirror, wall, target — combined into puzzles of escalating difficulty. The player drags prisms and mirrors around the level and rotates them in 15-degree increments. The light beam re-renders in real time as elements move, so you can see exactly what your adjustments do.

Snell's law for refraction. Angle-of-incidence reflection for mirrors. Ray tracing with up to 12 bounces. All client-side JavaScript, no server logic beyond serving one HTML page. Progress saves to localStorage so you can come back tomorrow.

The interaction is mobile-first: tap to select, drag to move, dedicated rotate buttons. Physics puzzles on touchscreens have to give up some precision in exchange for accessibility — 15-degree rotation increments and large touch targets are the trade-off.

## Stack

- Flask blueprint at /day-19/bend-the-beam on the existing 100_landing app
- HTML5 Canvas for rendering, vanilla JS for everything else
- Ray-segment intersection math, polygon intersection math, Snell's law for refraction
- ~700 lines of JavaScript, ~12 levels of data
- localStorage for level progress
- Zero ongoing cost, zero external dependencies, zero API calls

## Lessons

Snell's law is one line of mathematics. Implementing it correctly in code is several days of frustration. The thing they don't tell you is that ray tracing is mostly about handling edge cases — what happens when a ray hits a corner, what happens when it grazes a surface tangentially, what happens when floating-point precision makes it look like the ray is hitting the surface it just left. The trick that fixed half my bugs was advancing the ray origin a tiny fraction past the hit point before tracing the next bounce, so the algorithm never gets stuck testing intersections with the surface it just bounced off.
