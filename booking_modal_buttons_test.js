// booking_modal_buttons_test.js
// Guards the 2026-08-19 fix: editing a booked job renamed the WRONG button.
//
// `document.querySelector('#modal-book-job .btn-primary')` matched the FIRST .btn-primary in
// the modal — the full-width "Paste booking details from an email or text" button near the top,
// which is earlier in the DOM than the footer submit. So opening Edit on a booked job renamed
// the PASTE button to "Save changes" while the real footer button still read "Confirm booking".
// Clicking the big green button opened the paste dialog on an already-booked job.
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } };
const eq = (a, b, m) => ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const start = HTML.indexOf('id="modal-book-job"');
const end = HTML.indexOf('<div class="modal-bg"', start + 10);
const MODAL = HTML.slice(start, end);

// ── the bug ──────────────────────────────────────────────────────────────────
eq(HTML.indexOf("querySelector('#modal-book-job .btn-primary')"), -1,
  'the ambiguous .btn-primary selector is gone everywhere');
eq((HTML.match(/getElementById\('bj-submit-btn'\)/g) || []).length, 3,
  'all three call sites target the footer button by id');
eq((MODAL.match(/id="bj-submit-btn"/g) || []).length, 1,
  'exactly one element carries the submit id');

// The first .btn-primary in the modal is still the paste button — proving the old selector
// would still hit the wrong one, so the id is doing real work.
{
  const first = MODAL.match(/<button[^>]*btn-primary[^>]*>([^<]*)/);
  ok(/Paste/i.test(first[1]), 'the first .btn-primary is still the paste button (id is load-bearing)');
  const byId = MODAL.match(/<button[^>]*id="bj-submit-btn"[^>]*>([^<]*)/);
  eq(byId[1].trim(), 'Confirm booking', 'the id resolves to the footer submit button');
}

// ── wiring intact ────────────────────────────────────────────────────────────
ok(/id="bj-submit-btn" onclick="confirmBooking\(\)"/.test(MODAL), 'submit still calls confirmBooking');
ok(/onclick="openPasteToBooking\(\)"/.test(MODAL), 'paste button still calls openPasteToBooking');
ok(/if\(btnEl\)btnEl\.textContent='Save changes';/.test(HTML), 'edit mode still relabels the submit button');
ok(/if\(btnEl\)btnEl\.textContent='Confirm booking';/.test(HTML) ||
   /textContent='Confirm booking'/.test(HTML), 'fresh booking resets the label');

// ── paste row hidden while editing ───────────────────────────────────────────
ok(/id="bj-paste-row"/.test(HTML), 'the paste row has an id');
ok(/\{const _pr=document\.getElementById\('bj-paste-row'\);if\(_pr\)_pr\.style\.display='none';\}/.test(HTML),
  'paste row hidden when editing a booked job');
ok(/\{const _pr=document\.getElementById\('bj-paste-row'\);if\(_pr\)_pr\.style\.display='';\}/.test(HTML),
  'paste row shown again for a fresh booking');
{
  // The hide must live in editBookedJob and the show in openBooking, not the other way round.
  const iEdit = HTML.indexOf('function editBookedJob(');
  const iHide = HTML.indexOf("_pr.style.display='none'");
  const iOpen = HTML.indexOf('function openBooking(');
  const iShow = HTML.indexOf("_pr.style.display=''");
  ok(iHide > iEdit, 'the hide is inside editBookedJob');
  ok(iShow > iOpen && iShow < iEdit, 'the show is inside openBooking');
}

// ── Booked by unaffected ─────────────────────────────────────────────────────
ok(/id="bj-booked-by"/.test(MODAL), 'Booked by field still in the modal');
ok(MODAL.indexOf('id="bj-booked-by"') < MODAL.indexOf('Schedule & crew'),
  'Booked by still sits above the Schedule & crew heading');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
