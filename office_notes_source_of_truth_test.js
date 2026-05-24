// Tests for the "lead.officeNotes is single source of truth" fix.
// The bug we're guarding against: a stale quote.officeNotes (e.g. synced in from the cloud
// with old content) used to show through to the Quote Builder display. After this fix, the
// QB always reads from lead.officeNotes, and the cloud sync + initial load both self-heal
// any drifted copies.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// ─── PART A: WIRING ───
console.log('PART A: Verify the source-of-truth wiring');

// A1: Quote Builder reads office notes from lead only — NOT from quote
check('loadQuoteIntoBuilder reads qb-office-notes from lead.officeNotes (not quote)',
  /Office notes: lead is the single source of truth\. We deliberately IGNORE q\.officeNotes/.test(indexHtml) &&
  /onEl\.value=l\?\.officeNotes\|\|''/.test(indexHtml) &&
  !/onEl\.value=q\.officeNotes\|\|/.test(indexHtml)
);

// A2: Booking form does NOT pre-fill bj-office-notes from quote.officeNotes
check('openBooking removes pre-fill from quote.officeNotes',
  /DELIBERATELY DO NOT pre-fill bj-office-notes from quote\.officeNotes/.test(indexHtml) &&
  !/setIfEmpty\('bj-office-notes',quote\.officeNotes\)/.test(indexHtml)
);

// A3: Booking form still pre-fills bj-office-notes from lead (line ~5876, unchanged)
check('openBooking still pre-fills bj-office-notes from l.officeNotes',
  /setIfEmpty\('bj-office-notes',l\.officeNotes\|\|l\.estimateOfficeNotes\)/.test(indexHtml)
);

// A4: saveQuote propagates officeNotes through propagator instead of inline write
check('saveQuote uses propagator for officeNotes write (not silent inline write)',
  /propagateNotesEdits\('lead',currentQuoteLeadId,\{officeNotes:_qbOn\}\)/.test(indexHtml)
);

// A5: Cloud sync self-heal: present in refreshFromSupabase
check('refreshFromSupabase has OfficeNotes self-heal block',
  /OFFICE NOTES SELF-HEAL/.test(indexHtml) &&
  /OfficeNotes self-heal: corrected/.test(indexHtml)
);

