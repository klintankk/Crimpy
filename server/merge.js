'use strict';

/*
 * 3-way merge for Crimpy training data.
 *
 * The client sends two snapshots: `base` (the canonical document it last
 * agreed with the server) and `local` (its current state). The server reads
 * `remote` (the current canonical document). A 3-way merge against the common
 * `base` lets us tell additions, edits and *deletions* apart — so a record the
 * user deleted on one device does not silently reappear from another, which a
 * plain union merge could not do.
 *
 * Pure module: no I/O, no git. Exported for unit testing.
 */

const crypto = require('crypto');

// Stable, key-sorted JSON so deep-equality is order-independent for objects.
function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort()
    .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
function eq(a, b) { return canon(a) === canon(b); }
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/*
 * 3-way merge of a plain map (key -> value); values are compared atomically.
 * Rules per key:
 *   - changed on one side only        -> that side's value
 *   - deleted on one side, untouched on the other -> dropped
 *   - deleted on one side, edited on the other    -> the edit wins
 *   - changed on both (conflict)       -> local wins (last-writer-wins)
 */
function merge3Map(base, local, remote) {
  base = base || {}; local = local || {}; remote = remote || {};
  const out = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    const inB = has(base, k), inL = has(local, k), inR = has(remote, k);
    const localChanged  = inL ? (!inB || !eq(local[k],  base[k])) : inB;
    const remoteChanged = inR ? (!inB || !eq(remote[k], base[k])) : inB;
    const deletedLocal  = inB && !inL;
    const deletedRemote = inB && !inR;

    if (deletedLocal && deletedRemote) continue;
    if (deletedLocal)  { if (remoteChanged) out[k] = remote[k]; continue; }
    if (deletedRemote) { if (localChanged)  out[k] = local[k];  continue; }

    if (inL && inR) {
      if (remoteChanged && !localChanged) out[k] = remote[k];
      else out[k] = local[k]; // local-changed, identical, or conflict -> local
    } else if (inL) {
      out[k] = local[k];   // added locally
    } else if (inR) {
      out[k] = remote[k];  // added remotely
    }
  }
  return out;
}

// Merge arrays of records by keying them into maps first, then back to arrays.
function merge3List(base, local, remote, keyFn) {
  const toMap = (arr) => {
    const m = {};
    (Array.isArray(arr) ? arr : []).forEach(item => {
      if (item == null) return;
      m[keyFn(item)] = item;
    });
    return m;
  };
  return Object.values(merge3Map(toMap(base), toMap(local), toMap(remote)));
}

// Stable key for a log entry: its id, else a deterministic content hash so the
// same legacy entry hashes identically on every side of the merge.
function logKey(e) {
  if (e && e.id) return String(e.id);
  return 'h:' + crypto.createHash('sha1').update(canon(e)).digest('hex').slice(0, 16);
}

// Atomic 3-way pick for small whole-value fields (e.g. progressCategories).
function pickAtomic(b, l, r, dflt) {
  const B = b === undefined ? dflt : b;
  const L = l === undefined ? dflt : l;
  const R = r === undefined ? dflt : r;
  const lc = !eq(L, B), rc = !eq(R, B);
  if (lc && !rc) return L;
  if (rc && !lc) return R;
  return L; // identical or conflict -> local
}

// Merge a whole Crimpy document.
function mergeDoc(base, local, remote) {
  base = base || {}; local = local || {}; remote = remote || {};
  const out = {
    plan:          merge3Map(base.plan, local.plan, remote.plan),
    planRecurring: merge3Map(base.planRecurring, local.planRecurring, remote.planRecurring),
    planCompleted: merge3Map(base.planCompleted, local.planCompleted, remote.planCompleted),
    planNotes:     merge3Map(base.planNotes, local.planNotes, remote.planNotes),
    prs:           merge3Map(base.prs, local.prs, remote.prs),
    userWorkouts:  merge3List(base.userWorkouts, local.userWorkouts, remote.userWorkouts, x => String(x.id)),
    log:           merge3List(base.log, local.log, remote.log, logKey),
    progressCategories: pickAtomic(base.progressCategories, local.progressCategories, remote.progressCategories, [])
  };
  // activities are derived from userWorkouts for backward compatibility.
  out.activities = out.userWorkouts.filter(w => w && w.isActivity).map(w => w.name);
  // newest-first, matching the app's existing log ordering.
  out.log.sort((a, b) => (((a && a.date) || '') < ((b && b.date) || '') ? 1 : -1));
  return out;
}

module.exports = { mergeDoc, merge3Map, merge3List, logKey, canon, eq };
