// payment_correction_test.js
// Guards the 2026-07-22 "correct a payment" change.
//
// Reported problem: a job marked paid in full by mistake could not be put back to owing. The
// 💰 Update payment button was gated on `owed > 0`, so it vanished the moment a job settled, and
// confirmUpdatePayment was add-only (`Math.min(total, paid + amount)` with an `amount > 0` guard).
//
// This suite runs the REAL functions out of index.html against a stubbed DOM.

const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  \u2713 ' + m); } else { fail++; console.log('  \u2717 FAIL: ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function extract(sig) {
  const start = HTML.indexOf(sig);
  if (start === -1) throw new Error('not found: ' + sig);
  let depth = 0;
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('unbalanced: ' + sig);
}

// ── harness ──────────────────────────────────────────────────────────────────
function makeEnv(job) {
  const fields = {
    'up-amount': '', 'up-notes': '', 'up-method': 'Cash',
    'up-amount-label': '', 'up-balance-label': '', 'up-save-btn': '', 'up-hint': '',
    'up-balance-display': '', 'update-payment-summary': ''
  };
  const toasts = [];
  const els = {};
  function el(id) {
    if (!els[id]) els[id] = {
      _id: id,
      get value() { return fields[id] !== undefined ? fields[id] : ''; },
      set value(v) { fields[id] = v; },
      style: {}, textContent: '', innerHTML: '', placeholder: '', selectedIndex: 0,
      classList: { contains: () => false }
    };
    return els[id];
  }
  const db = { completedJobs: [job] };
  const src =
    'let currentUpdatePaymentJobId=null;' +
    extract('function openUpdatePayment(') + ';' +
    extract('function setUpdatePaymentMode(') + ';' +
    extract('function calcUpdateBalance(') + ';' +
    extract('function confirmUpdatePayment(') + ';' +
    'return {openUpdatePayment,setUpdatePaymentMode,calcUpdateBalance,confirmUpdatePayment,' +
    'getMode:()=>updatePaymentMode,setId:v=>{currentUpdatePaymentJobId=v;}};';
  const api = new Function(
    'db', 'document', 'showToast', 'fmtMoney', 'fmtDate', 'saveDB', 'closeModal',
    'renderCompleted', 'renderDashboard', 'openModal',
    // `let updatePaymentMode` is declared inside openUpdatePayment's replacement block
    src
  )(db, { getElementById: el }, m => toasts.push(m), n => '$' + Number(n || 0).toLocaleString(),
    () => '', () => {}, () => {}, () => {}, () => {}, () => {});
  return { api, job, fields, toasts, el };
}

const BASE = () => ({ id: 'j1', name: 'Deborah', total: 1200, paid: 1200, paymentState: 'paid' });

// ── the reported case: undo "paid in full" ───────────────────────────────────
console.log('\n\u2500\u2500 reported case: undo a mistaken "paid in full" \u2500\u2500');
{
  const e = makeEnv(BASE());
  e.api.setId('j1');
  e.api.openUpdatePayment('j1');
  eq(e.api.getMode(), 'fix', 'a settled job opens straight into correction mode');
  eq(Number(e.fields['up-amount']), 1200, 'prefills with what is currently on record');

  e.fields['up-amount'] = 300;
  e.fields['up-notes'] = 'marked paid by mistake';
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 300, 'total paid reduced to 300');
  eq(e.job.paymentState, 'owing', 'job flipped back to owing');
  eq(e.job.owing, 900, 'owing recomputed to 900');
  eq(e.job.paymentHistory.length, 1, 'correction logged to payment history');
  eq(e.job.paymentHistory[0].amount, -900, 'logged as a signed delta so history still sums to paid');
  eq(e.job.paymentHistory[0].correction, true, 'entry flagged as a correction');
  eq(e.job.paymentHistory[0].method, 'Correction', 'correction is not attributed to a payment method');
  eq(e.job.paymentHistory[0].notes, 'marked paid by mistake', 'operator note kept');
  ok(/owes/i.test(e.toasts.join(' ')), 'toast confirms the new balance');
}

// ── correction validation ────────────────────────────────────────────────────
console.log('\n\u2500\u2500 correction guards \u2500\u2500');
{
  const e = makeEnv(BASE()); e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = 1500;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 1200, 'cannot correct above the total charged');
  ok(/more than/i.test(e.toasts.join(' ')), 'explains why, and points at the job total');
  ok(!e.job.paymentHistory, 'nothing written to history on a rejected correction');
}
{
  const e = makeEnv(BASE()); e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = -50;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 1200, 'negative correction rejected');
}
{
  const e = makeEnv(BASE()); e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = '';
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 1200, 'blank correction rejected');
}
{
  const e = makeEnv(BASE()); e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = 1200;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 1200, 'no-op correction rejected');
  ok(/already/i.test(e.toasts.join(' ')), 'says the value is already on record');
  ok(!e.job.paymentHistory, 'no history entry for a no-op');
}
{
  // Correcting all the way to zero is legitimate — nothing was ever paid.
  const e = makeEnv(BASE()); e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = 0;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 0, 'can correct down to zero');
  eq(e.job.paymentState, 'owing', 'zero paid means owing');
  eq(e.job.paymentHistory[0].amount, -1200, 'full reversal logged');
}

