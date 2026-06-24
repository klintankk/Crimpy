import assert from 'assert';
import { buildScheduledNotifications } from '../js/notifications.js';

const mk = (data) => ({ get: (k) => data[k] });
const now = new Date('2026-06-22T12:00:00'); // local noon
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok -', name); } catch(e){ console.error('FAIL -', name, e.message); process.exitCode=1; } };

const userWorkouts = [{id:'w1',name:'Hangs'},{id:'w2',name:'Pulls'},{id:'activity:climbing',name:'climbing',isActivity:true}];

t('plans a future day with both workout names', () => {
  const n = buildScheduledNotifications(mk({ plan:{'2026-06-25':['w1','w2']}, userWorkouts, notifyHour:9 }), now);
  assert.strictEqual(n.length, 1);
  assert.strictEqual(n[0].body, 'Hangs, Pulls');
  assert.strictEqual(new Date(n[0].schedule.at).getHours(), 9);
});

t('completed workouts are excluded; fully-done day is dropped', () => {
  const n = buildScheduledNotifications(mk({ plan:{'2026-06-25':['w1','w2']}, planCompleted:{'2026-06-25':['w1']}, userWorkouts, notifyHour:9 }), now);
  assert.strictEqual(n.length, 1);
  assert.strictEqual(n[0].body, 'Pulls');
  const none = buildScheduledNotifications(mk({ plan:{'2026-06-25':['w1']}, planCompleted:{'2026-06-25':['w1']}, userWorkouts, notifyHour:9 }), now);
  assert.strictEqual(none.length, 0);
});

t('skips a time already passed today, keeps a later time today', () => {
  const past = buildScheduledNotifications(mk({ plan:{'2026-06-22':['w1']}, userWorkouts, notifyHour:9 }), now);
  assert.strictEqual(past.length, 0, 'past 09:00 should be skipped');
  const later = buildScheduledNotifications(mk({ plan:{'2026-06-22':['w1']}, userWorkouts, notifyHour:15 }), now);
  assert.strictEqual(later.length, 1, '15:00 should schedule');
});

t('recurring weekday schedules within the 14-day window', () => {
  const dow = new Date('2026-06-24T00:00:00').getDay(); // a day inside the window
  const n = buildScheduledNotifications(mk({ planRecurring:{[dow]:['activity:climbing']}, userWorkouts, notifyHour:8 }), now);
  assert.ok(n.length >= 1, 'expected at least one recurring notification');
  assert.ok(n.every(x => x.body === 'Climbing'), 'activity name should be capitalized');
});

t('dedupes a workout that is both planned and recurring on the same day', () => {
  const dow = new Date('2026-06-25T00:00:00').getDay();
  const n = buildScheduledNotifications(mk({ plan:{'2026-06-25':['w1']}, planRecurring:{[dow]:['w1']}, userWorkouts, notifyHour:9 }), now);
  const day = n.find(x => new Date(x.schedule.at).toISOString().slice(0,10)==='2026-06-25');
  assert.strictEqual(day.body, 'Hangs');
});

console.log(`\n${passed} notification tests passed.`);
