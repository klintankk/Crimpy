// js/storage.js
export class Storage {
  constructor() {
    this.defaults = {
      plan: {},
      log: [],
      prs: {},
      userWorkouts: [],
      // activities are stored as special entries inside `userWorkouts` with `isActivity: true`.
      autoSyncAfterWorkout: true
    };
  }

  get(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : (this.defaults[key] || null);
  }

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  clear(key) {
    localStorage.removeItem(key);
  }

  getUserWorkouts() {
    return this.get('userWorkouts');
  }

  getActivities() {
    const workouts = this.getUserWorkouts() || [];
    return workouts.filter(w => w && w.isActivity).map(a => a.name);
  }

  getActivityEntries() {
    const workouts = this.getUserWorkouts() || [];
    return workouts.filter(w => w && w.isActivity).map(a => ({ name: a.name, note: a.note || '' }));
  }

  addActivity(name) {
    if (!name) return;
    const workouts = this.getUserWorkouts() || [];
    const norm = (name || '').toLowerCase().trim();
    // remove any existing non-activity workouts that have the same name (case-insensitive)
    const filtered = workouts.filter(w => {
      try {
        if (!w) return false;
        if (w.isActivity) return true;
        const wn = (w.name || '').toLowerCase().trim();
        return wn !== norm;
      } catch (e) { return true; }
    });
    const id = `activity:${norm}`;
    if (!filtered.find(w => w && w.id === id)) {
      filtered.push({ id, name: norm, isActivity: true });
      this.set('userWorkouts', filtered);
    } else {
      // ensure the activity is saved if it already exists
      this.set('userWorkouts', filtered);
    }
  }

  removeActivity(name) {
    if (!name) return;
    const workouts = (this.getUserWorkouts() || []).filter(w => !(w && w.isActivity && w.name === name));
    this.set('userWorkouts', workouts);
  }

  updateActivity(oldName, newName, note) {
    if (!oldName || !newName) return;
    const workouts = this.getUserWorkouts() || [];
    const oldNorm = (oldName || '').toLowerCase().trim();
    const newNorm = (newName || '').toLowerCase().trim();

    // remove any non-activity workouts that conflict with the new name
    const filtered = workouts.filter(w => {
      try {
        if (!w) return false;
        if (w.isActivity) return true;
        const wn = (w.name || '').toLowerCase().trim();
        return wn !== newNorm;
      } catch (e) { return true; }
    });

    // find existing activity entries
    const existingIdx = filtered.findIndex(w => w && w.isActivity && w.name === newNorm);
    const oldIdx = filtered.findIndex(w => w && w.isActivity && w.name === oldNorm);

    if (existingIdx >= 0 && oldIdx >= 0 && existingIdx !== oldIdx) {
      // merge into existing: update note and remove old
      filtered[existingIdx].note = note || '';
      filtered.splice(oldIdx, 1);
    } else if (oldIdx >= 0) {
      // update the old entry
      filtered[oldIdx].name = newNorm;
      filtered[oldIdx].id = `activity:${newNorm}`;
      filtered[oldIdx].note = note || '';
    } else {
      // add new activity
      filtered.push({ id: `activity:${newNorm}`, name: newNorm, isActivity: true, note: note || '' });
    }

    this.set('userWorkouts', filtered);
  }

  // One-time migration: remove non-activity workouts that conflict with activity names
  dedupeActivityConflicts() {
    const workouts = this.getUserWorkouts() || [];
    const activityNames = new Set(workouts.filter(w => w && (w.isActivity || (w.id||'').startsWith('activity:'))).map(a => (a.name||'').toLowerCase().trim()));
    let changed = false;
    const filtered = workouts.filter(w => {
      if (!w) return false;
      // keep activity entries
      if (w.isActivity || (w.id||'').startsWith('activity:')) return true;
      const wn = (w.name||'').toLowerCase().trim();
      if (wn && activityNames.has(wn)) { changed = true; return false; }
      return true;
    });
    if (changed) this.set('userWorkouts', filtered);
    return changed;
  }

  saveUserWorkout(workout) {
    const workouts = this.getUserWorkouts();
    const index = workouts.findIndex(w => w.id === workout.id);
    
    if (index >= 0) {
      workouts[index] = workout;
    } else {
      workouts.push(workout);
    }
    
    this.set('userWorkouts', workouts);
  }

  deleteUserWorkout(id) {
    const workouts = this.getUserWorkouts().filter(w => w.id !== id);
    this.set('userWorkouts', workouts);
  }

  export() {
    return {
      plan: this.get('plan'),
      planRecurring: this.get('planRecurring') || {},
      planCompleted: this.get('planCompleted') || {},
      planNotes: this.get('planNotes') || {},
      activities: this.getActivities() || [],
      log: this.get('log'),
      prs: this.get('prs'),
      userWorkouts: this.get('userWorkouts'),
      progressCategories: this.get('progressCategories') || []
    };
  }

