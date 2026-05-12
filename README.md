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

A day is **visible only when**:
- `status` is `live`, AND
- the entry's `date` is today or earlier (future-dated entries are auto-hidden until their day arrives).

## Day 2 deploy notes

Day 2 (Title Doctor) adds a Flask blueprint at `/day-02/title-doctor` that calls the Anthropic API. To deploy:

```bash
git add .
git commit -m "Day 2: Title Doctor blueprint with SSE streaming"
git push origin main

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

## Day 3 deploy notes

Color Heist is mounted at `/day-03/color-heist` and requires the ScreenshotOne API for URL mode.

### Get a free ScreenshotOne API key

1. Sign up at https://screenshotone.com (no credit card required)
2. From the dashboard, copy your `access_key`
3. Add it to `.env`:

```
SCREENSHOTONE_ACCESS_KEY=your-access-key-here
```

Free tier gives 100 screenshots/month. We cache each URL for 24h on ScreenshotOne's side, so dev/demo traffic on the same URLs won't burn fresh credits.

### Update PythonAnywhere outbound whitelist

PythonAnywhere free tier blocks arbitrary outbound HTTPS. Before this works in production, add `api.screenshotone.com` to your account's allowed-domains list. Open the Web tab on PythonAnywhere — if outbound access is restricted, you'll see the list there.

### Deploy steps

```bash
git add .
git commit -m "Day 3: Color Heist with URL, image, and picker modes"
git push origin main

cd ~/100_landing
git pull origin main
workon 100days-venv
pip install -r requirements.txt
nano .env   # add SCREENSHOTONE_ACCESS_KEY
```

Then click Reload in the Web tab and visit: https://100dayswithclaude.pythonanywhere.com/day-03/color-heist

### Image upload size note

Our 5MB image limit is enforced via Flask's `MAX_CONTENT_LENGTH = 5 * 1024 * 1024` setting. Larger uploads return a friendly 413.

## License

MIT.
