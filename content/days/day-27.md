---
day: 27
title: "Bloom"
tagline: "Two chemicals. Endless patterns."
date: 2026-06-06
status: live
live_url: /day-27/bloom
repo_url: https://github.com/cielchan88/100_landing
tags: ["generative", "simulation", "science", "canvas"]
---

## Problem

In 1952 Alan Turing proposed that the patterns on animals — a leopard's spots, a zebra's stripes — might come from nothing more than two chemicals spreading and reacting at different speeds. It sounds too simple to be true, and the only way to really believe it is to watch it happen. Most explanations are static diagrams; the phenomenon is anything but static.

## Approach

The Gray-Scott model is the smallest reaction-diffusion system that produces Turing patterns, and it runs comfortably in a browser if you treat it carefully. The simulation lives on a grid of a few hundred cells a side, stored in typed arrays and double-buffered so each step reads one buffer and writes the next. You paint a seed of the second chemical anywhere on the field, and from that seed a whole living texture organizes itself — and which texture you get depends on just two numbers, the feed and kill rates, exposed as sliders with named presets for the famous regions.

## Stack

- Flask blueprint at /day-27/bloom on the existing 100_landing app
- HTML5 Canvas, vanilla JS, Float32Array double-buffering, requestAnimationFrame
- The simulation runs on a small grid scaled up to the display; several steps per frame
- Adaptive quality so it stays smooth on mobile; zero ongoing cost, no API, no dependencies

## Lessons

The performance trick that made it possible was decoupling the simulation resolution from the display resolution. Running the chemistry at full pixel resolution is hopeless; running it on a small grid and scaling the result up looks just as good and is an order of magnitude cheaper. The other lesson was how much the two parameters matter — feed and kill rates that differ by a couple of thousandths produce completely different worlds, spots versus stripes versus endlessly dividing cells, which is exactly why the named presets earn their place: without them you could search the parameter space for an hour and never find mitosis.
