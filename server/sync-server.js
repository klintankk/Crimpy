'use strict';

/*
 * Crimpy sync server — runs on the Raspberry Pi.
 *
 * Responsibilities:
 *   - Hold the GitHub credentials (so no token lives in any browser).
 *   - Be the single authority that writes the canonical data/backup.json.
 *   - 3-way merge each device's push against the latest canonical doc, so
 *     additions/edits/deletions from multiple devices reconcile correctly.
 *   - Optionally serve the static app itself, so one process + `tailscale
 *     serve` gives you an HTTPS PWA on your tailnet.
 *
 * No external npm dependencies: Node's built-in http/fs/child_process only.
 *
 * Endpoints:
 *   GET  /health        -> { ok: true }
 *   GET  /data          -> current canonical document (JSON)
 *   POST /sync          -> body { base, data }; returns the merged document
 *   (any other GET)     -> static file from REPO_DIR (if SERVE_STATIC=1)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { mergeDoc } = require('./merge');

const cfg = {
  port:         parseInt(process.env.PORT || '8787', 10),
  repoDir:      path.resolve(process.env.REPO_DIR || process.cwd()),
  dataPath:     process.env.DATA_PATH || 'data/backup.json',
  branch:       process.env.GIT_BRANCH || 'main',
  remote:       process.env.GIT_REMOTE || 'origin',
  push:         process.env.PUSH !== '0',
  serveStatic:  process.env.SERVE_STATIC !== '0',
  allowOrigin:  process.env.ALLOWED_ORIGIN || '*',
  syncToken:    process.env.SYNC_TOKEN || '',
  authorName:   process.env.GIT_AUTHOR_NAME || 'Crimpy Pi',
  authorEmail:  process.env.GIT_AUTHOR_EMAIL || 'crimpy@localhost'
};
const dataFile = path.join(cfg.repoDir, cfg.dataPath);

const log = (...a) => console.log(new Date().toISOString(), ...a);

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd: cfg.repoDir,
      env: { ...process.env, GIT_AUTHOR_NAME: cfg.authorName, GIT_AUTHOR_EMAIL: cfg.authorEmail,
             GIT_COMMITTER_NAME: cfg.authorName, GIT_COMMITTER_EMAIL: cfg.authorEmail }
    }, (err, stdout, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim()));
  });
}

function readDoc() {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch { return {}; }
}

// Serialize /sync handling so concurrent pushes never race on git/the file.
let chain = Promise.resolve();
const serialize = (fn) => (chain = chain.then(fn, fn));

async function doSync(localBundle) {
  const base = localBundle.base || null;
  const local = localBundle.data || {};

  // Pull the latest canonical doc into the working tree (best effort: keep
  // working when offline). The Pi is the only writer, so this stays clean.
  if (cfg.push) {
    try { await git(['pull', '--rebase', '--autostash', cfg.remote, cfg.branch]); }
    catch (e) { log('pull failed (continuing offline):', e.message); }
  }

  const remote = readDoc();
  const merged = mergeDoc(base, local, remote);

  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(merged, null, 2) + '\n');

  if (cfg.push) {
    try {
      await git(['add', cfg.dataPath]);
      const status = await git(['status', '--porcelain', '--', cfg.dataPath]);
      if (status) {
        await git(['commit', '-m', 'Sync training data']);
        await git(['push', cfg.remote, `HEAD:${cfg.branch}`]);
        log('pushed merged data');
      } else {
        log('no changes to push');
      }
    } catch (e) {
      // The merge + local write already succeeded; surface push failure but
      // still return the merged doc so the client is consistent with the Pi.
      log('git commit/push failed:', e.message);
    }
  }
  return merged;
}

function cors(res, req) {
  const origin = cfg.allowOrigin === '*' ? (req.headers.origin || '*') : cfg.allowOrigin;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Token');
}
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(cfg.repoDir, rel));
  if (!filePath.startsWith(cfg.repoDir)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  cors(res, req);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = req.url || '/';
  const route = url.split('?')[0];

  if (route === '/health') return sendJson(res, 200, { ok: true });

  if (route === '/data' && req.method === 'GET') {
    if (cfg.syncToken && req.headers['x-sync-token'] !== cfg.syncToken) return sendJson(res, 401, { error: 'unauthorized' });
    return sendJson(res, 200, readDoc());
  }

  if (route === '/sync' && req.method === 'POST') {
    if (cfg.syncToken && req.headers['x-sync-token'] !== cfg.syncToken) return sendJson(res, 401, { error: 'unauthorized' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 25 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch { return sendJson(res, 400, { error: 'invalid JSON' }); }
      serialize(() => doSync(parsed))
        .then(merged => sendJson(res, 200, merged))
        .catch(err => { log('sync error:', err.message); sendJson(res, 500, { error: err.message }); });
    });
    return;
  }

  if (cfg.serveStatic && req.method === 'GET') return serveStatic(req, res, url);
  sendJson(res, 404, { error: 'not found' });
});

server.listen(cfg.port, () => {
  log(`Crimpy sync server on :${cfg.port}`);
  log(`repo=${cfg.repoDir} data=${cfg.dataPath} branch=${cfg.branch} push=${cfg.push} static=${cfg.serveStatic} auth=${cfg.syncToken ? 'on' : 'off'}`);
});
