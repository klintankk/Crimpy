// js/updater.js
//
// In-app update check for the Android build: looks at the latest GitHub
// release, and if it's newer than this build, downloads the attached APK and
// hands it to the system installer. No-op on plain web (no Capacitor).

import { showToast } from './utils.js';

// Bump this on every release whose tag should be offered as an update.
// Must match the GitHub release tag (with or without a leading "v").
export const APP_VERSION = '1.0.1';

const REPO = 'klintankk/Crimpy';
const APK_FILENAME = 'crimpy-update.apk';

function getCapPlugins() {
  return (window.Capacitor && window.Capacitor.Plugins) || null;
}

export function isAndroidApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function parseVersion(v) {
  return String(v || '').trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
  const a = parseVersion(remote), b = parseVersion(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

async function fetchLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
  return res.json();
}

function findApkAsset(release) {
  return (release.assets || []).find(a => /\.apk$/i.test(a.name));
}

// Resolve whether a newer release with an APK asset exists.
// Always returns a result object — callers must check `status` rather than
// treating any falsy/null value as "no update", so check failures (network,
// no releases published yet, rate limit, etc.) can't be mistaken for
// "up to date".
//   { status: 'update', tag, asset, notes }
//   { status: 'up-to-date' }
//   { status: 'no-asset', tag }
//   { status: 'error', message }
export async function checkForUpdate({ silent = false } = {}) {
  if (!isAndroidApp()) {
    if (!silent) showToast('Updates are only available in the Android app');
    return { status: 'error', message: 'not running in the Android app' };
  }
  try {
    const release = await fetchLatestRelease();
    const tag = release.tag_name || '';
    if (!isNewer(tag, APP_VERSION)) {
      if (!silent) showToast(`You're up to date (v${APP_VERSION})`);
      return { status: 'up-to-date' };
    }
    const asset = findApkAsset(release);
    if (!asset) {
      if (!silent) showToast(`Update ${tag} found, but it has no APK attached`);
      return { status: 'no-asset', tag };
    }
    return { status: 'update', tag, asset, notes: release.body || '' };
  } catch (e) {
    console.warn('checkForUpdate failed', e);
    if (!silent) showToast('Update check failed: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Downloads the release asset and launches the system APK installer.
// onProgress(fraction:0..1|null) is called as the download proceeds.
export async function downloadAndInstall(asset, onProgress) {
  const plugins = getCapPlugins();
  const Filesystem = plugins && plugins.Filesystem;
  const ApkInstaller = plugins && plugins.ApkInstaller;
  if (!Filesystem || !ApkInstaller) {
    throw new Error('Update plugins unavailable');
  }

  if (ApkInstaller.canRequestInstall) {
    const perm = await ApkInstaller.canRequestInstall();
    if (perm && perm.allowed === false) {
      showToast('Allow "Install unknown apps" for Crimpy, then try again');
      await ApkInstaller.requestInstallPermission();
      return;
    }
  }

  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;

  let buffer;
  if (res.body && res.body.getReader && total) {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress(Math.min(1, received / total));
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }
    buffer = merged.buffer;
  } else {
    buffer = await res.arrayBuffer();
  }

  if (onProgress) onProgress(null); // switch UI to "installing"

  const base64 = arrayBufferToBase64(buffer);
  const written = await Filesystem.writeFile({
    path: APK_FILENAME,
    data: base64,
    directory: 'CACHE'
  });

  await ApkInstaller.install({ path: written.uri.replace(/^file:\/\//, '') });
}

// High-level convenience used by the Settings UI: check, prompt, and install.
export async function runUpdateFlow({ onStatus } = {}) {
  const status = (msg) => { if (onStatus) onStatus(msg); else showToast(msg); };
  status('Checking for updates…');
  const result = await checkForUpdate({ silent: true });

  if (result.status === 'error') { status('Update check failed: ' + result.message); return; }
  if (result.status === 'up-to-date') { status(`You're up to date (v${APP_VERSION})`); return; }
  if (result.status === 'no-asset') { status(`Update ${result.tag} found, but it has no APK attached`); return; }

  const proceed = window.confirm(
    `Crimpy ${result.tag} is available (you have v${APP_VERSION}). Download and install now?`
  );
  if (!proceed) { status(`Update ${result.tag} available`); return; }

  try {
    status('Downloading update… 0%');
    await downloadAndInstall(result.asset, (fraction) => {
      if (fraction == null) status('Opening installer…');
      else status(`Downloading update… ${Math.round(fraction * 100)}%`);
    });
  } catch (e) {
    console.error('runUpdateFlow failed', e);
    status('Update failed: ' + e.message);
  }
}
