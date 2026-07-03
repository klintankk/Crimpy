// Dependency-free tests for the client merge engine.
// Run: node test/merge.test.mjs
import assert from 'assert';
import { mergeDoc, merge3Map } from '../js/merge.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  -', name); }
  catch (e) { console.error('FAIL  -', name, '\n', e.message); process.exitCode = 1; }
}

test('add on local appears in merge', () => {
  const out = mergeDoc({ userWorkouts: [{ id: 'a' }] },
    { userWorkouts: [{ id: 'a' }, { id: 'b' }] }, { userWorkouts: [{ id: 'a' }] });
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id).sort(), ['a', 'b']);
});

test('add on remote (other device) is kept', () => {
  const out = mergeDoc({ userWorkouts: [{ id: 'a' }] },
    { userWorkouts: [{ id: 'a' }] }, { userWorkouts: [{ id: 'a' }, { id: 'c' }] });
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id).sort(), ['a', 'c']);
});

test('deletion on local propagates (does NOT reappear)', () => {
  const out = mergeDoc({ userWorkouts: [{ id: 'a' }, { id: 'b' }] },
    { userWorkouts: [{ id: 'a' }] }, { userWorkouts: [{ id: 'a' }, { id: 'b' }] });
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id), ['a']);
});

test('concurrent add elsewhere survives a local deletion', () => {
  const out = mergeDoc({ userWorkouts: [{ id: 'a' }, { id: 'b' }] },
    { userWorkouts: [{ id: 'a' }] }, { userWorkouts: [{ id: 'a' }, { id: 'b' }, { id: 'd' }] });
  assert.deepStrictEqual(out.userWorkouts.map(w => w.id).sort(), ['a', 'd']);
});

test('edit beats a concurrent delete', () => {
  const out = mergeDoc({ userWorkouts: [{ id: 'a', reps: 5 }] }, {},
    { userWorkouts: [{ id: 'a', reps: 8 }] });
  assert.deepStrictEqual(out.userWorkouts, [{ id: 'a', reps: 8 }]);
});

test('local edit wins a true conflict on a 3-way (schedule) collection', () => {
  const out = mergeDoc({ plan: { d: ['a'] } }, { plan: { d: ['local'] } }, { plan: { d: ['remote'] } });
  assert.deepStrictEqual(out.plan.d, ['local']);
});

test('log entries are NEVER dropped by a merge (history is safe)', () => {
  // base+remote have L1+L2 but local is missing L2 (e.g. stale/wiped local).
  // The old 3-way merge deleted L2 here — the union merge must keep it.
  const out = mergeDoc(
    { log: [{ id: 'L1', date: '2026-01-01' }, { id: 'L2', date: '2026-01-02' }] },
    { log: [{ id: 'L1', date: '2026-01-01' }] },
    { log: [{ id: 'L1', date: '2026-01-01' }, { id: 'L2', date: '2026-01-02' }] });
  assert.deepStrictEqual(out.log.map(e => e.id).sort(), ['L1', 'L2']);
});

test('prs keep the best (max) value and are never lost', () => {
  const out = mergeDoc({ prs: { x: 10 } }, { prs: { x: 20 } }, { prs: { x: 30 } });
  assert.strictEqual(out.prs.x, 30);
  const out2 = mergeDoc({ prs: { x: 30 } }, {}, { prs: { x: 30, y: 5 } });
  assert.strictEqual(out2.prs.y, 5);
});

test('plan: deleting all ids for a date removes the date', () => {
  const out = mergeDoc({ plan: { '2026-01-01': ['w1'] } }, { plan: {} },
    { plan: { '2026-01-01': ['w1'] } });
  assert.deepStrictEqual(out.plan, {});
});

test('log dedups by id and keeps both new entries (newest first)', () => {
  const out = mergeDoc(
    { log: [{ id: 'L1', date: '2026-01-01' }] },
    { log: [{ id: 'L1', date: '2026-01-01' }, { id: 'L2', date: '2026-01-02' }] },
    { log: [{ id: 'L1', date: '2026-01-01' }, { id: 'L3', date: '2026-01-03' }] });
  assert.deepStrictEqual(out.log.map(e => e.id), ['L3', 'L2', 'L1']);
});

test('legacy log entries without ids merge by content', () => {
  const e = { date: '2026-01-01', summary: 'Hangs' };
  const out = mergeDoc({ log: [e] }, { log: [e] }, { log: [e] });
  assert.strictEqual(out.log.length, 1);
});

test('activities are derived from merged userWorkouts', () => {
  const out = mergeDoc({}, { userWorkouts: [
    { id: 'activity:climbing', name: 'climbing', isActivity: true }, { id: 'w1', name: 'Pulls' }] }, {});
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
