// Guard: the view-modal bottom-right button reflects the RECORDS that exist
// (booked job / draft / completed job), not just the lead's status string.
//
// Regression this locks in: a lead whose status had moved past "Quote accepted"
// (i.e. "Booked" or "Completed") fell through every isAccepted-gated branch and
// hit the final fallback, showing "Book job →" on a job that was already booked.
// Clicking it called openBooking() and could create a SECOND booked job.
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const src = fs.readFileSync(file, 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, info) => {
  if (cond) { pass++; }
  else { fail++; console.log('  \u2717 ' + name + (info ? '\n    ' + info : '')); }
};

// ─── Extract the real footerBtnRight expression from source ───
const m = src.match(/const footerBtnRight=([\s\S]*?);\nconst viewQuoteBtn=/);
check('footerBtnRight expression found in source', !!m);
if (!m) { console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
const expr = m[1];

// Evaluate the real expression against synthetic state.
function button(status, hasBooked, hasDraft, hasCompleted) {
  const l = { id: 'L1', status };
  const isAccepted = status === 'Quote accepted' || status === 'Confirmation sent';
  const _bookedJob = hasBooked ? { id: 'B1' } : undefined;
  const _draftBookedJob = hasDraft ? { id: 'D1' } : undefined;
  const _completedJob = hasCompleted ? { id: 'C1' } : undefined;
  const _hasBookedJob = !!_bookedJob;
  const _hasDraftBooking = !!_draftBookedJob;
  const html = new Function(
    'l', 'isAccepted', '_hasBookedJob', '_hasDraftBooking', '_completedJob', '_bookedJob', '_draftBookedJob',
    'return (' + expr + ');'
  )(l, isAccepted, _hasBookedJob, _hasDraftBooking, _completedJob, _bookedJob, _draftBookedJob);
  return String(html).replace(/<[^>]*>/g, '').trim();
}

// ─── THE BUG: never offer "Book job" when the job is already booked ───
check('Booked lead does NOT show "Book job"',
  !/Book job/.test(button('Booked', true, false, false)),
  'got: ' + button('Booked', true, false, false));
check('Booked lead shows "Send confirmation"',
  /Send confirmation/.test(button('Booked', true, false, false)));
check('Completed lead does NOT show "Book job"',
  !/Book job/.test(button('Completed', false, false, true)),
  'got: ' + button('Completed', false, false, true));
check('Completed lead shows "View completed job"',
  /View completed job/.test(button('Completed', false, false, true)));
check('Completed button opens viewCompletedJob with the completed id',
  /viewCompletedJob\('C1'\)/.test(
    new Function('l','isAccepted','_hasBookedJob','_hasDraftBooking','_completedJob',
      'return (' + expr + ');')
      ({id:'L1',status:'Completed'}, false, false, false, {id:'C1'})));

// ─── No regression: every pre-existing state is unchanged ───
check('Quote accepted + real booking -> Send confirmation',
  /Send confirmation/.test(button('Quote accepted', true, false, false)));
check('Quote accepted + draft -> Continue booking',
  /Continue booking/.test(button('Quote accepted', false, true, false)));
check('Quote accepted + nothing -> Complete booking',
  /Complete booking/.test(button('Quote accepted', false, false, false)));
check('Confirmation sent + real booking -> Send confirmation',
  /Send confirmation/.test(button('Confirmation sent', true, false, false)));
check('Did not book -> Reactivate lead',
  /Reactivate lead/.test(button('Did not book', false, false, false)));
check('New lead with no records -> Book job',
  /Book job/.test(button('New', false, false, false)));
check('Estimate sent with no records -> Book job',
  /Book job/.test(button('Estimate sent', false, false, false)));

// ─── Precedence ───
check('A real booking outranks a leftover draft',
  /Send confirmation/.test(button('Booked', true, true, false)));
check('A completed job outranks a leftover booked record',
  /View completed job/.test(button('Completed', true, false, true)));
check('"Did not book" outranks everything',
  /Reactivate lead/.test(button('Did not book', true, true, true)));

// ─── Source-level: the completed-job lookup exists ───
check('_completedJob is resolved from db.completedJobs by leadId',
  /_completedJob=\(db\.completedJobs\|\|\[\]\)\.find\(c=>c\.leadId===l\.id\)/.test(src));

// ─── Exhaustive: no state with an existing record can reach "Book job" ───
const statuses = ['New','Need to follow up','Need to send summary','Summary sent',
  'Estimate scheduled','Need to send estimate','Estimate sent','Summary + rough quote',
  'Quote accepted','Confirmation sent','Booked','Completed'];
let leaks = [];
statuses.forEach(s => {
  [[1,0,0],[0,1,0],[0,0,1],[1,1,1]].forEach(([b,d,c]) => {
    if (/Book job/.test(button(s, !!b, !!d, !!c))) leaks.push(s + ' (b' + b + ' d' + d + ' c' + c + ')');
  });
});
check('No status with an existing booked/draft/completed record offers "Book job"',
  leaks.length === 0, leaks.join(', '));

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
