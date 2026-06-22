# Crimpy sync server (Raspberry Pi)

Makes a Raspberry Pi the single source of truth for your training data. The Pi:

- holds the GitHub credentials (no token in any browser);
- runs a **deletion-aware 3-way merge** so edits/additions/deletions from
  multiple devices reconcile correctly (deleted items don't reappear);
- writes and pushes the canonical `data/backup.json`;
- optionally serves the app itself, so one process behind `tailscale serve`
  gives you an HTTPS PWA on your tailnet.

No npm dependencies — just Node 18+ and `git`.

## How it works

```
browser (localStorage)  --POST /sync { base, data }-->  Pi
                                                          ├─ git pull --rebase
                                                          ├─ 3-way merge(base, local, remote)
                                                          ├─ write data/backup.json
                                                          └─ git commit + push --> GitHub
       <-- merged document (becomes the new local "base") --
```

`base` is the canonical document the device last agreed with the server. With
the common ancestor, the merge can tell a *deletion* (in base, gone now) from a
*never-had-it* (added on another device), which a plain union cannot.

## Setup on the Pi

1. **Install Node + git** (Raspberry Pi OS):
   ```bash
   sudo apt update && sudo apt install -y git nodejs
   ```

2. **Clone the repo** and give git push access via **one** of:
   - a **deploy key**: `ssh-keygen -t ed25519 -f ~/.ssh/crimpy`, add the
     `.pub` as a *read/write* deploy key on the GitHub repo, then clone over
     SSH; or
   - a **fine-grained PAT** scoped to *Contents: Read and write* on just this
     repo, used in the clone URL / git credential helper.
   ```bash
   git clone git@github.com:klintankk/Crimpy.git ~/Crimpy
   ```

3. **Configure**:
   ```bash
   cd ~/Crimpy/server
   cp .env.example .env
   # edit .env: set REPO_DIR=/home/pi/Crimpy, a SYNC_TOKEN, etc.
   ```

4. **Run it** (foreground test):
   ```bash
   node sync-server.js          # listens on :8787
   curl localhost:8787/health   # {"ok":true}
   ```

5. **Run it as a service**:
   ```bash
   sudo cp ~/Crimpy/deploy/crimpy-sync.service /etc/systemd/system/
   # edit the unit if your user/paths differ
   sudo systemctl enable --now crimpy-sync
   journalctl -u crimpy-sync -f
   ```

## Expose over Tailscale (HTTPS — required for the PWA)

Service workers need a secure context, so use Tailscale's HTTPS:

1. In the Tailscale admin console enable **MagicDNS** and **HTTPS Certificates**.
2. On the Pi:
   ```bash
   tailscale serve --bg 8787
   ```
   Your app + API are now at `https://<pi-name>.<your-tailnet>.ts.net`.

## Point the app at the Pi

In the app: **Settings → Sync server (Raspberry Pi)**

- **URL**: `https://<pi-name>.<your-tailnet>.ts.net`
- **Shared secret**: the `SYNC_TOKEN` from `.env` (leave blank if unset)

Click **Sync now** once to seed it. After that, with *Auto-sync after workout*
on, each finished workout syncs through the Pi. When a sync URL is set it takes
priority over the in-app GitHub backup.

## Tests

```bash
node merge.test.js
```

## Notes / limits

- The Pi is the only writer, so its working tree stays clean. If you *also*
  push to `data/backup.json` directly from a browser (GitHub backup form), the
  `git pull --rebase` before each merge keeps the Pi current; prefer one path.
- Conflicting edits to the *same* field on two devices resolve last-writer-wins
  (the syncing device wins). Distinct changes all merge.
- Set `PUSH=0` to run purely local (merge + serve, no GitHub) — e.g. if you
  want the Pi itself to be the only home for the data.