// ── recording a payment is UNCHANGED ─────────────────────────────────────────
console.log('\n\u2500\u2500 recording a payment (regression) \u2500\u2500');
{
  const e = makeEnv({ id: 'j1', name: 'Deborah', total: 1200, paid: 400, paymentState: 'owing' });
  e.api.setId('j1');
  e.api.openUpdatePayment('j1');
  eq(e.api.getMode(), 'add', 'a job with a balance opens in payment mode');
  eq(Number(e.fields['up-amount']), 800, 'prefills with the outstanding balance');

  e.fields['up-amount'] = 500;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 900, 'payment adds to the running total');
  eq(e.job.paymentState, 'owing', 'still owing');
  eq(e.job.paymentHistory[0].amount, 500, 'payment logged at face value');
  eq(e.job.paymentHistory[0].method, 'Cash', 'payment method captured');
  ok(!e.job.paymentHistory[0].correction, 'a payment is not flagged as a correction');
}
{
  const e = makeEnv({ id: 'j1', name: 'D', total: 1200, paid: 400, paymentState: 'owing' });
  e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = 5000;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 1200, 'overpayment still clamps to the total (unchanged)');
  eq(e.job.paymentState, 'paid', 'clears the balance');
}
{
  const e = makeEnv({ id: 'j1', name: 'D', total: 1200, paid: 400, paymentState: 'owing' });
  e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = 0;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 400, 'zero payment still rejected (unchanged)');
  ok(/amount received/i.test(e.toasts.join(' ')), 'original validation message preserved');
}
{
  const e = makeEnv({ id: 'j1', name: 'D', total: 1200, paid: 400, paymentState: 'owing' });
  e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = -100;
  e.api.confirmUpdatePayment();
  eq(e.job.paid, 400, 'payment mode still refuses a negative — corrections go through fix mode');
}

// ── mode switching ───────────────────────────────────────────────────────────
console.log('\n\u2500\u2500 mode switching \u2500\u2500');
{
  const e = makeEnv({ id: 'j1', name: 'D', total: 1000, paid: 250, paymentState: 'owing' });
  e.api.setId('j1'); e.api.openUpdatePayment('j1');
  eq(e.api.getMode(), 'add', 'starts in add mode');
  e.api.setUpdatePaymentMode('fix');
  eq(e.api.getMode(), 'fix', 'switches to fix');
  eq(Number(e.fields['up-amount']), 250, 'fix mode reprefills from what is on record');
  e.api.setUpdatePaymentMode('add');
  eq(Number(e.fields['up-amount']), 750, 'add mode reprefills from the outstanding balance');
  eq(e.el('up-method-wrap').style.display, '', 'payment method visible when recording a payment');
  e.api.setUpdatePaymentMode('fix');
  eq(e.el('up-method-wrap').style.display, 'none', 'payment method hidden when correcting');
  eq(e.el('up-save-btn').textContent, 'Save correction', 'save button relabels');
  eq(e.el('up-amount-label').textContent, 'Total paid should be ($) *', 'amount label relabels');
  e.api.setUpdatePaymentMode('garbage');
  eq(e.api.getMode(), 'add', 'unknown mode falls back to add, never a silent correction');
}

// ── live balance preview ─────────────────────────────────────────────────────
console.log('\n\u2500\u2500 balance preview \u2500\u2500');
{
  const e = makeEnv({ id: 'j1', name: 'D', total: 1000, paid: 400, paymentState: 'owing' });
  e.api.setId('j1'); e.api.openUpdatePayment('j1');
  e.fields['up-amount'] = 200; e.api.calcUpdateBalance();
  ok(/400/.test(e.el('up-balance-display').textContent), 'add mode: 600 owed less a 200 payment = 400');
  e.api.setUpdatePaymentMode('fix');
  e.fields['up-amount'] = 200; e.api.calcUpdateBalance();
  ok(/800/.test(e.el('up-balance-display').textContent), 'fix mode: total 1000 less 200 paid = 800');
  e.fields['up-amount'] = 1000; e.api.calcUpdateBalance();
  ok(/Paid in full/i.test(e.el('up-balance-display').textContent), 'fix mode shows paid-in-full at the total');
}

// ── the button that used to disappear ────────────────────────────────────────
console.log('\n\u2500\u2500 View-modal button always reachable \u2500\u2500');
// There are several 'view-modal-footer' writers; pick the completed-job one by content.
let fStart = -1, probe = -1;
while ((probe = HTML.indexOf("document.getElementById('view-modal-footer').innerHTML=", probe + 1)) !== -1) {
  const end = HTML.indexOf("openModal('view');}", probe);
  if (end !== -1 && HTML.slice(probe, end).includes('openUpdatePayment')) { fStart = probe; break; }
}
ok(fStart > -1, 'located the completed-job view footer');
const footer = HTML.slice(fStart, HTML.indexOf("openModal('view');}", fStart));
ok(footer.includes('openUpdatePayment'), 'footer still wires up openUpdatePayment');
ok(!footer.includes("${owed>0?`<button class=\"btn\" style=\"background:var(--amber-light)"),
   'button is no longer gated away when nothing is owed');
ok(footer.includes("${owed>0?'Update payment':'Correct payment'}"), 'button relabels by balance state');
const btnFrag = footer.slice(footer.indexOf('openUpdatePayment') - 260, footer.indexOf('openUpdatePayment') + 120);
ok(!/\$\{owed>0\?`<button/.test(btnFrag), 'no surviving owed>0 gate on the payment button');

console.log('\n' + '\u2500'.repeat(60));
console.log(`payment_correction_test.js: ${pass} passed, ${fail} failed`);
console.log('\u2500'.repeat(60) + '\n');
process.exit(fail > 0 ? 1 : 0);
