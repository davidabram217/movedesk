// Guard: the Customers modal job-history rows must reflect the REAL payment state.
//
// Regression this locks in (reported 2026-08-19, Steph Vigil): a completed job with
// an outstanding balance showed a green "✓ Paid" badge and an amount of "$0".
// Two independent causes:
//   (1) the badge was hardcoded — `h.type==='completed' ? '<span…>✓ Paid</span>' : ''`
//       never consulted total vs paid, so EVERY completed job read as paid;
//   (2) the amount was `fmtMoney(j.paid)` (money received), not the job total, so an
//       unpaid job displayed "$0" and looked free.
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const src = fs.readFileSync(file, 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, info) => {
  if (cond) { pass++; }
  else { fail++; console.log('  \u2717 ' + name + (info ? '\n    ' + info : '')); }
};

function fmtMoney(n){return'$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});}
function fmtDate(d){return d||'--';}

// ─── Extract the real row template from source ───
const rowM = src.match(/document\.getElementById\('cv-history'\)\.innerHTML=allHistory\.length\?allHistory\.map\(h=>`([\s\S]*?)`\)\.join\(''\)/);
check('cv-history row template found in source', !!rowM);
if (!rowM) { console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
const renderRow = new Function('h', 'fmtMoney', 'fmtDate', 'return `' + rowM[1] + '`;');

const _owedOf = j => Math.max(0, (Number(j.total)||0) - (Number(j.paid)||0));
function row(j) {
  const h = { date:j.date, type:'completed', label:'Completed job', sub:'A → B',
    amount:fmtMoney(Number(j.total)||0), owed:_owedOf(j), paidAmt:Number(j.paid)||0, id:'j1' };
  return renderRow(h, fmtMoney, fmtDate);
}
const text = j => row(j).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ─── THE BUG: unpaid job must not read as paid ───
const unpaid = { date:'2026-08-18', total:840, paid:0 };
check('Unpaid job does NOT show the green "Paid" badge',
  !/pill-green/.test(row(unpaid)), 'got: ' + text(unpaid));
check('Unpaid job shows an Owes badge with the balance',
  /pill-red/.test(row(unpaid)) && /Owes \$840/.test(text(unpaid)), 'got: ' + text(unpaid));
check('Unpaid job shows the job TOTAL, not $0',
  /\$840/.test(text(unpaid)) && !/^\D*\$0\b/.test(text(unpaid).replace(/Owes \$840/, '')),
  'got: ' + text(unpaid));

// ─── Partial payment ───
const partial = { date:'2026-08-18', total:1000, paid:400 };
check('Partially paid job shows the outstanding balance', /Owes \$600/.test(text(partial)), 'got: ' + text(partial));
check('Partially paid job shows the total', /\$1,000/.test(text(partial)), 'got: ' + text(partial));
check('Partially paid job shows how much was paid', /\$400 paid/.test(text(partial)), 'got: ' + text(partial));
check('Partially paid job is not green', !/pill-green/.test(row(partial)));

// ─── Fully paid still behaves as before ───
const paid = { date:'2026-05-29', total:1073, paid:1073 };
check('Fully paid job keeps the green Paid badge', /pill-green/.test(row(paid)) && /✓ Paid/.test(text(paid)));
check('Fully paid job shows no Owes badge', !/Owes/.test(text(paid)));
check('Fully paid job shows the amount', /\$1,073/.test(text(paid)));
check('Fully paid job does not show a redundant "paid" line', !/paid\b/i.test(text(paid).replace('✓ Paid','')));

// ─── Overpayment / credit must not render a negative balance ───
const over = { date:'2026-05-29', total:500, paid:600 };
check('Overpaid job clamps at zero (no negative Owes)', !/Owes/.test(text(over)) && !/-\$/.test(text(over)),
  'got: ' + text(over));
check('Overpaid job reads as Paid', /pill-green/.test(row(over)));

// ─── Zero-value job (nothing billed) reads as paid, not as debt ───
const zero = { date:'2026-05-29', total:0, paid:0 };
check('Zero-total job does not show an Owes badge', !/Owes/.test(text(zero)), 'got: ' + text(zero));

// ─── Missing/garbage fields must not throw or produce NaN ───
const bad = { date:'2026-05-29' };
check('Job with no total/paid renders without NaN', !/NaN/.test(text(bad)), 'got: ' + text(bad));

// ─── Header line ───
check('Header computes an outstanding total across jobs',
  /const totalOwed=hist\.jobs\.reduce\(\(s,j\)=>s\+Math\.max\(0,\(Number\(j\.total\)\|\|0\)-\(Number\(j\.paid\)\|\|0\)\),0\)/.test(src));
check('Header renders the outstanding total when non-zero',
  /totalOwed>0\?' · '\+fmtMoney\(totalOwed\)\+' outstanding':''/.test(src));

// ─── Source-level: the old hardcoded badge is gone ───
check('Hardcoded unconditional "Paid" badge is removed from cv-history',
  !/h\.type==='completed'\?'<span class="badge pill-green"[^']*✓ Paid<\/span>':''/.test(src));
check('History rows carry total/owed/paidAmt (not just paid)',
  /amount:fmtMoney\(Number\(j\.total\)\|\|0\),owed:_owedOf\(j\),paidAmt:Number\(j\.paid\)\|\|0/.test(src));

// ─── Balance formula matches the rest of the app ───
check('Uses the same owed formula as renderCompleted/dashboard',
  /const _owedOf=j=>Math\.max\(0,\(Number\(j\.total\)\|\|0\)-\(Number\(j\.paid\)\|\|0\)\)/.test(src));

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
