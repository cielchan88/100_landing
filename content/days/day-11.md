---
day: 11
title: "Pure Noise"
tagline: "Six sounds, no files."
date: 2026-05-21
status: live
live_url: /day-11/pure-noise
repo_url: https://github.com/cielchan88/100_landing
tags: ["audio", "synthesis", "ambient"]
---

## Problem

Soundscape apps for focus and meditation are usually MP3 collections — gigabytes loaded over the network, locked to whatever the creator recorded, the same five-minute loop on repeat for hours. The audio is heavy, the files expire from cache, the experience is finite even when it should feel infinite.

## Approach

Synthesize every sound from scratch using the Web Audio API. Six layers — rain, white noise, wind, fire, drone, singing bowl — each built from filtered noise, oscillators, and envelopes. The total JavaScript payload is smaller than a single MP3 file. The sounds can run forever without repeating, because there's no recording to loop.

A waveform visualizer dominates the screen, reacting to the live mix. Controls are subtle until needed. State encodes into the URL hash, so you can share a soundscape by sharing a link.

## Stack

- Flask blueprint at /day-11/pure-noise on the existing 100_landing app
- Pure Web Audio API synthesis: noise buffers, biquad filters, oscillators, LFOs
- HTML5 Canvas for the audio-reactive visualizer
- Vanilla JS, ~700 lines, no framework, no audio files
- URL hash for state encoding — shareable, no localStorage needed
- Zero ongoing cost, zero file size beyond the page itself

## Lessons

Fire was the hardest sound. White noise lowpass-filtered gives you the steady rumble, but the crackles need irregular timing — short bursts of high-passed noise with sharp envelopes, scheduled at random intervals between 50 and 300 milliseconds. Get the timing wrong and it sounds like rain. Get the envelope wrong and it sounds like applause. The line between "campfire" and "static" lives entirely in the parameters.
