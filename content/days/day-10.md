---
day: 10
title: "Mood Mosaic"
tagline: "Nine days, in color."
date: 2026-05-20
status: live
live_url: /day-10/mood-mosaic
repo_url: https://github.com/cielchan88/100_landing
tags: ["milestone", "generative art", "celebration"]
---

## Problem

Ten days into building one web app every day, the journey starts to have a shape. Word count tells one story. Commit count tells another. But the actual *feeling* of nine different apps — what each one looked like, what mood it carried — only emerges if you can see them all together.

## Approach

Each app gets a primary color and three accents. Nine palettes stitched into one full-viewport composition in an asymmetric grid. Hover any region to see which day made those colors. Click anywhere to cycle through three view modes: soft watercolor fields, hard-edged architectural blocks, drifting particle clouds. Same data, three textures.

No download button. No share button. If the composition is striking enough, the screenshot happens organically.

## Stack

- Flask blueprint at /day-10/mood-mosaic on the existing 100_landing app
- SVG for Mode 1 (soft fields) and Mode 2 (architectural)
- HTML5 Canvas for Mode 3 (particles)
- Vanilla JS, ~500 lines, no framework
- localStorage to remember preferred view mode
- Zero ongoing cost, zero external dependencies

## Lessons

Building generative art in two days when you've spent the previous nine on utilities turns out to be harder than building generative art in isolation. The constraint isn't technical — it's about deciding what the piece is FOR. The version that survived the cut is the one that earns its place in the project by doing what no previous day did: looking back, and making the looking-back the experience.
