---
day: 23
title: "Riba & Risk: Open Economy"
tagline: "Now open the borders."
date: 2026-06-02
status: live
live_url: /day-23/open-economy
repo_url: https://github.com/cielchan88/100_landing
tags: ["economics", "simulation", "monetary", "open-economy"]
---

## Problem

Day 22 compared a conventional and an Islamic monetary system behind closed borders. But the most consequential differences between an interest-based system and a profit-sharing one only appear once capital can cross borders and the exchange rate can move. In a conventional open economy the policy rate is also a magnet for capital — raise it and money flows in and the currency strengthens; cut it and the reverse. A system that prohibits riba has no such lever, so capital responds instead to expected real returns and, ideally, arrives in a stickier, equity-like form. The closed model couldn't show any of that.

## Approach

The same two stylized economies, now opened to the world: a floating exchange rate, cross-border capital flows responding to return differentials, and a current account that reacts to the currency. Two external shocks join the original three — a jump in world interest rates, and a sudden stop where capital inflows abruptly reverse. The conventional economy can defend its currency by raising rates, but only by deepening its own downturn, and it carries the balance-sheet fragility of foreign-currency debt. The interest-free economy has no defence lever, so its currency can move more on impact — but its stickier equity-like financing cushions the reversal and spares it the debt spiral.

The hard part, and the whole point, was refusing to let either side win. It would have been easy to make the interest-free system look immune to capital flight. It isn't — the model keeps a portion of its capital hot, because real dual-banking systems are full of instruments that behave like debt. No system escapes the impossible trinity, and the interface says so.

## Stack

- Flask blueprint at /day-23/open-economy on the existing 100_landing app; Day 22 stays live separately
- Pure client-side simulation extending the Day 22 dynamic system with exchange rate, capital flows, and current account
- Floating exchange-rate regime, uncovered-interest-parity intuition, exchange-rate pass-through, FX-debt balance-sheet effects
- Chart.js for ten side-by-side time series; Gemini for the no-winner narrative
- Zero ongoing cost (Gemini free tier)

## Lessons

Opening the economy doubled the number of ways to accidentally rig the result. The interest rate stops being just a demand lever and becomes a capital magnet, which makes it tempting to show the conventional system whipsawed by hot money while the interest-free one sails through. The honest version is messier: the interest-free system gives up an active defence of its currency, so under a sudden stop it can depreciate harder at first — it simply avoids the foreign-debt spiral that follows. Building it fairly meant writing the Islamic side's disadvantages into the equations as deliberately as its advantages, and keeping a stubborn slice of its capital flows hot. Comparative models earn trust by handicapping the side the author might be tempted to favour.
