---
day: 20
title: "Forty"
tagline: "Forty Hijri years arrives sooner than you think."
date: 2026-05-30
status: live
live_url: /day-20/forty
repo_url: https://github.com/cielchan88/100_landing
tags: ["calculator", "calendar", "hijri"]
---

## Problem

The age of forty is a milestone across traditions — in the Qur'an, Surah Al-Ahqaf describes it as the age of full maturity. But "forty years" depends on which calendar you count with. A Hijri year follows the moon and runs about 354 days; a Gregorian year follows the sun and runs about 365. Over forty years that eleven-day annual gap compounds into more than a year. Your fortieth Hijri birthday arrives well before your fortieth Gregorian one — and almost no one knows the exact date.

## Approach

Enter your birthdate in the Gregorian calendar. The app converts it to its Hijri equivalent, adds forty Hijri years, and converts that target back to a Gregorian date — the day you reach forty in lunar years. It also shows your age today counted both ways, which near the milestone will often differ by a full year: forty in Hijri reckoning, thirty-nine in Gregorian.

The conversions use the browser's built-in Umm al-Qura calendar through the Intl API — no library, no server, no network call. Going from Gregorian to Hijri is a direct lookup; going the other way uses a binary search over Gregorian dates, since the mapping is monotonic.

## Stack

- Flask blueprint at /day-20/forty on the existing 100_landing app
- Vanilla JS using Intl.DateTimeFormat with the islamic-umalqura calendar
- Binary search for Hijri-to-Gregorian conversion
- URL hash to make a result shareable
- No library, no API, no database
- Zero ongoing cost, entirely client-side

## Lessons

The whole project hinges on a fact that feels wrong until you sit with it: the lunar milestone comes earlier, not later. The instinct is that "forty years is forty years." But a shorter year means you accumulate forty of them faster. The first working build had the comparison inverted — it showed the Hijri birthday after the Gregorian one — and it looked plausible enough that only the sanity-check test caught it. A reminder that with calendar math, intuition is not a substitute for a test with a known answer.