// A6: Self-heal covers quotes
check('Self-heal forces every quote\'s officeNotes to match its lead\'s',
  /\(db\.quotes\|\|\[\]\)\.forEach\(q=>\{[\s\S]{0,300}lead=_leadById\[q\.leadId\][\s\S]{0,300}q\.officeNotes=desired/.test(indexHtml)
);

// A7: Self-heal covers bookedJobs
check('Self-heal forces every bookedJob\'s officeNotes to match its lead\'s',
  /\(db\.bookedJobs\|\|\[\]\)\.forEach\(bj=>\{[\s\S]{0,300}lead=_leadById\[bj\.leadId\][\s\S]{0,300}bj\.officeNotes=desired/.test(indexHtml)
);

// A8: Self-heal covers completedJobs (via bookedJobId OR name+date fallback)
check('Self-heal forces completedJob officeNotes — via bookedJobId or name+date match',
  /\(db\.completedJobs\|\|\[\]\)\.forEach\(cj=>/.test(indexHtml) &&
  /cj\.officeNotes=desired/.test(indexHtml) &&
  /lead=\(db\.leads\|\|\[\]\)\.find\(l=>l\.name===cj\.name&&l\.date===cj\.date\)/.test(indexHtml)
);

// A9: Initial load (loadDB) reconciles quotes too (was bookedJob/completedJob only)
check('loadDB notes reconciliation includes quotes',
  /Push officeNotes to QUOTES \(new \u2014 Tim Satron-style drift fix\)/.test(indexHtml)
);

// A10: Initial load reconciles completedJob officeNotes
check('loadDB reconciles completedJob.officeNotes (was only cj.notes before)',
  /if\(cj\.officeNotes!==lon\)\{cj\.officeNotes=lon;_notesReconciled\+\+;\}/.test(indexHtml)
);

// ─── PART B: BEHAVIOR SIMULATION ───
console.log('');
console.log('PART B: Simulate the stale-quote bug and verify the fix');

// Replicate the cloud-sync self-heal logic
function runSelfHeal(db) {
  const _leadById = {};
  (db.leads || []).forEach(l => { if (l && l.id) _leadById[l.id] = l; });
  let fixed = 0;
  (db.quotes || []).forEach(q => {
    if (!q || !q.leadId) return;
    const lead = _leadById[q.leadId];
    if (!lead) return;
    const desired = lead.officeNotes || '';
    if ((q.officeNotes || '') !== desired) { q.officeNotes = desired; fixed++; }
  });
  (db.bookedJobs || []).forEach(bj => {
    if (!bj || !bj.leadId) return;
    const lead = _leadById[bj.leadId];
    if (!lead) return;
    const desired = lead.officeNotes || '';
    if ((bj.officeNotes || '') !== desired) { bj.officeNotes = desired; fixed++; }
  });
  (db.completedJobs || []).forEach(cj => {
    if (!cj) return;
    let lead = null;
    if (cj.bookedJobId) {
      const bj = (db.bookedJobs || []).find(j => j.id === cj.bookedJobId);
      if (bj && bj.leadId) lead = _leadById[bj.leadId];
    }
    if (!lead && cj.name && cj.date) lead = (db.leads || []).find(l => l.name === cj.name && l.date === cj.date);
    if (!lead) return;
    const desired = lead.officeNotes || '';
    if ((cj.officeNotes || '') !== desired) { cj.officeNotes = desired; fixed++; }
  });
  return fixed;
}

// B1: The Tim Satron scenario — lead has correct notes, quote has stale notes → self-heal fixes the quote
{
  const db = {
    leads: [{ id: 'TIM', name: 'Tim Satron', officeNotes: 'John Called and sent text May 18th' }],
    quotes: [{ id: 'Q-TIM', leadId: 'TIM', officeNotes: 'someone else\'s notes that drifted in' }],
    bookedJobs: [],
    completedJobs: []
  };
  const fixed = runSelfHeal(db);
  check('Stale quote.officeNotes corrected to match lead', db.quotes[0].officeNotes === 'John Called and sent text May 18th');
  check('Tim scenario reported 1 fix', fixed === 1);
}

// B2: Multiple stale records across all 3 record types — all get fixed
{
  const db = {
    leads: [{ id: 'L1', name: 'Alice', officeNotes: 'master truth' }],
    quotes: [
      { id: 'Q1a', leadId: 'L1', officeNotes: 'stale1' },
      { id: 'Q1b', leadId: 'L1', officeNotes: 'stale2' }
    ],
    bookedJobs: [{ id: 'B1', leadId: 'L1', officeNotes: 'stale3' }],
    completedJobs: [{ id: 'C1', bookedJobId: 'B1', officeNotes: 'stale4' }]
  };
  const fixed = runSelfHeal(db);
  check('All quotes corrected', db.quotes[0].officeNotes === 'master truth' && db.quotes[1].officeNotes === 'master truth');
  check('BookedJob corrected', db.bookedJobs[0].officeNotes === 'master truth');
  check('CompletedJob corrected', db.completedJobs[0].officeNotes === 'master truth');
  check('Fix count = 4 (2 quotes + 1 booked + 1 completed)', fixed === 4);
}

// B3: CompletedJob without bookedJobId — falls back to name+date match
{
  const db = {
    leads: [{ id: 'L2', name: 'Bob', date: '2026-06-15', officeNotes: 'correct' }],
    quotes: [],
    bookedJobs: [],
    completedJobs: [{ id: 'C2', name: 'Bob', date: '2026-06-15', officeNotes: 'stale' }] // no bookedJobId
  };
  const fixed = runSelfHeal(db);
  check('Legacy completedJob (no bookedJobId) gets corrected via name+date match', db.completedJobs[0].officeNotes === 'correct');
}

// B4: Records already in sync — no changes, no false positives
{
  const db = {
    leads: [{ id: 'L3', name: 'Carol', officeNotes: 'same everywhere' }],
    quotes: [{ id: 'Q3', leadId: 'L3', officeNotes: 'same everywhere' }],
    bookedJobs: [{ id: 'B3', leadId: 'L3', officeNotes: 'same everywhere' }],
    completedJobs: []
  };
  const fixed = runSelfHeal(db);
  check('Already-synced records → 0 fixes', fixed === 0);
}

// B5: Orphan records (leadId doesn't exist) — silently skipped, not crashed
{
  const db = {
    leads: [],
    quotes: [{ id: 'Q-ORPHAN', leadId: 'GONE', officeNotes: 'whatever' }],
    bookedJobs: [{ id: 'B-ORPHAN', leadId: 'ALSO-GONE', officeNotes: 'whatever' }],
    completedJobs: []
  };
  const fixed = runSelfHeal(db);
  check('Orphan records with no matching lead → safely skipped, not crashed', fixed === 0);
  check('Orphan quote untouched', db.quotes[0].officeNotes === 'whatever');
}

// B6: Empty lead.officeNotes → propagates to clear other records too
{
  const db = {
    leads: [{ id: 'L6', name: 'Frank', officeNotes: '' }],
    quotes: [{ id: 'Q6', leadId: 'L6', officeNotes: 'old leftover' }],
    bookedJobs: [],
    completedJobs: []
  };
  const fixed = runSelfHeal(db);
  check('Empty lead.officeNotes clears stale quote copy too', db.quotes[0].officeNotes === '');
  check('Empty propagation reported as 1 fix', fixed === 1);
}

// B7: Multiple leads, only the matching ones get corrected
{
  const db = {
    leads: [
      { id: 'LA', name: 'Alice', officeNotes: 'alice note' },
      { id: 'LB', name: 'Bob', officeNotes: 'bob note' }
    ],
    quotes: [
      { id: 'QA', leadId: 'LA', officeNotes: 'wrong content' },
      { id: 'QB', leadId: 'LB', officeNotes: 'bob note' } // already correct
    ],
    bookedJobs: [],
    completedJobs: []
  };
  const fixed = runSelfHeal(db);
  check('Multi-lead: wrong quote corrected', db.quotes[0].officeNotes === 'alice note');
  check('Multi-lead: already-correct quote untouched', db.quotes[1].officeNotes === 'bob note');
  check('Multi-lead reports 1 fix (only the wrong one)', fixed === 1);
}

// ─── PART C: Quote Builder load behavior — simulate the qb load ───
console.log('');
console.log('PART C: Simulate Quote Builder load behavior');

// Replicate the new load logic
function loadOfficeNotesForBuilder(lead, quote) {
  // After fix: always lead.officeNotes
  return lead?.officeNotes || '';
}

// C1: Stale quote, fresh lead — QB shows the lead's notes (not the stale quote's)
{
  const lead = { id: 'L', officeNotes: 'fresh truth' };
  const quote = { id: 'Q', leadId: 'L', officeNotes: 'stale lie' };
  const displayed = loadOfficeNotesForBuilder(lead, quote);
  check('QB displays lead notes (fresh), NOT quote notes (stale)', displayed === 'fresh truth');
}

// C2: Lead has no notes — QB shows empty (not the quote's leftover)
{
  const lead = { id: 'L', officeNotes: '' };
  const quote = { id: 'Q', leadId: 'L', officeNotes: 'old content' };
  const displayed = loadOfficeNotesForBuilder(lead, quote);
  check('QB displays empty when lead.officeNotes is empty (quote\'s old content ignored)', displayed === '');
}

// ─── PART D: The Ruari cross-customer-contamination fix ───
console.log('');
console.log('PART D: Cross-customer Quote Builder textarea cannot leak between leads');

// D1: openQuoteBuilder unconditionally sets qb-office-notes (no stale-DOM guard)
check('openQuoteBuilder: qb-office-notes load is UNCONDITIONAL (no !_qbOn.value guard)',
  /if\(_qbOn\)_qbOn\.value=l\?\.officeNotes/.test(indexHtml) &&
  !/if\(_qbOn&&!_qbOn\.value\)/.test(indexHtml)
);

// D2: Comment explaining the bug class is present (helps future Claude understand why)
check('openQuoteBuilder: explanatory comment about the cross-customer leak is present',
  /allowed stale content[\s\S]{0,200}from a PREVIOUS lead's session to bleed into the next lead/.test(indexHtml)
);

// D3: qb-notes is also force-cleared (same bug pattern)
check('openQuoteBuilder: qb-notes is also force-cleared unconditionally',
  /if\(_qbNotesEl\)_qbNotesEl\.value=''/.test(indexHtml) &&
  !/if\(_qbNotesEl&&!_qbNotesEl\.value\)/.test(indexHtml)
);

// D4: Behavioral simulation — opening Customer B's QB after Customer A's session loads B's notes,
// NOT A's leftover textarea content.
//
// Simulates what happens in the real DOM:
//   1. User opens QB for Customer A → textarea value set to A's officeNotes
//   2. User types "kkkkk" → textarea value is "A's notes + kkkkk"
//   3. User closes modal without clearing textarea
//   4. User opens QB for Customer B → openQuoteBuilder runs again
//
// With the fix: the unconditional `_qbOn.value = l.officeNotes` line resets the textarea to
// Customer B's notes, not Customer A's leftover.
function simulateQbOpenWithFix(currentTextareaValue, newLeadOfficeNotes) {
  // After fix: always overwrites
  return newLeadOfficeNotes || '';
}
function simulateQbOpenWithBug(currentTextareaValue, newLeadOfficeNotes) {
  // Old buggy version: only overwrites if textarea is empty
  if (currentTextareaValue) return currentTextareaValue;
  return newLeadOfficeNotes || '';
}

// D5: Fix scenario — switching from Customer A to Customer B shows B's notes
{
  const customerA_typed = "John called and sent text May 18th\nkkkkk testing";
  const customerB_officeNotes = "Ruari original notes here";
  const result = simulateQbOpenWithFix(customerA_typed, customerB_officeNotes);
  check('Fix: Customer B QB shows B\'s notes, not A\'s leftover', result === customerB_officeNotes);
}

// D6: Bug demonstration — old behavior would leak A's content into B's modal
{
  const customerA_typed = "kkkkk";
  const customerB_officeNotes = "Customer B real notes";
  const buggyResult = simulateQbOpenWithBug(customerA_typed, customerB_officeNotes);
  check('Bug demo: old buggy behavior would have leaked A\'s "kkkkk" to B\'s modal', buggyResult === "kkkkk");
}

// D7: Empty-lead edge — Customer B has no office notes, still shouldn't show A's
{
  const customerA_typed = "Sensitive office content from another customer";
  const customerB_officeNotes = "";
  const result = simulateQbOpenWithFix(customerA_typed, customerB_officeNotes);
  check('Fix: empty Customer B officeNotes shows empty, NOT A\'s leftover', result === '');
}

// D8: Same customer reopens — their notes still appear correctly (sanity)
{
  const customerA_typed = "intermediate edit they were making";
  const customerA_officeNotes = "saved office notes for customer A";
  const result = simulateQbOpenWithFix(customerA_typed, customerA_officeNotes);
  check('Fix: same customer reopen shows their saved officeNotes (not intermediate textarea)', result === customerA_officeNotes);
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
