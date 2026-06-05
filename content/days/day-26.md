---
day: 26
title: "Pitch"
tagline: "Three a side. Winner stays on."
date: 2026-06-05
status: live
live_url: /day-26/pitch
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "3d", "soccer", "threejs"]
---

## Problem

The brief was a soccer game with high-quality graphics, in a day, in the browser. Those constraints fight each other: a full eleven-a-side match can't be made to look good or play well in a single session — the effort spreads too thin across team AI, formations, and rules, and the graphics are the first casualty. The way to actually deliver "high quality" was to shrink the game until the polish budget could concentrate: a small-sided 3-vs-3 match, where a clean stylized 3D scene and tight arcade controls can both be done properly.

## Approach

Three.js, but stylized rather than photoreal — photorealism isn't a one-day target, while clean low-poly figures, a striped pitch, good lighting, and soft shadows read as premium and are achievable. You control one player at a time: whoever is on the ball, or the teammate nearest it when defending, with the AI running everyone else. Movement, a lead pass, and a hold-to-charge shot are the whole control surface, which keeps it instantly playable on a phone with a thumb-stick and two buttons. The ball runs on hand-rolled arcade physics — roll, friction, arced shots, bounce — with players treated as simple cylinders for collision, because a real physics engine was scope the game didn't need.

It was built as a vertical slice: a complete, smooth, watchable 3-vs-3 match first, then the graphics and game-feel polish layered on top.

## Stack

- Flask blueprint at /day-26/pitch on the existing 100_landing app
- Three.js (r128, loaded from a CDN, no bundler) for 3D rendering: striped pitch, soft shadows, a follow camera
- Vanilla JS for the game loop, custom arcade ball physics, simple team AI, and input (keyboard + on-screen joystick)
- Adaptive quality so it stays smooth on mobile; zero ongoing cost, no API, no dependencies beyond Three.js

## Lessons

High-quality graphics in a day is a scoping problem disguised as an art problem. The trick wasn't any single rendering technique — it was choosing a game small enough that lighting and shadows could be tuned at all. A striped pitch texture and one well-placed shadow-casting light did more for the "premium" feel than anything expensive would have. The other lesson was the controlled-player problem: a 3-vs-3 game is only fun if you're always controlling the player who matters, so the auto-switch to the nearest defender quietly does a lot of the work of making it feel good to play.
