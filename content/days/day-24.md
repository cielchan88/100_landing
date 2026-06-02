---
day: 24
title: "Flock"
tagline: "Three rules. One living flock."
date: 2026-06-03
status: live
live_url: /day-24/flock
repo_url: https://github.com/cielchan88/100_landing
tags: ["generative", "simulation", "canvas", "toy"]
---

## Problem

After two days simulating monetary systems, the project needed to breathe. Something with no argument to make and no verdict to reach — just motion. A murmuration of starlings is one of the most beautiful emergent phenomena in nature, and the surprising thing is how little produces it: no leader, no plan, just every bird obeying three local rules. That gap between the simplicity of the rules and the complexity of the result is worth feeling directly, not just reading about.

## Approach

Craig Reynolds' 1986 boids model: separation, alignment, cohesion. Five hundred agents, each one looking only at its near neighbors, and a whole flock emerges from the sum. You reach into it with your cursor — pull it toward you, scatter it, or become a predator and watch it tear open and reknit. Five sliders let you change the flock's entire personality: tight schooling, loose drifting, coherent streams.

The interesting engineering was performance. Five hundred boids each checking every other is a quarter-million comparisons a frame — far too slow. A spatial hash grid fixes it: bucket the boids into cells the size of their vision, and each one only checks the nine cells around it. On top of that, the simulation watches its own frame rate and quietly thins the flock or drops the glow if a device is struggling, so it stays smooth on a phone.

## Stack

- Flask blueprint at /day-24/flock on the existing 100_landing app
- HTML5 Canvas, vanilla JS, requestAnimationFrame
- Spatial hash grid for O(n) neighbor search; toroidal wrapped world
- Cinematic rendering: directional triangles, speed-mapped color, motion trails, optional glow
- Adaptive quality: auto-thins flock / disables bloom under load, caps device pixel ratio
- Zero ongoing cost, no API, no dependencies

## Lessons

The cheap, obvious win was the trail. Instead of clearing the canvas to black each frame, you paint a near-black rectangle at low opacity over the previous frame — the old positions fade instead of vanishing, and suddenly five hundred dots read as a flowing murmuration rather than scattered noise. One line of code does most of the aesthetic work. The expensive lesson was the opposite: the glow effect that looked gorgeous on a laptop turned a mid-range phone into a slideshow, which is why the simulation ended up needing to measure itself and degrade on purpose. Beauty that only works on your own machine isn't finished.
