// direct_booking_attribution_test.js
// Guards the 2026-08-19 addition: tracking who booked a job that never had an estimate.
//
// A job booked straight off a phone call or email was INVISIBLE to staff analytics. Both gates
// there require a price to have been recorded — `if(!hasRoughQuote&&!hasFormalEstimate)return;`
// — so it was dropped before a name was even looked for. It counted in revenue but earned
// nobody any credit.
//
// Reported in its own section rather than folded into Jobs Booked, so Close rate
// (booked / estimates sent) keeps its meaning and cannot exceed 100%.
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } };
const eq = (a, b, m) => ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const _sNorm = n => { if (!n) return ''; return n.trim().replace(/\b\w/g, c => c.toUpperCase()); };

// Mirrors the block added to renderAnalytics.
function tally(db) {
  const byName = {}; let unattributed = 0;
  db.leads.filter(l => ['Booked', 'Completed'].includes(l.status)).forEach(l => {
    const hasRough = !!(l.roughQuoteDate || l.roughQuoteMin);
    const hasFormal = !!(l.estimateType || (db.quotes || []).some(q => q.leadId === l.id) || l.estimateSentBy);
    if (hasRough || hasFormal) return;
    const bj = (db.bookedJobs || []).find(b => b.leadId === l.id && !b._draft);
    const name = _sNorm(l.bookedBy || (bj && bj.bookedBy) || l.takenBy || '');
    if (!name) { unattributed++; return; }
    if (!byName[name]) byName[name] = { count: 0, revenue: 0 };
    byName[name].count++;
    const cj = (db.completedJobs || []).find(c => c.leadId === l.id);
    byName[name].revenue += Number(cj && cj.paid) || 0;
  });
  return { byName, unattributed };
}

const DB = {
  leads: [
    { id: 'L1', status: 'Booked', bookedBy: 'Dave' },
    { id: 'L2', status: 'Completed', bookedBy: 'John' },
    { id: 'L3', status: 'Completed', estimateSentBy: 'Dave' },
    { id: 'L4', status: 'Booked', roughQuoteMin: 1500 },
    { id: 'L5', status: 'Completed' },
    { id: 'L6', status: 'Did not book', bookedBy: 'Dave' },
    { id: 'L7', status: 'Booked', takenBy: 'john' }
  ],
  quotes: [], bookedJobs: [], completedJobs: [{ leadId: 'L2', paid: 2400 }, { leadId: 'L5', paid: 900 }]
};

// ── counting ─────────────────────────────────────────────────────────────────
{
  const { byName, unattributed } = tally(DB);
  eq(byName['Dave'].count, 1, 'Dave credited with his direct booking');
  eq(byName['John'].count, 2, 'John credited with two (one via takenBy fallback)');
  eq(byName['John'].revenue, 2400, 'revenue counted from the completed job');
  eq(unattributed, 1, 'a direct booking with no name is counted as unattributed, not silently dropped');
  ok(!('' in byName), 'no blank-name row');
}
// ── exclusions ───────────────────────────────────────────────────────────────
{
  const { byName } = tally(DB);
  const total = Object.values(byName).reduce((a, d) => a + d.count, 0);
  eq(total, 3, 'only the three attributed DIRECT bookings are counted');
  // L3 had an estimate, L4 a rough quote, L6 did not book.
  ok(byName['Dave'].count === 1, 'a lead that went through the estimate pipeline is NOT double-counted here');
}
{
  const db2 = { leads: [{ id: 'X', status: 'Booked', bookedBy: 'Dave' }],
    quotes: [{ leadId: 'X', sentBy: 'Dave' }], bookedJobs: [], completedJobs: [] };
  eq(Object.keys(tally(db2).byName).length, 0, 'a lead with a quote is excluded even if bookedBy is set');
}
{
  const db3 = { leads: [{ id: 'X', status: 'Booked' }],
    quotes: [], bookedJobs: [{ leadId: 'X', bookedBy: 'Dave' }], completedJobs: [] };
  eq(tally(db3).byName['Dave'].count, 1, 'falls back to the booked job when the lead has no bookedBy');
}
{
  const db4 = { leads: [{ id: 'X', status: 'Booked' }],
    quotes: [], bookedJobs: [{ leadId: 'X', bookedBy: 'Dave', _draft: true }], completedJobs: [] };
  eq(tally(db4).unattributed, 1, 'a DRAFT booking does not supply attribution');
}
// ── name normalisation ───────────────────────────────────────────────────────
{
  const db5 = { leads: [{ id: 'A', status: 'Booked', bookedBy: 'dave' },
                        { id: 'B', status: 'Booked', bookedBy: 'Dave' },
                        { id: 'C', status: 'Booked', bookedBy: '  dave  ' }],
    quotes: [], bookedJobs: [], completedJobs: [] };
  const { byName } = tally(db5);
  eq(Object.keys(byName).length, 1, 'lowercase and padded variants collapse to one person');
  eq(byName['Dave'].count, 3, 'all three credited to Dave');
  // KNOWN LIMITATION (pre-existing, app-wide): _sNorm title-cases the FIRST letter only and does
  // not lowercase the rest, so an ALL-CAPS entry stays its own person. Documented, not fixed
  // here — changing _sNorm would affect every analytics figure.
  const db6 = { leads: [{ id: 'A', status: 'Booked', bookedBy: 'Dave' },
                        { id: 'B', status: 'Booked', bookedBy: 'DAVE' }],
    quotes: [], bookedJobs: [], completedJobs: [] };
  eq(Object.keys(tally(db6).byName).length, 2, 'ALL-CAPS is a separate bucket (known _sNorm limitation)');
}

