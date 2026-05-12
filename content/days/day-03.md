---
day: 3
title: "Color Heist"
tagline: "Steal color palettes from any website, image, or seed color."
date: 2026-05-13
status: live
live_url: /day-03/color-heist
repo_url: https://github.com/cielchan88/100_landing
tags: ["design", "color", "tools"]
---

## Problem

Designers spend an absurd amount of time picking colors. Existing tools either give you one input mode (only URLs, or only images), force a sign-up, or hide the good exports behind a paywall.

## Approach

Color Heist gives three doors into the same idea — paste a URL, upload an image, or pick a seed color. Each one returns 8 dominant tones plus 4 algorithmically-generated palettes (complementary, analogous, triadic, monochromatic). Every palette exports cleanly to CSS variables, Tailwind config, JSON, or a downloadable SVG swatch.

## Stack

- Flask blueprint mounted at `/day-03/color-heist` on the existing `100_landing` app
- ScreenshotOne API to render arbitrary URLs (free tier: 100 captures/month, cached 24h)
- Pillow + scikit-learn k-means for dominant color extraction on images
- Pure-Python color theory module for the 4 generated palettes
- Vanilla JS frontend, no framework — three input tabs, one output canvas
- WCAG contrast ratios computed on every swatch hover

## Lessons

The hard part was not the math. It was deciding what "dominant color" means when 30% of a page is white space. Background pixels dominate naive k-means, so the extraction quality lives or dies by the downscale-and-cluster pipeline, not the cluster count.
