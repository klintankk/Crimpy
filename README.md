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

Training data lives in the browser's `localStorage`. Backup/sync is done
**directly from the app to GitHub** (Settings → Backup to GitHub): set the repo,
path (`data/backup.json`), branch and a token, and enable *Auto-sync after
workout*. Each sync fetches the remote copy and does a **deletion-aware 3-way
merge** ([`js/merge.js`](js/merge.js)) against the last-synced state, so edits,
additions and deletions reconcile across devices without deleted items
reappearing. GitHub is your durable, versioned off-device backup; restore on a
new device with **Load from GitHub**.

Use a fine-grained Personal Access Token scoped to *Contents: write* on this
repo only, and rotate it if you lose the device.

## Tests

```bash
npm test        # node test/merge.test.mjs — exercises the merge engine
```

## Layout

```
index.html, css/, js/      the app (static PWA)
js/merge.js                deletion-aware 3-way merge used by the GitHub sync
sw.js, manifest.json       PWA service worker + manifest
icons/                     app icons (installable PWA)
data/backup.json           canonical synced training data
test/                      merge engine tests
tailwind.config.js         Tailwind build config
```
