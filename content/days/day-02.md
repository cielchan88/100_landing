---
day: 2
title: "Forwarded-Message Origin Tracer"
tagline: "Lacak asal-usul pesan viral yang di-forward berkali-kali."
date: 2026-05-12
status: live
live_url:
repo_url:
tags: ["AI", "misinformation", "Python"]
---

## Problem

Pesan WhatsApp yang di-forward terus-menerus kehilangan jejak asal-usulnya. Klaim soal kebijakan, kesehatan, atau berita politik tersebar tanpa konteks.

## Approach

Paste pesan apa pun. App mencari kemunculan paling awal, mendeteksi mutasi varian, mengumpulkan verifikasi fact-check, dan memberikan verdict yang siap di-forward balik.

## Stack

- FastAPI + Jinja
- Anthropic API dengan web_search tool
- SQLite cache untuk hash pesan yang sudah pernah dilacak

## Lessons

Cara melawan misinformasi yang menyebar lewat WhatsApp adalah membuat verifikasinya menyebar lewat WhatsApp juga.
