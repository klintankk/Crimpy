# Crimpy

A climbing-training PWA — fingerboard hangs, weighted pull-ups, repeaters,
planning calendar, logs, PRs and charts. Vanilla JS, no framework, no build at
runtime (Tailwind is precompiled to `css/tailwind.css`).

## Run it locally

It's a static site — serve the repo root with any static server:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
```

A service worker (`sw.js`) provides offline support; it needs HTTPS or
`localhost` to register.

## Rebuild CSS

Utility classes are compiled from the source with Tailwind:

```bash
npm install          # dev only: tailwindcss
npm run build:css    # -> css/tailwind.css
npm run watch:css    # rebuild on change
```

## Data & sync

Training data lives in the browser's `localStorage`. Backups/sync can go to:

1. **GitHub** directly from the browser (Settings → Backup to GitHub), or
2. **A Raspberry Pi sync server** (recommended for multi-device use): the Pi
   holds the GitHub credentials and performs a deletion-aware 3-way merge so
   changes from several devices reconcile without deleted items reappearing.
   See [`server/README.md`](server/README.md).

## Layout

```
index.html, css/, js/      the app (static PWA)
sw.js, manifest.json       PWA service worker + manifest
data/backup.json           canonical synced training data
server/                    Raspberry Pi sync server + merge engine + tests
deploy/                    systemd unit for the sync server
tailwind.config.js         Tailwind build config
```
