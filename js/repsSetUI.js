// js/repsSetUI.js
// Renders a reps-per-set UI for "reps only" workouts (no duration).
// Exports: renderRepsUI(timerState, app) -> HTML string

export function renderRepsUI(ts, app) {
  const w = ts.workout || {};
  const isFingerBoard = ((w.tool || '').toLowerCase().includes('finger') || (w.name || '').toLowerCase().includes('finger') || (w.tool || '').toLowerCase().includes('hang') || (w.name || '').toLowerCase().includes('hang'));
  const total = Math.max(1, ts.totalSets || 1);
  if (!Array.isArray(ts.inputs) || ts.inputs.length !== total) {
    ts.inputs = new Array(total).fill(w.reps || 0);
  }
  if (!Array.isArray(ts.repsChecked) || ts.repsChecked.length !== total) {
    ts.repsChecked = new Array(total).fill(false);
  }
  const inputs = ts.inputs;
  const checked = ts.repsChecked;

  return `
    <div class="p-4 flex flex-col items-center min-h-[60vh]">
      <div class="w-full flex items-center justify-between mb-3">
        <h2 class="text-xl md:text-2xl font-bold truncate">${w.name || 'Workout'}</h2>
        <button onclick="app.cancelWorkout()" class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100">Cancel</button>
      </div>
      <div class="w-full text-sm text-gray-400 mb-4 truncate">${w.tool || ''} ${w.reps ? `— ${w.reps} target reps` : ''}</div>
      ${w.hasWeight ? `
        <div class="mb-4">
            <label class="block text-sm text-gray-700 dark:text-gray-300 mb-2">Weight</label>
            <div class="flex items-center gap-2">
              <input id="repsWeight" type="number" step="0.5" min="0" value="${(typeof ts.presetWeight !== 'undefined' && ts.presetWeight !== null) ? ts.presetWeight : ((typeof w.weight !== 'undefined' && w.weight !== null) ? w.weight : 0)}" class="bg-white dark:bg-gray-700 p-2 rounded w-20 text-lg text-gray-900 dark:text-gray-100" onchange="app.repsUI_updateWeight(this.value)">
              <span class="text-sm text-gray-700 dark:text-gray-300">${w.weightUnit || 'kg'}</span>
            </div>
          </div>
      ` : ''}

      ${isFingerBoard ? `
        <div class="mb-4">
            <label class="block text-sm text-gray-700 dark:text-gray-300 mb-2">Depth (mm)</label>
            <div class="flex items-center gap-2">
              <input id="repsDepth" type="number" step="1" min="0" value="${(typeof ts.presetDepth !== 'undefined' && ts.presetDepth !== null) ? ts.presetDepth : ((typeof w.depth !== 'undefined' && w.depth !== null) ? w.depth : '')}" class="bg-white dark:bg-gray-700 p-2 rounded w-24 text-lg text-gray-900 dark:text-gray-100" onchange="app.repsUI_updateDepth(this.value)">
              <span class="text-sm text-gray-700 dark:text-gray-300">mm</span>
            </div>
          </div>
      ` : ''}

      <div class="w-full grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        ${Array.from({ length: total }).map((_, i) => `
          <div class="flex flex-col items-center gap-3 bg-white dark:bg-gray-900 p-3 rounded w-full">
            <div class="flex items-center gap-2 justify-center w-full">
              <button type="button" onclick="window.app.repsUI_addReps(${i}, -1)" class="w-9 h-9 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-lg font-semibold text-gray-900 dark:text-gray-100">-</button>
              <div class="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center text-lg md:text-2xl font-bold ${checked[i] ? 'bg-green-500 text-white border-green-500' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}" onclick="app.repsUI_onToggle(${i})">${inputs[i] || 0}</div>
              <button type="button" onclick="window.app.repsUI_addReps(${i}, 1)" class="w-9 h-9 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-lg font-semibold text-gray-900 dark:text-gray-100">+</button>
            </div>
            <div class="text-center w-full">
              <!-- removed 'Set n' label to improve fit on small screens -->
            </div>
          </div>
        `).join('')}
      </div>

      ${checked.every(Boolean) ? `
        <div class="mt-6 bg-white dark:bg-gray-800 p-4 rounded">
          <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">Workout Complete! Add a note (optional)</label>
          <textarea id="workoutNote" class="w-full bg-gray-100 dark:bg-gray-700 p-3 rounded text-sm mb-4 text-gray-900 dark:text-gray-100" rows="3" placeholder="How did it go?"></textarea>
          <button onclick="app.repsUI_finishWithNote()" class="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500">Finish Workout</button>
        </div>
      ` : ''}

    </div>
  `;
}
