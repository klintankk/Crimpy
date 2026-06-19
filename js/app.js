// js/app.js
import { Router } from './router.js';
import { Storage } from './storage.js';
import { generateId, validateWorkout, getWorkoutSummary, setupFormListeners, WORKOUT_TYPES, showActivitySettings, addActivity, removeActivity } from './workouts.js';
import { Timer } from './timer.js';
import { Calendar } from './calendar.js';
import { Logger } from './logger.js';
import { showToast, showConfetti, playSound, renderSpeakerButton } from './utils.js';
import { initThemeFromStorage, toggleTheme as toggleThemeHelper, loadSvgSprite } from './ui.js';
import { renderRepsUI } from './repsSetUI.js';

class App {
  constructor() {
    this.storage = new Storage();
    try { if (typeof this.storage.dedupeActivityConflicts === 'function') this.storage.dedupeActivityConflicts(); } catch (e) { /* ignore */ }
    this.router = new Router();
    this.timer = null;
    this.calendar = new Calendar(this.storage);
    this.logger = new Logger(this.storage);
    // Wake lock helpers
    this.wakeLockSentinel = null;
    this._wakeLockActive = false;
    this.noSleep = null; // fallback

    this.state = {
      tab: 'plan',
      activeWorkout: null,
      timerState: null,
      editingWorkout: null,
      showWorkoutForm: false
    };

    this.initRouter();
    initThemeFromStorage();
    loadSvgSprite('icons/sprite.svg');
    this.registerServiceWorker();

    // react to storage updates (cloud fetches) and refresh UI automatically
    window.addEventListener('storage:workoutsUpdated', () => {
      try { if (typeof this.render === 'function') this.render(); } catch (e) {}
      try { if (typeof this.renderPlanEditor === 'function') this.renderPlanEditor(); } catch (e) {}
    });
    window.addEventListener('storage:planUpdated', () => {
      try { if (typeof this.render === 'function') this.render(); } catch (e) {}
      try { if (typeof this.renderPlanEditor === 'function') this.renderPlanEditor(); } catch (e) {}
    });
    window.addEventListener('storage:logsUpdated', () => {
      try { if (typeof this.render === 'function') this.render(); } catch (e) {}
      try { if (typeof this.renderPlanEditor === 'function') this.renderPlanEditor(); } catch (e) {}
    });
    window.addEventListener('storage:allUpdated', () => {
      try { if (typeof this.render === 'function') this.render(); } catch (e) {}
      try { if (typeof this.renderPlanEditor === 'function') this.renderPlanEditor(); } catch (e) {}
    });

    window.app = this;
    // attempt auto-load of GitHub backup if user enabled it in previous session
    try { this.maybeAutoLoadBackup(); } catch (e) { /* ignore */ }
    // bind session renderer to instance to ensure method exists on the object
    if (typeof this.renderWorkoutSession === 'function') {
      this.renderWorkoutSession = this.renderWorkoutSession.bind(this);
    } else {
      // fallback minimal session renderer in case method isn't present (robustness)
      this.renderWorkoutSession = () => {
        const ts = this.state.timerState;
        if (!ts) return '<div class="p-4">No active workout</div>';
        const w = ts.workout || { name: 'Workout' };
        return `
          <div class="p-4">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-bold">${w.name}</h2>
              <button onclick="app.cancelWorkout()" class="px-3 py-1 rounded bg-gray-700">Cancel</button>
            </div>
            <div class="text-center py-12">
              <div class="text-4xl mb-6">Session</div>
            </div>
          </div>
        `;
      };
    }

    // Re-acquire a wake lock after visibility changes if we were keeping device awake
    document.addEventListener('visibilitychange', async () => {
      try {
        if (document.visibilityState === 'visible' && this._wakeLockActive) {
          await this.requestWakeLock();
        }
      } catch (e) { /* ignore */ }
    });

  }

