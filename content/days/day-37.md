---
day: 37
title: "Singularity"
tagline: "Where light bends."
date: 2026-06-16
status: live
live_url: /day-37/singularity
repo_url: https://github.com/cielchan88/100_landing
tags: ["graphics", "webgl", "space", "shaders"]
---

## Problem

A black hole is the best-looking object in physics: a perfectly black disc, a ring of glowing doomed matter, and the entire sky bent around it like a lens. Rendering it properly means tracing light backward along curved paths through warped spacetime — geodesic integration, genuinely hard and genuinely slow. The question for the day was whether you can get the look that stopped everyone in their tracks in Interstellar without doing the physics that earned a paper.

## Approach

You fake the lens and keep the drama. The accretion disk is a flat ring with a shader that scrolls turbulent noise and colors it by temperature, white-hot inside cooling to red out, brighter on the side rushing toward you to stand in for Doppler beaming, with a second warped copy arcing up and over the shadow so the disk appears to wrap the hole the way real lensing makes it. The bending of the sky is a screen-space trick: a post-processing pass that pushes the rendered pixels radially inward around the hole's position on screen, hard near the edge and fading with distance, so the stars swim around the shadow as you orbit. A bright photon ring, bloom, and filmic tonemapping do the rest. It is an artistic approximation, stated plainly — no geodesics — and it reads as a black hole instantly.

## Stack

- Flask blueprint at /day-37/singularity on the existing 100_landing app
- Three.js (r128, CDN) with OrbitControls; custom GLSL for the accretion-disk shader and a screen-space lensing post pass; EffectComposer for lensing + bloom
- ACES tonemapping, tier-scaled quality, procedural starfield — no assets, no geodesics
- Zero ongoing cost, no API

## Lessons

Most of the awe in a black hole render is in three cheap effects, not the hard one: a temperature gradient on the disk, a brighter near side, and a radial smear of the background. The lensing that takes a physicist a render farm can be approximated with a single distortion pass that fools the eye completely as long as the starfield behind it is busy enough to show the bend. The honest move was to label it an approximation rather than imply simulated physics — and the practical one was, again, that bloom and tonemapping did more for the result than anything underneath them.
