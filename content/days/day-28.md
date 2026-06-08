---
day: 28
title: "Antipodes"
tagline: "Dig straight down. Where do you come out?"
date: 2026-06-07
status: live
live_url: /day-28/antipodes
repo_url: https://github.com/cielchan88/100_landing
tags: ["geography", "maps", "toy"]
---

## Problem

Every child eventually asks where they'd end up if they dug a hole straight through the Earth, and the answer is more surprising than the question deserves: almost always the open ocean. Because the Earth's land and water are arranged the way they are, most places on land have water on the exact opposite side. It's a fact that's much more convincing when you can tap a city and watch the marker land in the middle of the Pacific than when someone just tells you.

## Approach

Two world maps, one above the other. Tap anywhere on the first and a marker drops on the second at the antipode — latitude flipped, longitude spun halfway around the globe. A point-in-polygon test against a bundled set of country outlines reports what's actually there: a country, or ocean. An optional "guess first" mode turns it into a game — you place your guess for the antipode and it scores you by how many kilometres off you were, great-circle distance, before revealing the truth.

The whole thing is self-contained. The world map is a simplified set of polygons bundled into the page, drawn with a plain equirectangular projection, so there are no map tiles, no map service, and no network calls once the page loads.

## Stack

- Flask blueprint at /day-28/antipodes on the existing 100_landing app
- Vanilla JS: equirectangular projection, antipode math, ray-casting point-in-polygon, haversine distance
- A simplified world GeoJSON (Natural Earth 110m, 177 countries) bundled into the project's static files — no map API, no tiles
- Zero ongoing cost, fully offline after load

## Lessons

The temptation was to reach for a mapping library and live tiles, which would have been faster to start and worse to live with — an external dependency and network calls for something that's really just polygons and arithmetic. Bundling a simplified world and drawing it with a ten-line equirectangular projection kept the whole toy self-contained and instant, and made the antipode visually obvious: flip top-to-bottom, slide halfway across, and you're there. The point-in-polygon test was the only fiddly part, mostly because countries are multipolygons with islands and holes, and "which country is this ocean point in" has to gracefully answer "none."
