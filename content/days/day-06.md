---
day: 6
title: "The Shape of a Scam"
tagline: "The math behind three income structures."
date: 2026-05-16
status: live
live_url: /day-06/shape-of-a-scam
repo_url: https://github.com/cielchan88/100_landing
tags: ["finance", "education", "simulation"]
---

## Problem

Ponzi schemes, pyramid schemes, and legal multi-level marketing are usually discussed in moral or sensational terms — "scammers" versus "victims," "scheme" versus "opportunity." The mathematics that distinguish them is rarely shown. People making real decisions about whether to participate often lack a clear view of the underlying structure.

## Approach

A simulator. Five preset scenarios spanning the three structures. Each runs 100 monte-carlo trials server-side and visualizes the outcomes: who profited, who lost, what fraction collapsed, what the operator earned. Anonymous, generic models — no real companies named, no specific accusations. The goal is to make the math visible.

## Stack

- Flask blueprint at `/day-06/shape-of-a-scam` on the existing 100_landing app
- Pure-Python monte-carlo simulator (no AI runtime, deterministic given seed)
- Chart.js from CDN for histograms and timelines
- Server-side caching with `lru_cache` — results are deterministic
- Zero external API, zero runtime cost forever

## Lessons

The hardest design choice was tone. A simulator for fraud structures could easily slip into moralizing or sensationalism. The empathy paragraph upfront — acknowledging that people involved often had understandable reasons — turned out to set the right frame for everything that followed. The math should inform, not accuse. People deserve to see clearly without being condescended to.
