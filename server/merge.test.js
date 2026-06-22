'use strict';

// Minimal dependency-free test runner for the merge engine.
const assert = require('assert');
const { mergeDoc, merge3Map } = require('./merge');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  -', name); }
  catch (e) { console.error('FAIL  -', name, '\n', e.message); process.exitCode = 1; }
}

test('add on local appears in merge', () => {
  const base = { userWorkouts: [{ id: 'a' }] };
  const local = { userWorkouts: [{ id: 'a' }, { id: 'b' }] };
  const remote = { userWorkouts: [{ id: 'a' }] };
  const out = mergeDoc(base, local, remote);
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id).sort(), ['a', 'b']);
});

test('add on remote (other device) is kept', () => {
  const base = { userWorkouts: [{ id: 'a' }] };
  const local = { userWorkouts: [{ id: 'a' }] };
  const remote = { userWorkouts: [{ id: 'a' }, { id: 'c' }] };
  const out = mergeDoc(base, local, remote);
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id).sort(), ['a', 'c']);
});

test('deletion on local propagates (does NOT reappear)', () => {
  const base = { userWorkouts: [{ id: 'a' }, { id: 'b' }] };
  const local = { userWorkouts: [{ id: 'a' }] };          // user deleted b
  const remote = { userWorkouts: [{ id: 'a' }, { id: 'b' }] }; // remote still has b
  const out = mergeDoc(base, local, remote);
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id), ['a']);
});

test('concurrent add elsewhere survives a local deletion', () => {
  const base = { userWorkouts: [{ id: 'a' }, { id: 'b' }] };
  const local = { userWorkouts: [{ id: 'a' }] };               // deleted b
  const remote = { userWorkouts: [{ id: 'a' }, { id: 'b' }, { id: 'd' }] }; // added d elsewhere
  const out = mergeDoc(base, local, remote);
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id).sort(), ['a', 'd']);
});

test('edit beats a concurrent delete', () => {
  const base = { userWorkouts: [{ id: 'a', reps: 5 }] };
  const local = {};                                   // deleted a
  const remote = { userWorkouts: [{ id: 'a', reps: 8 }] }; // edited a elsewhere
  const out = mergeDoc(base, local, remote);
  assert.deepStrictEqual(out.userWorkouts, [{ id: 'a', reps: 8 }]);
});

test('local edit wins a true conflict (LWW)', () => {
  const base = { prs: { x: 10 } };
  const local = { prs: { x: 20 } };
  const remote = { prs: { x: 30 } };
  const out = mergeDoc(base, local, remote);
  assert.strictEqual(out.prs.x, 20);
});

test('plan: deleting all ids for a date removes the date', () => {
  const base = { plan: { '2026-01-01': ['w1'] } };
  const local = { plan: {} };                          // removed the date
  const remote = { plan: { '2026-01-01': ['w1'] } };
  const out = mergeDoc(base, local, remote);
  assert.deepStrictEqual(out.plan, {});
});

test('log dedups by id and keeps both new entries', () => {
  const base = { log: [{ id: 'L1', date: '2026-01-01' }] };
  const local = { log: [{ id: 'L1', date: '2026-01-01' }, { id: 'L2', date: '2026-01-02' }] };
  const remote = { log: [{ id: 'L1', date: '2026-01-01' }, { id: 'L3', date: '2026-01-03' }] };
  const out = mergeDoc(base, local, remote);
  assert.deepStrictEqual(out.log.map(e => e.id), ['L3', 'L2', 'L1']); // newest first
});

test('legacy log entries without ids merge by content', () => {
  const e = { date: '2026-01-01', summary: 'Hangs' };
  const out = mergeDoc({ log: [e] }, { log: [e] }, { log: [e] });
  assert.strictEqual(out.log.length, 1);
});

test('activities are derived from merged userWorkouts', () => {
  const local = { userWorkouts: [{ id: 'activity:climbing', name: 'climbing', isActivity: true }, { id: 'w1', name: 'Pulls' }] };
  const out = mergeDoc({}, local, {});
  assert.deepStrictEqual(out.activities, ['climbing']);
});

test('empty base (first sync) unions both sides', () => {
  const out = mergeDoc(null, { userWorkouts: [{ id: 'a' }] }, { userWorkouts: [{ id: 'b' }] });
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id).sort(), ['a', 'b']);
});

test('merge3Map handles undefined inputs', () => {
  assert.deepStrictEqual(merge3Map(undefined, undefined, undefined), {});
});

console.log(`\n${passed} tests passed.`);
