---
day: 12
title: "The Tipping Point"
tagline: "Mild preferences, extreme outcomes."
date: 2026-05-22
status: live
live_url: /day-12/tipping-point
repo_url: https://github.com/cielchan88/100_landing
tags: ["explainer", "complexity", "interactive"]
---

## Problem

In 1971, Thomas Schelling published a result that shouldn't be true but is. Place two groups of people on a grid. Give each person a single preference: they want at least some percentage of their neighbors to be the same group as them. Set that threshold to something modest — 30%, even less. Let everyone who's unhappy move to a random open spot. Watch what happens.

What happens is full segregation. Not approximate. Not partial. Stark.

The model is replicated in every introduction to complexity science because it makes a single point with overwhelming clarity: collective outcomes can emerge from individual decisions in ways that don't reflect anyone's intentions. The number that produces segregation is much lower than common sense suggests.

## Approach

A grid of 1,600 cells. Roughly 1,440 agents in two equal groups. Two sliders: threshold (the preference each agent has) and animation speed. One button: start. Watch the self-organization happen, then read what it might mean.

Real-world annotations appear after equilibrium — different framings depending on what threshold the user chose. The point is to give the visualization room to land first, then let context deepen the moment.

## Stack

- Flask blueprint at /day-12/tipping-point on the existing 100_landing app
- HTML5 Canvas for the grid, vanilla JS for the simulation
- No data, no API, no server logic beyond serving one page
- ~450 lines of JavaScript, ~1,600 simulation cells, equilibrium in under 100 iterations
- Zero ongoing cost, zero external dependencies

## Lessons

The choice that mattered most wasn't the algorithm — Schelling's rules are simple. It was when to show the annotation. Show it before, and the user reads instead of watching. Show it during, and the simulation feels like a tutorial. Show it after, and the reveal lands first, then context deepens it. The visualization needs space to do its own work.
