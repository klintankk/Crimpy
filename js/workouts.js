// js/workouts.js
export const WORKOUT_TYPES = [
  { value: 'duration',  label: 'Duration only' },
  { value: 'reps',      label: 'Reps only' },
  { value: 'repeaters', label: 'Repeaters (7s on / 3s off)' }
];

export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function validateWorkout(w) {
  if (!w.name?.trim()) return 'Name required';
  if (!w.tool) return 'Tool required';
  if (!w.sets || w.sets < 1) return 'Sets ≥ 1';
  if (!w.type) return 'Type required';

  if ((w.type === 'duration' || w.type === 'both') && (!w.duration || w.duration <= 0)) return 'Duration > 0';
  if ((w.type === 'reps' || w.type === 'both') && (!w.reps || w.reps <= 0)) return 'Reps > 0';
  if (w.type === 'repeaters' && (!w.repeaterCount || w.repeaterCount < 1)) return 'Repeater cycles ≥ 1';
  if (w.type !== 'reps' && (w.rest == null || w.rest < 0)) return 'Rest ≥ 0';
  return null;
}

export function getWorkoutSummary(w) {
  let s = `${w.sets} sets`;
  if (w.tool === 'Finger block' && w.leftRightMode) {
    const effectiveRest = Math.max(0, (w.rest || 120) - 5 - (w.duration || 30));
    s += ` × ${w.duration || 30}s per hand (5s switch) / ${effectiveRest}s rest`;
  } else if (w.type === 'duration') s += ` × ${w.duration}s`;
  else if (w.type === 'reps') s += ` × ${w.reps} reps`;
  else if (w.type === 'both') s += ` × ${w.reps} reps × ${w.duration}s`;
  else if (w.type === 'repeaters') s += ` × ${w.repeaterCount} cycles (7s/3s)`;
  if (w.hasWeight) s += ' + weight';
  if (!(w.tool === 'Finger block' && w.leftRightMode)) s += ` / ${w.rest}s rest`;
  return s;
}

