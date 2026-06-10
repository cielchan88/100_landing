---
day: 31
title: "Ember-8"
tagline: "A tiny console. Real Lua."
date: 2026-06-10
status: live
live_url: /day-31/ember-8
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "console", "lua", "tools"]
---

## Problem

Fantasy consoles are a small miracle of constraint: give people a 128-pixel screen, sixteen colors, and tiny sprites, and they finish games they'd never finish with unlimited freedom. The question for day thirty-one was whether an entire one — the machine, the language runtime, and the tools to make carts — could be built in a single session. The honest answer required picking the hard option on purpose: cartridges in real Lua, running on a real Lua VM in the browser, rather than the easy path of letting JavaScript pretend.

## Approach

The whole project hinges on one bridge. Fengari is a Lua VM implemented in JavaScript, and the console works by running every cartridge as three chunks in its persistent state: a prelude that binds the machine's API — cls, spr, print, btn and friends — to a JavaScript object through Fengari's interop layer, then the cart's own source, then a tiny epilogue that hands the cart's _update and _draw functions back to JavaScript so a fixed 30fps loop can drive them. Around that bridge sits the machine itself: an indexed 128×128 framebuffer in a typed array, the classic sixteen-color palette, Bresenham primitives, an 8×8 sprite sheet with a pixel editor, a three-by-five pixel font, and cart management down to export and import. Two carts ship on the machine — a catch-the-embers game and a parallax starfield — because a console with nothing to play isn't a console.

## Stack

- Flask blueprint at /day-31/ember-8 on the existing 100_landing app
- Fengari (Lua 5.3 in JavaScript) as the cartridge runtime — the only external library
- Vanilla JS for the machine: typed-array framebuffer, drawing primitives, input, the editors, localStorage carts
- Zero ongoing cost; everything runs in the visitor's browser

## Lessons

Embedding a real language runtime turned out to be less about the VM and more about the seam. Fengari ran Lua flawlessly from the first hour; every real bug lived at the boundary — how a JavaScript method receives self from a colon call, what happens to globals that survive between runs, how a runtime error in frame 4,000 gets caught and shown instead of freezing the screen. The seam is the product. The other lesson is older: the constraints did exactly what fantasy consoles promise. With sixteen colors and sixty-four pixels per sprite, the example game took an hour, looked intentional, and was fun — which is the entire argument for building machines smaller than the ones we have.