  startActivity(name, date) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
        <h2 class="text-xl font-bold mb-4">${name.charAt(0).toUpperCase() + name.slice(1)}</h2>
        <textarea id="activityNote" class="w-full bg-gray-900 p-3 rounded text-sm mb-4" rows="4" placeholder="Optional note (how did it go?)"></textarea>
        <div class="flex justify-end gap-3">
          <button id="cancelAct" class="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500">Cancel</button>
          <button id="saveAct" class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cancelAct').onclick = () => modal.remove();
    modal.querySelector('#saveAct').onclick = () => {
      const note = (document.getElementById('activityNote') || {}).value || '';
      const entry = {
        date: new Date().toISOString(),
        workoutId: null,
        workoutName: name.charAt(0).toUpperCase() + name.slice(1),
        bestValue: 0,
        isPR: false,
        summary: note ? `${name.charAt(0).toUpperCase() + name.slice(1)} — ${note}` : (name.charAt(0).toUpperCase() + name.slice(1)),
        details: []
      };
      try { if (this.logger && typeof this.logger.addEntry === 'function') this.logger.addEntry(entry); } catch (e) { console.error('Failed to add log entry for activity', e); }
      // Mark activity as completed in calendar
      const completionDate = date || new Date().toISOString().split('T')[0];
      const activityId = `activity:${name}`;
      if (this.calendar) {
        if (!this.calendar.completed[completionDate]) this.calendar.completed[completionDate] = [];
        if (!this.calendar.completed[completionDate].includes(activityId)) {
          this.calendar.completed[completionDate].push(activityId);
          this.storage.set('planCompleted', this.calendar.completed);
        }
      }
      modal.remove();
      if (typeof this.render === 'function') this.render();
    };
  }

  startActivityFromCalendar(name) {
    return this.startActivity(name);
  }

  editActivity(oldName) {
    const workouts = this.storage.getUserWorkouts() || [];
    const act = workouts.find(w => w && w.isActivity && w.name === oldName) || null;
    const currentName = act ? (act.name || oldName) : oldName;
    const currentNote = act ? (act.note || '') : '';

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
        <h2 class="text-xl font-bold mb-4">Edit Activity</h2>
        <div class="space-y-3">
          <div>
            <label class="block mb-2 font-medium">Name</label>
            <input id="editActivityName" class="w-full bg-gray-700 p-3 rounded text-lg" value="${currentName}" />
          </div>
          <div>
            <label class="block mb-2 font-medium">Note (subtitle)</label>
            <input id="editActivityNote" class="w-full bg-gray-700 p-3 rounded text-lg" value="${currentNote}" />
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-4">
          <button id="cancelEditAct" class="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500">Cancel</button>
          <button id="saveEditAct" class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cancelEditAct').onclick = () => modal.remove();
    modal.querySelector('#saveEditAct').onclick = () => {
      const newName = (document.getElementById('editActivityName') || {}).value || '';
      const newNote = (document.getElementById('editActivityNote') || {}).value || '';
      try { this.storage.updateActivity(oldName, newName, newNote); } catch (e) { console.error('updateActivity failed', e); }
      modal.remove();
      if (typeof this.render === 'function') this.render();
    };
  }

  // NoSleep fallback using the video trick similar to NoSleep.js.
  // Creates a tiny hidden looping video element that plays a silent WebM to keep the device awake.
  _ensureNoSleep() {
    if (this.noSleep) return;
    this.noSleep = {
      _video: null,
      enabled: false,
      enable() {
        try {
          if (this._video) return;
          const v = document.createElement('video');
          v.setAttribute('playsinline', '');
          v.setAttribute('muted', '');
          v.loop = true;
          v.style.width = '1px';
          v.style.height = '1px';
          v.style.opacity = '0';
          v.style.position = 'fixed';
          v.style.right = '0';
          v.style.bottom = '0';
          // tiny silent webm data URI (1s of silence) - small and widely supported
          v.src = 'data:video/webm;base64,GkXfo0AgQoaBAUL+AAAAAAABAAEAAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
          v.play().catch(() => {});
          document.body.appendChild(v);
          this._video = v;
          this.enabled = true;
        } catch (e) {
          // ignore
        }
      },
      disable() {
        try {
          if (this._video) {
            try { this._video.pause(); } catch (e) {}
            try { this._video.removeAttribute('src'); } catch (e) {}
            if (this._video.parentNode) this._video.parentNode.removeChild(this._video);
            this._video = null;
          }
        } catch (e) {}
        this.enabled = false;
      }
    };
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator && navigator.wakeLock.request) {
        try {
          this.wakeLockSentinel = await navigator.wakeLock.request('screen');
          this._wakeLockActive = true;
          // when released by UA, mark inactive
          if (this.wakeLockSentinel && this.wakeLockSentinel.addEventListener) {
            this.wakeLockSentinel.addEventListener('release', () => { this._wakeLockActive = false; });
          }
          return;
        } catch (e) {
          // fall through to fallback
          console.warn('Screen Wake Lock request failed', e);
        }
      }
    } catch (e) { /* ignore */ }

    // Fallback: enable NoSleep via hidden video trick
    try {
      this._ensureNoSleep();
      if (this.noSleep && !this.noSleep.enabled) this.noSleep.enable();
      this._wakeLockActive = true;
    } catch (e) { /* ignore */ }
  }

  async releaseWakeLock() {
    try {
      if (this.wakeLockSentinel && this.wakeLockSentinel.release) {
        try { await this.wakeLockSentinel.release(); } catch (e) {}
        this.wakeLockSentinel = null;
      }
    } catch (e) { /* ignore */ }
    try {
      if (this.noSleep && this.noSleep.enabled) this.noSleep.disable();
    } catch (e) { /* ignore */ }
    this._wakeLockActive = false;
  }

  // Try to auto-load a backup on startup.
  // First attempt to fetch a local `/data/backup.json` (or configured `githubPath`),
  // then fall back to GitHub auto-load if configured.
  async maybeAutoLoadBackup() {
    try {
      const configuredPath = (this.storage.get('githubPath') || 'data/backup.json').replace(/^\/+/, '');
      const localPath = '/' + configuredPath;
      try {
        const res = await fetch(localPath, { cache: 'no-store' });
        if (res.ok) {
          const parsed = await res.json();
          this.storage.import(parsed);
          console.debug('Auto-loaded local backup from', localPath);
          if (typeof this.render === 'function') this.render();
          return;
        }
      } catch (err) {
        // local fetch failed or not present — continue to GitHub fallback
        console.debug('Local backup not found at', localPath);
      }

      const repoVal = this.storage.get('githubRepo');
      const autoLoad = !!this.storage.get('githubAutoLoad');
      if (!repoVal || !autoLoad) return;
      const parts = repoVal.split('/');
      if (parts.length < 2) return;
      const owner = parts[0];
      const repoName = parts.slice(1).join('/');
      const path = this.storage.get('githubPath') || 'data/backup.json';
      const branch = this.storage.get('githubBranch') || 'main';
      const token = this.storage.get('githubToken') || undefined;
      try {
        await this.storage.loadFromGitHub({ owner, repo: repoName, path, branch, token });
        console.debug('Auto-loaded GitHub backup', { owner, repo: repoName, path, branch });
        if (typeof this.render === 'function') this.render();
      } catch (err) {
        console.warn('Auto-load GitHub backup failed', err);
      }
    } catch (e) { console.error('maybeAutoLoadBackup failed', e); }
  }

  async maybeAutoSyncToGitHub() {
    try {
      const enabled = !!this.storage.get('autoSyncAfterWorkout');
      if (!enabled) return;
      const repoVal = this.storage.get('githubRepo');
      if (!repoVal) {
        showToast('Auto-save: no GitHub repo configured');
        return;
      }
      try {
        showToast('Auto-saving backup to GitHub...');
        await this.storage.saveAllToGitHub();
        showToast('Auto-save complete');
      } catch (err) {
        console.error('Auto-save failed', err);
        showToast('Auto-save failed');
      }
    } catch (e) { console.error('maybeAutoSyncToGitHub failed', e); }
  }


  // quickSaveToGitHub removed; save/load lives in App Settings modal

  showGlobalSettings() {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-50 flex items-center justify-center';
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-black bg-opacity-50';
    overlay.onclick = () => wrap.remove();

    const modal = document.createElement('div');
    modal.className = 'relative bg-white dark:bg-gray-800 p-6 rounded-lg max-w-lg w-full';

    modal.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">App Settings</h2>
        <button id="closeSettingsBtn" class="text-xl">✕</button>
      </div>
      <div class="mb-3 flex items-center gap-3">
        <label class="text-sm">Auto-sync after workout</label>
        <button id="autoSyncBtn" class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700">Off</button>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button id="closeOnlySettingsBtn" class="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500">Close</button>
      </div>
    `;

    // Save form fields (GitHub token and last-used repo info) and close
    const saveAndClose = () => {
      try {
        // Persist GitHub form fields if present
        const ghTokenEl = modal.querySelector('#gh-token');
        if (ghTokenEl) {
          const token = (ghTokenEl.value || '').trim();
          const rememberEl = modal.querySelector('#gh-remember');
          const remember = !!(rememberEl && rememberEl.checked);
          if (remember && token) this.storage.set('githubToken', token);
          else this.storage.clear('githubToken');

          const repoVal = ((modal.querySelector('#gh-repo') && modal.querySelector('#gh-repo').value) || '').trim();
          const pathVal = ((modal.querySelector('#gh-path') && modal.querySelector('#gh-path').value) || '').trim();
          const branchVal = ((modal.querySelector('#gh-branch') && modal.querySelector('#gh-branch').value) || '').trim();
          const msgVal = ((modal.querySelector('#gh-message') && modal.querySelector('#gh-message').value) || '').trim();
          if (repoVal) this.storage.set('githubRepo', repoVal);
          if (pathVal) this.storage.set('githubPath', pathVal);
          if (branchVal) this.storage.set('githubBranch', branchVal);
          if (msgVal) this.storage.set('githubMessage', msgVal);
        }
      } catch (err) { console.error('saveAndClose failed', err); }
      wrap.remove();
    };

    modal.querySelector('#closeSettingsBtn').onclick = saveAndClose;
    modal.querySelector('#closeOnlySettingsBtn').onclick = saveAndClose;

    

    // initialize auto-sync toggle button state
    try {
      const btn = modal.querySelector('#autoSyncBtn');
      const enabled = !!this.storage.get('autoSyncAfterWorkout');
      if (btn) {
        const setState = (v) => {
          btn.dataset.enabled = v ? '1' : '0';
          btn.textContent = v ? 'On' : 'Off';
          btn.classList.toggle('bg-indigo-600', v);
          btn.classList.toggle('text-white', v);
          btn.classList.toggle('bg-gray-200', !v);
        };
        setState(enabled);
        btn.addEventListener('click', (e) => {
          try {
            const newState = !(btn.dataset.enabled === '1');
            this.storage.set('autoSyncAfterWorkout', newState);
            setState(newState);
            showToast('Auto-sync ' + (newState ? 'enabled' : 'disabled'));
          } catch (err) { console.error('Failed to save autoSyncAfterWorkout', err); }
        });
      }
    } catch (e) { /* ignore */ }

    

    // sample data load and import/export buttons removed

    // Cloud sync buttons removed — use GitHub backup form instead

    // Export/Import and Save/Load All handlers removed

    // GitHub Save / Load — friendly inline form (insert reliably)
    {
      const ghForm = document.createElement('div');
      ghForm.className = 'mt-3 p-3 bg-gray-700 rounded';
      const savedToken = this.storage.get('githubToken') || '';
      const savedRepo = this.storage.get('githubRepo') || 'eriknilsson133x-dev/.github.io';
      const savedPath = this.storage.get('githubPath') || 'data/backup.json';
      const savedBranch = this.storage.get('githubBranch') || 'main';
      const savedMessage = this.storage.get('githubMessage') || 'crimpd backup from web';
      const savedAutoLoad = !!this.storage.get('githubAutoLoad');
      ghForm.innerHTML = `
        <div class="text-sm font-semibold mb-2">Backup to GitHub</div>
        <div class="grid grid-cols-1 gap-2">
          <input id="gh-repo" class="p-2 bg-gray-600 rounded text-gray-100" placeholder="owner/repo" value="${savedRepo}">
          <input id="gh-path" class="p-2 bg-gray-600 rounded text-gray-100" placeholder="path (e.g. data/backup.json)" value="${savedPath}">
          <input id="gh-branch" class="p-2 bg-gray-600 rounded text-gray-100" placeholder="branch" value="${savedBranch}">
          <input id="gh-token" class="p-2 bg-gray-600 rounded text-gray-100" placeholder="Personal access token (optional for public repo)" value="${savedToken}">
          <label class="flex items-center gap-2 text-sm"><input id="gh-remember" type="checkbox" ${savedToken ? 'checked' : ''}> Remember token in browser (localStorage)</label>
          <input id="gh-message" class="p-2 bg-gray-600 rounded text-gray-100" placeholder="Commit message" value="${savedMessage}">
          <label class="flex items-center gap-2 text-sm"><input id="gh-autoload" type="checkbox" ${savedAutoLoad ? 'checked' : ''}> Auto-load backup on startup</label>
          <label class="flex items-center gap-2 text-sm"><input id="gh-force" type="checkbox"> Force overwrite (bypass SHA check)</label>
          <div class="text-xs text-gray-400 mt-2">Remote SHA: <span id="gh-remote-sha" class="font-mono text-sm">(unknown)</span> <button id="gh-refresh-sha" class="ml-2 px-2 py-1 bg-gray-600 rounded text-xs">Refresh</button></div>
          <div class="mt-2">
            <button id="gh-forcepush" class="px-3 py-2 bg-red-600 text-white rounded text-sm">Force Push Now</button>
          </div>
          <div class="flex gap-2">
            <button id="gh-save" class="px-4 py-2 bg-green-600 text-white rounded">Save to GitHub</button>
            <button id="gh-load" class="px-4 py-2 bg-yellow-600 text-white rounded">Load from GitHub</button>
          </div>
          <div class="text-xs text-gray-400">Token scope: use <strong>public_repo</strong> for public repos or <strong>repo</strong> for private repos. The token is sent directly to GitHub and (optionally) stored locally if you check "Remember".</div>
        </div>
      `;

      const footer = modal.querySelector('.flex.justify-end.gap-3.mt-6');
      if (footer && footer.parentElement) footer.parentElement.insertBefore(ghForm, footer);
      else modal.appendChild(ghForm);

      const ghSave = ghForm.querySelector('#gh-save');
      const ghLoad = ghForm.querySelector('#gh-load');
      ghSave.addEventListener('click', async () => {
        try {
            const repoVal = ghForm.querySelector('#gh-repo').value.trim();
            const path = ghForm.querySelector('#gh-path').value.trim();
            const branch = ghForm.querySelector('#gh-branch').value.trim() || 'main';
            const token = ghForm.querySelector('#gh-token').value.trim();
            const remember = ghForm.querySelector('#gh-remember').checked;
            const message = ghForm.querySelector('#gh-message').value.trim() || 'crimpd backup from web';
            const autoLoadEl = ghForm.querySelector('#gh-autoload');
            const autoLoad = !!(autoLoadEl && autoLoadEl.checked);
            const forceEl = ghForm.querySelector('#gh-force');
            const force = !!(forceEl && forceEl.checked);
          if (!repoVal || !path) return alert('Please provide repo and path');
          const parts = repoVal.split('/');
          if (parts.length < 2) return alert('Repo must be in owner/repo format');
          const owner = parts[0];
          const repo = parts.slice(1).join('/');
          if (!token) {
            if (!confirm('No token provided. Saving to a public repo without token may fail. Continue?')) return;
          }
          if (remember && token) this.storage.set('githubToken', token); else this.storage.clear('githubToken');
          this.storage.set('githubAutoLoad', !!autoLoad);
          await this.storage.saveToGitHub({ owner, repo, path, branch, token, message, force });
          alert('Saved to GitHub');
        } catch (err) { console.error(err); alert('Save to GitHub failed: ' + (err && err.message)); }
      });

      // Refresh remote SHA display
      const ghRefreshBtn = ghForm.querySelector('#gh-refresh-sha');
      const ghRemoteShaEl = ghForm.querySelector('#gh-remote-sha');
      const refreshSha = async () => {
        try {
          const repoVal = ghForm.querySelector('#gh-repo').value.trim();
          const pathVal = ghForm.querySelector('#gh-path').value.trim();
          const branchVal = ghForm.querySelector('#gh-branch').value.trim() || 'main';
          const tokenVal = ghForm.querySelector('#gh-token').value.trim();
          if (!repoVal || !pathVal) return;
          const parts = repoVal.split('/');
          const owner = parts[0];
          const repo = parts.slice(1).join('/');
          const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(pathVal)}?ref=${encodeURIComponent(branchVal)}`;
          const res = await fetch(apiBase, { headers: tokenVal ? { Authorization: `token ${tokenVal}`, Accept: 'application/vnd.github.v3+json' } : { Accept: 'application/vnd.github.v3+json' } });
          if (!res.ok) { ghRemoteShaEl.textContent = '(not found)'; return; }
          const j = await res.json(); ghRemoteShaEl.textContent = (j && j.sha) ? j.sha : '(no sha)';
        } catch (e) { ghRemoteShaEl.textContent = '(error)'; }
      };
      ghRefreshBtn.addEventListener('click', refreshSha);
      // initial refresh
      setTimeout(() => refreshSha(), 100);

      // Force push now: attempts a save with force=true and shows full error message
      const ghForcePushBtn = ghForm.querySelector('#gh-forcepush');
      ghForcePushBtn.addEventListener('click', async () => {
        try {
          const repoVal = ghForm.querySelector('#gh-repo').value.trim();
          const path = ghForm.querySelector('#gh-path').value.trim();
          const branch = ghForm.querySelector('#gh-branch').value.trim() || 'main';
          const token = ghForm.querySelector('#gh-token').value.trim();
          const message = ghForm.querySelector('#gh-message').value.trim() || 'crimpd backup from web';
          if (!repoVal || !path) return alert('Please provide repo and path');
          const parts = repoVal.split('/'); if (parts.length < 2) return alert('Repo must be in owner/repo format');
          const owner = parts[0]; const repo = parts.slice(1).join('/');
          const res = await this.storage.saveToGitHub({ owner, repo, path, branch, token, message, force: true, merge: true });
          alert('Force push succeeded');
          // update displayed sha
          setTimeout(() => refreshSha(), 200);
        } catch (err) {
          console.error('Force push failed', err);
          alert('Force push failed: ' + (err && err.message));
          // refresh sha to show current state
          setTimeout(() => refreshSha(), 200);
        }
      });

      ghLoad.addEventListener('click', async () => {
        try {
          const repoVal = ghForm.querySelector('#gh-repo').value.trim();
          const path = ghForm.querySelector('#gh-path').value.trim();
          const branch = ghForm.querySelector('#gh-branch').value.trim() || 'main';
          const token = ghForm.querySelector('#gh-token').value.trim();
          if (!repoVal || !path) return alert('Please provide repo and path');
          const parts = repoVal.split('/');
          if (parts.length < 2) return alert('Repo must be in owner/repo format');
          const owner = parts[0];
          const repo = parts.slice(1).join('/');
          if (!confirm('This will overwrite local data with the GitHub file. Continue?')) return;
          if (ghForm.querySelector('#gh-remember').checked && token) this.storage.set('githubToken', token);
          const autoLoadEl = ghForm.querySelector('#gh-autoload');
          const autoLoad = !!(autoLoadEl && autoLoadEl.checked);
          this.storage.set('githubAutoLoad', !!autoLoad);
          const parsed = await this.storage.loadFromGitHub({ owner, repo, path, branch, token });
          alert('Loaded data from GitHub');
          if (window.app && typeof window.app.render === 'function') window.app.render();
        } catch (err) { console.error(err); alert('Load from GitHub failed: ' + (err && err.message)); }
      });
    }

    wrap.appendChild(overlay);
    wrap.appendChild(modal);
    document.body.appendChild(wrap);
  }

  initRouter() {
    this.router.on('/', () => this.render());
    this.router.on('/remote', () => this.renderRemote());
    this.router.on('/plan-editor', () => this.renderPlanEditor());
    this.router.init();
  }

  renderPlanEditor() {
    const app = document.getElementById('app');
    let content = this.renderNavBar();
    content += this.calendar.renderEditor();
    app.innerHTML = content;

    const speakerWrap = app.querySelector('#speakerWrap');
    if (speakerWrap) {
      const btn = renderSpeakerButton();
      speakerWrap.replaceWith(btn);
    }

    this.updateThemeIcon();
  }

  // Proxy methods for calendar to fix onclick issues
  toggleRecurringForCalendar(date, id) {
    const dow = new Date(date).getDay();
    this.calendar.recurring[dow] = this.calendar.recurring[dow] || [];
    const idx = this.calendar.recurring[dow].indexOf(id);
    if (idx === -1) this.calendar.recurring[dow].push(id);
    else this.calendar.recurring[dow].splice(idx, 1);
    this.storage.set('planRecurring', this.calendar.recurring);
    if (typeof this.renderPlanEditor === 'function') this.renderPlanEditor();
    else if (typeof this.render === 'function') this.render();
  }

  toggleActivityCompletedForCalendar(date, id) {
    this.calendar.completed[date] = this.calendar.completed[date] || [];
    const idx = this.calendar.completed[date].indexOf(id);
    if (idx === -1) this.calendar.completed[date].push(id);
    else this.calendar.completed[date].splice(idx, 1);
    this.storage.set('planCompleted', this.calendar.completed);
    if (typeof this.render === 'function') this.render();
  }

  removeFromDayForCalendar(date, id) {
    this.calendar.plan[date] = (this.calendar.plan[date] || []).filter(i => i !== id);
    if (this.calendar.plan[date].length === 0) delete this.calendar.plan[date];
    this.storage.set('plan', this.calendar.plan);
    if (typeof this.renderPlanEditor === 'function') this.renderPlanEditor();
    else if (typeof this.render === 'function') this.render();
  }

  prevWeekForCalendar() {
    this.calendar.prevWeek();
  }

  nextWeekForCalendar() {
    this.calendar.nextWeek();
  }

  prevMonthForCalendar() {
    this.calendar.prevMonth();
  }

  nextMonthForCalendar() {
    this.calendar.nextMonth();
  }

  toggleMonthlyForCalendar() {
    this.calendar.toggleMonthly();
  }

  closePlanModalForCalendar() {
    this.calendar.closePlanModal();
  }

  editNoteForCalendar(date) {
    this.calendar.editNote(date);
  }

  removeFromDayForCalendar(date, id) {
    this.calendar.removeFromDay(date, id);
  }

  toggleActivityCompletedForCalendar(date, id) {
    this.calendar.toggleActivityCompleted(date, id);
  }


  // Expose workouts-based activity handlers (used by workouts UI)
  removeActivityForWorkouts(activity) {
    try { removeActivity(activity); } catch (e) { /* ignore */ }
    if (typeof this.render === 'function') this.render();
  }

  addActivityForWorkouts() {
    try { addActivity(); } catch (e) { /* ignore */ }
  }

  showActivitySettingsForWorkouts() {
    try { showActivitySettings(); } catch (e) { /* ignore */ }
  }

  saveEditorAndReturnForCalendar() {
    this.calendar.saveEditorAndReturn();
  }

  dragStartForCalendar(event, id) {
    this.calendar.dragStart(event, id);
  }

  dragStartActivityForCalendar(event, activity) {
    this.calendar.dragStartActivity(event, activity);
  }

  dragEndForCalendar(event) {
    this.calendar.dragEnd(event);
  }

  dropForCalendar(event, date) {
    this.calendar.drop(event, date);
  }

  allowDropForCalendar(event) {
    this.calendar.allowDrop(event);
  }

  dropInEditorForCalendar(event, date) {
    this.calendar.dropInEditor(event, date);
  }

  toggleTheme() {
    toggleThemeHelper();
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    try {
      const btn = document.querySelector('button[title="Toggle theme"]');
      const isDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
      if (!btn) return;
      const svgs = btn.querySelectorAll('svg');
      svgs.forEach(svg => {
        const use = svg.querySelector('use');
        const href = use && (use.getAttribute('href') || use.getAttribute('xlink:href')) || '';
        if (href.includes('icon-sun')) {
          svg.classList.toggle('hidden', isDark);
          svg.classList.toggle('block', !isDark);
          svg.style.display = isDark ? 'none' : 'block';
        } else if (href.includes('icon-moon')) {
          svg.classList.toggle('hidden', !isDark);
          svg.classList.toggle('block', isDark);
          svg.style.display = isDark ? 'block' : 'none';
        }
      });
    } catch (e) { /* ignore */ }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      // avoid registering the service worker during local development to prevent stale cache issues
      const host = location.hostname;
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      if (isLocal) {
        // attempt to unregister any existing SWs to avoid serving stale files
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
        console.debug('Skipping service worker registration on localhost');
      } else {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    }
  }

  switchTab(tab) {
    this.state.tab = tab;
    this.state.showWorkoutForm = false;
    this.state.editingWorkout = null;
    this.render();
  }

  showCreateWorkout() {
    this.state.showWorkoutForm = true;
    this.state.editingWorkout = null;
    this.render();
  }

  editWorkout(id) {
    const workout = this.storage.getUserWorkouts().find(w => w.id === id);
    if (workout) {
      this.state.editingWorkout = workout;
      this.state.showWorkoutForm = true;
      this.render();
    }
  }

  deleteWorkout(id) {
    if (confirm('Delete this workout?')) {
      this.storage.deleteUserWorkout(id);
      this.render();
    }
  }

  cancelWorkoutForm() {
    this.state.showWorkoutForm = false;
    this.state.editingWorkout = null;
    this.render();
  }

  saveWorkout(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    // Prefer reading the checkbox `.checked` to avoid FormData inconsistencies
    const isActivityEl = form.querySelector('input[name="isActivity"]');
    const isActivity = !!(isActivityEl && isActivityEl.checked);
    if (isActivity) {
      const name = (formData.get('name') || '').trim();
      if (!name) { showToast('Name required'); return; }
      try {
        // if editing an existing activity, remove old and add new
        if (this.state.editingWorkout && this.state.editingWorkout.isActivity) {
          try { this.storage.removeActivity(this.state.editingWorkout.name); } catch (e) {}
        }
        this.storage.addActivity(name.toLowerCase());
        showToast(this.state.editingWorkout ? 'Activity updated' : 'Activity created');
        this.state.showWorkoutForm = false;
        this.state.editingWorkout = null;
        this.render();
      } catch (e) { console.error('Failed to save activity', e); showToast('Save failed'); }
      return;
    }
    const workout = {
      id: (this.state.editingWorkout && this.state.editingWorkout.id) || generateId(),
      isActivity: false,
      name: formData.get('name'),
      tool: formData.get('tool'),
      sets: parseInt(formData.get('sets')),
      type: formData.get('type'),
      duration: (formData.get('type') === 'duration' || formData.get('type') === 'both')
        ? parseInt(formData.get('duration')) : null,
      reps: (formData.get('type') === 'reps' || formData.get('type') === 'both')
        ? parseInt(formData.get('reps')) : null,
      // --- repeater extras (user-editable) ---
      repeaterWork:  formData.get('type') === 'repeaters' ? parseInt(formData.get('repeaterWork'))  || 7  : null,
      repeaterRest:  formData.get('type') === 'repeaters' ? parseInt(formData.get('repeaterRest'))  || 3  : null,
      repeaterCount: formData.get('type') === 'repeaters' ? parseInt(formData.get('repeaterCount')) || 10 : null,
      // ---------------------------------------
      hasWeight: formData.get('hasWeight') === 'on',
      weight: formData.get('hasWeight') === 'on'
        ? parseFloat(formData.get('weight')) : null,
      weightUnit: formData.get('hasWeight') === 'on'
        ? formData.get('weightUnit') : null,
      rest: parseInt(formData.get('rest')),
      // finger block mode
      leftRightMode: formData.get('tool') === 'Finger block' ? formData.get('leftRightMode') === 'on' : false
      ,
      // depth for hangboard / finger workouts (mm)
      depth: (formData.get('depth') && formData.get('depth').trim() !== '') ? parseInt(formData.get('depth'), 10) : null
    };

    const error = validateWorkout(workout);
    if (error) { showToast(error); return; }

    this.storage.saveUserWorkout(workout);
    showToast(this.state.editingWorkout ? 'Workout updated' : 'Workout created');
    this.state.showWorkoutForm = false;
    this.state.editingWorkout = null;
    this.render();
  }

  startWorkout(id, date) {
    console.debug('App.startWorkout', id, date);
    const workout = this.storage.getUserWorkouts().find(w => w.id === id);
    if (!workout) { console.debug('startWorkout: workout not found', id); return; }
    // If this is an activity, use the activity modal instead
    if (workout.isActivity) {
      this.startActivity(workout.name);
      return;
    }
    this.state.activeWorkout = id;
    this.state.timerState = {
      phase: 'setup',               // ask for weight first
      totalSets: workout.sets || 1,
      currentSet: 0,
      inputs: [],
      workout,
      originalWeight: workout.weight,  // track original for saving changes
      originalDepth: workout.depth,
      origin: date ? { type: 'plan', date } : null
    };
    this.render();
  }

  /* ----------------------------------------------------------
     NEW: capture single weight and auto-run all sets
  ---------------------------------------------------------- */
  startFirstSet() {
    const w  = this.state.timerState.workout;
    const ts = this.state.timerState;

    if (w.hasWeight) {
      const pw = document.getElementById('presetWeight');
      // prefer user-entered value, fall back to saved workout weight if empty
      if (pw && String(pw.value).trim() !== '') {
        const v = parseFloat(pw.value);
        ts.presetWeight = Number.isFinite(v) ? v : ((typeof w.weight !== 'undefined' && w.weight !== null) ? w.weight : 0);
      } else {
        ts.presetWeight = (typeof w.weight !== 'undefined' && w.weight !== null) ? w.weight : 0;
      }
      // if weight was changed, save it back to the workout template
      if (ts.presetWeight !== (w.weight || 0)) {
        w.weight = ts.presetWeight;
        this.storage.saveUserWorkout(w);
      }
    } else {
      ts.presetWeight = null;
    }

    // depth for fingerboard/hang workouts
    const isFinger = ((w.tool || '').toLowerCase().includes('finger') || (w.name || '').toLowerCase().includes('finger') || (w.tool || '').toLowerCase().includes('hang') || (w.name || '').toLowerCase().includes('hang'));
    if (isFinger) {
      const pd = document.getElementById('presetDepth');
      if (pd && String(pd.value).trim() !== '') {
        const d = parseInt(pd.value, 10);
        ts.presetDepth = Number.isFinite(d) ? d : ((typeof w.depth !== 'undefined' && w.depth !== null) ? w.depth : null);
      } else {
        ts.presetDepth = (typeof w.depth !== 'undefined' && w.depth !== null) ? w.depth : null;
      }
      if (ts.presetDepth !== (w.depth || null)) {
        w.depth = ts.presetDepth;
        try { this.storage.saveUserWorkout(w); } catch (e) { /* ignore */ }
      }
    } else {
      ts.presetDepth = null;
    }

    // jump straight into first work period or special UI
    if (w.type === 'repeaters') {
      ts.repeaterCounter = 0;
      ts.phase = 'repeaters-work';
      ts.timeLeft = w.repeaterWork;
      this.startTimer();
    } else if (w.type === 'reps' && !w.duration) {
      // Reps-only workouts: show the reps-per-set UI instead of starting a timer
      ts.phase = 'reps-ui';
      const total = Math.max(1, ts.totalSets || 1);
      if (!Array.isArray(ts.inputs) || ts.inputs.length !== total) {
        ts.inputs = new Array(total).fill(w.reps || 0);
      }
      if (!Array.isArray(ts.repsChecked) || ts.repsChecked.length !== total) {
        ts.repsChecked = new Array(total).fill(false);
      }
      // do not call startTimer()
    } else {
      // Duration or both: start with countdown
      ts.phase = 'countdown';
      ts.timeLeft = 3;
      this.startTimer();
    }

    // special initialization for finger block left/right mode
    if (w.tool === 'Finger block' && w.leftRightMode) {
      ts.phase = 'countdown';
      ts.timeLeft = 3;
      this.startTimer();
    }

    // initialize rep counter for reps/both-type workouts
    if (w.type === 'reps' || w.type === 'both') {
      ts.currentRep = 0;
      ts.inputs = ts.inputs || [];
    }
    this.render();
    // Try to keep device awake during active session
    try { this.requestWakeLock(); } catch (e) { /* ignore */ }
  }

  startTimer() {
    const ts = this.state.timerState;
    if (ts.timer) clearInterval(ts.timer);

    // BEEP whenever a work phase starts
    if (ts.phase === 'work' || ts.phase === 'repeaters-work' || ts.phase === 'work-left' || ts.phase === 'work-right') playSound();

    ts.timer = setInterval(() => {
      ts.timeLeft -= 0.1;
      if (ts.timeLeft <= 0) {
        clearInterval(ts.timer);

        // countdown finished: start work
        if (ts.phase === 'countdown') {
          ts.phase = 'work';
          ts.timeLeft = ts.workout.duration || 1;
          this.startTimer();
          return;
        }

        // ---- repeater micro-loop ----
        if (ts.workout.type === 'repeaters') {
          if (ts.phase === 'repeaters-work') {
            // work finished → rest
            ts.phase = 'repeaters-rest';
            ts.timeLeft = ts.workout.repeaterRest;
            this.startTimer();
            return;
          }
          if (ts.phase === 'repeaters-rest') {
            ts.repeaterCounter = (ts.repeaterCounter || 0) + 1;
            if (ts.repeaterCounter >= ts.workout.repeaterCount) {
              // all cycles done → normal inter-set rest (unless this was the final set)
              if (ts.currentSet + 1 >= ts.totalSets) {
                this.finishWorkout();
                return;
              }
              ts.phase = 'rest';
              ts.timeLeft = ts.workout.rest || 120;
              this.startTimer();
            } else {
              // another work/rest cycle
              ts.phase = 'repeaters-work';
              ts.timeLeft = ts.workout.repeaterWork;
              this.startTimer();
            }
            return;
          }
        }
        // ---- finger block left/right mode ----
        if (ts.workout.tool === 'Finger block' && ts.workout.leftRightMode) {
          if (ts.phase === 'work-left') {
            // left work finished → delay
            ts.phase = 'delay';
            ts.timeLeft = 5;
            this.startTimer();
            return;
          }
          if (ts.phase === 'delay') {
            // delay finished → work right
            ts.phase = 'work-right';
            ts.timeLeft = ts.workout.duration || 30;
            this.startTimer();
            return;
          }
          if (ts.phase === 'work-right') {
            // right work finished → rest or finish
            const effectiveRest = Math.max(0, (ts.workout.rest || 120) - 5 - (ts.workout.duration || 30));
            if (ts.currentSet + 1 >= ts.totalSets) {
              this.finishWorkout();
              return;
            }
            ts.phase = 'rest';
            ts.timeLeft = effectiveRest;
            this.startTimer();
            return;
          }
        }
        // ---- normal work/rest ----
        if (ts.phase === 'work') {
          // record reps for this set before entering rest
          if (ts.workout.type === 'reps' || ts.workout.type === 'both') {
            ts.inputs = ts.inputs || [];
            ts.inputs.push(ts.currentRep || 0);
            ts.currentRep = 0;
          } else if (ts.workout.type === 'duration') {
            // record duration per set so it appears in the log
            ts.inputs = ts.inputs || [];
            ts.inputs.push(ts.workout.duration || 0);
          }
          // if this was the final set, finish immediately (no final rest)
          if (ts.currentSet + 1 >= ts.totalSets) {
            this.finishWorkout();
          } else {
            ts.phase = 'rest';
            ts.timeLeft = ts.workout.rest || 120;
            this.startTimer();
          }
        } else if (ts.phase === 'rest') {
          ts.currentSet++;
          if (ts.currentSet >= ts.totalSets) {
            this.finishWorkout();
          } else {
            if (ts.workout.tool === 'Finger block' && ts.workout.leftRightMode) {
              // start next set with work-left
              ts.phase = 'work-left';
              ts.timeLeft = ts.workout.duration || 30;
            } else if (ts.workout.type === 'repeaters') {
              // start next set with fresh counter
              ts.repeaterCounter = 0;
              ts.phase = 'repeaters-work';
              ts.timeLeft = ts.workout.repeaterWork;
            } else {
              ts.phase = 'work';            // will beep on re-entry
              ts.timeLeft = ts.workout.duration || 1;
            }
            this.startTimer();
          }
        }
        this.render();
      } else {
        this.render();
      }
    }, 100);
  }

  adjustTimer(delta) {
    this.state.timerState.timeLeft = Math.max(0, this.state.timerState.timeLeft + delta);
    this.render();
  }

  // rep counter controls
  addReps(delta) {
    const ts = this.state.timerState;
    if (!ts) return;
    ts.currentRep = Math.max(0, (ts.currentRep || 0) + delta);
    this.render();
  }

  // Handlers used by repsSetUI (inline call targets)
  repsUI_onToggle(index) {
    const ts = this.state.timerState;
    if (!ts) return;
    const total = Math.max(1, ts.totalSets || 1);
    if (!Array.isArray(ts.repsChecked) || ts.repsChecked.length !== total) ts.repsChecked = new Array(total).fill(false);
    if (!Array.isArray(ts.inputs) || ts.inputs.length !== total) ts.inputs = new Array(total).fill((ts.workout && ts.workout.reps) || 0);
    ts.repsChecked[index] = !ts.repsChecked[index];
    // if checked but input is empty, initialize with workout default
    if (ts.repsChecked[index] && (ts.inputs[index] === undefined || ts.inputs[index] === null)) {
      ts.inputs[index] = ts.workout.reps || 0;
    }
    // if all checked, show note input (don't finish yet)
    // finishWorkout will be called from repsUI_finishWithNote
    this.render();
  }

  repsUI_finishWithNote() {
    const ts = this.state.timerState;
    if (!ts) return;
    const note = document.getElementById('workoutNote').value.trim();
    ts.note = note || null;
    this.finishWorkout();
  }

  repsUI_onChange(index, value) {
    const ts = this.state.timerState;
    if (!ts) return;
    const total = Math.max(1, ts.totalSets || 1);
    if (!Array.isArray(ts.inputs) || ts.inputs.length !== total) ts.inputs = new Array(total).fill((ts.workout && ts.workout.reps) || 0);
    ts.inputs[index] = parseInt(value, 10) || 0;
    this.render();
  }

  // New: adjust reps for specific set
  repsUI_addReps(index, delta) {
    const ts = this.state.timerState;
    if (!ts) return;
    const total = Math.max(1, ts.totalSets || 1);
    if (!Array.isArray(ts.inputs) || ts.inputs.length !== total) ts.inputs = new Array(total).fill((ts.workout && ts.workout.reps) || 0);
    ts.inputs[index] = Math.max(0, (ts.inputs[index] || 0) + delta);
    this.render();
  }

  // Modal for post-workout notes
  showPostWorkoutNoteModal(callback) {
    // remove any existing
    this.closePostWorkoutNoteModal();
    const wrap = document.createElement('div');
    wrap.id = 'postWorkoutNoteModal';
    wrap.className = 'fixed inset-0 z-50 flex items-center justify-center';

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-black bg-opacity-60';
    overlay.onclick = () => this.closePostWorkoutNoteModal();

    const modal = document.createElement('div');
    modal.className = 'relative bg-white dark:bg-gray-800 rounded-lg p-4 w-[min(720px,95%)] max-h-[80vh] overflow-auto';
    modal.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Add a note for this workout</h3>
        <button id="closePostNoteBtn" class="text-xl">✕</button>
      </div>
      <textarea id="postWorkoutNoteTextarea" class="w-full bg-gray-100 dark:bg-gray-900 p-3 rounded text-sm mb-4" rows="4" placeholder="How did it go?"></textarea>
      <div class="flex justify-end gap-3">
        <button id="cancelPostNoteBtn" class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Skip</button>
        <button id="savePostNoteBtn" class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500">Add Note</button>
      </div>
    `;

    modal.querySelector('#closePostNoteBtn').onclick = () => { this.closePostWorkoutNoteModal(); callback(''); };
    modal.querySelector('#cancelPostNoteBtn').onclick = () => { this.closePostWorkoutNoteModal(); callback(''); };
    modal.querySelector('#savePostNoteBtn').onclick = () => {
      const ta = document.getElementById('postWorkoutNoteTextarea');
      const note = (ta.value || '').trim();
      this.closePostWorkoutNoteModal();
      callback(note);
    };

    wrap.appendChild(overlay);
    wrap.appendChild(modal);
    document.body.appendChild(wrap);
    // focus textarea
    requestAnimationFrame(() => { const ta = document.getElementById('postWorkoutNoteTextarea'); if (ta) ta.focus(); });
  }

  closePostWorkoutNoteModal() {
    const ex = document.getElementById('postWorkoutNoteModal');
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  // New: update weight during reps workout
  repsUI_updateWeight(value) {
    const ts = this.state.timerState;
    if (!ts) return;
    ts.presetWeight = parseFloat(value) || 0;
    this.render();
  }

  // New: update depth (mm) during reps workout
  repsUI_updateDepth(value) {
    const ts = this.state.timerState;
    if (!ts) return;
    ts.presetDepth = (value === '' || value === null) ? null : parseInt(value, 10) || 0;
    this.render();
  }

  skipTimer() {
    clearInterval(this.state.timerState.timer);
    this.state.timerState.phase = 'work';
    this.state.timerState.timeLeft = 0;
    this.startTimer();
  }

  cancelWorkout() {
    if (this.state.timerState && this.state.timerState.timer) clearInterval(this.state.timerState.timer);
    this.state.activeWorkout = null;
    this.state.timerState = null;
    try { this.releaseWakeLock(); } catch (e) {}
    this.render();
  }

  finishWorkout() {
    const workout = this.state.timerState.workout;
    const ts = this.state.timerState;
    // determine display value per workout type
    let bestValue = 0;
    let isPR = false;
    const timeUnit = (workout.type === 'duration' ? 's' : 'reps');
    const weightUnit = workout.weightUnit || 'kg';
    const unit = workout.hasWeight ? weightUnit : timeUnit;

    if (workout.hasWeight) {
      // Prefer an explicitly entered preset weight; fall back to the workout's saved default.
      const preset = (ts && typeof ts.presetWeight !== 'undefined' && ts.presetWeight !== null && Number.isFinite(ts.presetWeight))
        ? ts.presetWeight
        : (workout.weight || 0);
      bestValue = preset;
      const prs = this.storage.get('prs');
      if (!prs[workout.id] || bestValue > prs[workout.id]) {
        prs[workout.id] = bestValue;
        this.storage.set('prs', prs);
        isPR = true;
        showConfetti();
        showToast('NEW PR 🏆');
      }
    } else if (workout.type === 'duration') {
      // use configured duration for display
      bestValue = workout.duration || (ts.inputs && ts.inputs[0]) || 0;
    } else {
      // reps or other types: prefer first input if available
      bestValue = (ts.inputs && ts.inputs.length > 0) ? ts.inputs[0] : 0;
    }

    // Build summary and per-set details. If workout has weight and also a duration/reps
    // include both in the display (e.g. "2 sets: 5s 20 mm @ 10 kg" and "Set 1: 5s 20 mm @ 10 kg").
    let summary;
    let details = [];

    const displayUnit = workout.hasWeight ? (weightUnit) : timeUnit;
    const depthVal = (ts && typeof ts.presetDepth !== 'undefined' && ts.presetDepth !== null)
      ? ts.presetDepth
      : (typeof workout.depth !== 'undefined' && workout.depth !== null ? workout.depth : null);

    // Helper to assemble token groups with single-space unit and double-space separators
    const joinTokens = (tokens) => tokens.filter(Boolean).join('  ');

    if (workout.hasWeight && (workout.type === 'duration' || workout.type === 'both')) {
      const perSet = (ts.inputs && ts.inputs.length > 0) ? ts.inputs[0] : (workout.duration || 0);
      const summaryTokens = [ `${perSet} ${timeUnit}`, depthVal ? `${depthVal} mm` : null, `${bestValue} ${weightUnit}` ];
      summary = `${ts.totalSets} sets: ${joinTokens(summaryTokens)}${isPR ? ' – NEW PR' : ''}`;
      if (ts.inputs && ts.inputs.length > 0) {
        details = ts.inputs.map((v, i) => `Set ${i+1}: ${joinTokens([`${v} ${timeUnit}`, depthVal ? `${depthVal} mm` : null, `${bestValue} ${weightUnit}`])}`);
      } else {
        details = Array(ts.totalSets).fill(`Set: ${joinTokens([`${workout.duration || 0} ${timeUnit}`, depthVal ? `${depthVal} mm` : null, `${bestValue} ${weightUnit}`])}`);
      }
    } else if (workout.hasWeight && (workout.type === 'reps')) {
      // reps with weight
      const perSet = (ts.inputs && ts.inputs.length > 0) ? ts.inputs[0] : 0;
      const summaryTokens = [ `${perSet} ${timeUnit}`, depthVal ? `${depthVal} mm` : null, `${bestValue} ${weightUnit}` ];
      summary = `${ts.totalSets} sets: ${joinTokens(summaryTokens)}${isPR ? ' – NEW PR' : ''}`;
      if (ts.inputs && ts.inputs.length > 0) {
        details = ts.inputs.map((v, i) => `Set ${i+1}: ${joinTokens([`${v} ${timeUnit}`, depthVal ? `${depthVal} mm` : null, `${bestValue} ${weightUnit}`])}`);
      } else {
        details = Array(ts.totalSets).fill(`Set: ${joinTokens([`${perSet} ${timeUnit}`, depthVal ? `${depthVal} mm` : null, `${bestValue} ${weightUnit}`])}`);
      }
    } else {
      // non-weight workouts (duration or reps)
      const summaryTokens = [ `${bestValue} ${unit}`, depthVal ? `${depthVal} mm` : null ];
      summary = `${ts.totalSets} sets × ${joinTokens(summaryTokens)}`;
      if (ts.inputs && ts.inputs.length > 0) {
        details = ts.inputs.map((v, i) => `Set ${i+1}: ${joinTokens([`${v} ${unit}`, depthVal ? `${depthVal} mm` : null ])}`);
      } else {
        details = Array(ts.totalSets).fill(`Set: ${joinTokens([`${bestValue} ${unit}`, depthVal ? `${depthVal} mm` : null ])}`);
      }
    }

    const entryDate = (ts.origin && ts.origin.type === 'plan' && ts.origin.date) ? ts.origin.date : new Date().toISOString();
    const entry = {
      date: entryDate,
      workoutId: workout.id,
      workoutName: workout.name,
      bestValue,
      isPR,
      summary: ts.note ? `${summary} — ${ts.note}` : summary,
      details
    };

    // optional note after completion (skip for reps-only, which have their own note UI)
    if (workout.type === 'reps' && !workout.duration) {
      this.logger.addEntry(entry);
      if (ts.timer) clearInterval(ts.timer);
      this.state.activeWorkout = null;
      this.state.timerState = null;
      // if this workout was started from the plan, mark that scheduled occurrence completed
      if (ts.origin && ts.origin.type === 'plan' && ts.origin.date) {
        try {
          this.calendar.markCompleted(ts.origin.date, workout.id);
        } catch (e) { console.error('Failed to mark plan item completed', e); }
      }
      // save updated weight back to workout template if changed
      if (workout.hasWeight && ts.presetWeight !== ts.originalWeight) {
        workout.weight = ts.presetWeight;
        this.storage.saveUserWorkout(workout);
      }
      // save updated depth back to workout template if changed
      if (typeof ts.presetDepth !== 'undefined' && ts.presetDepth !== null && ts.presetDepth !== ts.originalDepth) {
        workout.depth = ts.presetDepth;
        this.storage.saveUserWorkout(workout);
      }
      this.state.tab = 'log';
      try { this.releaseWakeLock(); } catch (e) {}
      this.render();
      // Auto-sync to cloud in background after every finished workout
      try {
        this.maybeAutoSyncToGitHub();
      } catch (e) { console.error('auto-sync scheduling failed', e); }
    } else {
      this.showPostWorkoutNoteModal((note) => {
        if (note) entry.summary += ' — ' + note;
        this.logger.addEntry(entry);
        if (ts.timer) clearInterval(ts.timer);
        this.state.activeWorkout = null;
        this.state.timerState = null;
        // if this workout was started from the plan, mark that scheduled occurrence completed
        if (ts.origin && ts.origin.type === 'plan' && ts.origin.date) {
          try {
            this.calendar.markCompleted(ts.origin.date, workout.id);
          } catch (e) { console.error('Failed to mark plan item completed', e); }
        }
        // save updated weight back to workout template if changed
        if (workout.hasWeight && ts.presetWeight !== ts.originalWeight) {
          workout.weight = ts.presetWeight;
          this.storage.saveUserWorkout(workout);
        }
        // save updated depth back to workout template if changed
        if (typeof ts.presetDepth !== 'undefined' && ts.presetDepth !== null && ts.presetDepth !== ts.originalDepth) {
          workout.depth = ts.presetDepth;
          this.storage.saveUserWorkout(workout);
        }
        this.state.tab = 'log';
        try { this.releaseWakeLock(); } catch (e) {}
        this.render();
        // Auto-save backup to GitHub (if enabled)
        try {
          this.maybeAutoSyncToGitHub();
        } catch (e) { console.error('auto-sync scheduling failed', e); }
      });
    }
  }

  renderWorkoutSession() {
    const ts = this.state.timerState;
    if (!ts) return '<div class="p-4">No active workout</div>';
    const w = ts.workout;

    // Reps-only UI (no duration): delegate rendering to the repsSetUI module
    if (w.type === 'reps' && !w.duration) {
      try {
        return renderRepsUI(ts, this);
      } catch (e) {
        console.error('Failed to render reps UI', e);
        return '<div class="p-4">Unable to render reps UI</div>';
      }
    }

    // setup phase: ask for preset weight if needed
    if (ts.phase === 'setup') {
      return `
        <div class="p-4">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold">${w.name}</h2>
            <button onclick="app.cancelWorkout()" class="px-3 py-1 rounded bg-gray-700">Cancel</button>
          </div>
          <p class="text-sm text-muted mb-4">${w.tool} — ${getWorkoutSummary(w)}</p>
          ${w.hasWeight ? `
            <label class="block mb-2">Enter weight</label>
            <div class="flex gap-2 items-center mb-4">
              <input id="presetWeight" type="number" step="0.5" min="0" class="bg-gray-700 p-3 rounded w-full" placeholder="0" value="${w.weight || ''}">
              <div class="text-sm text-gray-300 px-3">${w.weightUnit || 'kg'}</div>
            </div>` : ''}
          ${((w.tool || '').toLowerCase().includes('finger') || (w.name || '').toLowerCase().includes('finger') || (w.tool || '').toLowerCase().includes('hang') || (w.name || '').toLowerCase().includes('hang')) ? `
            <label class="block mb-2">Depth (mm)</label>
            <div class="flex gap-2 items-center mb-4">
              <input id="presetDepth" type="number" step="1" min="0" class="bg-gray-700 p-3 rounded w-full" placeholder="e.g. 20" value="${w.depth || ''}">
              <div class="text-sm text-gray-300 px-3">mm</div>
            </div>` : ''}
          <div class="flex gap-3">
            <button onclick="app.startFirstSet()" class="flex-1 bg-blue-600 py-3 rounded-lg text-lg hover:bg-blue-500">Start</button>
            <button onclick="app.cancelWorkout()" class="flex-1 bg-gray-700 py-3 rounded-lg text-lg hover:bg-gray-600">Cancel</button>
          </div>
        </div>
      `;
    }

    // active timer view
    const displayTime = Math.max(0, Math.ceil(ts.timeLeft || 0));
    let phaseLabel = ts.phase.includes('rest') ? 'REST' : (ts.phase.includes('work') ? 'WORK' : ts.phase.toUpperCase());
    if (w.tool === 'Finger block' && w.leftRightMode) {
      if (ts.phase === 'work-left') phaseLabel = 'WORK LEFT';
      else if (ts.phase === 'delay') phaseLabel = 'SWITCH';
      else if (ts.phase === 'work-right') phaseLabel = 'WORK RIGHT';
    }
    if (ts.phase === 'countdown') {
      phaseLabel = 'GET READY';
    }
    return `
      <div id="workoutFormWrap" class="p-4">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-2xl font-bold">${w.name}</h2>
          <button onclick="app.cancelWorkout()" class="px-3 py-1 rounded bg-gray-700">Cancel</button>
        </div>
        <div class="text-center py-12">
          <div class="text-9xl font-bold mb-4">${displayTime}</div>
          <div class="text-4xl mb-6">${phaseLabel}</div>
          <div class="mb-4 text-center">
            <div class="text-sm text-gray-400 mb-2">Set</div>
            <div class="text-2xl">${ts.currentSet + 1} of ${ts.totalSets}</div>
          </div>
          ${w.hasWeight ? `<div class="mb-4">Weight: ${ (ts.presetWeight !== undefined && ts.presetWeight !== null) ? ts.presetWeight : ((w.weight !== undefined && w.weight !== null) ? w.weight : 0) } ${w.weightUnit || 'kg'}</div>` : ''}
          ${((w.tool || '').toLowerCase().includes('finger') || (w.name || '').toLowerCase().includes('finger') || (w.tool || '').toLowerCase().includes('hang') || (w.name || '').toLowerCase().includes('hang')) ? `<div class="mb-4">Depth: ${ (ts.presetDepth !== undefined && ts.presetDepth !== null) ? ts.presetDepth : ((w.depth !== undefined && w.depth !== null) ? w.depth : '') } mm</div>` : ''}
          ${(w.type === 'repeaters') ? `
            <div class="mb-4 text-center">
              <div class="text-sm text-gray-400 mb-2">Cycle</div>
              <div class="text-2xl">${Math.min((ts.repeaterCounter || 0) + 1, w.repeaterCount || 0)} of ${w.repeaterCount || 0}</div>
            </div>` : ''}
          ${(w.type === 'reps' || w.type === 'both') ? `
            <div class="mb-4 text-center">
              <div class="text-sm text-gray-400 mb-2">Reps this set</div>
              <div class="flex items-center justify-center gap-3">
                <button onclick="app.addReps(-1)" class="px-3 py-2 rounded bg-gray-700">-</button>
                <div class="text-2xl">${ts.currentRep || 0}</div>
                <button onclick="app.addReps(1)" class="px-3 py-2 rounded bg-gray-700">+</button>
              </div>
            </div>` : ''}
          <div class="flex gap-2 justify-center">
            <button onclick="app.adjustTimer(-5)" class="px-4 py-2 rounded bg-gray-700">-5s</button>
            <button onclick="app.adjustTimer(5)" class="px-4 py-2 rounded bg-gray-700">+5s</button>
            <button onclick="app.skipTimer()" class="px-4 py-2 rounded bg-blue-600">Skip</button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const app = document.getElementById('app');
    if (this.state.activeWorkout) {
      // robustly resolve a session renderer: instance -> prototype -> lightweight fallback
      const sessionRenderer = (typeof this.renderWorkoutSession === 'function' && this.renderWorkoutSession)
        || (typeof App.prototype.renderWorkoutSession === 'function' && App.prototype.renderWorkoutSession)
        || (function () { return '<div class="p-4">Session UI unavailable</div>'; });
      try {
        app.innerHTML = sessionRenderer.call(this);
      } catch (e) {
        console.error('Error rendering workout session', e);
        app.innerHTML = '<div class="p-4">Session UI unavailable</div>';
      }
    } else {
      let content = this.renderNavBar();
      if (this.state.tab === 'workouts') content += this.renderWorkoutsTab();
      else if (this.state.tab === 'plan') {
        content += this.calendar.render();
      }
      else if (this.state.tab === 'log') content += this.logger.render();
      app.innerHTML = content;

      // insert real speaker button element into placeholder so it has listeners
      const speakerWrap = app.querySelector('#speakerWrap');
      if (speakerWrap) {
        const btn = renderSpeakerButton();
        speakerWrap.replaceWith(btn);
      }

      // Ensure the theme toggle icon reflects the currently-applied theme
      this.updateThemeIcon();

      if (this.state.tab === 'log') {
        import('./charts.js')
          .then(({ renderCharts }) => renderCharts(this.storage.get('log'), this.storage))
          .catch(err => console.error('Failed to load charts module', err));
      }
      if (this.state.tab === 'workouts' && this.state.showWorkoutForm) setupFormListeners();
    }
  }

  renderRemote() {
    const app = document.getElementById('app');
    const ts = this.state.timerState;
    if (this.state.activeWorkout && ts) {
      app.innerHTML = `
        <div class="flex items-center justify-center h-screen">
          <div class="text-center">
            <div class="text-9xl font-bold mb-4">${Math.ceil(ts.timeLeft)}</div>
            <div class="text-4xl">${ts.phase.includes('rest') ? 'REST' : 'WORK'}</div>
          </div>
        </div>
      `;
    } else {
      app.innerHTML = '<div class="p-4 text-center">No active workout</div>';
    }
  }

  renderNavBar() {
    const speakerPlaceholder = '<span id="speakerWrap"></span>';
    return `
      <nav class="flex items-center h-16 bg-gray-100 border-b border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 px-4 transition-colors">
        <div class="flex-1 flex justify-around">
          ${['plan','log','workouts'].map(t => `
            <button onclick="app.switchTab('${t}')"
                    class="flex-1 h-full text-lg font-medium ${this.state.tab === t ? 'tab-active' : ''}"
                    style="min-height:48px">
              ${t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          `).join('')}
        </div>
        <div class="flex items-center gap-3">
          <button onclick="app.toggleTheme()" class="p-2 rounded bg-gray-800 hover:bg-gray-700" aria-label="Toggle theme" title="Toggle theme">
            <svg class="w-5 h-5 block dark:hidden"><use href="#icon-sun"></use></svg>
            <svg class="w-5 h-5 hidden dark:block"><use href="#icon-moon"></use></svg>
          </button>
          <button onclick="app.showGlobalSettings()" class="p-2 rounded bg-gray-800 hover:bg-gray-700" title="App Settings" aria-label="App Settings">⚙️</button>
          ${speakerPlaceholder}
        </div>
      </nav>
    `;
  }

  renderWorkoutsTab() {
    if (this.state.showWorkoutForm) return this.renderWorkoutForm();
    const allWorkouts = this.storage.getUserWorkouts() || [];
    const activityEntries = this.storage.getActivityEntries ? (this.storage.getActivityEntries() || []) : (this.storage.getActivities() || []).map(a => ({ name: a, note: '' }));
    const activityNames = (activityEntries || []).map(a => (a.name || '').toLowerCase().trim());
    const workouts = allWorkouts.filter(w => {
      if (!w) return false;
      if (w.isActivity) return false;
      const name = (w.name || '').toLowerCase().trim();
      if (name && activityNames.includes(name)) return false;
      return true;
    });
    const activities = activityEntries.length ? activityEntries : [{ name: 'stretching', note: '' }, { name: 'rest', note: '' }, { name: 'recovery', note: '' }];
    return `
      <div class="p-4">
        <div class="flex justify-between items-center mb-4">
          <h1 class="text-2xl font-bold">Workout Library</h1>
          <div class="flex items-center gap-3">
            <button onclick="app.showCreateWorkout()"
                    class="bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-500"
                    style="min-height:48px">+ Create Workout</button>
          </div>
        </div>
        ${workouts.length === 0 ? `
          <div class="text-center py-12 text-gray-400">
            <p class="text-xl mb-2">No workouts yet</p>
            <p>Create your first custom workout</p>
          </div>` : `
          <div class="space-y-3">
            ${workouts.map(w => `
                  <div draggable="true" ondragstart="app.calendar.dragStart(event,'${w.id}')"
                    class="bg-white dark:bg-gray-800 p-4 rounded-lg cursor-move hover:bg-gray-50 dark:hover:bg-gray-700"
                   style="min-height:44px">
                <div class="flex justify-between items-start mb-2">
                  <div class="flex-1">
                    <h3 class="font-semibold text-lg">${w.name}</h3>
                    <p class="text-sm text-muted">${w.tool}</p>
                    <p class="text-sm text-muted">${getWorkoutSummary(w)}</p>
                  </div>
                </div>
                <div class="flex gap-2 mt-3">
                  <button onclick="app.startWorkout('${w.id}')"
                          class="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500 flex-1"
                          style="min-height:48px">Start</button>
                    <button onclick="app.editWorkout('${w.id}')"
                      class="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                          style="min-height:48px;min-width:48px">✏️</button>
                  <button onclick="app.deleteWorkout('${w.id}')"
                          class="bg-red-600 px-4 py-2 rounded hover:bg-red-500"
                          style="min-height:48px;min-width:48px">🗑️</button>
                </div>
              </div>`).join('')}
          </div>`}

        <div class="mt-6">
          <h2 class="text-lg font-semibold mb-2">Activities</h2>
          <div class="space-y-3">
            ${activities.map(a => `
              <div class="bg-white dark:bg-gray-800 p-4 rounded-lg cursor-move hover:bg-gray-50 dark:hover:bg-gray-700" style="min-height:44px">
                <div class="flex justify-between items-start mb-2">
                  <div class="flex-1">
                    <h3 class="font-semibold text-lg">${(a.name && (a.name.charAt(0).toUpperCase() + a.name.slice(1)))}</h3>
                    <p class="text-sm text-muted">${(a.note && a.note.length) ? a.note : 'Activity'}</p>
                  </div>
                </div>
                <div class="flex gap-2 mt-3">
                  <button onclick="app.startActivity('${a.name}')"
                          class="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500 flex-1"
                          style="min-height:48px">Start</button>
                  <button onclick="app.editActivity('${a.name}')"
                          class="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                          style="min-height:48px;min-width:48px">✏️</button>
                  <button onclick="app.removeActivityForWorkouts('${a.name}')"
                          class="bg-red-600 px-4 py-2 rounded hover:bg-red-500"
                          style="min-height:48px;min-width:48px">🗑️</button>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderWorkoutForm() {
    const ed = this.state.editingWorkout;
    return `
      <div class="p-4">
        <h1 class="text-2xl font-bold mb-4">${ed ? 'Edit Workout' : 'Create Workout'}</h1>
        <form id="workout-form" onsubmit="app.saveWorkout(event); return false;"
              class="bg-gray-800 p-6 rounded-lg space-y-4">
          <div>
            <label class="block mb-2 font-medium">Name *</label>
            <input type="text" name="name" value="${(ed && ed.name) || ''}"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px" required>
          </div>
          <div>
            <label class="flex items-center p-3 bg-gray-700 rounded cursor-pointer mt-2" style="min-height:48px">
              <input type="checkbox" name="isActivity" ${(ed && ed.isActivity) ? 'checked' : ''} class="mr-3">
              <span>Is an activity (no workout parameters required)</span>
            </label>
          </div>
          <div>
            <label class="block mb-2 font-medium">Tool *</label>
            <select name="tool" class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px" required>
              <option value="">Select tool</option>
              ${['Hangboard','Pull-up bar','Barbell','Dumbbell','Cable','Body-weight','Campus','Finger block','Other']
                .map(t => `<option value="${t}" ${(ed && ed.tool) === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div id="fingerBlockMode" style="display:${(ed && ed.tool) === 'Finger block' ? 'block' : 'none'}">
            <label class="flex items-center p-3 bg-gray-700 rounded cursor-pointer" style="min-height:48px">
              <input type="checkbox" name="leftRightMode" ${(ed && ed.leftRightMode) ? 'checked' : ''} class="mr-3">
              <span>Left / Right hand mode</span>
            </label>
          </div>
          <div>
            <label class="block mb-2 font-medium">Type *</label>
            <div class="space-y-2">
              ${WORKOUT_TYPES.map(t => `
                <label class="flex items-center p-3 bg-gray-700 rounded cursor-pointer" style="min-height:48px">
                  <input type="radio" name="type" value="${t.value}"
                         ${(ed && ed.type) === t.value ? 'checked' : ''} class="mr-3">
                  <span>${t.label}</span>
                </label>`).join('')}
            </div>
          </div>
          <div>
            <label class="block mb-2 font-medium">Sets *</label>
            <input type="number" name="sets" value="${(ed && ed.sets) || 1}" min="1"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px" required>
          </div>
          <div id="duration-input" style="display:${(ed && (ed.type==='duration'||ed.type==='both'))?'block':'none'}">
            <label class="block mb-2 font-medium">Duration (seconds)</label>
            <input type="number" name="duration" value="${(ed && ed.duration) || ''}" min="1"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
          </div>
          <div id="reps-input" style="display:${(ed && (ed.type==='reps'||ed.type==='both'))?'block':'none'}">
            <label class="block mb-2 font-medium">Reps</label>
            <input type="number" name="reps" value="${(ed && ed.reps) || ''}" min="1"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
          </div>
          <div id="repeaters-input" style="display:${(ed && ed.type==='repeaters')?'block':'none'}">
            <label class="block mb-2 font-medium">Number of repeater cycles</label>
            <input type="number" name="repeaterCount" value="${(ed && ed.repeaterCount) || 10}" min="1"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
            <label class="block mb-2 font-medium mt-3">Work time (seconds)</label>
            <input type="number" name="repeaterWork" value="${(ed && ed.repeaterWork) || 7}" min="1"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
            <label class="block mb-2 font-medium mt-3">Rest time (seconds)</label>
            <input type="number" name="repeaterRest" value="${(ed && ed.repeaterRest) || 3}" min="1"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
          </div>
          <div>
            <label class="flex items-center p-3 bg-gray-700 rounded cursor-pointer mb-3" style="min-height:48px">
              <input type="checkbox" name="hasWeight" ${(ed && ed.hasWeight) ? 'checked' : ''} class="mr-3">
              <span>Track added weight</span>
            </label>
            <div id="weight-inputs" style="display:${(ed && ed.hasWeight)?'block':'none'}" class="space-y-3 ml-4">
              <div>
                <label class="block mb-2 font-medium">Weight</label>
                <input type="number" name="weight" value="${(ed && ed.weight) || ''}" step="0.5" min="0"
                       class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
              </div>
              <div>
                <label class="block mb-2 font-medium">Weight Unit</label>
                <select name="weightUnit" class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
                  <option value="kg" ${(ed && ed.weightUnit) === 'kg' ? 'selected' : ''}>kg</option>
                  <option value="lbs" ${(ed && ed.weightUnit) === 'lbs' ? 'selected' : ''}>lbs</option>
                </select>
              </div>
            </div>
            <div id="depth-inputs" style="display:${(ed && (ed.tool==='Finger block' || ed.tool==='Hangboard')) ? 'block' : 'none'}" class="space-y-3 ml-4">
              <div>
                <label class="block mb-2 font-medium">Depth (mm)</label>
                <input type="number" name="depth" value="${(ed && (typeof ed.depth !== 'undefined' && ed.depth !== null)) ? ed.depth : ''}" step="1" min="0"
                       class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px">
              </div>
            </div>
          </div>
          <div id="rest-input">
            <label class="block mb-2 font-medium">Rest between sets (seconds) *</label>
                 <input type="number" name="rest" value="${(ed && ed.rest) || 180}" min="0"
                   class="w-full bg-gray-700 p-3 rounded text-lg" style="min-height:48px" required>
          </div>
          <div class="flex gap-3 pt-4">
            <button type="submit" class="flex-1 bg-blue-600 py-3 rounded-lg text-lg hover:bg-blue-500" style="min-height:48px">
              ${ed ? 'Update' : 'Create'} Workout
            </button>
            <button type="button" onclick="app.cancelWorkoutForm()"
                    class="flex-1 bg-gray-700 py-3 rounded-lg text-lg hover:bg-gray-600" style="min-height:48px">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;
  }
}

window.addEventListener('DOMContentLoaded', () => new App());

