const CACHE_KEY = 'climbApp_muted';
let muted = localStorage.getItem(CACHE_KEY) === 'true';
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function beep(freq = 800, duration = 120, vol = 0.15) {
  if (muted) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.value = vol;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration / 1000);
}

export function playSound() { beep(); }

export function isMuted() { return muted; }

export function muteToggle() {
  muted = !muted;
  localStorage.setItem(CACHE_KEY, muted);
  updateSpeakerIcon();
  return muted;
}

let $speaker = null;
function updateSpeakerIcon() {
  if (!$speaker) return;
  $speaker.textContent = muted ? '🔇' : '🔊';
}

export function renderSpeakerButton() {
  $speaker = document.createElement('button');
  $speaker.id = 'muteBtn';
  $speaker.title = 'Toggle sound';
    $speaker.className = 'text-xl leading-none px-2 py-1 rounded bg-gray-200 dark:bg-transparent hover:bg-gray-300 dark:hover:bg-gray-700';
  updateSpeakerIcon();
  $speaker.onclick = muteToggle;   // real toggle, no wrapper
  return $speaker;
}

export function showToast(msg) {
  const t = document.createElement('div');
    t.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-2 rounded shadow-lg';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

export function showConfetti() {
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'fixed w-2 h-2 rounded-full';
    p.style.background = colors[i % colors.length];
    p.style.left = '50%'; p.style.top = '40%'; p.style.pointerEvents = 'none';
    document.body.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 80;
    p.animate([{transform: 'translate(0,0)', opacity: 1},
               {transform: `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px)`, opacity: 0}],
              {duration: 800, easing: 'ease-out'});
    setTimeout(() => p.remove(), 800);
  }
}
