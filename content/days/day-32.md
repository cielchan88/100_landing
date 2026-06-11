---
day: 32
title: "Nusa TCG"
tagline: "Wildlife and legends of the archipelago, in one deck."
date: 2026-06-11
status: live
live_url: /day-32/nusa-tcg
repo_url: https://github.com/cielchan88/100_landing
tags: ["game", "tcg", "cards", "nusantara"]
---

## Problem

The modern pocket trading-card formula is a masterpiece of subtraction — twenty-card decks, energy that simply arrives each turn, three points and the match is over — and the request was to clone it. The honest version of that request has a hard constraint: the famous game's creatures, names, and art are fiercely protected expression, while the system underneath them is just rules, and rules belong to everyone. So the day became a two-part exercise: rebuild the system faithfully, and give it a roster that exists nowhere else.

## Approach

The roster came from home: twenty-two original cards across two types, the jungle and the myth — a Komodo line that evolves into its king, a night tiger worth two points if it falls, Garuda, Barong, the archipelago's dragon, and a trainer suite of market vendors, healers, and a fast boat. The match engine implements the pocket ruleset whole: an energy zone instead of energy cards, evolution timing, one supporter a turn, weakness, retreat costs, and the three-point race, played against a rule-based opponent that never cheats the rules it must follow. And because half the genre's joy was never the dueling, the booster experience ships alongside it — five-card packs ripped open one card at a time, a foil shimmer on the rares, a binder of silhouettes slowly turning to color, two free packs a day and one more for every win.

## Stack

- Flask blueprint at /day-32/nusa-tcg on the existing 100_landing app
- Vanilla JS and DOM for the engine, AI, board, packs, and binder; CSS for the card frames and foil
- localStorage for the collection and the daily pack economy
- Zero ongoing cost, no API, no dependencies — and zero references to anyone else's creatures

## Lessons

Card games hide their complexity in timing words. "Once per turn," "not on the turn it was played," "during your opponent's next turn" — each phrase is a flag on the game state, and the bugs live wherever two flags meet. The engine got simpler the moment every rule became a question the state could answer (can this evolve? has a supporter been played?) instead of a behavior scattered through the UI. The other lesson was about the skin: original expression isn't a legal chore, it's the creative opening. A generic monster deck would have been forgettable; a binder where the silhouette of a tiger slowly becomes the night tiger is the part people remember.
