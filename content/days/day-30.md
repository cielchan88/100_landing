---
day: 30
title: "QR Studio"
tagline: "QR codes worth looking at."
date: 2026-06-09
status: live
live_url: /day-30/qr-studio
repo_url: https://github.com/cielchan88/100_landing
tags: ["utility", "qr", "design"]
---

## Problem

Most QR code generators give you one of two bad deals: an ugly grid of black squares, or a "free" code that's actually a redirect through someone's server — which means it stops working the day they decide to charge you, and quietly tracks every scan in the meantime. A QR code can just contain its data directly. Those static codes work forever and phone home to no one. The only thing missing is that they're usually allowed to be ugly, and they don't have to be.

## Approach

The trick is to not let a library draw the code for you. A tiny dependency computes only the matrix — which cells are dark — and everything after that is custom rendering: square, rounded, or dotted modules; a solid color or a gradient; styled corner "eyes"; a logo dropped in the center with the error correction bumped to its highest level so the code still scans around it. The same composition is rendered twice, to a canvas for a crisp PNG at whatever resolution you ask for, and to hand-built SVG for a version that stays sharp at any size. Content, logo, everything stays in the browser.

## Stack

- Flask blueprint at /day-30/qr-studio on the existing 100_landing app
- A small QR-matrix library (matrix only) from a CDN; all styling and rendering done by hand
- Canvas for live preview and PNG export; hand-built SVG for vector export; FileReader for the logo
- Zero ongoing cost, nothing uploaded, static codes that work forever

## Lessons

The tension in a styled QR code is that everything which makes it pretty also makes it harder to scan, and the format's built-in error correction is the budget you spend on style. A center logo, dot-shaped modules, a low-contrast gradient — each eats into the redundancy that lets a scanner recover the data. So the useful move wasn't adding more styling options, it was being honest about the trade: force the highest error correction whenever a logo appears, keep a real quiet zone, and warn when a combination is getting risky rather than silently shipping a code that won't scan. A generator that makes beautiful codes nobody can read has missed the entire point.
