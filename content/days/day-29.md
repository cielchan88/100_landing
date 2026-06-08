---
day: 29
title: "Pluck"
tagline: "Strings, synthesized from physics."
date: 2026-06-08
status: live
live_url: /day-29/pluck
repo_url: https://github.com/cielchan88/100_landing
tags: ["audio", "synthesis", "instrument", "webaudio"]
---

## Problem

A plucked string is a deeply satisfying sound, and sampling one is the boring way to reproduce it — a recording, a file, a download. The interesting way is to generate it from almost nothing. In 1983 Karplus and Strong showed that a burst of white noise fed through a short delay line, averaged a little on each pass, collapses into a pitched, decaying tone that sounds remarkably like a real string — for a tiny fraction of the cost of anything else. It's one of those algorithms that feels like a magic trick the first time you hear it work.

## Approach

A row of strings on screen, tuned by default to a pentatonic scale so there are no wrong notes — strum across them and it always sounds musical, which is the whole secret to making an instrument feel good to a non-musician. Each pluck triggers a Karplus-Strong voice: noise sized to the note's period, a feedback delay with a gentle lowpass, decaying naturally. Two sliders expose the physics directly — brightness (how much averaging, i.e., how fast the highs die) and decay (how long the string rings). The strings vibrate on screen in time with the sound. No samples, no files; the audio is computed from the algorithm every time.

## Stack

- Flask blueprint at /day-29/pluck on the existing 100_landing app
- Web Audio API for synthesis (Karplus-Strong via buffer pre-render), with a compressor on the master bus to handle big strums
- Canvas for the vibrating strings; vanilla JS for everything
- No audio files, no API, no dependencies; zero ongoing cost

## Lessons

Two small decisions did most of the work of making it feel good. First, defaulting to a pentatonic scale: it removes the possibility of a wrong note, so a random strum from someone who can't play an instrument still sounds intentional and pleasant. Second, putting a compressor on the master output: Karplus-Strong voices are cheap enough that you'll happily strum ten at once, and without a limiter that sums into ugly clipping. The synthesis itself is almost suspiciously simple — a handful of lines turns noise into a string — which is exactly why it's one of the most beloved algorithms in computer music.
