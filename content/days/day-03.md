---
day: 3
title: "Group-Chat Decision Extractor"
tagline: "Tarik keputusan-keputusan kecil dari obrolan grup yang panjang."
date: 2026-05-13
status: draft
live_url:
repo_url:
tags: ["nlp", "productivity"]
---

## Problem

Banyak keputusan kecil terjadi di group chat — jam meeting, siapa bawa apa,
deadline geser, dst — dan terkubur di antara ratusan pesan lain. Mencarinya
ulang butuh scroll panjang.

## Approach

Masih dalam eksplorasi. Kemungkinan besar gabungan retrieval + extractive
summarization, dengan filter berbasis kata kerja keputusan ("jadi", "sepakat",
"besok jam", dll).
