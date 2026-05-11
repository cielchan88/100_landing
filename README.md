# 100 Days with Claude

> Membangun satu proyek web setiap hari, selama 100 hari.

🌐 **Live:** https://100dayswithclaude.pythonanywhere.com
📦 **Repo:** https://github.com/100dayswithclaude/100_landing

Sebuah katalog harian dari 100 proyek web yang dibangun selama 100 hari
berturut-turut, bersama Claude Code. Setiap hari menghasilkan satu halaman
baru yang otomatis muncul sebagai tombol di landing page.

---

## Tech stack

- **Python 3.10+** dengan **Flask 3.x** (WSGI, satu file entry)
- **Jinja2** untuk templating (built-in Flask)
- **Tailwind CSS via CDN** — tidak ada build step Node
- **Markdown + YAML frontmatter** sebagai content store (`content/days/*.md`),
  di-parse dengan `markdown` + `python-frontmatter`
- **Inter** dan **JetBrains Mono** dari Google Fonts
- Tidak ada database, tidak ada Node, tidak ada JavaScript framework

---

## Setup lokal

```bash
git clone https://github.com/100dayswithclaude/100_landing.git
cd 100_landing
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
python flask_app.py
```

Buka `http://localhost:5000`.

Dalam mode development (default saat menjalankan `flask_app.py`), Flask akan
otomatis reload file content jika ada perubahan di `content/days/`.

---

## Struktur proyek

```
100_landing/
├── flask_app.py            # entry point Flask (development)
├── wsgi.py                 # WSGI untuk PythonAnywhere (pre-filled)
├── requirements.txt
├── app/
│   ├── __init__.py         # Flask app factory
│   ├── routes.py           # /, /days/<slug>, /about, /healthz, 404
│   ├── content.py          # loader markdown + frontmatter (DayEntry)
│   ├── filters.py          # Jinja filters: date_id, date_en, slugify, pad2
│   └── templates/
│       ├── base.html       # layout + CSS variables + fonts + Tailwind CDN
│       ├── index.html
│       ├── day.html
│       ├── about.html
│       ├── 404.html
│       └── partials/       # header, hero, day_card, footer
├── content/days/           # Markdown per hari
└── static/favicon.svg
```

---

## Cara menambah hari baru

1. Buat file `content/days/day-XX.md` (zero-padded, contoh: `day-04.md`)
2. Isi frontmatter standar (template di bawah)
3. Set `status: live` untuk publikasi, `status: draft` untuk sembunyikan
4. Commit & push ke GitHub
5. Di PythonAnywhere: `git pull` lalu klik **Reload** di tab Web

Tombol di landing otomatis bertambah — tidak perlu edit kode.

### Template frontmatter

```markdown
---
day: 4
title: "Judul Proyek Hari Ke-4"
tagline: "Satu kalimat ringkas tentang proyek ini."
date: 2026-05-14
status: live
live_url:
repo_url:
tags: ["tag1", "tag2"]
---

## Problem
Apa masalah yang dipecahkan?

## Approach
Bagaimana pendekatannya?

## Stack
- Tech 1
- Tech 2

## Lessons
Apa yang dipelajari dari proyek ini?
```

Field wajib: `day`, `title`, `tagline`, `date`, `status`. File dengan
`status: draft` tidak akan muncul di landing dan tidak dapat diakses
lewat URL.

---

## Deploy ke PythonAnywhere — langkah lengkap

Asumsi: akun PythonAnywhere dengan username `100dayswithclaude` sudah
dibuat (free tier).

### A. Clone repo via Bash console

```bash
cd ~
git clone https://github.com/100dayswithclaude/100_landing.git
```

### B. Buat virtualenv

```bash
mkvirtualenv --python=/usr/bin/python3.10 100days-venv
pip install -r ~/100_landing/requirements.txt
```

### C. Konfigurasi Web app

1. Buka tab **Web** di dashboard PythonAnywhere
2. Klik **Add a new web app**
3. Domain: `100dayswithclaude.pythonanywhere.com` (otomatis)
4. Pilih **Manual configuration** &rarr; **Python 3.10**
5. Setelah dibuat, set field berikut di tab Web:
   - **Source code:** `/home/100dayswithclaude/100_landing`
   - **Working directory:** `/home/100dayswithclaude/100_landing`
   - **Virtualenv:** `/home/100dayswithclaude/.virtualenvs/100days-venv`

### D. Edit WSGI file

1. Di tab Web, klik link **WSGI configuration file**
   (path: `/var/www/100dayswithclaude_pythonanywhere_com_wsgi.py`)
2. Hapus semua isi default
3. Copy seluruh isi `wsgi.py` dari repo — sudah pre-filled dengan path
   `/home/100dayswithclaude/100_landing`, tidak perlu edit apa-apa
4. Save

### E. Static files mapping

Di tab Web, scroll ke **Static files**, tambah:

| URL        | Directory                                              |
|------------|--------------------------------------------------------|
| `/static/` | `/home/100dayswithclaude/100_landing/static/`          |

### F. Reload web app

Klik tombol hijau **Reload** di tab Web. Buka
<https://100dayswithclaude.pythonanywhere.com> — landing muncul.

---

## Cara update content di production

```bash
# di Bash console PythonAnywhere
cd ~/100_landing
git pull origin main
```

Lalu klik **Reload** di tab Web. Konten baru langsung tampil.
Free tier PythonAnywhere tidak auto-reload — reload manual diperlukan.

---

## Troubleshooting

| Gejala | Solusi |
|---|---|
| 500 error setelah deploy | Cek **Error log** di tab Web |
| `ModuleNotFoundError` | `workon 100days-venv && pip install -r ~/100_landing/requirements.txt`, lalu Reload |
| Static file tidak muncul | Pastikan **Static files** mapping di tab Web sudah benar |
| Update markdown tidak tampil | Pastikan `status: live`, lalu klik **Reload** (wajib di free tier) |
| Path WSGI salah | Buka `/var/www/100dayswithclaude_pythonanywhere_com_wsgi.py`, pastikan `project_home = '/home/100dayswithclaude/100_landing'` |

---

## Routes

| Method | Path              | Keterangan                                            |
|--------|-------------------|-------------------------------------------------------|
| GET    | `/`               | Landing — hero + grid tombol auto dari days live      |
| GET    | `/days/<slug>`    | Halaman per proyek (slug: `day-01`, `day-02`, ...)    |
| GET    | `/about`          | Tentang proyek                                        |
| GET    | `/healthz`        | Health check: `{"ok": true}`                          |
| -      | 404               | Custom 404 page, brand-consistent                     |

---

## Design notes

Palet dan tipografi dirancang menyerupai estetika Claude (Anthropic):
near-black hangat `#0F0F0E`, oranye Claude `#D97757`, off-white hangat
`#FAFAF7`. Definisi warna disimpan sebagai CSS custom properties di
`base.html` dan digunakan via arbitrary value Tailwind
(`bg-[var(--bg)]`, `text-[var(--accent)]`, dst). Pendekatan ini menghindari
build step Tailwind sambil tetap memberi konsistensi tema.

---

## Lisensi

Personal project. Source code tersedia untuk dibaca dan dipelajari.

Built with [Claude Code](https://claude.com/claude-code).