// ── wiring ───────────────────────────────────────────────────────────────────
ok(/id="bj-booked-by"/.test(HTML), 'Booked by field on the booking form');
// The separate card was REMOVED 2026-08-19 — it duplicated the app's existing per-person
// "How jobs get booked" panel and reported different numbers, which is worse than nothing.
// bookedBy now feeds that existing panel instead.
ok(!/id="direct-bookings"/.test(HTML), 'the duplicate card is gone');
ok(/const name=_sNorm\(l\.bookedBy\|\|\(_bj&&_bj\.bookedBy\)\|\|l\.estimateSentBy\|\|l\.takenBy\|\|l\.roughQuoteSentBy\|\|''\)/.test(HTML),
  'bookedBy is FIRST in the how-booked attribution');
ok(/Booked on call — no estimate/.test(HTML), 'the existing booking-path category still exists');
eq((HTML.match(/j\.bookedBy=\(document\.getElementById\('bj-booked-by'\)\|\|\{\}\)\.value\|\|'';/g) || []).length, 2,
  'BOTH write paths persist bookedBy (bjWriteFields and confirmBooking)');
ok(/_l\.bookedBy=j\.bookedBy;/.test(HTML),
  'mirrored onto the lead \u2014 confirmComplete deletes the booked job, so without this the credit vanishes');
ok(/_bb\.value=l\.bookedBy\|\|\(_q&&_q\.sentBy\)\|\|l\.estimateSentBy\|\|l\.takenBy\|\|''/.test(HTML),
  'a fresh booking pre-fills from the quote/estimate sender so it is not retyped');
ok(/draftSetIfHasValue\('bj-booked-by',_existingDraft\.bookedBy\)/.test(HTML), 'draft restore brings it back');
ok(/_bb\.value=j\.bookedBy\|\|'';/.test(HTML), 'editBookedJob restores it \u2014 this is how it gets set retroactively');
// Dates: a job booked on a call has no roughQuoteDate/estimateDate/createdAt, so the
// drill-down showed "—"; it now falls back to the booked/completed job's own date.
ok(/const _b=\(db\.bookedJobs\|\|\[\]\)\.find\(b=>b\.leadId===l\.id&&!b\._draft\);\s*\n\s*if\(_b&&_b\.date\)return _b\.date;/.test(HTML),
  'drill-down falls back to the booked job date');
ok(/const _c=\(db\.completedJobs\|\|\[\]\)\.find\(c=>c\.leadId===l\.id\);\s*\n\s*if\(_c&&_c\.date\)return _c\.date;/.test(HTML),
  'drill-down falls back to the completed job date');

// Close rate must remain estimates-only.
ok(/const rate=d\.sent\?Math\.round\(uniqueBooked\/d\.sent\*100\):0;/.test(HTML),
  'close rate formula unchanged \u2014 direct bookings are NOT folded in');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
