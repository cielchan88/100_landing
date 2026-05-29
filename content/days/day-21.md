---
day: 21
title: "The Question Volley"
tagline: "A conversation, one question at a time."
date: 2026-05-31
status: live
live_url: /day-21/question-volley
repo_url: https://github.com/cielchan88/100_landing
tags: ["social", "conversation", "url-state"]
---

## Problem

Most ways we talk online are built for speed and for audiences. Group chats reward the fast reply; feeds reward the performance. What's gotten rare is the slow, private, two-person exchange — the kind where someone asks you a real question and you actually sit with it before answering. The tools for that barely exist, and the ones that do want you to make an account and join a platform.

## Approach

Two people, one link, passed back and forth. You pick or write a question, generate a link, and send it to one person. They open it, read your question, answer, ask one back, and send you a new link. The whole conversation — every question and answer, both names — is compressed and encoded directly into the URL. There is no database, no account, no server that ever sees a word of it.

A question deck across five moods — getting to know you, for close ones, playful, deep, or write your own — gives you somewhere to start. A soft cap at ten volleys keeps it from sprawling. A 280-character limit per message keeps it honest.

## Stack

- Flask blueprint at /day-21/question-volley on the existing 100_landing app
- Vanilla JS, no framework
- LZ-string compression so even a ten-volley conversation fits in a shareable link
- The entire conversation state lives in the URL hash — no database, no storage
- Zero ongoing cost, zero external dependencies beyond one small compression library

## Lessons

The privacy model is the feature and the catch at the same time. Putting the whole conversation in the URL means no server ever stores it — genuinely private in the sense that there's nothing to leak. But it also means anyone holding the link can read the whole thread, so it's the wrong place for secrets. The honest move was to say so plainly in the interface rather than imply a confidentiality the design doesn't provide. A tool should tell you what it is.
