# Crimpy Sync — Home Assistant add-on

Runs the Crimpy sync server as a managed, **persistent** Home Assistant add-on:
it survives reboots and add-on updates, auto-restarts, and is configured from
the HA UI. It holds your GitHub credential and performs the deletion-aware
3-way merge of training data, then pushes the canonical `data/backup.json`.

It can also serve the app itself, so one add-on behind `tailscale serve` gives
you an HTTPS PWA on your tailnet.

## 1. Create a GitHub token

Create a **fine-grained Personal Access Token**:

- GitHub → Settings → Developer settings → Fine-grained tokens → Generate.
- **Repository access:** only `klintankk/Crimpy`.
- **Permissions:** *Contents → Read and write*.

Copy the token (`github_pat_…`).

## 2. Install the add-on (local add-on)

This add-on is self-contained — it clones the app/server code at runtime, so you
only need this folder on the HA machine.

1. Get file access to HA via the **Samba** or **Studio Code Server** / SSH add-on.
2. Copy this `crimpy-sync` folder into the HA **`/addons/`** share, i.e. so you
   have `/addons/crimpy-sync/config.yaml`.
3. HA → **Settings → Add-ons → Add-on Store**, then ⋮ (top right) →
   **Check for updates**. A **Local add-ons** section appears with *Crimpy Sync*.
4. Open it → **Install**.

(Alternatively, host this folder in its own GitHub repo and add that repo as a
custom **add-on repository** — HA expects each add-on folder at the repo root.)

## 3. Configure

On the add-on's **Configuration** tab:

| Option | Value |
| --- | --- |
| `repo` | `klintankk/Crimpy` |
| `branch` | `main` |
| `github_token` | the fine-grained PAT from step 1 |
| `sync_token` | a long random string (optional; the app must send the same) |
| `push` | `true` (set `false` to merge/serve locally without pushing) |
| `serve_static` | `true` to also serve the app from the add-on |
| `allowed_origin` | `*`, or your app's exact origin if hosted elsewhere |

Then **Start** the add-on and watch the **Log** tab — you should see
`Cloning…` then `Starting Crimpy sync server on :8787`.

## 4. Reach it / connect the app

The API listens on port **8787**. For the PWA you need HTTPS (service worker),
so front it with Tailscale on the host:

```bash
tailscale serve --bg 8787
tailscale serve status   # shows https://<name>.<tailnet>.ts.net
```

In the app: **Settings → Sync server** → paste that URL (and the `sync_token`
if you set one) → **Sync now**.

## Notes

- Persistent data lives in the add-on's `/data` (`/data/repo` is the git
  clone). Reinstalling the add-on clears it; the canonical copy is safe on
  GitHub regardless.
- The token is stored in HA's add-on options and written into the clone's git
  config inside `/data` (not world-readable). Rotate it in the GitHub UI if
  needed.
- `build.yaml` pins the Alpine base image to `3.19`; bump it if you want a newer
  base.
