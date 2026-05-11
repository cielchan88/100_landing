# Deploy ke PythonAnywhere — Tutorial Lengkap

Panduan langkah-demi-langkah untuk men-deploy **100 Days with Claude**
ke PythonAnywhere (free tier) di domain
`https://100dayswithclaude.pythonanywhere.com`.

Total waktu: ~15 menit untuk deploy pertama.

---

## Prasyarat

- [ ] Repo `100_landing` sudah di-push ke GitHub:
      `https://github.com/cielchan88/100_landing`
- [ ] Punya akun PythonAnywhere dengan username `100dayswithclaude`
      (daftar gratis di <https://www.pythonanywhere.com/registration/register/beginner/>)
- [ ] Bisa login ke dashboard PythonAnywhere

---

## Langkah 1 — Clone repo ke PythonAnywhere

1. Login ke <https://www.pythonanywhere.com/user/100dayswithclaude/>
2. Buka tab **Consoles** &rarr; klik **Bash** untuk membuka terminal baru
3. Di console, jalankan:

   ```bash
   cd ~
   git clone https://github.com/cielchan88/100_landing.git
   ```

4. Verifikasi:

   ```bash
   ls ~/100_landing
   ```

   Output yang diharapkan: `README.md  app  content  flask_app.py  requirements.txt  static  wsgi.py` ...

> Repo private? Gunakan personal access token GitHub:
> `git clone https://USERNAME:TOKEN@github.com/cielchan88/100_landing.git`

---

## Langkah 2 — Buat virtualenv dan install dependencies

Masih di Bash console:

```bash
mkvirtualenv --python=/usr/bin/python3.10 100days-venv
```

Setelah selesai, prompt akan berubah menjadi `(100days-venv) ...`. Lalu:

```bash
pip install -r ~/100_landing/requirements.txt
```

Verifikasi:

```bash
python -c "import flask; print(flask.__version__)"
```

Output yang diharapkan: `3.x.x`.

> Jika di kemudian hari Anda buka console baru dan butuh masuk ke venv ini:
> `workon 100days-venv`

---

## Langkah 3 — Buat Web App

1. Buka tab **Web** di dashboard PythonAnywhere
2. Klik **Add a new web app**
3. Halaman pertama: konfirmasi domain `100dayswithclaude.pythonanywhere.com` &rarr; **Next**
4. Pilih framework: **Manual configuration** (jangan pilih "Flask" — kita pakai WSGI manual)
5. Pilih versi Python: **Python 3.10**
6. Klik **Next** sampai web app dibuat

Setelah web app dibuat, Anda akan diarahkan ke halaman konfigurasi.

---

## Langkah 4 — Set Source code, Working dir, dan Virtualenv

Masih di tab **Web**, scroll ke section **Code**:

| Field             | Value                                                 |
|-------------------|-------------------------------------------------------|
| Source code       | `/home/100dayswithclaude/100_landing`                 |
| Working directory | `/home/100dayswithclaude/100_landing`                 |

Klik ikon pensil di tiap field untuk edit, lalu tombol centang untuk simpan.

Lanjut scroll ke section **Virtualenv**:

| Field      | Value                                                  |
|------------|--------------------------------------------------------|
| Virtualenv | `/home/100dayswithclaude/.virtualenvs/100days-venv`    |

---

## Langkah 5 — Edit WSGI configuration file

1. Masih di tab Web, scroll ke section **Code**
2. Klik link biru: `WSGI configuration file:` &rarr;
   `/var/www/100dayswithclaude_pythonanywhere_com_wsgi.py`
3. Editor akan terbuka — **hapus seluruh isi default** (template Flask/Django bawaan)
4. Buka file `wsgi.py` dari repo lokal Anda (atau langsung lihat di
   <https://github.com/cielchan88/100_landing/blob/main/wsgi.py>)
5. Copy seluruh isinya, paste ke editor PythonAnywhere
6. Klik **Save** di pojok kanan atas

Isi yang harus ada (sudah pre-filled di repo, **tidak perlu edit apa-apa**):

```python
import sys
import os

project_home = '/home/100dayswithclaude/100_landing'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

os.environ['FLASK_ENV'] = 'production'

from flask_app import app as application  # noqa
```

> Variabel `application` (huruf kecil semua) **wajib** — itu yang dicari
> WSGI loader PythonAnywhere.

---

## Langkah 6 — Static files mapping

Di tab Web, scroll ke section **Static files** &rarr; klik **Enter URL**:

| URL        | Directory                                              |
|------------|--------------------------------------------------------|
| `/static/` | `/home/100dayswithclaude/100_landing/static/`          |

Klik centang untuk simpan. Ini membuat PythonAnywhere serve `favicon.svg`
dan file static lain langsung tanpa melewati Flask (lebih cepat & hemat kuota).

---

## Langkah 7 — Reload web app

Scroll ke atas tab **Web**, klik tombol hijau besar **Reload
100dayswithclaude.pythonanywhere.com**.

Tunggu ~10 detik sampai indikator hijau muncul, lalu buka:

<https://100dayswithclaude.pythonanywhere.com>

✅ **Indikator sukses:**
- Background gelap hangat `#0F0F0E`
- Judul besar "100 Days with **Claude**" — kata "Claude" oranye
- Counter `02/100` di pojok kiri atas
- 2 tombol grid: `01 Hello, Day 1` dan `02 Forwarded-Message Origin Tracer`
- Footer: "Built with Claude Code. · Source"

---

## Cara update content setelah deploy

Setiap kali Anda push update ke GitHub (misalnya menambah `day-04.md`):

1. Buka **Bash console** di PythonAnywhere
2. Jalankan:

   ```bash
   cd ~/100_landing
   git pull origin main
   ```

3. Buka tab **Web** &rarr; klik **Reload**

✋ **Wajib reload manual** — free tier PythonAnywhere tidak auto-reload
saat file berubah.

> **Tip:** Bookmark URL Bash console + tab Web di browser, jadi update
> hanya butuh 3 klik (pull, switch tab, reload).

---

## Troubleshooting per error

### ❌ "Something went wrong :-(" / HTTP 500

1. Tab **Web** &rarr; scroll ke section **Log files**
2. Klik **Error log** (paling bawah, paling baru di atas)
3. Cari traceback paling akhir

**Penyebab umum:**

| Error di log                              | Penyebab & solusi                                                                                                |
|-------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `ModuleNotFoundError: No module named 'flask'` | Virtualenv salah / belum install deps. `workon 100days-venv && pip install -r ~/100_landing/requirements.txt`, lalu Reload. |
| `ModuleNotFoundError: No module named 'app'`   | `project_home` di WSGI salah. Pastikan `/home/100dayswithclaude/100_landing`.                                    |
| `FileNotFoundError: ... content/days`          | Folder content tidak ada. `ls ~/100_landing/content/days` untuk cek.                                             |
| `ValueError: ... missing required frontmatter` | Ada file `.md` dengan frontmatter tidak lengkap. Cek field wajib: `day`, `title`, `tagline`, `date`, `status`.   |

### ❌ "Disallowed Host" atau redirect loop

Tidak relevan untuk Flask (itu pesan Django). Kalau muncul,
WSGI file masih pakai template Django bawaan — ulangi Langkah 5.

### ❌ Halaman muncul tapi font default (bukan Inter)

Font dimuat dari Google Fonts CDN. Cek koneksi atau buka DevTools &rarr;
tab Network, lihat apakah `fonts.googleapis.com` ke-block. Tidak fatal —
fallback ke `system-ui`.

### ❌ Favicon tidak muncul

Static files mapping belum di-setup. Ulangi Langkah 6, lalu Reload.

### ❌ "Bad Gateway" beberapa detik setelah Reload

Normal — web app sedang restart. Tunggu 10-15 detik, refresh.

### ❌ Update markdown tidak tampil setelah git pull

Anda lupa klik **Reload**. Free tier tidak auto-reload pada file change.

### ❌ Push ke GitHub diterima tapi PythonAnywhere belum update

PythonAnywhere **tidak** auto-pull dari GitHub. Anda harus `git pull`
manual di Bash console setiap kali ada update.

---

## Verifikasi akhir — Acceptance checklist

Setelah deploy sukses, jalankan checklist ini di browser:

- [ ] `/` &rarr; landing tampil, 2 tombol live
- [ ] `/days/day-01` &rarr; halaman detail, markdown ter-render rapi
- [ ] `/days/day-02` &rarr; halaman detail Day 2
- [ ] `/days/day-03` &rarr; 404 (karena status: draft)
- [ ] `/days/xxx` &rarr; 404 page brand-consistent
- [ ] `/about` &rarr; halaman about
- [ ] `/healthz` &rarr; JSON `{"ok": true}`
- [ ] Mobile view (DevTools 375px) &rarr; grid 2 kolom, hero tetap proporsional
- [ ] Counter `02/100` di header
- [ ] Hover tombol &rarr; lift + border oranye (kecuali `prefers-reduced-motion`)
- [ ] Footer "Source" link &rarr; ke repo GitHub

Jika semua centang ✅, deploy sukses.

---

## Maintenance jangka panjang

**Sekali per minggu (atau saat ada update besar):**

```bash
# di Bash console PythonAnywhere
cd ~/100_landing
git pull origin main

# kalau ada update di requirements.txt
workon 100days-venv
pip install -r requirements.txt --upgrade
```

Lalu **Reload** di tab Web.

**Cek log secara berkala:**
- Tab **Web** &rarr; **Error log**: cek 500 errors
- Tab **Web** &rarr; **Server log**: cek traffic dan request lambat

**Free tier limit yang perlu diingat:**
- 1 web app per akun
- 512 MB disk
- CPU quota harian (tampil di dashboard)
- Web app **expire** setelah 3 bulan jika tidak login — login berkala untuk reset
- Outbound network terbatas ke whitelist domain (tidak masalah untuk app ini —
  tidak ada outbound call)

---

## Kalau benar-benar mentok

1. Screenshot error log lengkap
2. Buka <https://www.pythonanywhere.com/forums/> — komunitas responsif
3. Atau email `support@pythonanywhere.com` (free tier dapat support juga)

Selamat! Day 1 sudah live. Tinggal 99 lagi 🎯
