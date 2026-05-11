---
day: 2
title: "Forwarded-Message Origin Tracer"
tagline: "Lacak asal usul sebuah pesan yang sudah di-forward berkali-kali."
date: 2026-05-12
status: live
live_url:
repo_url:
tags: ["nlp", "utility"]
---

## Problem

Sebuah pesan WhatsApp atau email yang sampai ke kita sering kali sudah
melewati banyak tangan: "fwd:fwd:fwd:". Yang asli — siapa yang menulisnya
pertama, kapan, dan dalam konteks apa — biasanya hilang di tumpukan kutipan.

## Approach

- Parse blok header `>` bertingkat
- Deteksi pola "On X, Y wrote:" dalam beberapa bahasa
- Bangun pohon forward dari level terdalam ke terluar
- Tampilkan timeline pengirim asli &rarr; pengirim terakhir

## Stack

- Python untuk parser
- Regex + heuristik bahasa (ID/EN)
- UI minimal untuk paste pesan dan melihat tracing-nya

## Lessons

Yang menarik bukan kompleksitas regex-nya — tetapi betapa banyak konvensi
"forwarded message" yang ternyata tidak terstandar. Setiap klien email
melakukannya dengan caranya sendiri.
