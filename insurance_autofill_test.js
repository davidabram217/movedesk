// insurance_autofill_test.js
// Guards the 2026-08-19 fix: choosing an insurance option on a MULTI-DAY completion did not
// fill the insurance fee, so the fee had to be typed by hand or the job total came out short.
//
// Cause: only the single-day dropdown carried onchange="autoFillInsuranceFee()". The multi-day
// and edit-multi-day dropdowns had no handler at all, even though all three offer identical
// option text and the multi-day total already included cjmd-insurance in its whole-job fees.
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
const MAP = HTML.match(/const _INSURANCE_FEE_MAP=\{[\s\S]*?\n\};/)[0];
const make = new Function('document', MAP + '\n' + ex('function _autoFillInsurance(') + '\nreturn _autoFillInsurance;');

function run(option, existingFee, typeId, feeId) {
  typeId = typeId || 'cjmd-insurance-type'; feeId = feeId || 'cjmd-insurance';
  const els = {}; els[typeId] = { value: option }; els[feeId] = { value: existingFee };
  let recalcs = 0;
  make({ getElementById: id => els[id] || null })(typeId, feeId, () => recalcs++);
  return { fee: els[feeId].value, recalcs };
}

// ── every option maps to its fee ─────────────────────────────────────────────
eq(run('Option 1 \u2014 Actual Cash Value ($150)', '').fee, 150, 'Option 1 \u2192 $150');
eq(run('Option 2 \u2014 Full Value Protection, No Deductible ($300)', '').fee, 300, 'Option 2 no deductible \u2192 $300');
eq(run('Option 2 \u2014 Full Value Protection, $250 Deductible ($100)', '').fee, 100,
  'Option 2 $250 deductible \u2192 $100 (the reported case)');
eq(run('Option 2 \u2014 Full Value Protection, $500 Deductible ($50)', '').fee, 50, 'Option 2 $500 deductible \u2192 $50');
eq(run('Option 3 \u2014 Basic Liability (included)', '').fee, '', 'Option 3 included \u2192 blank, not "0"');
eq(run('Did not get an answer', '').fee, '', 'no answer \u2192 blank');

// ── recalculates so the total updates ────────────────────────────────────────
ok(run('Option 1 \u2014 Actual Cash Value ($150)', '').recalcs > 0, 'a filled fee triggers a recalculation');

// ── switching options replaces a previously auto-filled fee ──────────────────
eq(run('Option 2 \u2014 Full Value Protection, $250 Deductible ($100)', '150').fee, 100,
  'switching from Option 1 to Option 2 replaces $150 with $100');
eq(run('Option 3 \u2014 Basic Liability (included)', '300').fee, '',
  'switching to an included option clears the fee');

// ── a hand-typed override is never clobbered ─────────────────────────────────
{
  const r = run('Option 1 \u2014 Actual Cash Value ($150)', '275');
  eq(r.fee, '275', 'a negotiated premium that matches no option survives');
  eq(r.recalcs, 0, 'and nothing is recalculated behind their back');
}
eq(run('Option 1 \u2014 Actual Cash Value ($150)', '0').fee, 150,
  'a zero is treated as empty, not as a deliberate override');

// ── unknown / placeholder selections do nothing ──────────────────────────────
eq(run('Select\u2026', '100').fee, '100', 'the placeholder leaves the fee alone');
eq(run('', '100').fee, '100', 'an empty selection leaves the fee alone');
eq(run('Something else entirely', '100').fee, '100', 'an unrecognised option leaves the fee alone');

// ── wiring: all three forms ──────────────────────────────────────────────────
ok(/id="cj-insurance-type" onchange="autoFillInsuranceFee\(\)"/.test(HTML), 'single-day still wired');
ok(/id="cjmd-insurance-type" onchange="autoFillInsuranceFeeMd\(\)"/.test(HTML), 'multi-day now wired');
ok(/id="ecjmd-insurance-type" onchange="autoFillInsuranceFeeEcjmd\(\)"/.test(HTML), 'edit-multi-day now wired');
ok(/autoFillInsuranceFeeMd\(\)\{_autoFillInsurance\('cjmd-insurance-type','cjmd-insurance',typeof calcMultiDayTotal/.test(HTML),
  'multi-day recalculates via calcMultiDayTotal');
ok(/autoFillInsuranceFeeEcjmd\(\)\{_autoFillInsurance\('ecjmd-insurance-type','ecjmd-insurance',typeof calcEditMultiDayTotal/.test(HTML),
  'edit-multi-day recalculates via calcEditMultiDayTotal');

// ── the fee is actually part of the multi-day total ──────────────────────────
ok(/const wj=\['cjmd-insurance','cjmd-coi','cjmd-dump','cjmd-yelp','cjmd-damage'\]/.test(HTML),
  'cjmd-insurance is included in the multi-day whole-job fees');

// ── one shared map, so the three forms cannot drift ──────────────────────────
eq((HTML.match(/const _INSURANCE_FEE_MAP=/g) || []).length, 1, 'exactly one fee map');
['cj-insurance-type', 'cjmd-insurance-type', 'ecjmd-insurance-type'].forEach(id => {
  const i = HTML.indexOf('id="' + id + '"');
  const seg = HTML.slice(i, HTML.indexOf('</select>', i));
  ok(seg.includes('Option 2 \u2014 Full Value Protection, $250 Deductible ($100)'),
    id + ' offers the same option text the map keys on');
});

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
