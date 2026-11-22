# Sabbatical Menu

Plan experiences, not outcomes. A phone-first, local-first PWA: no account, no backend, no build step.

## Run locally

    cd sabbatical-menu
    python3 -m http.server 8765
    # open http://localhost:8765

## Put it on your phone

Service workers (offline + install) need HTTPS, so host the folder as static files
(GitHub Pages, Netlify, Cloudflare Pages…). Then on iPhone: Safari → Share → Add to Home Screen.
When you ship changes, bump `VERSION` in `sw.js`.

## How it works

- `js/data.js`: starter menu (activities with variants, places, extras).
- `js/match.js`: soft matching. Energy, where and company each add a penalty when they don't match, so there's never an empty result. Recently chosen activities get a small nudge down.
- Activities *need* tags (e.g. `seat`, `printer`); places *offer* tags. A variant fits a place when the place offers everything it needs, with per-variant "also works at" / "never pair with" overrides.
- `js/db.js`: everything is one document in IndexedDB (localStorage fallback).
- Back up from Edit → Data → Export backup. Browser storage can be cleared by the OS.
