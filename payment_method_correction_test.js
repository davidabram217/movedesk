// payment_method_correction_test.js
// Guards the 2026-08-19 fix: a completed job logged with the wrong payment method (cash when it
// was actually a cheque) could not be corrected on the Update payment screen.
//
// Two problems:
//   1. `up-method-wrap` was hidden whenever fix mode was selected — so the one screen whose
//      purpose is correcting a payment offered no way to correct the method.
//   2. Even with it visible, the fix branch never wrote `j.payment`, and it bailed out early on
//      `entered===prev`, so a method-only correction (amount already right) was rejected outright.
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
const SRC = ex('function confirmUpdatePayment(');

function run(job, amountStr, method, mode) {
  const els = { 'up-notes': { value: '' }, 'up-amount': { value: amountStr }, 'up-method': { value: method },
    'page-dashboard': { classList: { contains: () => false } },
    'page-analytics': { classList: { contains: () => false } } };
  const toasts = [];
  const fn = new Function('db', 'currentUpdatePaymentJobId', 'updatePaymentMode', 'document',
    'showToast', 'fmtMoney', 'saveDB', 'closeModal', 'renderCompleted', 'renderDashboard', 'renderAnalytics',
    SRC + ';return confirmUpdatePayment();');
  fn({ completedJobs: [job] }, job.id, mode || 'fix',
    { getElementById: id => els[id] || null, querySelector: () => null },
    m => toasts.push(m), n => '$' + n, () => {}, () => {}, () => {}, () => {}, () => {});
  return { job, toast: toasts[0] };
}
const base = () => ({ id: 'J1', name: 'Test', total: 1000, paid: 1000, payment: 'Cash' });

// ── THE REPORTED CASE: method only, amount already correct ───────────────────
{
  const { job, toast } = run(base(), '1000', 'Cheque');
  eq(job.payment, 'Cheque', 'method corrected from Cash to Cheque');
  eq(job.paid, 1000, 'amount left untouched');
  ok(/method corrected/i.test(toast), 'toast reports a method correction, not an amount one');
  ok(!job.paymentHistory, 'a correction writes NO paymentHistory row (would read as real money)');
}
// ── amount only ──────────────────────────────────────────────────────────────
{
  const { job, toast } = run(base(), '600', 'Cash');
  eq(job.paid, 600, 'amount corrected');
  eq(job.payment, 'Cash', 'method unchanged when it was not touched');
  eq(job.owing, 400, 'balance recalculated');
  eq(job.paymentState, 'owing', 'payment state recalculated');
  ok(/owes/.test(toast), 'toast reports the new balance');
}
// ── both at once ─────────────────────────────────────────────────────────────
{
  const { job } = run(base(), '600', 'Cheque');
  eq(job.paid, 600, 'amount corrected');
  eq(job.payment, 'Cheque', 'method corrected');
}
// ── neither changed: must refuse ─────────────────────────────────────────────
{
  const { job, toast } = run(base(), '1000', 'Cash');
  eq(job.paid, 1000, 'nothing written');
  eq(job.payment, 'Cash', 'nothing written');
  ok(/already what is on record/.test(toast), 'refuses a no-op correction');
}
// ── guards still hold ────────────────────────────────────────────────────────
{
  const { job, toast } = run(base(), '1500', 'Cash');
  eq(job.paid, 1000, 'cannot correct paid ABOVE the job total');
  ok(/more than/.test(toast), 'explains why');
}
{
  const { job, toast } = run(base(), '', 'Cheque');
  eq(job.paid, 1000, 'blank amount rejected');
  ok(/0 or more/.test(toast), 'asks for a figure');
}
{
  const { job } = run(base(), '0', 'Cheque');
  eq(job.paid, 0, 'correcting to zero is allowed (job wrongly marked paid)');
  eq(job.paymentState, 'owing', 'state flips back to owing');
  eq(job.payment, 'Cheque', 'method still applied alongside');
}
// ── add mode is unchanged ────────────────────────────────────────────────────
{
  const j = { id: 'J1', name: 'Test', total: 1000, paid: 400, payment: 'Cash' };
  const { job } = run(j, '300', 'Cheque', 'add');
  eq(job.paid, 700, 'add mode still accumulates');
  eq((job.paymentHistory || []).length, 1, 'add mode still writes a history row');
  eq(job.paymentHistory[0].method, 'Cheque', 'the history row carries the method');
}

// ── wiring ───────────────────────────────────────────────────────────────────
ok(!/up-method-wrap'\)\.style\.display=isFix\?'none':''/.test(HTML),
  'the method field is no longer hidden in fix mode');
ok(/document\.getElementById\('up-method-wrap'\)\.style\.display='';/.test(HTML),
  'the method field is shown in both modes');
ok(/_ml\.textContent=isFix\?'Payment method \u2014 correct it here':'Payment method'/.test(HTML),
  'the label tells you it is correctable in fix mode');
ok(/_m\.value=j\.payment\|\|'Cash'/.test(HTML),
  'the dropdown opens on the method currently on record, not always the first option');
ok(/if\(_methodChanged\)j\.payment=_method;/.test(HTML), 'a corrected method is persisted');
ok(/if\(entered===prev&&!_methodChanged\)/.test(HTML), 'a method-only change is not rejected as a no-op');
ok(/j\._localEditedAt=new Date\(\)\.toISOString\(\);/.test(HTML), 'the correction marks the record for sync');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
