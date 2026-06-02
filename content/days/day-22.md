---
day: 22
title: "Riba & Risk"
tagline: "Two systems. One shock. Watch the mechanics."
date: 2026-06-01
status: live
live_url: /day-22/riba-and-risk
repo_url: https://github.com/cielchan88/100_landing
tags: ["economics", "simulation", "monetary"]
---

## Problem

Conventional and Islamic monetary systems differ in mechanism, not just in name. One runs on interest — a policy rate transmitting through the cost of borrowing, money created largely through interest-bearing debt. The other prohibits riba and routes finance through profit-and-loss sharing and asset-backed contracts, so returns track the real economy and losses are shared rather than fixed in advance. These are genuinely different machines. They should respond differently to the same shock — but most explanations of the difference are either polemical or abstract.

## Approach

Two stylized economies, side by side, hit by the same shock — a demand collapse, a supply shock, or a financial crisis. The conventional economy runs a Taylor-style policy rule and accumulates interest-bearing debt; the Islamic economy has no policy rate, its returns track real output, and a share of each shock is absorbed through risk-sharing rather than forced into default. You adjust severity, authority responsiveness, and how tightly returns link to the real economy, then watch both dashboards diverge.

Crucially, the tool does not crown a winner. The financial-crisis scenario tends to flatter risk-sharing; the demand shock tends to flatter the discretionary policy lever; the supply shock is hard for both. A short narrative — written fresh each run — explains the mechanics of that particular divergence, and the interface is blunt about the fact that this is a teaching model, not a forecast.

## Stack

- Flask blueprint at /day-22/riba-and-risk on the existing 100_landing app
- Pure client-side simulation: a transparent discrete-time dynamic system, ~20 periods
- Chart.js for six side-by-side time series
- Gemini for the post-run narrative, with a strict no-winner system prompt
- Zero ongoing cost (Gemini free tier)

## Lessons

The hardest part was not the math — it was the framing. A side-by-side comparison of two systems is almost designed to be read as a contest, and the easiest way to get engagement would have been to let one side "win." That would also have been dishonest: the literature genuinely does not settle this, and a stylized model proves nothing either way. Most of the design effort went into the opposite of persuasion — the framing note, the no-winner constraint baked into the AI prompt, the assumptions accordion. A model that compares two things has a responsibility to be loud about what it is leaving out.