  import(data) {
    if (!data || typeof data !== 'object') return;
    if (data.plan) this.set('plan', data.plan);
    if (data.planRecurring) this.set('planRecurring', data.planRecurring);
    if (data.planCompleted) this.set('planCompleted', data.planCompleted);
    if (data.planNotes) this.set('planNotes', data.planNotes);
    if (data.activities && Array.isArray(data.activities)) {
      // merge activities into userWorkouts as `isActivity` entries
      const existing = this.getUserWorkouts() || [];
      const filtered = existing.filter(w => !(w && w.isActivity));
      const activities = data.activities.map(a => ({ id: `activity:${a}`, name: a, isActivity: true }));
      this.set('userWorkouts', filtered.concat(activities));
    }
    if (data.log) this.set('log', data.log);
    if (data.prs) this.set('prs', data.prs);
    if (data.userWorkouts) this.set('userWorkouts', data.userWorkouts);
    if (data.progressCategories) this.set('progressCategories', data.progressCategories);
    // notify UI that everything changed
    try { window.dispatchEvent(new CustomEvent('storage:allUpdated', { detail: { source: 'import' } })); } catch (e) { /* ignore */ }
  }

  // Supabase cloud helpers removed — provide no-op stubs to avoid runtime errors
  async syncWorkoutsToCloud() {
    console.warn('syncWorkoutsToCloud: Supabase integration removed — no-op');
    return false;
  }

  async fetchWorkoutsFromCloud() {
    console.warn('fetchWorkoutsFromCloud: Supabase integration removed — no-op');
    return null;
  }

  // Plan sync
  async syncPlanToCloud() {
    console.warn('syncPlanToCloud: Supabase integration removed — no-op');
    return false;
  }

  async fetchPlanFromCloud() {
    console.warn('fetchPlanFromCloud: Supabase integration removed — no-op');
    return null;
  }

  // Logs sync
  async syncLogsToCloud() {
    console.warn('syncLogsToCloud: Supabase integration removed — no-op');
    return false;
  }

  async fetchLogsFromCloud() {
    console.warn('fetchLogsFromCloud: Supabase integration removed — no-op');
    return null;
  }

  // Orchestrators
  async syncAllToCloud() {
    console.warn('syncAllToCloud: Supabase integration removed — no-op');
    return { workouts: false, plan: false, logs: false };
  }

  async fetchAllFromCloud() {
    console.warn('fetchAllFromCloud: Supabase integration removed — no-op');
    return { workouts: null, plan: null, logs: null };
  }

