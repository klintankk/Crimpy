// js/ui.js
const THEME_KEY = 'themePreference';

/*
  Palette tokens used throughout CSS. Keep keys identical across palettes
  so runtime application is predictable. Comments explain intent for each
  token.
*/
const PALETTES = {
  dark: {
    // Page/background
    '--bg': '#0b1220',        // full-page deep navy
    '--surface': '#0f1724',   // nav / top surfaces

    // Cards and panels
    '--card-bg': '#2e3942',   // card / panel background (muted slate)
    '--inner': '#1f2937',     // inner box / panel inner background

    // Text
    '--text': '#e6eef8',      // primary text (off-white)
    '--muted': '#9aa6b2',     // subdued / secondary text

    // Actions & accents
    '--accent': '#2b6ef6',    // vivid blue accents
    '--btn-bg': '#15171dff',  // primary button background
    '--btn-text': '#ffffff',  // primary button text

    // Borders
    '--border': 'rgba(255,255,255,0.03)'
  },

  light: {
    // Page/background
    '--bg': '#f7fbff',        // full-page pale blue
    '--surface': '#60a5fa',   // nav / top surfaces

    // Cards and panels
    '--card-bg': '#60a5fa',   // card / panel background (Astro blue)
    '--inner': '#dbeafe',     // inner box / subtle blue tint

    // Text
    '--text': '#071633',      // primary text (very dark navy)
    '--muted': '#4b5563',     // subdued / secondary text

    // Actions & accents
    '--accent': '#1e6be6',    // vivid blue accents
    '--btn-bg': '#eaf4ff',    // primary button background
    '--btn-text': '#071633',  // primary button text

    // Borders
    '--border': '#e6eef8'
  }
};

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) {
    // Migrate any old 'glasto' value to 'light'
    if (stored === 'glasto') return 'light';
    return stored;
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(themeName) {
  const key = themeName === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[key] || PALETTES.light;

  // set Tailwind-compatible dark class only for dark palette
  if (key === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');

  // set data-theme attribute for diagnostics
  document.documentElement.setAttribute('data-theme', key);

  // apply variables inline so CSS picks them up immediately
  Object.keys(palette).forEach(k => document.documentElement.style.setProperty(k, palette[k]));

  // also set body background/text as an immediate fallback
  try {
    if (document && document.body) {
      document.body.style.background = palette['--bg'];
      document.body.style.color = palette['--text'];
    }
  } catch (e) { /* ignore */ }

  localStorage.setItem(THEME_KEY, key);
  return key;
}

export function initThemeFromStorage() {
  const theme = getStoredTheme();
  return applyTheme(theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  return applyTheme(next);
}

export async function loadSvgSprite(url, containerId = 'svg-sprite') {
  if (document.getElementById(containerId)) return;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svgText = await res.text();
    const wrapper = document.createElement('div');
    wrapper.id = containerId;
    wrapper.style.display = 'none';
    wrapper.innerHTML = svgText;
    document.body.prepend(wrapper);
  } catch (e) {
    console.error('Failed to load SVG sprite', e);
  }
}
