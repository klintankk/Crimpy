// js/notifications.js
//
// Local notifications for "workout due today", powered by Capacitor's
// LocalNotifications plugin when running in the native Android app. On the
// plain web (no Capacitor) every function is a safe no-op.
//
// Strategy: each time the schedule changes we look 14 days ahead, find days
// that have planned or recurring workouts which aren't already completed, and
// (re)schedule one notification per such day at the user's chosen hour.

const ID_BASE = 7000;     // our notification id range: 7000..7099
const DAYS_AHEAD = 14;

function getLN() {
  return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
}

export function notificationsAvailable() {
  return !!getLN();
}

export async function ensureNotificationPermission() {
  const LN = getLN();
  if (!LN) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    return p.display === 'granted';
  } catch (e) {
    console.warn('notification permission check failed', e);
    return false;
  }
}

function clampHour(v) {
  const h = parseInt(v, 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 8; // default 08:00
}

function workoutName(id, userWorkouts) {
  if (typeof id === 'string' && id.startsWith('activity:')) {
    const n = id.slice('activity:'.length);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  const w = userWorkouts.find(x => x && x.id === id);
  return w ? w.name : 'Workout';
}

const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Build the list of notifications to schedule from current storage.
export function buildScheduledNotifications(storage, now = new Date()) {
  const plan = storage.get('plan') || {};
  const recurring = storage.get('planRecurring') || {};
  const completed = storage.get('planCompleted') || {};
  const userWorkouts = storage.get('userWorkouts') || [];
  const hour = clampHour(storage.get('notifyHour'));

  const notifications = [];
  const start = new Date(now); start.setHours(0, 0, 0, 0);

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = new Date(start); day.setDate(start.getDate() + d);
    const iso = isoDate(day);
    const dow = day.getDay();
    const ids = Array.from(new Set([...(plan[iso] || []), ...((recurring[dow]) || [])]));
    const done = new Set(completed[iso] || []);
    const due = ids.filter(id => !done.has(id));
    if (!due.length) continue;

    const at = new Date(day); at.setHours(hour, 0, 0, 0);
    if (at.getTime() <= now.getTime()) continue; // never schedule in the past

    const names = due.map(id => workoutName(id, userWorkouts));
    const body = names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4} more` : '');
    notifications.push({
      id: ID_BASE + d,
      title: names.length > 1 ? `${names.length} workouts due today` : 'Workout due today',
      body,
      schedule: { at, allowWhileIdle: true }
    });
  }
  return notifications;
}

export async function scheduleWorkoutNotifications(storage) {
  const LN = getLN();
  if (!LN) return { scheduled: 0, reason: 'no-native' };
  const granted = await ensureNotificationPermission();
  if (!granted) return { scheduled: 0, reason: 'no-permission' };

  const notifications = buildScheduledNotifications(storage);
  try {
    // cancel our previously-scheduled range, then (re)schedule
    const pending = await LN.getPending();
    const ours = (pending.notifications || []).filter(n => n.id >= ID_BASE && n.id < ID_BASE + 100);
    if (ours.length) await LN.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    if (notifications.length) await LN.schedule({ notifications });
  } catch (e) {
    console.warn('scheduleWorkoutNotifications failed', e);
    return { scheduled: 0, reason: 'error' };
  }
  return { scheduled: notifications.length };
}
