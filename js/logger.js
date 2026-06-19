// js/logger.js
import { defaultKeywords } from './chartsConfig.js';

export class Logger {
  constructor(storage) {
    this.storage = storage;
    this.activeIdx = null;
  }

  addEntry(entry) {
    const log = this.storage.get('log');
    log.push(entry);
    this.storage.set('log', log);
  }

  editEntry(idx) {
    const log = this.storage.get('log') || [];
    const entry = log[idx];
    if (!entry) return;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    const entryDate = (entry.date && entry.date.slice && entry.date.slice(0,10)) ? entry.date.slice(0,10) : new Date().toISOString().slice(0,10);
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
        <h2 class="text-xl font-bold mb-4">Edit Log Entry</h2>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">Date</label>
            <input id="edit-log-date" type="date" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" value="${entryDate}">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Summary</label>
            <input id="edit-log-summary" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" value="${(entry.summary||'').replace(/"/g,'&quot;')}">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Details (one per line)</label>
            <textarea id="edit-log-details" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" rows="6">${(entry.details || []).join('\n')}</textarea>
          </div>
        </div>
        <div class="flex justify-end items-center mt-6">
          <button id="edit-cancel" class="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500 mr-2">Cancel</button>
          <button id="edit-save" class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#edit-cancel').onclick = () => modal.remove();
    modal.querySelector('#edit-save').onclick = () => {
      try {
        const d = modal.querySelector('#edit-log-date').value;
        const s = modal.querySelector('#edit-log-summary').value.trim();
        const detailsRaw = modal.querySelector('#edit-log-details').value || '';
        entry.date = d ? d : entry.date;
        entry.summary = s;
        entry.details = detailsRaw.split('\n').map(s => s.trim()).filter(Boolean);
        this.storage.set('log', log);
        modal.remove();
        if (window.app && typeof window.app.render === 'function') window.app.render();
      } catch (err) { console.error('Failed to save edited log entry', err); }
    };
  }

  deleteEntry(idx) {
    if (confirm('Delete this session?')) {
      const log = this.storage.get('log');
      log.splice(idx, 1);
      this.storage.set('log', log);
      window.app.render();
    }
  }

  toggleAccordion(idx) {
    const el = document.getElementById(`accordion-${idx}`);
    if (el) el.classList.toggle('open');
  }

  toggleActive(idx) {
    this.activeIdx = this.activeIdx === idx ? null : idx;
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  exportData() {
    const data = this.storage.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crimpd-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          this.storage.import(parsed);
          alert('Backup imported. The page will refresh.');
          window.app.render();
        } catch (err) {
          console.error('Import failed', err);
          alert('Import failed: invalid file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  clearHistory(skipConfirm = false) {
    if (!skipConfirm) {
      if (!confirm('Clear all session log entries? This cannot be undone.')) return;
    }
    this.storage.set('log', []);
    this.activeIdx = null;
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  showSettings() {
    const keywords = this.storage.get('chartKeywords') || defaultKeywords;
    const progressFilters = this.storage.get('progressFilters') || { pull: true, finger: true }; // legacy
    const log = this.storage.get('log') || [];
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

    // Collect unique workout names that match progress categories
    const uniqueWorkouts = new Set();
    log.forEach(entry => {
      if (new Date(entry.date).getTime() < cutoff) return;
      const wid = entry.workoutId;
      if (!wid) return;
      const name = entry.workoutName || '';
      if (!name) return;

      // Check if matches progress categories
      const lowerName = name.toLowerCase();
      let matched = false;
      for (const cat of ['pull', 'finger']) {
        if (progressFilters[cat] && keywords[cat].some(w => lowerName.includes(w.toLowerCase()))) {
          matched = true;
          break;
        }
      }
      if (matched) uniqueWorkouts.add(name);
    });

    const workoutList = Array.from(uniqueWorkouts).sort();

    // Progress categories (dynamic). Fallback to legacy pull/finger if none stored.
    let progressCategories = this.storage.get('progressCategories');
    if (!progressCategories || !Array.isArray(progressCategories) || !progressCategories.length) {
      progressCategories = [
        { title: 'Pull-ups', keywords: keywords.pull || [], enabled: progressFilters.pull !== false },
        { title: '20 mm fingerboard', keywords: keywords.finger || [], enabled: progressFilters.finger !== false }
      ];
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4 max-h-screen overflow-y-auto">
        <h2 class="text-xl font-bold mb-4">Chart Keywords</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Finger Training</label>
            <input id="finger-keywords" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" value="${keywords.finger.join(', ')}">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Pull-ups</label>
            <input id="pull-keywords" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" value="${keywords.pull.join(', ')}">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Board Climbing</label>
            <input id="board-keywords" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" value="${keywords.board.join(', ')}">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Climbing</label>
            <input id="climbing-keywords" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" value="${keywords.climbing.join(', ')}">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Strength & Conditioning</label>
            <input id="strength-keywords" class="w-full p-2 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100" value="${(keywords.strength||[]).join(', ')}">
          </div>
          <div class="border-t border-gray-700 pt-3">
            <div class="flex items-center justify-between mb-2">
              <div class="text-sm font-semibold">Progress Graph Categories</div>
              <button type="button" onclick="app.logger.addProgressCategoryRow()" class="text-sm px-2 py-1 bg-blue-600 rounded hover:bg-blue-500">+ Add</button>
            </div>
            <div id="progress-categories" class="space-y-3">
              ${progressCategories.map((cat, idx) => `
                <div class="progress-category-row bg-gray-700 rounded p-3 space-y-2">
                  <div class="flex items-center gap-2">
                    <input type="checkbox" class="category-enabled" ${cat.enabled === false ? '' : 'checked'}>
                    <input type="text" class="category-title flex-1 p-2 bg-gray-600 rounded text-gray-100" placeholder="Category title" value="${cat.title || ''}">
                  </div>
                  <input type="text" class="category-keywords w-full p-2 bg-gray-600 rounded text-gray-100" placeholder="Comma-separated keywords" value="${(cat.keywords || []).join(', ')}">
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="flex justify-between items-center mt-6">
          <div>
            <button onclick="(function(){ if(confirm('Export a backup before clearing history?')){ app.logger.exportData(); app.logger.clearHistory(true);} else if(confirm('Clear all session log entries? This cannot be undone.')){ app.logger.clearHistory(true);} })()" class="px-4 py-2 bg-red-600 rounded hover:bg-red-500 mr-2">Clear History</button>
          </div>
          <div>
            <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500 mr-2">Cancel</button>
            <button onclick="app.logger.saveSettings()" class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">Save</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  saveSettings() {
    const finger = document.getElementById('finger-keywords').value.split(',').map(s => s.trim()).filter(s => s);
    const pull = document.getElementById('pull-keywords').value.split(',').map(s => s.trim()).filter(s => s);
    const board = document.getElementById('board-keywords').value.split(',').map(s => s.trim()).filter(s => s);
    const climbing = document.getElementById('climbing-keywords').value.split(',').map(s => s.trim()).filter(s => s);
    const strength = (document.getElementById('strength-keywords') ? document.getElementById('strength-keywords').value.split(',').map(s => s.trim()).filter(s => s) : []);
    const keywords = { finger, pull, board, climbing };
    if (strength && strength.length) keywords.strength = strength;

    // Collect dynamic progress categories
    const progressCategories = [];
    const catRows = document.querySelectorAll('#progress-categories .progress-category-row');
    catRows.forEach(row => {
      const enabled = row.querySelector('.category-enabled')?.checked ?? true;
      const title = row.querySelector('.category-title')?.value?.trim() || '';
      const kwStr = row.querySelector('.category-keywords')?.value || '';
      const kw = kwStr.split(',').map(s => s.trim()).filter(Boolean);
      if (!title && kw.length === 0) return; // skip empty rows
      progressCategories.push({ title, keywords: kw, enabled });
    });

    this.storage.set('chartKeywords', keywords);
    this.storage.set('progressCategories', progressCategories);
    document.querySelector('.fixed').remove();
    // re-render
    window.app.render();
  }

  render() {
    const log = this.storage.get('log') || [];
    const logs = [...log].reverse();

    // group entries by ISO date (YYYY-MM-DD)
    const groups = {};
    logs.forEach((entry, idx) => {
      const originalIdx = log.length - 1 - idx;
      const dateKey = new Date(entry.date).toISOString().slice(0, 10);
      groups[dateKey] = groups[dateKey] || [];
      groups[dateKey].push({ entry, originalIdx });
    });

    const dateKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a)); // newest first

    return `
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">Session Log</h1>
          <button onclick="app.logger.showSettings()" class="text-gray-400 hover:text-white text-2xl" title="Chart Settings">⚙️</button>
        </div>

        

        <div id="stats-charts" class="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <h3 class="font-semibold mb-3">Weekly Volume</h3>
            <canvas id="volumeChart" width="400" height="200"></canvas>
          </div>
          <div class="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <h3 class="font-semibold mb-3">Progress (Last 90 Days)</h3>
            <canvas id="progressChart" width="400" height="200"></canvas>
          </div>
        </div>

        <div class="space-y-6">
          ${dateKeys.length === 0 ? '<p class="text-gray-500 text-center py-8">No sessions yet</p>' : ''}
          ${dateKeys.map(dateKey => {
            const items = groups[dateKey];
            const pretty = new Date(dateKey).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            return `
              <div>
                <div class="log-date">${pretty}</div>
                <div class="space-y-3">
                  ${items.map(item => {
                    const entry = item.entry;
                    // Normalize unit formatting for workout entries to "5 s  5 mm  5 kg"
                    let displaySummary = entry.summary || '';
                    let displayDetails = (entry.details || []).slice();
                    if (entry.workoutId) {
                      try {
                        const fmt = s => {
                          if (!s) return '';
                          let t = s;
                          // ensure single space between number and unit
                          t = t.replace(/\b(\d+)\s*s\b/gi, '$1 s');
                          t = t.replace(/\b(\d+)\s*mm\b/gi, '$1 mm');
                          t = t.replace(/\b(\d+)\s*kg\b/gi, '$1 kg');
                          t = t.replace(/\b(\d+)\s*lbs\b/gi, '$1 lbs');
                          // replace @ with space
                          t = t.replace(/\s*@\s*/g, ' ');
                          // collapse multiple spaces to single (temporary)
                          t = t.replace(/\s+/g, ' ').trim();
                          // insert double space between unit and next numeric group
                          t = t.replace(/(s|mm|kg|lbs) (\d+)/gi, '$1  $2');
                          return t;
                        };
                        displaySummary = fmt(displaySummary);
                        displayDetails = displayDetails.map(d => fmt(d));
                      } catch (e) { /* ignore formatting errors */ }
                    }
                    const originalIdx = item.originalIdx;
                    if (!entry.workoutId) {
                      // note entry: show note text directly (no accordion, no 'Note' title)
                      const noteText = (entry.summary || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
                      return `
                          <div onclick="app.logger.toggleActive(${originalIdx})" class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden p-4 flex items-start justify-between log-entry" style="cursor:pointer">
                            <div class="text-sm text-muted">${noteText}</div>
                            ${this.activeIdx === originalIdx ? `<div style="display:flex;align-items:center">
                                <button onclick="app.logger.editEntry(${originalIdx}); event.stopPropagation();" class="text-gray-400 hover:text-white ml-2 px-3 py-2" style="min-height:48px;min-width:48px">⚙️</button>
                                <button onclick="app.logger.deleteEntry(${originalIdx}); event.stopPropagation();" class="text-red-500 hover:text-red-400 ml-2 px-3 py-2" style="min-height:48px;min-width:48px">🗑️</button>
                              </div>` : ''}
                          </div>
                        `;
                    }
                    return `
                        <div class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden log-entry">
                          <div class="flex items-center">
                            <div onclick="app.logger.toggleAccordion(${originalIdx}); app.logger.toggleActive(${originalIdx})" class="flex-1 p-4 text-left log-entry-content" style="min-height:44px;cursor:pointer">
                                <div class="font-semibold">
                                  ${entry.workoutName} ${entry.isPR ? ' 🏆' : ''}
                                </div>
                                <div class="text-sm text-muted">${displaySummary}</div>
                                ${displayDetails && displayDetails.length ? `<div class="text-xs text-muted mt-1">${displayDetails.join(' · ')}</div>` : ''}
                            </div>
                            ${this.activeIdx === originalIdx ? `<div style="display:flex;align-items:center">
                                <button onclick="app.logger.editEntry(${originalIdx}); event.stopPropagation();" class="text-gray-400 hover:text-white ml-4 px-3 py-2" style="min-height:48px;min-width:48px">⚙️</button>
                                <button onclick="app.logger.deleteEntry(${originalIdx}); event.stopPropagation();" class="text-red-500 hover:text-red-400 ml-4 px-3 py-2" style="min-height:48px;min-width:48px">🗑️</button>
                              </div>` : ''}
                          </div>
                        <div id="accordion-${originalIdx}" class="accordion-content px-4">
                          <div class="pb-4 text-sm text-gray-600 dark:text-gray-300 space-y-1">
                            ${entry.details.map(d => `<div>• ${d}</div>`).join('')}
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  addProgressCategoryRow() {
    const container = document.getElementById('progress-categories');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'progress-category-row bg-gray-700 rounded p-3 space-y-2';
    div.innerHTML = `
      <div class="flex items-center gap-2">
        <input type="checkbox" class="category-enabled" checked>
        <input type="text" class="category-title flex-1 p-2 bg-gray-600 rounded text-gray-100" placeholder="Category title">
      </div>
      <input type="text" class="category-keywords w-full p-2 bg-gray-600 rounded text-gray-100" placeholder="Comma-separated keywords">
    `;
    container.appendChild(div);
  }
}
