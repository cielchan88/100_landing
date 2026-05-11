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

```yaml
---
day: 4
title: "Project name"
tagline: "One-line pitch."
date: 2026-05-14
status: live          # or 'draft' to hide
live_url: https://...
repo_url: https://github.com/...
tags: ["tag1", "tag2"]
---

Markdown body here.
```

A day is **visible only when**:
- `status` is `live`, AND
- the entry's `date` is today or earlier (future-dated entries are auto-hidden until their day arrives).

## Project structure

```
100_landing/
  flask_app.py            # entry point for `python flask_app.py`
  wsgi.py                 # PythonAnywhere WSGI hook
  app/
    __init__.py           # create_app()
    routes.py             # main routes + Day 1 Scrabble API
    content.py            # markdown loader (date-gated)
    filters.py            # jinja filters
    scrabble/             # Day 1 game engine + AI
    day02/                # Day 2 Title Doctor blueprint
    templates/
      base.html, index.html, day.html, about.html, 404.html, scrabble.html
      partials/
      day02/title_doctor.html
  static/
    favicon.svg
    day02/title_doctor.css, title_doctor.js
  content/
    days/day-01.md, day-02.md, ...
  requirements.txt
  README.md
```

## PythonAnywhere deploy (free tier)

### 1. Push this repo to GitHub

Done, at https://github.com/cielchan88/100_landing.

### 2. Clone on PythonAnywhere

In a Bash console:

```bash
cd ~
git clone https://github.com/cielchan88/100_landing.git
cd 100_landing
mkvirtualenv 100days-venv --python=python3.11
pip install -r requirements.txt
```

### 3. Web tab → Add a new web app → Manual configuration → Python 3.11

### 4. Edit the WSGI file

Replace its contents with:

```python
import sys
path = '/home/100dayswithclaude/100_landing'
if path not in sys.path:
    sys.path.insert(0, path)
from flask_app import app as application
```

### 5. Set the virtualenv path

`/home/100dayswithclaude/.virtualenvs/100days-venv`

And the static mapping:

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
- **New day not appearing** → confirm `status: live` AND `date` is today or earlier in the frontmatter, then Reload
- **Old content cached** → free-tier worker doesn't auto-restart; Reload is mandatory after any change

## Day 2 deploy notes

Day 2 (Title Doctor) adds a Flask blueprint at `/day-02/title-doctor` that calls the Anthropic API. To deploy:

```bash
# Local — commit and push
git add .
git commit -m "Day 2: Title Doctor blueprint with SSE streaming"
git push origin main

# On PythonAnywhere Bash console
cd ~/100_landing
git pull origin main
workon 100days-venv
pip install -r requirements.txt
```

Then in the PythonAnywhere Web tab:

1. Open or create `/home/100dayswithclaude/100_landing/.env` and add: `ANTHROPIC_API_KEY=sk-ant-...`
2. Click **Reload**.
3. Visit https://100dayswithclaude.pythonanywhere.com/day-02/title-doctor

Without an API key the page still loads but the form returns a 503 with a friendly message.

## License

MIT.
