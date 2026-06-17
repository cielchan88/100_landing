---
day: 38
title: "Bastion"
tagline: "Build the maze. Hold the line."
date: 2026-06-17
status: live
live_url: /day-38/bastion
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "tower-defense", "pathfinding", "algorithms"]
---

## Problem

Most tower defense hands you a fixed road and asks where to put the guns. The more interesting version lets you rewrite the road: if every tower is a wall, then the enemies have to find their way around whatever you build, and the real game becomes shaping the longest, cruelest maze your gold can buy. That only works if the enemies are genuinely smart about routing — and if the player can never accidentally wall the exit off completely.

## Approach

A* pathfinding is the whole engine. There is a base path from the entrance to the core, but towers block cells, so every time you build, the enemies recompute their shortest walkable route and bend around your maze. The trick that keeps it honest is validating placements before they happen: the game runs the pathfinder on the hypothetical grid with the new tower added, and if no route survives, the placement is refused, so the exit is always reachable. Flyers are the deliberate exception — they ignore the grid and cross in a straight line, which is why anti-air exists. The waves never end; they only escalate, mixing fast, armored, and flying enemies as the numbers climb, and the score is simply how long you held.

## Stack

- Flask blueprint at /day-38/bastion on the existing 100_landing app
- Vanilla JS + HTML5 Canvas 2D: A* over the grid, towers, enemies, projectiles, an endless wave generator
- Clean top-down neon rendering; high score in localStorage; no assets, no API
- Zero ongoing cost, pure client-side

## Lessons

Making the path a computed thing instead of a drawn thing changed the whole game: the player is no longer choosing where to stand, they are authoring the route, and A* turns from decoration into the core verb. Two failure modes did most of the design work — letting the player seal the exit (fixed by pathfinding the hypothetical grid before committing a tower) and forgetting that flyers should ignore the maze entirely (fixed by giving them their own straight path and a tower type that can reach them). And the oldest game lesson held: a clean readable grid with snappy feedback beats any amount of visual noise when the fun is in the thinking.
