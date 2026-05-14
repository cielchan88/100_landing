---
day: 5
title: "The Restless Earth"
tagline: "Every earthquake on Earth, in real time."
date: 2026-05-15
status: live
live_url: /day-05/restless-earth
repo_url: https://github.com/cielchan88/100_landing
tags: ["data viz", "real-time", "geology"]
---

## Problem

Earthquakes happen constantly — roughly 8,000 per day at all magnitudes, somewhere on the planet. Most are invisible to humans but tracked by USGS sensors. The data is public, but the visualization that exists is fragmented across news cycles and emergency-only contexts. There's no calm, beautiful way to watch the planet's geological pulse.

## Approach

A single page, a dark world map, live data from the USGS public GeoJSON feed. Time window toggle for 1 hour, 24 hours, or 7 days. Magnitude slider. Markers sized by magnitude, colored by depth. New earthquakes pulse in as they arrive. A small stats panel keeps perspective: total count, biggest in window, most active region. No login, no sign-up, no ads.

## Stack

- Flask blueprint at `/day-05/restless-earth` on the existing 100_landing app
- USGS Earthquake Hazards Program GeoJSON feeds — free, public, no API key
- Leaflet 1.9 (CDN) for the map; CartoDB Dark Matter for tiles
- Server-side proxy with 60-second cache to be a good API citizen
- Vanilla JS frontend, ~250 lines, no framework
- Auto-refresh every 5 minutes, real-time pulse animation on new arrivals

## Lessons

The biggest design choice was *what NOT to add*. The temptation was to include depth filtering, region filtering, historical comparison, tectonic plate overlays. Each one would have weakened the central image: a dark planet with bright marks where it's currently shaking. Restraint is the feature.
