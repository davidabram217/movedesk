// booking_date_prefill_test.js
// Guards the 2026-08-19 fix: the LEAD's move date is the single source of truth for the
// booking form's Confirmed date.
//
// The bug: the booking modal body autosaves on ANY input/change, so merely touching the form
// creates a `_draft` booked job capturing whatever bj-date held at that moment. Drafts are
// never cleaned up (only deleted on commit). On reopen, openBooking filled bj-date from the
// lead and THEN let the draft overwrite it unconditionally — so a weeks-old abandoned draft
// silently won, and the customer could be confirmed for the wrong day.
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } };
const eq = (a, b, m) => ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

function ex(sig) {
  const st = HTML.indexOf(sig);
  if (st === -1) throw new Error('could not find: ' + sig);
  let d = 0, i = HTML.indexOf('{', st);
  for (; i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}') { d--; if (!d) return HTML.slice(st, i + 1); } }
}
const SRC = ex('function _bjLeadDate(');
ok(!!SRC, '_bjLeadDate extracted from index.html');
const _bjLeadDate = new Function('return ' + SRC.replace('function _bjLeadDate', 'function'))();

// ── the reported bug ─────────────────────────────────────────────────────────
eq(_bjLeadDate({ date: '2026-08-21' }), '2026-08-21', 'a real lead date is used');
ok(!/draftSetIfHasValue\('bj-date'/.test(HTML),
  'the draft NEVER writes bj-date \u2014 a stale draft cannot override the lead date');

// ── TBD and unusable values are treated as "no date", never handed to the input ──
// bj-date is <input type="date">, which silently blanks anything not yyyy-mm-dd. Passing
// 'TBD' through produced a mysteriously empty field that a stale draft then filled.
eq(_bjLeadDate({ date: 'TBD' }), '', 'TBD is treated as no date');
eq(_bjLeadDate({ date: 'tbd' }), '', 'lowercase tbd is treated as no date');
eq(_bjLeadDate({ date: ' TBD ' }), '', 'padded TBD is treated as no date');
eq(_bjLeadDate({ date: '8/21/26' }), '', 'a non-ISO date is rejected rather than blanked by the input');
eq(_bjLeadDate({ date: '2026-8-1' }), '', 'an unpadded ISO-ish date is rejected');
eq(_bjLeadDate({ date: '' }), '', 'empty date yields empty');
eq(_bjLeadDate({}), '', 'missing date yields empty');
eq(_bjLeadDate({ date: null }), '', 'null date yields empty');
eq(_bjLeadDate(null), '', 'missing lead yields empty (no throw)');
eq(_bjLeadDate({ date: '  2026-08-21  ' }), '2026-08-21', 'surrounding whitespace is trimmed');

// ── wiring ───────────────────────────────────────────────────────────────────
ok(/document\.getElementById\('bj-date'\)\.value=_bjLeadDate\(l\);/.test(HTML),
  'openBooking fills bj-date via _bjLeadDate');
ok(!/document\.getElementById\('bj-date'\)\.value=l\.date\|\|''/.test(HTML),
  'the old unguarded l.date assignment is gone');

// Every OTHER draft field must still be restored — only the date changed.
['bj-time', 'bj-rate-regular', 'bj-rate-cash', 'bj-fee-materials', 'bj-fee-fuel',
 'bj-drive-to', 'bj-drive-return'].forEach(id => {
  ok(new RegExp("draftSetIfHasValue\\('" + id + "'").test(HTML),
    'draft still restores ' + id);
});

// Editing an already-committed booking is a separate path and must be untouched:
// there the job's own stored date is correct and authoritative.
ok(/function editBookedJob\(jobId\)/.test(HTML), 'editBookedJob still exists');
ok(/document\.getElementById\('bj-date'\)\.value=j\.date\|\|'';/.test(HTML),
  'editBookedJob still fills the date from the committed job, unchanged');

// The paste-to-booking path already guarded TBD correctly; make sure it still does.
ok(/if\(ex\.date&&ex\.date!=='TBD'\)set\('bj-date',ex\.date\)/.test(HTML),
  'applyBookingExtract keeps its existing TBD guard');

// ── the scenario, end to end ─────────────────────────────────────────────────
// Simulates the two prefill steps in the order openBooking runs them.
function shown(leadDate, draftDate) {
  let field = _bjLeadDate({ date: leadDate });   // lead fills first
  // draft restore no longer touches bj-date at all
  void draftDate;
  return field;
}
eq(shown('2026-08-21', '2026-07-03'), '2026-08-21', 'REPORTED BUG: lead date beats a stale draft');
eq(shown('2026-08-21', undefined), '2026-08-21', 'no draft, lead date shown');
eq(shown('TBD', '2026-07-03'), '', 'TBD lead shows blank, not a stale draft date');
eq(shown('', '2026-07-03'), '', 'dateless lead shows blank, not a stale draft date');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
