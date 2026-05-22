// Tests for the lead-state-exclusion invariant: a lead is in exactly ONE of
// (active lead, booked, completed). If a completedJob exists for a leadId, no bookedJob
// with that same leadId should appear in the displayed Booked Jobs list, and the bookedJob
// must be removed from db.bookedJobs with a tombstone preventing cloud resurrection.
//
// This is the root-cause fix for the recurring Susan/Austin "in both booked and completed" bug.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// ─── PART A: WIRING ───
console.log('PART A: Verify the 3-layer wiring');

// A1: renderBooked filters out bookedJobs whose lead has a completedJob
check('renderBooked: builds _completedLeadIds set from db.completedJobs',
  /const _completedLeadIds=new Set\(\(db\.completedJobs\|\|\[\]\)/.test(indexHtml) &&
  /Build set of leadIds that have a completedJob/.test(indexHtml)
);

check('renderBooked: filter discards bookedJobs whose leadId is in _completedLeadIds',
  /if\(_completedLeadIds\.has\(j\.leadId\)\)return false;.*already completed.*hide/.test(indexHtml.replace(/\n/g,' '))
);

// A2: refreshFromSupabase has the lead-state exclusion self-heal
check('refreshFromSupabase: has LEAD-STATE EXCLUSION SELF-HEAL block',
  /LEAD-STATE EXCLUSION SELF-HEAL\b(?![ ]ON)/.test(indexHtml)
);
check('refreshFromSupabase: self-heal removes bookedJobs whose lead has a completedJob',
  /Lead-state self-heal: removed .* bookedJob\(s\) whose lead is already completed/.test(indexHtml)
);
check('refreshFromSupabase: self-heal creates tombstones',
  /_tombstones\[bj\.id\]=new Date\(\)\.toISOString\(\)/.test(indexHtml)
);
check('refreshFromSupabase: self-heal calls sbDelete for cloud removal',
  /_toRemove\.forEach\(bid=>\{try\{sbDelete\('booked_jobs',bid\)/.test(indexHtml)
);

// A3: loadDB has the same self-heal at app startup
check('loadDB: has LEAD-STATE EXCLUSION SELF-HEAL ON INITIAL LOAD',
  /LEAD-STATE EXCLUSION SELF-HEAL ON INITIAL LOAD/.test(indexHtml)
);
check('loadDB: initial-load self-heal logs the count',
  /Initial-load lead-state self-heal: removed .* bookedJob\(s\) whose lead is already completed/.test(indexHtml)
);
check('loadDB: writes tombstones to localStorage',
  /localStorage\.setItem\('movedesk_booked_tombstones',JSON\.stringify\(_ldTombstones\)\)/.test(indexHtml)
);

// ─── PART B: Behavior simulation ───
console.log('');
console.log('PART B: Simulate the exclusion logic against sample data');

// Replicate the renderBooked filter logic
function renderBookedFilter(db) {
  const _completedLeadIds = new Set((db.completedJobs || []).map(c => c.leadId).filter(Boolean));
  const seen = new Set();
  const filtered = (db.bookedJobs || []).filter(j => {
    if (!j.leadId) return true;
    if (j._draft) return false;
    if (_completedLeadIds.has(j.leadId)) return false;
    if (seen.has(j.leadId)) return false;
    seen.add(j.leadId);
    return true;
  });
  return filtered;
}

// Replicate the self-heal mutation logic
function runLeadStateSelfHeal(db) {
  const _completedLeadIds = new Set((db.completedJobs || []).map(c => c.leadId).filter(Boolean));
  let removed = 0;
  const toRemove = [];
  db.bookedJobs = (db.bookedJobs || []).filter(bj => {
    if (!bj || !bj.leadId) return true;
    if (_completedLeadIds.has(bj.leadId)) {
      toRemove.push(bj.id);
      removed++;
      return false;
    }
    return true;
  });
  return { removed, toRemove };
}

// B1: THE SUSAN SCENARIO — lead has both a bookedJob and a completedJob → bookedJob hidden
{
  const db = {
    leads: [{ id: 'SUSAN-LEAD', name: 'Susan Toder', status: 'Completed' }],
    bookedJobs: [{ id: 'SUSAN-BJ', leadId: 'SUSAN-LEAD', name: 'Susan Toder', date: '2026-06-01' }],
    completedJobs: [{ id: 'SUSAN-CJ', leadId: 'SUSAN-LEAD', name: 'Susan Toder', date: '2026-06-01' }]
  };
  const filtered = renderBookedFilter(db);
  check('Susan scenario: bookedJob does NOT appear in filtered list', filtered.length === 0);
}

// B2: Same scenario — self-heal permanently removes the duplicate from db.bookedJobs
{
  const db = {
    leads: [{ id: 'SUSAN-LEAD', name: 'Susan Toder', status: 'Completed' }],
    bookedJobs: [{ id: 'SUSAN-BJ', leadId: 'SUSAN-LEAD', name: 'Susan Toder', date: '2026-06-01' }],
    completedJobs: [{ id: 'SUSAN-CJ', leadId: 'SUSAN-LEAD', name: 'Susan Toder', date: '2026-06-01' }]
  };
  const result = runLeadStateSelfHeal(db);
  check('Self-heal: db.bookedJobs is empty after run', db.bookedJobs.length === 0);
  check('Self-heal: reported 1 removal', result.removed === 1);
  check('Self-heal: returned the bookedJob id for cloud delete', result.toRemove[0] === 'SUSAN-BJ');
}

// B3: Idempotent — running the heal twice does nothing the second time
{
  const db = {
    leads: [{ id: 'L1', status: 'Completed' }],
    bookedJobs: [{ id: 'BJ1', leadId: 'L1' }],
    completedJobs: [{ id: 'CJ1', leadId: 'L1' }]
  };
  runLeadStateSelfHeal(db);
  const second = runLeadStateSelfHeal(db);
  check('Idempotent: second run removes 0 records', second.removed === 0);
}

// B4: Different bookedJob whose lead has NO completed job → safe, kept
{
  const db = {
    leads: [
      { id: 'L1', status: 'Booked' },
      { id: 'L2', status: 'Completed' }
    ],
    bookedJobs: [
      { id: 'BJ1', leadId: 'L1', name: 'Alice', date: '2026-07-01' },
      { id: 'BJ2', leadId: 'L2', name: 'Bob', date: '2026-06-01' }
    ],
    completedJobs: [{ id: 'CJ2', leadId: 'L2', name: 'Bob', date: '2026-06-01' }]
  };
  const result = runLeadStateSelfHeal(db);
  check('Mixed: only the completed-lead bookedJob is removed', result.removed === 1);
  check('Mixed: still-active bookedJob is kept', db.bookedJobs.length === 1 && db.bookedJobs[0].id === 'BJ1');
}

// B5: BookedJob without leadId — left alone (legacy/orphan, can't determine status)
{
  const db = {
    leads: [],
    bookedJobs: [{ id: 'ORPHAN-BJ', name: 'Legacy Bob', date: '2026-06-01' }], // no leadId
    completedJobs: []
  };
  const result = runLeadStateSelfHeal(db);
  check('BookedJob without leadId is preserved (cannot determine state)', db.bookedJobs.length === 1 && result.removed === 0);
}

// B6: CompletedJob without leadId — doesn't trigger removal of bookedJobs
{
  const db = {
    leads: [{ id: 'L1', status: 'Booked' }],
    bookedJobs: [{ id: 'BJ1', leadId: 'L1' }],
    completedJobs: [{ id: 'CJ1', name: 'Some Name', date: '2026-06-01' }] // no leadId
  };
  const result = runLeadStateSelfHeal(db);
  check('CompletedJob without leadId: bookedJob NOT removed (no leadId match possible)',
    db.bookedJobs.length === 1 && result.removed === 0
  );
}

// B7: Drafts skipped by display filter (separate concern, but verified)
{
  const db = {
    leads: [],
    bookedJobs: [
      { id: 'BJ1', leadId: 'L1', _draft: true, name: 'Draft' },
      { id: 'BJ2', leadId: 'L2', name: 'Real', date: '2026-06-01' }
    ],
    completedJobs: []
  };
  const filtered = renderBookedFilter(db);
  check('Display filter: drafts hidden from display', filtered.length === 1 && filtered[0].id === 'BJ2');
}

// B8: Multiple bookedJobs for same completed lead — all removed
{
  const db = {
    leads: [{ id: 'L1', status: 'Completed' }],
    bookedJobs: [
      { id: 'BJ1', leadId: 'L1', name: 'Sue', date: '2026-06-01' },
      { id: 'BJ2', leadId: 'L1', name: 'Sue', date: '2026-06-01' } // duplicate
    ],
    completedJobs: [{ id: 'CJ1', leadId: 'L1' }]
  };
  const result = runLeadStateSelfHeal(db);
  check('Multiple duplicates for same completed lead: all removed', db.bookedJobs.length === 0 && result.removed === 2);
}

// B9: Display filter dedups by leadId for active leads (existing behavior preserved)
{
  const db = {
    leads: [],
    bookedJobs: [
      { id: 'BJ1', leadId: 'L1', name: 'Alice', date: '2026-06-01' },
      { id: 'BJ2', leadId: 'L1', name: 'Alice', date: '2026-06-01' } // dup
    ],
    completedJobs: []
  };
  const filtered = renderBookedFilter(db);
  check('Display filter: still dedups duplicate bookedJobs by leadId', filtered.length === 1);
}

// B10: Edge case — completedJob.leadId set but no matching lead exists
{
  const db = {
    leads: [],
    bookedJobs: [{ id: 'BJ1', leadId: 'GHOST-LEAD' }],
    completedJobs: [{ id: 'CJ1', leadId: 'GHOST-LEAD' }]
  };
  const result = runLeadStateSelfHeal(db);
  check('Ghost lead: heal still works (matches purely on leadId)', result.removed === 1);
}

// ─── PART C: The historical attempt patterns must still work ───
console.log('');
console.log('PART C: Historical fallbacks remain intact');

// C1: The existing dashboard cleanup at line 4116 still uses completedJobIds (bookedJobId match) — not removed
check('renderDashboard: still has completedJobIds (bookedJobId-based) cleanup',
  /completedJobIds=new Set\(\(db\.completedJobs\|\|\[\]\)\.map\(j=>j\.bookedJobId\)/.test(indexHtml)
);

// C2: The existing name+date fallback still works for legacy completedJobs without bookedJobId
check('renderDashboard: still has name+date fallback for legacy data',
  /completedNames=new Set\(\(db\.completedJobs\|\|\[\]\)\.map/.test(indexHtml)
);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
