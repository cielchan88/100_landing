---
day: 34
title: "The Onion"
tagline: "One attack, all the way down."
date: 2026-06-13
status: live
live_url: /day-34/the-onion
repo_url: https://github.com/cielchan88/100_landing
tags: ["explainer", "security", "ai", "scrollytelling"]
---

## Problem

Prompt injection gets explained two unsatisfying ways: as a scary headline with no mechanism, or as a list of payloads that reads like a how-to. Neither leaves you understanding *why* it works — and without that, every defense sounds like superstition. The mechanism is actually simple enough to see, if you slow it down: an assistant asked to summarize an email, an email with one line written for the machine instead of the human, and a context window where the instruction and the data are the same kind of thing because nothing in the stream is labeled trusted or untrusted.

## Approach

A single attack, dissected in one long scroll. A sticky diagram holds still while the explanation steps past it, and at each step the diagram peels back one layer — the ordinary request, the poisoned email, the three sources collapsing into one text stream, the moment the provenance colors flatten into the model's-eye view where it's all just text, the hijack, and then the defenses wrapping the untrusted data back up behind a visible boundary. It's deliberately defanged: the rogue line exists only to show that an instruction can wear the costume of data, and the weight of the piece sits on the mitigations, not the exploit. The "AI" is a transparent stand-in for how concatenation works, stated plainly as illustration rather than a real model.

## Stack

- Flask blueprint at /day-34/the-onion on the existing 100_landing app
- A hand-written scrollytelling engine: IntersectionObserver for steps, a throttled scroll-progress value for tweens, one SVG scene re-rendered per step
- Vanilla JS and SVG, no scrolly or animation libraries; reduced-motion falls back to a clean stepped article
- Zero ongoing cost, no API, no dependencies

## Lessons

Scrollytelling punishes decoration and rewards structure: the version that worked treated the scroll as a sequence of states and the graphic as a pure function of the current state, instead of a pile of triggered animations. The harder content lesson was restraint — the most honest way to teach an attack is to make the defense the climax, and to keep the example so generic it teaches the shape of the problem without handing anyone a weapon. And the mechanism, once slowed to eight frames, turned out to argue for itself: the boundary between instruction and data isn't missing because someone forgot it, it's missing because natural language never had one.
