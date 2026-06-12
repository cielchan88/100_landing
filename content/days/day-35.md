---
day: 35
title: "Ink"
tagline: "Drag. Watch it bloom."
date: 2026-06-14
status: live
live_url: /day-35/ink
repo_url: https://github.com/cielchan88/100_landing
tags: ["graphics", "webgl", "simulation", "shaders"]
---

## Problem

Fluid is the single most satisfying thing to push around with a cursor, and convincingly faking it in real time is one of the classic set-pieces of computer graphics. The temptation is a particle trick that looks fluid-ish from a distance; the honest version is an actual fluid solver — momentum carried along the flow, pressure forcing the field to conserve volume, vorticity put back to keep the swirls alive — running fast enough to chase a cursor at sixty frames a second, in a browser.

## Approach

It's Jos Stam's stable-fluids method, living entirely on the GPU. The velocity and dye fields are float textures, and each step is a fragment shader ping-ponging between them: advect the velocity along itself, add a push where the cursor drags, compute how much the field is diverging, solve for the pressure that cancels that divergence with a few dozen Jacobi iterations, subtract its gradient to make the flow incompressible, and confine vorticity so the curls don't wash out. The dye rides the same field and is rendered as glowing neon on black, additively so overlaps burn toward white. The whole thing was built one stage at a time — drift, then push, then incompressibility, then swirl — because a fluid solver written all at once is a black screen with no error message.

## Stack

- Flask blueprint at /day-35/ink on the existing 100_landing app
- Three.js (r128, CDN) as a thin WebGL harness for render targets and fullscreen passes; the solver is custom GLSL
- Ping-ponged half-float textures for velocity/dye/pressure; tier-gated bloom for the glow; runs the simulation below display resolution and upscales
- Zero ongoing cost, no API, no fluid library

## Lessons

A fluid solver teaches you to debug by sight. Each stage has a way it's supposed to look — dye drifting in a straight line, a push that follows the cursor, swirls that tighten instead of bloating — and when a stage looks wrong, the bug is in that stage and nowhere else, which is the only thing that makes a hundred lines of interacting shaders tractable in a day. The incompressibility step is the whole illusion: without the pressure solve and its gradient subtraction the dye just spreads like a stain, and with it the same field suddenly curls like smoke. And the oldest graphics lesson held again — the simulation runs at a quarter of the screen's resolution and nobody can tell, because motion sells fluid far more than pixels do.
