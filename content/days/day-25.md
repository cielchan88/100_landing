---
day: 25
title: "Permadeath"
tagline: "Descend. Build your deck. Die. Again."
date: 2026-06-04
status: live
live_url: /day-25/permadeath
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "roguelike", "deckbuilder"]
---

## Problem

A quarter of the way through the project, the obvious move was to attempt the hardest thing yet: a roguelike deckbuilder, the genre that usually takes a studio months. Grid exploration, turn-based card combat, a pool of upgrades that make each run different, three floors of escalating danger, and permadeath to make every choice matter. The interesting question wasn't whether the pieces could be built — it was whether they could be built small enough to ship in a day and still feel like a real game.

## Approach

The answer was ruthless scope discipline. The game was built as a vertical slice: one floor, fully playable and genuinely fun — exploration, a complete card-combat loop with telegraphed enemy intents, card rewards, relics, a boss, and permadeath — before a second floor was even started. Combat is the proven Slay-the-Spire loop reduced to its skeleton: draw a hand, spend energy, read what the enemies are about to do, and solve the turn. The deckbuilding pool is small but tuned so a few combinations feel genuinely strong, which is where the replayability lives. Everything runs on a seeded random number generator, so a daily seed gives everyone the same dungeon.

## Stack

- Flask blueprint at /day-25/permadeath on the existing 100_landing app
- Vanilla JS state machine: run state, seeded floor generation, a turn-based combat engine, rewards and relics
- DOM-based cards and UI; minimal emoji/shape art; a seeded PRNG for reproducible runs
- Zero ongoing cost, no API, no dependencies

## Lessons

The whole project was an exercise in saying no. A roguelike deckbuilder has an almost unlimited appetite for content — more cards, more enemies, more floors, more mechanics — and the only way to ship one in a day was to decide in advance exactly which layer had to be complete and fun before any of that was allowed to start. Telegraphed enemy intents did most of the work of making combat feel fair: when you can see what's coming, a loss is your fault, and that's what makes you hit "run again." The hardest engineering wasn't the combat math; it was resisting the floor-two temptation until floor one actually played well.
