---
day: 1
title: "Scrabble vs Claude"
tagline: "A single-player Scrabble game where the computer plays the highest-scoring word it can find."
date: 2026-05-11
status: live
live_url: /days/day-01/play
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "Python", "Flask"]
---

## The build

A full-rules Scrabble game played in the browser. One human player versus a greedy computer opponent that enumerates every legal move from its rack and plays the one that scores highest.

[**▶ Play it now**](/days/day-01/play)

## How it works

- **Engine** — 15×15 board, 100-tile bag with the standard English distribution, premium squares (double/triple letter, double/triple word), first-move-covers-center rule, bingo bonus, blanks, exchange and pass.
- **Dictionary** — the public-domain ENABLE word list, ~168,000 words. Stored as a Python set for O(1) word lookup, with a precomputed prefix set for fast pruning during move search.
- **AI** — for every empty square adjacent to a tile, the engine builds candidate words letter-by-letter using rack tiles plus any board tiles it passes through. Precomputed cross-checks tell it which letters can be placed without creating an invalid perpendicular word. Prefix pruning kills dead branches early. Of all the legal moves it finds, it plays the highest scorer.
- **No lookahead** — the AI doesn't think about what tiles will be left in its rack, what the human might play next, or board positioning. Just points. It's still surprisingly tough — a typical mid-game move evaluates a few thousand candidates in under a second.

## Stack

- Python + Flask for the backend (game state held in memory per-session)
- Vanilla JavaScript + HTML5 drag-and-drop for the board UI
- Tailwind CDN + a sprinkle of custom CSS

## What I learned

Move generation without a GADDAG is slower than the textbook version, but for a 7-tile rack with a real dictionary it's still fast enough that the AI's turn feels instant. The hard part wasn't the algorithm — it was getting every cross-word, every premium-square multiplier, and every edge case (single-tile plays, words that pass through multiple existing runs, blanks scored as zero but constrained by cross-checks) to agree with each other.
