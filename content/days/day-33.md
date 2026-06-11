---
day: 33
title: "Cakrawala"
tagline: "Seventeen thousand islands. One small plane."
date: 2026-06-12
status: live
live_url: /day-33/cakrawala
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "3d", "flight", "procedural", "threejs"]
---

## Problem

A flight simulator is two hard problems wearing one trench coat: an aircraft that feels like it's flying, and a world big enough to fly in. Studios spend years on each. The one-day version forces both problems down to their essence — a handful of forces that interact honestly, and terrain that doesn't exist until you head toward it.

## Approach

The flight model is four forces and a stall. Thrust along the nose, lift that grows with the square of airspeed, drag that fights it, gravity that never stops — and a lift curve that gives up past the critical angle, so holding the nose up with no speed earns a buffet, a warning, and a drop. There is no auto-level; the wings stay where you leave them. The world is a single mathematical function: a seeded noise field that answers "how high is the ground here?" for any coordinate on an infinite plane. Terrain meshes are generated from that function in chunks around the plane and dissolved behind it, fog hiding the seam where the world is still being imagined — and because the function is analytic, crashing is just a comparison, no raycasts required. Hitting anything ends the flight, full stop; the apology is that the next one starts in under a second. Rings hang in the air to give the horizon a direction.

## Stack

- Flask blueprint at /day-33/cakrawala on the existing 100_landing app
- Three.js (r128, CDN, no bundler) — flat-shaded vertex-colored chunks, no shadow maps, fog as level-of-detail
- Hand-written seeded simplex noise; a fixed-timestep semi-sim physics core; chase camera; virtual stick + throttle slider on touch
- localStorage for bests and preferences; zero ongoing cost, no API, no dependencies beyond Three.js

## Lessons

The code was the easy half. A flight model is a dozen lines of vector math that feel wrong in forty different ways until the constants are right, and most of the session's real work was flying, adjusting one number, and flying again — the difference between a soap bar and an airplane lives entirely in the tuning. The terrain taught the opposite lesson: making the height of the world a pure function meant the mesh, the collision, and the ring placement all asked the same oracle and could never disagree. And the fog, added for mood, turned out to be the most honest performance tool in 3D — the horizon doesn't have to be rendered if it's allowed to be a color.
