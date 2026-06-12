---
day: 26
title: "Pitch"
tagline: "Eleven a side. Hold your shape."
date: 2026-06-05
status: live
live_url: /day-26/pitch
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "3d", "soccer", "threejs"]
---

## Problem

A full eleven-a-side match in a browser, in a day, looking good — three demands that pull against each other. The graphics are the easy part. The hard part is that twenty-two players chasing one ball is not football, it is a swarm, and a swarm is both ugly and unplayable. The whole illusion of the sport is shape: a team that keeps its formation, stretches and slides as the ball moves, and sends one player to close down while the rest hold position. Without that, more players just means more chaos.

## Approach

The heart of the game is the positional AI. Every outfield player has a home position from a 4-3-3, and that home shifts with the ball — the block pushes up to attack and drops to defend, sliding toward the ball's side — so the team moves as one connected unit. The rule that kills the swarm is simple: on each side, only the single closest player to the ball leaves shape to press it; everyone else goes to their position. A goalkeeper guards each goal, tracking the ball across its line and rushing the angle when a shot threatens, and a referee jogs after the play to start it and whistle the goals. You only ever control the player who matters — the one on the ball, or the nearest defender — with the rest holding their lines. On top of that sits a tiered renderer borrowed from the flight sim: filmic tonemapping and environment lighting on every device, real shadows and bloom and a crowd on capable ones, and blob shadows with the heavy effects stripped on a phone, because twenty-two players plus shadows is exactly where a browser starts to choke.

## Stack

- Flask blueprint at /day-26/pitch on the existing 100_landing app
- Three.js (r128, CDN) with a tiered pipeline: ACES tonemapping + PMREM environment light everywhere; real shadows + bloom + crowd on capable devices; blob shadows on mobile
- Vanilla JS for the game loop, custom arcade ball physics, formation/positional AI, a goalkeeper, a referee, and input (keyboard + on-screen joystick)
- Zero ongoing cost, no API, no dependencies beyond Three.js

## Lessons

Scaling from a few players to a full team is not a numbers change, it is a design change: the entire problem becomes crowd control. The pressing rule — one player closes down, the rest hold shape — did more for making it look like football than any amount of animation could, and it is three lines of logic guarding against the most common failure in a ball game. The other lesson was the keeper: a goal nobody defends makes the whole match feel cheap, so a goalkeeper that simply tracks the ball and rushes the angle is what makes scoring feel earned. And the graphics confirmed the flight sim's lesson again — tonemapping and an environment map are nearly free and do most of the "rendered" look, while the expensive effects are the first thing a phone gives back.
