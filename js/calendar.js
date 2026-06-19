// js/calendar.js
export class Calendar {
  constructor(storage) {
    this.storage = storage;
    this.plan = storage.get('plan') || {};
    this.completed = storage.get('planCompleted') || {};
    // recurring: map of JS weekday (0=Sunday..6=Saturday) -> array of workout ids
    this.recurring = storage.get('planRecurring') || {};
    // per-date notes (keyed by ISO date string)
    this.notes = storage.get('planNotes') || {};
    this.monthly = false;
    this.weekOffset = 0;
    this.monthOffset = 0;
  }

  toggleMonthly() {
    this.monthly = !this.monthly;
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  prevWeek() {
    this.weekOffset--;
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  nextWeek() {
    this.weekOffset++;
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  prevMonth() {
    this.monthOffset--;
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  nextMonth() {
    this.monthOffset++;
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  render() {
    if (this.monthly) {
      return this.renderMonthly();
    } else {
      return this.renderWeekly();
    }
  }

  renderWeekly() {
    // show the upcoming 7 days (today -> +6) in the Plan tab
    const week = this.getNext7Days(this.weekOffset);
    const weekStart = new Date(week[0]);
    const weekEnd = new Date(week[6]);
    const weekTitle = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return `
      <div class="p-4">
        <!-- title + plus on same line -->
          <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">${weekTitle}</h1>
          
          <div class="flex items-center gap-2">
            <button onclick="window.app.prevWeekForCalendar()" class="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">
              <svg class="w-4 h-4"><use href="#icon-chevron-left"></use></svg>
            </button>
            <button onclick="window.app.nextWeekForCalendar()" class="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">
              <svg class="w-4 h-4"><use href="#icon-chevron-right"></use></svg>
            </button>
            <button onclick="window.app.toggleMonthlyForCalendar()" class="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">Monthly</button>
            <button id="planPlusBtn" onclick="app.renderPlanEditor()" class="text-xl px-2 py-1 rounded hover:bg-gray-700" title="Add workout">＋</button>
          </div>
        </div>
        <div class="space-y-3">
          ${week.map(d => this.renderDay(d, false)).join('')}
        </div>
      </div>
    `;
  }

  renderMonthly() {
    const now = new Date();
    now.setMonth(now.getMonth() + this.monthOffset);
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push(date);
    }
    return `
      <div class="p-4">
        <!-- title + plus on same line -->
          <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">${monthName}</h1>
          
          <div class="flex items-center gap-2">
            <button onclick="window.app.prevMonthForCalendar()" class="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">
              <svg class="w-4 h-4"><use href="#icon-chevron-left"></use></svg>
            </button>
            <button onclick="window.app.nextMonthForCalendar()" class="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">
              <svg class="w-4 h-4"><use href="#icon-chevron-right"></use></svg>
            </button>
            <button onclick="window.app.toggleMonthlyForCalendar()" class="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">7-Day</button>
            <button id="planPlusBtn" onclick="app.renderPlanEditor()" class="text-xl px-2 py-1 rounded hover:bg-gray-700" title="Add workout">＋</button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          ${days.map(d => this.renderDay(d, true)).join('')}
        </div>
      </div>
    `;
  }

  /* ---------- modal picker (unchanged) ---------- */
  openPlanModal() {
    // show a sliding right-hand sidebar instead of a centered modal
    const date = this.getWeekDays()[0]; // today
    const workouts = this.storage.getUserWorkouts();
    const activities = this.storage.getActivities() || ['stretching', 'rest', 'recovery'];

    const wrap = document.createElement('div');
    wrap.id = 'planSidebarWrap';
    wrap.className = 'fixed inset-0 z-50';

    const overlay = document.createElement('div');
    overlay.id = 'planSidebarOverlay';
    overlay.className = 'absolute inset-0 bg-black bg-opacity-60';
    overlay.onclick = () => this.closePlanModal();

    const sidebar = document.createElement('aside');
    sidebar.id = 'planSidebar';
    sidebar.style.width = '360px';
    sidebar.style.maxWidth = '100%';
    sidebar.style.right = '0';
    sidebar.style.top = '0';
    sidebar.style.bottom = '0';
    sidebar.style.position = 'absolute';
    sidebar.style.background = '#1f2937'; // bg-gray-800
    sidebar.style.padding = '1rem';
    sidebar.style.overflow = 'auto';
    sidebar.style.transform = 'translateX(100%)';
    sidebar.style.transition = 'transform 280ms ease';

    sidebar.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Add to ${new Date(date).toLocaleDateString()}</h2>
        <button onclick="window.app.closePlanModalForCalendar()" class="text-xl px-2">✕</button>
      </div>
      <div class="space-y-2 max-h-[70vh] overflow-y-auto">
        ${workouts.length
          ? workouts.map(w => `
              <div draggable="true" ondragstart="window.app.dragStartForCalendar(event,'${w.id}')" ondragend="window.app.dragEndForCalendar(event)"
                   class="bg-white dark:bg-gray-700 rounded px-3 py-2 cursor-move hover:bg-gray-50 dark:hover:bg-gray-600 mb-2 text-gray-900 dark:text-gray-100">
                ${w.name}
              </div>`).join('')
          : '<p class="text-gray-400 text-sm">No workouts yet. Create one first.</p>'}
        <div class="mt-4 pt-4 border-t border-gray-600">
          <h3 class="text-sm font-semibold mb-2">Activities</h3>
          ${activities.map(activity => `
            <div draggable="true" ondragstart="window.app.dragStartActivityForCalendar(event,'${activity}')" ondragend="window.app.dragEndForCalendar(event)"
                 class="bg-white dark:bg-gray-700 rounded px-3 py-2 cursor-move hover:bg-gray-50 dark:hover:bg-gray-600 mb-2 text-gray-900 dark:text-gray-100">${activity.charAt(0).toUpperCase() + activity.slice(1)}</div>
          `).join('')}
        </div>
      </div>
      <div class="mt-4 text-right">
        <button onclick="window.app.closePlanModalForCalendar()" class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Done</button>
      </div>
    `;

    wrap.appendChild(overlay);
    wrap.appendChild(sidebar);
    document.body.appendChild(wrap);

    // trigger slide-in
    requestAnimationFrame(() => { sidebar.style.transform = 'translateX(0)'; });
  }

  closePlanModal() {
    // support both legacy modal id and new sidebar wrapper
    const wrap = document.getElementById('planSidebarWrap');
    if (wrap) {
      const sidebar = wrap.querySelector('#planSidebar');
      if (sidebar) {
        sidebar.style.transform = 'translateX(100%)';
        sidebar.addEventListener('transitionend', () => { if (wrap.parentNode) wrap.remove(); }, { once: true });
        // fallback removal
        setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, 400);
        return;
      }
      wrap.remove();
      return;
    }
    const m = document.getElementById('planModal');
    if (m) m.remove();
  }

  /* ---------- day card (supports recurring) ---------- */
  renderDay(date, showDate = true) {
    // include recurring workouts for this weekday
    const dow = new Date(date).getDay();
    const recurringIds = this.recurring[dow] || [];
    const dayIds = Array.from(new Set([...(recurringIds || []), ...((this.plan[date] || []))]));
    const workoutsAndActivities = dayIds.map(id => {
      const w = this.storage.getUserWorkouts().find(w => w.id === id);
      if (w) return { type: 'workout', data: w, id };
      if (id.startsWith('activity:')) return { type: 'activity', data: id.split(':')[1], id };
      return null;
    }).filter(Boolean);
    const dayName = showDate
      ? new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      : new Date(date).toLocaleDateString(undefined, { weekday: 'short' });

    return `
      <div class="day-card rounded-lg p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="font-medium day-label">${dayName}</div>
          <button onclick="window.app.editNoteForCalendar('${date}')" class="text-xs ml-2">📝</button>
        </div>
        ${this.notes[date] ? `<div class="text-xs day-note mb-2 truncate">📝 ${this.notes[date]}</div>` : ''}
           <div class="min-h-[40px] bg-gray-50 dark:bg-gray-900 rounded p-2 space-y-2"
             ondrop="window.app.dropForCalendar(event,'${date}')"
             ondragover="window.app.allowDropForCalendar(event)">
          ${workoutsAndActivities.length
              ? workoutsAndActivities.map(item => {
                  if (item.type === 'workout') {
                    const w = item.data;
                    return `<div draggable="true" ondragstart="window.app.dragStartForCalendar(event,'${item.id}')" ondragend="window.app.dragEndForCalendar(event)"
                      class="${this.completed[date] && this.completed[date].includes(item.id) ? 'bg-green-700' : 'bg-blue-700'} rounded px-2 py-1 text-sm cursor-move flex items-center justify-between">
                        <span onclick="app.startWorkout('${item.id}','${date}')" style="flex:1;cursor:pointer">${w.name}${recurringIds.includes(item.id) ? ' 🔁' : ''}</span>
                        <button onclick="event.stopPropagation(); window.app.removeFromDayForCalendar('${date}','${item.id}')"
                          class="ml-2 text-xs">✕</button>
                      </div>`;
                  } else if (item.type === 'activity') {
                    const activity = item.data;
                    return `<div draggable="true" ondragstart="window.app.dragStartActivityForCalendar(event,'${activity}')" ondragend="window.app.dragEndForCalendar(event)"
                      class="${this.completed[date] && this.completed[date].includes(item.id) ? 'bg-green-700' : 'bg-yellow-700'} rounded px-2 py-1 text-sm cursor-move flex items-center justify-between">
                      <span onclick="window.app.startActivity('${activity}','${date}')" style="flex:1;cursor:pointer">${activity.charAt(0).toUpperCase() + activity.slice(1)}${recurringIds.includes(item.id) ? ' 🔁' : ''}</span>
                      <button onclick="event.stopPropagation(); window.app.removeFromDayForCalendar('${date}','${item.id}')"
                        class="ml-2 text-xs">✕</button>
                    </div>`;
                  }
                  return '';
                }).join('')
            : ''}
        </div>
      </div>
    `;
  }

  getWeekDays() {
    const days = [];
    const today = new Date();
    // compute Monday of current week
    const dow = today.getDay(); // 0 (Sun) .. 6 (Sat)
    const diffToMonday = (dow + 6) % 7; // days since Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }

  // next 7 calendar dates starting from today (used by Plan tab)
  getNext7Days(offset = 0) {
    const days = [];
    const today = new Date();
    today.setDate(today.getDate() + offset * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }

  exportPlan() {
    try {
      const data = {
        plan: this.plan || {},
        planRecurring: this.recurring || {},
        planCompleted: this.completed || {},
        planNotes: this.notes || {}
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crimpd-plan-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export plan', e);
      alert('Export failed');
    }
  }

  importPlan() {
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
          if (parsed.plan) this.plan = parsed.plan;
          if (parsed.planRecurring) this.recurring = parsed.planRecurring;
          if (parsed.planCompleted) this.completed = parsed.planCompleted;
          if (parsed.planNotes) this.notes = parsed.planNotes;
          // persist
          this.storage.set('plan', this.plan);
          this.storage.set('planRecurring', this.recurring);
          this.storage.set('planCompleted', this.completed);
          this.storage.set('planNotes', this.notes);
          alert('Plan imported. The view will refresh.');
          if (window.app && typeof window.app.render === 'function') window.app.render();
        } catch (err) {
          console.error('Import plan failed', err);
          alert('Import failed: invalid file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  dragStart(ev, workoutId) {
    // set multiple dataTransfer types for cross-browser compatibility
    try {
      ev.dataTransfer.setData('text/plain', workoutId);
      ev.dataTransfer.setData('text', workoutId);
    } catch (e) {
      // ignore
    }
    console.debug('calendar.dragStart', workoutId);
    // while dragging from the sidebar, allow underlying calendar to receive drag events
    const overlay = document.getElementById('planSidebarOverlay');
    if (overlay) overlay.style.pointerEvents = 'none';
  }

  dragStartActivity(ev, activity) {
    const data = `activity:${activity}`;
    try {
      ev.dataTransfer.setData('text/plain', data);
      ev.dataTransfer.setData('text', data);
    } catch (e) {
      // ignore
    }
    console.debug('calendar.dragStartActivity', activity);
    // while dragging from the sidebar, allow underlying calendar to receive drag events
    const overlay = document.getElementById('planSidebarOverlay');
    if (overlay) overlay.style.pointerEvents = 'none';
  }

  // Activity management modal & helpers moved to `workouts.js` — calendar no longer provides them.

  drop(ev, date) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/plain') || ev.dataTransfer.getData('text') || ev.dataTransfer.getData('Text') || ev.dataTransfer.getData('text/html');
    console.debug('calendar.drop got id=', id, 'date=', date);
    if (!this.plan[date]) this.plan[date] = [];
    if (!this.plan[date].includes(id)) this.plan[date].push(id);
    try {
      this.storage.set('plan', this.plan);
      console.debug('calendar.drop saved plan', this.plan);
      console.debug('localStorage.plan=', localStorage.getItem('plan'));
    } catch (e) {
      console.error('calendar.drop failed to save plan', e);
    }
    // remove any sidebar/modal overlay synchronously so it can't block the UI
    const wrap = document.getElementById('planSidebarWrap');
    if (wrap && wrap.parentNode) {
      wrap.parentNode.removeChild(wrap);
    } else {
      const m = document.getElementById('planModal');
      if (m && m.parentNode) m.parentNode.removeChild(m);
    }
    window.app.render();
  }

  allowDrop(ev) { ev.preventDefault(); }

  /* ---------- editor drop (separate from modal sidebar) ---------- */
  dropInEditor(ev, date) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/plain') || ev.dataTransfer.getData('text') || ev.dataTransfer.getData('Text');
    if (!id) return;
    if (!this.plan[date]) this.plan[date] = [];
    if (!this.plan[date].includes(id)) this.plan[date].push(id);
    this.storage.set('plan', this.plan);
    // re-render the editor view
    if (window.app && typeof window.app.renderPlanEditor === 'function') window.app.renderPlanEditor();
  }

  /* ---------- full-page planner editor ---------- */
  renderEditor() {
    const week = this.getWeekDays();
    const workouts = (this.storage.getUserWorkouts() || []).filter(w => {
      if (!w) return false;
      if (w.isActivity) return false;
      if (w.id && String(w.id).startsWith('activity:')) return false;
      return true;
    });
    const activities = this.storage.getActivities() || ['stretching', 'rest', 'recovery'];
    return `
      <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-1 bg-white dark:bg-gray-800 rounded-lg p-4">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Workouts</h2>
          </div>
          <div class="space-y-2 max-h-[70vh] overflow-auto">
              ${workouts.length ? workouts.map(w => `
                <div draggable="true" ondragstart="window.app.dragStartForCalendar(event,'${w.id}')" ondragend="window.app.dragEndForCalendar(event)"
                   class="bg-white dark:bg-gray-700 rounded cursor-move hover:bg-gray-50 dark:hover:bg-gray-600 mb-2 text-gray-900 dark:text-gray-100"
                   style="padding:6px 8px;min-height:44px">${w.name}</div>`).join('')
              : '<p class="text-gray-400 text-sm">No workouts yet. Create one first.</p>'}
            <div class="mt-4 pt-4 border-t border-gray-600">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-semibold">Activities</h3>
              </div>
              ${activities.map(activity => `
                <div draggable="true" ondragstart="window.app.dragStartActivityForCalendar(event,'${activity}')" ondragend="window.app.dragEndForCalendar(event)"
                     onclick="window.app.startActivityFromCalendar('${activity}')"
                     class="bg-white dark:bg-gray-700 rounded cursor-move hover:bg-gray-50 dark:hover:bg-gray-600 mb-2 text-gray-900 dark:text-gray-100"
                     style="padding:6px 8px;min-height:44px">${activity.charAt(0).toUpperCase() + activity.slice(1)}</div>
              `).join('')}
            </div>
          </div>
          <div class="mt-4 flex flex-col items-stretch gap-2">
            <button onclick="window.app.saveEditorAndReturnForCalendar()" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500">Save</button>
          </div>
        </div>
        <div class="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${week.map(d => `
            <div class="bg-gray-800 rounded-lg p-3">
              <div class="flex items-center justify-between mb-2">
                <div class="font-medium">${new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <button onclick="window.app.editNoteForCalendar('${d}')" class="text-xs ml-2">📝</button>
              </div>
              ${this.notes[d] ? `<div class="text-xs text-gray-400 mb-2 truncate">📝 ${this.notes[d]}</div>` : ''}
              <div class="min-h-[80px] bg-gray-900 rounded p-2 space-y-2" ondrop="window.app.dropInEditorForCalendar(event,'${d}')" ondragover="window.app.allowDropForCalendar(event)">
                ${( () => {
                  const dow = new Date(d).getDay();
                  const recurringIds = this.recurring[dow] || [];
                  const dayIds = Array.from(new Set([...(recurringIds || []), ...((this.plan[d] || []))]));
                  return dayIds.map(id => {
                    const w = this.storage.getUserWorkouts().find(x => x.id === id);
                    if (w) {
                      const isRecurring = recurringIds.includes(id);
                      return `<div class="${this.completed[d] && this.completed[d].includes(id) ? 'bg-green-700' : 'bg-blue-700'} rounded px-2 py-1 text-sm flex items-center justify-between">
                                <span onclick="app.startWorkout('${id}','${d}')" style="flex:1;cursor:pointer">${w.name}${isRecurring ? ' 🔁' : ''}</span>
                                <div class="flex items-center gap-2">
                                  <button onclick="event.stopPropagation(); window.app.toggleRecurringForCalendar('${d}','${id}')" class="text-xs">${isRecurring ? 'Unrec' : 'Rec'}</button>
                                  <button onclick="event.stopPropagation(); window.app.removeFromDayForCalendar('${d}','${id}')" class="ml-2 text-xs">✕</button>
                                </div>
                              </div>`;
                    } else if (id.startsWith('activity:')) {
                      const activity = id.split(':')[1];
                      return `<div class="${this.completed[d] && this.completed[d].includes(id) ? 'bg-green-700' : 'bg-yellow-700'} rounded px-2 py-1 text-sm flex items-center justify-between">
                                <span onclick="window.app.startActivity('${activity}','${d}')" style="flex:1;cursor:pointer">${activity.charAt(0).toUpperCase() + activity.slice(1)}${recurringIds.includes(id) ? ' 🔁' : ''}</span>
                                <div class="flex items-center gap-2">
                                  <button onclick="event.stopPropagation(); window.app.toggleRecurringForCalendar('${d}','${id}')" class="text-xs">${recurringIds.includes(id) ? 'Unrec' : 'Rec'}</button>
                                  <button onclick="event.stopPropagation(); window.app.removeFromDayForCalendar('${d}','${id}')" class="ml-2 text-xs">✕</button>
                                </div>
                              </div>`;
                    }
                    return '';
                  }).join('');
                })()}
              </div>
            </div>`).join('')}
        </div>
      </div>
    `;
  }

  saveEditorAndReturn() {
    this.storage.set('plan', this.plan);
    this.storage.set('planRecurring', this.recurring);
    if (window.app && typeof window.app.switchTab === 'function') {
      window.app.switchTab('plan');
    } else {
      window.location.hash = '/';
    }
  }

  editNote(date) {
    const existing = this.notes[date] || '';
    this.showNoteModal(date, existing);
  }

  showNoteModal(date, existing='') {
    // remove any existing modal
    this.closeNoteModal();
    const wrap = document.createElement('div');
    wrap.id = 'planNoteModal';
    wrap.className = 'fixed inset-0 z-50 flex items-center justify-center';

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-black bg-opacity-60';
    overlay.onclick = () => this.closeNoteModal();

    const modal = document.createElement('div');
    modal.className = 'relative bg-gray-800 rounded-lg p-4 w-[min(720px,95%)] max-h-[80vh] overflow-auto';
    modal.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Note for ${new Date(date).toLocaleDateString()}</h3>
        <button id="closeNoteBtn" class="text-xl">✕</button>
      </div>
      <textarea id="planNoteTextarea" class="w-full bg-gray-900 p-3 rounded text-sm mb-4" rows="8" placeholder="How did the session go?">${(existing||'').replace(/</g,'&lt;')}</textarea>
      <div class="flex justify-end gap-3">
        <button id="deleteNoteBtn" class="px-4 py-2 rounded bg-red-600 hover:bg-red-500">Delete</button>
        <button id="saveNoteBtn" class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500">Save</button>
      </div>
    `;

    modal.querySelector('#closeNoteBtn').onclick = () => this.closeNoteModal();
    modal.querySelector('#saveNoteBtn').onclick = () => {
      const ta = document.getElementById('planNoteTextarea');
      const val = (ta.value || '').trim();
      if (val === '') {
        delete this.notes[date];
      } else {
        this.notes[date] = val;
      }
      this.storage.set('planNotes', this.notes);
      // also append to session log
      if (window.app && window.app.logger && typeof window.app.logger.addEntry === 'function') {
        const entry = {
          // use the note's day as the log date so it groups with workouts from the same day
          date: new Date(date).toISOString(),
          workoutId: null,
          // keep workoutName empty (don't show 'Note' or date in title)
          workoutName: '',
          bestValue: 0,
          isPR: false,
          // store the note text in summary so it appears directly in the log
          summary: val,
          details: []
        };
        try { window.app.logger.addEntry(entry); } catch (e) { console.error('Failed to add log entry for note', e); }
      }
      this.closeNoteModal();
      if (window.app && typeof window.app.render === 'function') window.app.render();
    };
    modal.querySelector('#deleteNoteBtn').onclick = () => {
      if (this.notes[date]) {
        if (!confirm('Delete this note?')) return;
        delete this.notes[date];
        this.storage.set('planNotes', this.notes);
      }
      this.closeNoteModal();
      if (window.app && typeof window.app.render === 'function') window.app.render();
    };

    wrap.appendChild(overlay);
    wrap.appendChild(modal);
    document.body.appendChild(wrap);
    // focus textarea
    requestAnimationFrame(() => { const ta = document.getElementById('planNoteTextarea'); if (ta) ta.focus(); });
  }

  closeNoteModal() {
    const ex = document.getElementById('planNoteModal');
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  toggleActivityCompleted(date, id) {
    this.completed[date] = this.completed[date] || [];
    const idx = this.completed[date].indexOf(id);
    if (idx === -1) this.completed[date].push(id);
    else this.completed[date].splice(idx, 1);
    this.storage.set('planCompleted', this.completed);
    // If an activity was just marked completed, prompt for an optional note
    try {
      if (idx === -1 && window.app && window.app.logger && typeof window.app.logger.addEntry === 'function') {
        const activity = id.startsWith('activity:') ? id.split(':')[1] : id;
        const addEntry = (note) => {
          const title = activity.charAt(0).toUpperCase() + activity.slice(1);
          const entry = {
            date: new Date(date).toISOString(),
            workoutId: null,
            workoutName: title,
            bestValue: 0,
            isPR: false,
            summary: note ? `${title} — ${note}` : title,
            details: []
          };
          try { window.app.logger.addEntry(entry); } catch (e) { console.error('Failed to add log entry for activity', e); }
        };

        if (window.app && typeof window.app.showPostWorkoutNoteModal === 'function') {
          try {
            window.app.showPostWorkoutNoteModal((note) => addEntry(note));
          } catch (e) {
            addEntry('');
          }
        } else {
          addEntry('');
        }
      }
    } catch (e) { /* ignore */ }

    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  markCompleted(date, id) {
    this.completed[date] = this.completed[date] || [];
    if (!this.completed[date].includes(id)) {
      this.completed[date].push(id);
      this.storage.set('planCompleted', this.completed);
    }
    if (window.app && typeof window.app.render === 'function') window.app.render();
  }

  removeFromDay(date, id) {
    this.plan[date] = (this.plan[date] || []).filter(i => i !== id);
    if (this.plan[date].length === 0) delete this.plan[date];
    this.storage.set('plan', this.plan);
    window.app.render();
  }
}