export function setupFormListeners() {
  requestAnimationFrame(() => {
    const form = document.getElementById('workout-form');
    if (!form) return;

    form.addEventListener('submit', e => e.preventDefault());

    // toggle form fields when `isActivity` is checked
    const isActivityCb = form.querySelector('input[name="isActivity"]');
    if (isActivityCb) {
      const toggle = () => {
        const checked = isActivityCb.checked;
        // hide/show by known element IDs first
        ['duration-input','reps-input','repeaters-input','depth-inputs','rest-input','weight-inputs','fingerBlockMode']
          .forEach(id => {
            try {
              const el = document.getElementById(id);
              if (el) el.style.display = checked ? 'none' : '';
            } catch (e) { /* ignore */ }
          });

        // hide tool select wrapper and disable/clear validation when activity-only
        try {
          const toolEl = form.querySelector('select[name="tool"]');
          const toolWrap = toolEl ? toolEl.closest('div') : null;
          if (toolWrap) toolWrap.style.display = checked ? 'none' : '';
          if (toolEl) {
            toolEl.required = !checked;
            toolEl.disabled = checked;
            if (checked) toolEl.value = '';
          }
        } catch (e) { /* ignore */ }

        // hide the entire Type block (label + radios). Find the label that says 'Type' and hide its parent wrapper
        try {
          const labels = Array.from(form.querySelectorAll('label'));
          let typeLabel = labels.find(l => (l.textContent || '').toLowerCase().trim().startsWith('type')) || null;
          if (typeLabel) {
            const typeBlock = typeLabel.closest('div');
            if (typeBlock) typeBlock.style.display = checked ? 'none' : '';
            // also hide the following sibling that contains the radio list (in case the markup nests differently)
            try {
              let sibling = typeBlock.nextElementSibling;
              if (!sibling && typeBlock.querySelectorAll('input[name="type"]').length === 0) {
                // look for descendant radio container
                const radios = typeBlock.querySelector('div');
                if (radios) radios.style.display = checked ? 'none' : '';
              } else if (sibling) {
                sibling.style.display = checked ? 'none' : '';
              }
            } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore */ }

        // hide sets wrapper and disable validation
        try {
          const setsEl = form.querySelector('input[name="sets"]');
          const setsWrap = setsEl ? setsEl.closest('div') : null;
          if (setsWrap) setsWrap.style.display = checked ? 'none' : '';
          if (setsEl) { setsEl.required = !checked; setsEl.disabled = checked; }
        } catch (e) { /* ignore */ }

        // hide the 'Track added weight' label (checkbox) itself and disable weight inputs
        try {
          const hasWeightEl = form.querySelector('input[name="hasWeight"]');
          const weightLabel = hasWeightEl ? hasWeightEl.closest('label') : null;
          if (weightLabel) weightLabel.style.display = checked ? 'none' : '';
          if (hasWeightEl) { hasWeightEl.disabled = checked; hasWeightEl.checked = false; }
          const weightInputs = document.getElementById('weight-inputs');
          if (weightInputs) {
            weightInputs.style.display = checked ? 'none' : '';
            // disable contained inputs
            Array.from(weightInputs.querySelectorAll('input,select')).forEach(i => { i.disabled = checked; });
          }
        } catch (e) { /* ignore */ }

        try { document.body.classList.toggle('activity-only', checked); } catch (e) { /* ignore */ }
      };
      isActivityCb.addEventListener('change', toggle);
      // initialize
      try { toggle(); } catch (e) { /* ignore */ }
    }

    form.querySelectorAll('input[name="type"]').forEach(radio => {
      radio.addEventListener('change', e => {
        e.stopPropagation();
        const t = e.target.value;
        document.getElementById('duration-input').style.display = (t === 'duration' || t === 'both') ? 'block' : 'none';
        document.getElementById('reps-input').style.display    = (t === 'reps'    || t === 'both') ? 'block' : 'none';
        document.getElementById('repeaters-input').style.display = (t === 'repeaters') ? 'block' : 'none';
        // hide rest when 'reps' only and make it not required
        try {
          const restWrap = document.getElementById('rest-input');
          const restInput = form.querySelector('input[name="rest"]');
          if (restWrap) restWrap.style.display = (t === 'reps') ? 'none' : 'block';
          if (restInput) restInput.required = !(t === 'reps');
        } catch (err) { /* ignore */ }
        // auto-enable Track added weight for reps-only
        try {
          const hasWeight = form.querySelector('input[name="hasWeight"]');
          const weightInputs = document.getElementById('weight-inputs');
          if (t === 'reps') {
            if (hasWeight && !hasWeight.checked) {
              hasWeight.checked = true;
              if (weightInputs) weightInputs.style.display = 'block';
            }
          }
        } catch (err) { /* ignore */ }
      });
    });

    const cb = form.querySelector('input[name="hasWeight"]');
    if (cb) {
      cb.addEventListener('change', e => {
        e.stopPropagation();
        document.getElementById('weight-inputs').style.display = e.target.checked ? 'block' : 'none';
      });
    }

    const toolSelect = form.querySelector('select[name="tool"]');
    if (toolSelect) {
      toolSelect.addEventListener('change', e => {
        e.stopPropagation();
        const tool = e.target.value;
        document.getElementById('fingerBlockMode').style.display = (tool === 'Finger block') ? 'block' : 'none';
        // show depth input for Hangboard or Finger block
        try {
          const depthWrap = document.getElementById('depth-inputs');
          if (depthWrap) depthWrap.style.display = (tool === 'Finger block' || tool === 'Hangboard') ? 'block' : 'none';
        } catch (err) { /* ignore */ }
      });
      // initialize depth input visibility based on current selection
      try {
        const current = toolSelect.value;
        const depthWrapInit = document.getElementById('depth-inputs');
        if (depthWrapInit) depthWrapInit.style.display = (current === 'Finger block' || current === 'Hangboard') ? 'block' : 'none';
      } catch (err) { /* ignore */ }
    }
  });
}

// Activity management UI (previously in calendar.js) — expose via workouts module
export function showActivitySettings() {
  const activities = (window.app && window.app.storage) ? window.app.storage.getActivities() || ['stretching','rest','recovery'] : ['stretching','rest','recovery'];
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
      <h2 class="text-xl font-bold mb-4">Manage Activities</h2>
      <div class="space-y-2 mb-4">
        ${activities.map(activity => `
          <div class="flex items-center justify-between bg-gray-700 rounded px-3 py-2">
            <span>${activity.charAt(0).toUpperCase() + activity.slice(1)}</span>
            <button onclick="window.app.removeActivityForWorkouts('${activity}')" class="text-red-500 hover:text-red-400">✕</button>
          </div>
        `).join('')}
      </div>
      <div class="flex gap-2">
        <input id="newActivity" type="text" placeholder="New activity" class="flex-1 bg-white dark:bg-gray-700 p-2 rounded text-gray-900 dark:text-gray-100">
        <button onclick="window.app.addActivityForWorkouts()" class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">Add</button>
      </div>
      <div class="flex justify-end mt-6">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500 mr-2">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function addActivity() {
  const input = document.getElementById('newActivity');
  if (!input) return;
  const name = input.value.trim().toLowerCase();
  if (!name) return;
  const storage = (window.app && window.app.storage) ? window.app.storage : null;
  if (storage) storage.addActivity(name);
  input.value = '';
  const ex = document.querySelector('.fixed');
  if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  showActivitySettings();
}

export function removeActivity(activity) {
  const storage = (window.app && window.app.storage) ? window.app.storage : null;
  if (storage) storage.removeActivity(activity);
  const ex = document.querySelector('.fixed');
  if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  showActivitySettings();
}
