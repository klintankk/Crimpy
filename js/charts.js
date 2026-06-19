// js/charts.js
import { defaultKeywords } from './chartsConfig.js';

export { defaultKeywords };

export function renderCharts(log, storage) {
  setTimeout(() => {
    renderVolumeChart(log, storage);
    renderProgressChart(log, storage);
  }, 100);
}

function renderVolumeChart(log, storage) {
  const ctx = document.getElementById('volumeChart');
  if (!ctx || !storage) return;

  const categories = { finger: 0, pull: 0, board: 0, climbing: 0, strength: 0 };
  const cutoff     = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const keywords = storage.get('chartKeywords') || defaultKeywords;

  log.forEach(entry => {
    if (new Date(entry.date).getTime() < cutoff) return;
    // skip non-workout notes (no workoutId)
    const wid = entry.workoutId || '';
    if (typeof wid !== 'string') return;
    const name = (entry.workoutName || '').toLowerCase();
    let matched = false;
    for (const [cat, words] of Object.entries(keywords)) {
      if (words.some(w => name.includes(w.toLowerCase()))) {
        categories[cat]++;
        matched = true;
        break;
      }
    }
    if (!matched) categories.climbing++;
  });

    new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Finger Training', 'Pull-ups', 'Board Climbing', 'Climbing', 'Strength & Conditioning'],
      datasets: [{
        data: [categories.finger, categories.pull, categories.board, categories.climbing, categories.strength],
        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
      }]
    },
    options: {
      cutout: '55%',
      responsive: true,
      plugins: {
        legend: { labels: { color: '#f3f4f6' } }
      }
    }
  });
}

function renderProgressChart(log, storage) {
  const ctx   = document.getElementById('progressChart');
  if (!ctx || !storage) return;

  const keywords = storage.get('chartKeywords') || defaultKeywords;
  const storedCategories = storage.get('progressCategories');
  const categories = (storedCategories && Array.isArray(storedCategories) && storedCategories.length)
    ? storedCategories
    : [
        { title: 'Pull-ups', keywords: keywords.pull || [], enabled: true },
        { title: '20 mm fingerboard', keywords: keywords.finger || [], enabled: true }
      ];
  const cutoff       = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const dataByCategory = {};

  log.forEach(entry => {
    if (new Date(entry.date).getTime() < cutoff) return;
    const wid = entry.workoutId;
    if (!wid) return;
    const name = entry.workoutName || '';

    // classify using dynamic progress categories (first match wins)
    let matchedCategory = null;
    for (const cat of categories) {
      if (cat.enabled === false) continue;
      const words = cat.keywords || [];
      if (words.some(w => name.toLowerCase().includes((w || '').toLowerCase()))) {
        matchedCategory = cat;
        break;
      }
    }

    if (!matchedCategory) return;
    const catTitle = (matchedCategory && matchedCategory.title) ? matchedCategory.title : 'Other';
    if (!dataByCategory[catTitle]) {
      dataByCategory[catTitle] = { dateValues: {} };
    }

    const dateStr = new Date(entry.date).toLocaleDateString();
    const val = entry.bestValue || 0;
    if (!dataByCategory[catTitle].dateValues[dateStr] || val > dataByCategory[catTitle].dateValues[dateStr]) {
      dataByCategory[catTitle].dateValues[dateStr] = val;
    }
  });
  // Convert to arrays, sorted by date (per category)
  Object.keys(dataByCategory).forEach(title => {
    const dv = dataByCategory[title].dateValues;
    const sortedDates = Object.keys(dv).sort((a, b) => new Date(a) - new Date(b));
    dataByCategory[title].dates = sortedDates;
    dataByCategory[title].values = sortedDates.map(d => dv[d]);
  });

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  // Build datasets in the order of configured categories (fallback to keys order)
  const datasets = (categories || []).map((cat, i) => {
    const title = cat.title;
    if (!dataByCategory[title]) return null;
    return {
      label: title,
      data: dataByCategory[title].values,
      borderColor: colors[i % colors.length],
      fill: false
    };
  }).filter(Boolean);

  const allDates = [...new Set(Object.values(dataByCategory).flatMap(d => d.dates))].sort();

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: allDates,
      datasets
    },
    options: {
      responsive: true,
      scales: {
        y: {
          ticks: { color: '#f3f4f6' },
          grid: { color: '#374151' }
        },
        x: {
          ticks: { color: '#f3f4f6' },
          grid: { color: '#374151' }
        }
      },
      plugins: {
        legend: { labels: { color: '#f3f4f6' } }
      }
    }
  });
}
