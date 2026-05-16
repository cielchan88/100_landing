---
day: 7
title: "Distraction Inventory"
tagline: "What you avoid, and what you turn to."
date: 2026-05-17
status: live
live_url: /day-07/distraction-inventory
repo_url: https://github.com/cielchan88/100_landing
tags: ["productivity", "self-tracking", "privacy-first"]
---

## Problem

Most productivity apps track tasks completed. They tell you what you did — never what you avoided, and never what you turned to instead. But those two pieces of information are often more honest about how an actual day went than the to-do list ever is.

## Approach

Capture is intentionally minimal. Two dropdowns, six avoidance categories, eight distraction categories. Logging is meant to take under five seconds. Insights — hour-of-day patterns, top categories, common avoid-to pairs — are computed only when the user clicks "Insights." No nagging. No streaks. No gamification. Just a quiet log that reveals patterns when you're ready to look.

All entries are saved in the browser's localStorage. Nothing leaves the device. There's no account, no server-side storage, no analytics. The trade-off is no sync between devices — but for a self-tracking tool this personal, privacy beats convenience.

## Stack

- Flask blueprint at `/day-07/distraction-inventory` on the existing 100_landing app
- Three HTML pages, one JS file, one CSS file — no server-side logic at all
- localStorage for all data, Chart.js for visualizations
- Zero external API, zero server-side storage, zero ongoing cost
- Predefined categories instead of free text, to keep capture under 5 seconds

## Lessons

The hardest part wasn't building the capture flow — it was resisting the urge to add fields. Three fields would have been more "complete." Five would have been "comprehensive." But every additional field would have moved logging from a 5-second action to a 15-second action, and self-tracking apps die in that gap. The constraint of two fields is the product.
