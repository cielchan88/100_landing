---
day: 36
title: "Swarm"
tagline: "A million points, one current."
date: 2026-06-15
status: live
live_url: /day-36/swarm
repo_url: https://github.com/cielchan88/100_landing
tags: ["graphics", "webgl", "gpgpu", "particles"]
---

## Problem

One particle is nothing. A million of them moving together — flowing, folding, gathering into a shape and falling apart — is the kind of thing that stops a scroll. The catch is that a million of anything will not survive being updated by JavaScript sixty times a second. The only way to move that many points in a browser is to never touch them with the CPU at all: keep their positions and velocities in textures on the GPU and let shaders push them around.

## Approach

It is a GPGPU simulation. Every particle is a pixel in a floating-point texture, and each frame two fragment shaders rewrite those pixels — one advancing velocity, one advancing position. The motion comes from a curl-noise field, the curl of a 3D noise function, which is divergence-free and so reads as smoke or a flock rather than random drift. The cursor adds a local force, and a morph mode springs every particle toward a target position sampled from a shape or a word rendered to a canvas, holds the form, then lets the noise reclaim it. They are drawn as a million soft additive points with bloom on near-black, which is most of the magic.

## Stack

- Flask blueprint at /day-36/swarm on the existing 100_landing app
- Three.js (r128, CDN) with GPUComputationRenderer managing the position/velocity compute textures; custom GLSL for curl-noise, forces, and the point shader
- Tier-scaled particle counts (toward a million on desktop, fewer on mobile), ACES tonemapping, bloom for the glow
- Zero ongoing cost, no API, no assets

## Lessons

The number that matters is not the particle count, it is where the data lives. Move the state into textures and a million particles costs about the same as a thousand, because the GPU updates them all in one pass; leave any of it on the CPU and a thousand is already too many. Curl noise was the other key: ordinary noise makes particles jitter, but its curl makes them flow, and that one mathematical detail is the difference between static and starlings. And the oldest lesson held — additive points and a bloom pass do more for the look than any cleverness in the simulation.
