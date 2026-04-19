# Khajni Yatra

A bilingual (Hindi/English) static site for the Khajni Yatra — a grassroots
listening journey across 455 booths led by Vidya Sagar urf Chote Bhai.
Starts 20 April 2026.

## Stack

Static HTML / CSS / vanilla JS. Ships with Google Translate fallback for
13 Indian languages, a 455-booth heatmap, a live poll (checkbox multi-pick
with IP dedup) and a private feedback form. Both forms submit to a Google
Apps Script web-app backend which writes to a Google Sheet and emails the
candidate.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (GitHub Pages)

Push to `main` → repo Settings → Pages → source: `main` / root → save.

## Backend setup

See `apps-script/Code.gs` — it includes step-by-step setup instructions.
Paste the deployed web-app URL into `assets/js/main.js` →
`CONFIG.APPS_SCRIPT_URL`.

## Assets

Drop the yatra poster at `assets/images/poster-1.jpg` (21:8 ratio). A
styled fallback renders when missing.
