---
day: 13
title: "Quick Diagrammer"
tagline: "Type relationships. See diagrams."
date: 2026-05-23
status: live
live_url: /day-13/quick-diagrammer
repo_url: https://github.com/cielchan88/100_landing
tags: ["utility", "diagrams", "writing"]
---

## Problem

Drawing tools want you to drag shapes. Diagram languages like Mermaid want you to learn syntax. Both are friction. Most of the time, all you really want to do is sketch a few relationships — and most of the time, you can describe them in plain text faster than you can draw them.

## Approach

One textarea. Each line is a relationship: `A -> B`, `A <-> B`, `A -- B`. Add a label with `A -> B: pulls from`. Wrap something in brackets to emphasize it: `[Backend] -> Database`. Type, and the diagram appears beneath. The parser is forgiving: anything it doesn't recognize is silently ignored, so you can mix notes and structure in the same input without worrying about errors.

Layout is automatic. Force-directed simulation finds positions, with deterministic seeding so the same input always produces the same diagram. Copy as SVG, copy as PNG, or share the entire diagram via a URL hash.

## Stack

- Flask blueprint at /day-13/quick-diagrammer on the existing 100_landing app
- Vanilla JS parser for the plain-text syntax (~120 lines)
- Force-directed layout with deterministic seeding (~80 lines)
- SVG rendering with rounded-rect nodes and arrowhead markers
- URL hash for sharing — your text never touches a server
- Zero ongoing cost, zero external dependencies

## Lessons

The hardest decision wasn't the parser or the layout — it was deciding what NOT to support. No nested groups. No subgraphs. No styling syntax. No flowchart-specific shapes. Every additional feature would have moved this tool one step closer to "another Mermaid," and away from "the fastest way to make a small diagram from a thought." The constraint is the product.
