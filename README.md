# 100 Days with Claude

> Building one web project every day, for 100 days.

🌐 **Live:** https://100dayswithclaude.pythonanywhere.com
📦 **Source:** https://github.com/cielchan88/100_landing

A static-feeling Flask app that catalogs 100 daily web-build projects. New entries are pure markdown files — drop one in, reload, done.

## Local development

```bash
git clone https://github.com/cielchan88/100_landing.git
cd 100_landing
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python flask_app.py
```

Open http://localhost:5000.

## Adding a new day

1. Create `content/days/day-XX.md` (zero-padded, e.g. `day-04.md`)
2. Fill the frontmatter (template below). Set `status: live` to publish.
3. Commit and push.
4. On PythonAnywhere: `cd ~/100_landing && git pull` then click Reload in the Web tab.

### Frontmatter template

```markdown
---
day: 4
title: "Project Title"
tagline: "One-line description of what this project does."
date: 2026-05-14
status: live
live_url:
repo_url:
tags: ["tag1", "tag2"]
---

## Problem
What problem does this solve?

## Approach
How did you approach it?

## Stack
- Tech 1
- Tech 2

## Lessons
What did you learn?
```

## Deploy to PythonAnywhere

PythonAnywhere account: `100dayswithclaude` (free tier is enough).

### 1. Clone the repo

In a PythonAnywhere Bash console:

```bash
cd ~
git clone https://github.com/cielchan88/100_landing.git
```

### 2. Create the virtualenv

```bash
mkvirtualenv --python=/usr/bin/python3.10 100days-venv
pip install -r ~/100_landing/requirements.txt
```

### 3. Configure the Web app

Open the **Web** tab and click **Add a new web app**.

- Domain: `100dayswithclaude.pythonanywhere.com` (auto)
- Choose **Manual configuration** → **Python 3.10**
- Set fields:
  - **Source code:** `/home/100dayswithclaude/100_landing`
  - **Working directory:** `/home/100dayswithclaude/100_landing`
  - **Virtualenv:** `/home/100dayswithclaude/.virtualenvs/100days-venv`

### 4. Edit the WSGI file

Click the WSGI configuration file link (path: `/var/www/100dayswithclaude_pythonanywhere_com_wsgi.py`). Replace its contents with the entire contents of `wsgi.py` from this repo — the file is already pre-filled with the correct paths. Save.

### 5. Static files mapping

In the Web tab → Static files, add:

- URL: `/static/`
- Directory: `/home/100dayswithclaude/100_landing/static/`

### 6. Reload

Click the green **Reload** button. Visit https://100dayswithclaude.pythonanywhere.com.

## Updating content in production

```bash
cd ~/100_landing
git pull origin main
```

Then click Reload in the Web tab.

## Troubleshooting

- **500 error** → check the error log in the Web tab
- **ModuleNotFoundError** → `workon 100days-venv && pip install -r ~/100_landing/requirements.txt`
- **Static files 404** → confirm the static mapping in the Web tab
- **New day not appearing** → confirm `status: live` in frontmatter, then Reload
- **Old content cached** → free-tier worker doesn't auto-restart; Reload is mandatory after any change

## License

MIT.