  // Save exported data to a file in a GitHub repository using the Contents API.
  // options: { owner, repo, path, branch, token, message }
  async saveToGitHub(options) {
    try {
      const { owner, repo, path = 'data/backup.json', branch = 'main', token, message = 'crimpd backup', force = false, merge = true } = options || {};
      if (!owner || !repo || !path) throw new Error('owner, repo and path are required');

      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      const payloadLocal = this.export();
      const contentLocal = btoa(unescape(encodeURIComponent(JSON.stringify(payloadLocal, null, 2))));

      const headers = { Accept: 'application/vnd.github.v3+json' };
      if (token) headers.Authorization = `token ${token}`;

      // helper: fetch remote file JSON (if exists)
      const fetchRemote = async () => {
        try {
          const res = await fetch(apiBase + `?ref=${encodeURIComponent(branch)}`, { headers });
          if (!res.ok) return null;
          const j = await res.json();
          if (!j || !j.content) return null;
          const raw = j.content.replace(/\n/g, '');
          const decoded = decodeURIComponent(escape(atob(raw)));
          const parsed = JSON.parse(decoded);
          return { parsed, sha: j.sha };
        } catch (e) { return null; }
      };

      // helper: write a file to GitHub at given path (relative repo path)
      const putFile = async (repoPath, contentB64, commitMessage, branchName, shaOpt) => {
        const encoded = repoPath.split('/').map(encodeURIComponent).join('/');
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}`;
        const body = { message: commitMessage, content: contentB64, branch: branchName };
        if (shaOpt) body.sha = shaOpt;
        const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
        const pj = await r.json();
        if (!r.ok) throw new Error(pj && pj.message ? pj.message : 'GitHub put failed');
        return pj;
      };

      // Merge remote and local payloads
      const mergePayloads = (remote, local) => {
        if (!remote) return local;
        const out = {};
        // merge objects: plan, planRecurring, planCompleted, planNotes, prs
        out.plan = Object.assign({}, remote.plan || {}, local.plan || {});
        out.planRecurring = Object.assign({}, remote.planRecurring || {}, local.planRecurring || {});
        out.planCompleted = Object.assign({}, remote.planCompleted || {}, local.planCompleted || {});
        out.planNotes = Object.assign({}, remote.planNotes || {}, local.planNotes || {});
        out.prs = Object.assign({}, remote.prs || {}, local.prs || {});
        out.progressCategories = local.progressCategories || remote.progressCategories || [];

        // activities: union of names
        const aRem = Array.isArray(remote.activities) ? remote.activities : [];
        const aLoc = Array.isArray(local.activities) ? local.activities : [];
        out.activities = Array.from(new Set(aRem.concat(aLoc)));

        // userWorkouts: merge by id, prefer local
        const uwRem = Array.isArray(remote.userWorkouts) ? remote.userWorkouts : [];
        const uwLoc = Array.isArray(local.userWorkouts) ? local.userWorkouts : [];
        const uwMap = new Map();
        uwRem.forEach(u => { if (u && u.id) uwMap.set(u.id, u); });
        uwLoc.forEach(u => { if (u && u.id) uwMap.set(u.id, u); });
        out.userWorkouts = Array.from(uwMap.values());

        // log: merge and dedupe by id or date+summary
        const logRem = Array.isArray(remote.log) ? remote.log : [];
        const logLoc = Array.isArray(local.log) ? local.log : [];
        const logMap = new Map();
        const keyFor = (e) => (e && e.id) ? `id:${e.id}` : `ds:${(e && e.date)||''}|${(e && e.summary)||JSON.stringify(e)}`;
        logRem.forEach(e => { try { logMap.set(keyFor(e), e); } catch (e) {} });
        logLoc.forEach(e => { try { logMap.set(keyFor(e), e); } catch (e) {} });
        out.log = Array.from(logMap.values()).sort((a,b) => (a.date||'') < (b.date||'') ? 1 : -1);

        return out;
      };

      // perform merge if requested
      const remote = await fetchRemote();
      const mergedPayload = (merge) ? mergePayloads(remote && remote.parsed, payloadLocal) : payloadLocal;

      // create a timestamped backup copy under backups/
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `backups/backup-${timestamp}.json`;
      const backupContent = btoa(unescape(encodeURIComponent(JSON.stringify(remote && remote.parsed ? remote.parsed : payloadLocal, null, 2))));
      try {
        // attempt to write backup (no sha required if new)
        await putFile(backupPath, backupContent, `Backup before merge ${timestamp}`, branch);
      } catch (e) {
        // ignore backup failures but log
        console.warn('saveToGitHub: backup write failed', e && e.message);
      }

      // finally, write merged payload to target path using latest sha
      const mergedContent = btoa(unescape(encodeURIComponent(JSON.stringify(mergedPayload, null, 2))));
      // fetch latest sha again to be safe
      const latest = await fetchRemote();
      const latestSha = latest && latest.sha ? latest.sha : null;
      // Try writing the merged payload, retrying up to 3 times by refetching latest sha each attempt
      const maxAttempts = 3;
      let lastErr = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const latestTry = await fetchRemote();
        const trySha = latestTry && latestTry.sha ? latestTry.sha : null;
        try {
          const res = await putFile(path, mergedContent, message || `Backup: merged ${timestamp}`, branch, trySha);
          return res;
        } catch (err) {
          lastErr = err;
          // if not last attempt, wait a short moment and retry
          if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 200 * attempt));
        }
      }
      // all attempts failed
      throw lastErr || new Error('GitHub save failed after retries');
    } catch (err) {
      console.error('saveToGitHub failed', err);
      throw err;
    }
  }

  // Load a JSON backup file from a GitHub repository and import it into storage.
  // options: { owner, repo, path, branch, token }
  async loadFromGitHub(options) {
    try {
      const { owner, repo, path, branch = 'main', token } = options || {};
      if (!owner || !repo || !path) throw new Error('owner, repo and path are required');
      const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(apiBase, {
        headers: token ? { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } : { Accept: 'application/vnd.github.v3+json' }
      });
      if (!res.ok) {
        const pj = await res.json().catch(() => ({}));
        throw new Error(pj && pj.message ? pj.message : 'Failed to fetch file from GitHub');
      }
      const j = await res.json();
      let content = j.content || j.data || null;
      if (!content) throw new Error('No content field in GitHub response');
      // content may contain newlines
      content = content.replace(/\n/g, '');
      const decoded = decodeURIComponent(escape(atob(content)));
      const parsed = JSON.parse(decoded);
      // Import into storage
      this.import(parsed);
      // Notify UI
      try { window.dispatchEvent(new CustomEvent('storage:allUpdated', { detail: { source: 'github' } })); } catch (e) { /* ignore */ }
      return parsed;
    } catch (err) {
      console.error('loadFromGitHub failed', err);
      throw err;
    }
  }

  // Save full backup using saved GitHub settings in localStorage
  async saveAllToGitHub() {
    try {
      const repoVal = this.get('githubRepo');
      if (!repoVal) throw new Error('No GitHub repo configured');
      const parts = repoVal.split('/');
      if (parts.length < 2) throw new Error('Repo must be in owner/repo format');
      const owner = parts[0];
      const repo = parts.slice(1).join('/');
      const path = this.get('githubPath') || 'data/backup.json';
      const branch = this.get('githubBranch') || 'main';
      const token = this.get('githubToken') || undefined;
      const message = this.get('githubMessage') || 'crimpd backup from web';
      return await this.saveToGitHub({ owner, repo, path, branch, token, message });
    } catch (err) {
      console.error('saveAllToGitHub failed', err);
      throw err;
    }
  }
}
