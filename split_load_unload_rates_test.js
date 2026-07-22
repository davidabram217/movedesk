// split_load_unload_rates_test.js
// Guards the 2026-07-22 "separate load and unload rate lines" change to Section 1.
//
// Extracts the REAL functions out of index.html / quote-page.js and runs them, rather than
// reimplementing the logic here. Covers:
//   - _qbSplitTotals / _qbSeedSplit segment math and the price-preserving seed
//   - calcQbTotals summing both segments
//   - BOTH renderers emitting two rows, and staying in parity (invariant #1)
//   - legacy (non-split) quotes rendering byte-for-byte unchanged
//   - the blank-builder / _isDraftEmpty guards refusing to call a split day empty
//   - resolveQuotedInfo's quoted-hours sum covering both segments

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const QPJS = fs.readFileSync(path.join(__dirname, 'quote-page.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.log('  \u2717 FAIL: ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// ── extraction ───────────────────────────────────────────────────────────────
// Naive brace counter, same approach the other suites use.
function extract(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error('could not find: ' + signature);
  let depth = 0, i = src.indexOf('{', start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces from: ' + signature);
}

console.log('\n── extraction ──');
const srcSplitTotals = extract(HTML, 'function _qbSplitTotals(');
const srcSeedSplit   = extract(HTML, 'function _qbSeedSplit(');
const srcCalcTotals  = extract(HTML, 'function calcQbTotals(');
const srcDraftEmpty  = extract(HTML, 'function _isDraftEmpty(');
ok(srcSplitTotals.length > 0, '_qbSplitTotals extracted');
ok(srcSeedSplit.length > 0, '_qbSeedSplit extracted');
ok(srcCalcTotals.length > 0, 'calcQbTotals extracted');
ok(srcDraftEmpty.length > 0, '_isDraftEmpty extracted');

// ── segment math ─────────────────────────────────────────────────────────────
console.log('\n── _qbSplitTotals segment math ──');
const _qbSplitTotals = new Function(srcSplitTotals + '; return _qbSplitTotals;')();

const splitDay = {
  splitRates: true, crew: 3, rate: 225, hrsMin: 2, hrsMax: 4,
  rateLoad: 265, hrsMinLoad: 3, hrsMaxLoad: 4,
  rateUnload: 205, hrsMinUnload: 2, hrsMaxUnload: 3
};
const st = _qbSplitTotals(splitDay);
eq(st.loadMin, 795, 'load min = 3hrs x $265');
eq(st.loadMax, 1060, 'load max = 4hrs x $265');
eq(st.unloadMin, 410, 'unload min = 2hrs x $205');
eq(st.unloadMax, 615, 'unload max = 3hrs x $205');
eq(st.hrsMin, 5, 'summed min hours = 3 + 2');
eq(st.hrsMax, 7, 'summed max hours = 4 + 3');

ok(_qbSplitTotals({ splitRates: false, rate: 225, hrsMin: 2, hrsMax: 4 }) === null,
   'returns null for a non-split day (callers keep original math)');
ok(_qbSplitTotals({ splitRates: true, flatRate: true }) === null,
   'returns null when the day is flat-rate (flat wins)');
ok(_qbSplitTotals(null) === null, 'null-safe');

const partial = _qbSplitTotals({ splitRates: true, rateLoad: 200, hrsMinLoad: 2, hrsMaxLoad: 3 });
eq(partial.unloadMin, 0, 'missing unload fields coerce to 0, no NaN');
eq(partial.loadMin, 400, 'load side still computes with unload blank');

// ── seed preserves the price ─────────────────────────────────────────────────
console.log('\n── _qbSeedSplit price preservation ──');
const _qbSeedSplit = new Function(srcSeedSplit + '; return _qbSeedSplit;')();

function seedCase(hrsMin, hrsMax, rate) {
  const d = { rate, hrsMin, hrsMax, rateLoad: '', rateUnload: '', hrsMinLoad: '', hrsMaxLoad: '', hrsMinUnload: '', hrsMaxUnload: '' };
  _qbSeedSplit(d);
  return d;
}
let s1 = seedCase(2, 4, 225);
eq(Number(s1.hrsMinLoad) + Number(s1.hrsMinUnload), 2, 'seed: load+unload min sums back to 2');
eq(Number(s1.hrsMaxLoad) + Number(s1.hrsMaxUnload), 4, 'seed: load+unload max sums back to 4');
eq(s1.rateLoad, 225, 'seed: load rate inherits the day rate');
eq(s1.rateUnload, 225, 'seed: unload rate inherits the day rate');
const s1t = _qbSplitTotals({ ...s1, splitRates: true });
eq(s1t.loadMin + s1t.unloadMin, 2 * 225, 'seed: total min price unchanged by ticking the box');
eq(s1t.loadMax + s1t.unloadMax, 4 * 225, 'seed: total max price unchanged by ticking the box');

let s2 = seedCase(3, 5, 250);   // odd hours -> half-hour split
eq(Number(s2.hrsMinLoad) + Number(s2.hrsMinUnload), 3, 'seed: odd min hours still sum exactly');
eq(Number(s2.hrsMaxLoad) + Number(s2.hrsMaxUnload), 5, 'seed: odd max hours still sum exactly');

let s3 = { rate: 225, hrsMin: 2, hrsMax: 4, rateLoad: 300, rateUnload: 180, hrsMinLoad: 1, hrsMaxLoad: 2, hrsMinUnload: 4, hrsMaxUnload: 5 };
_qbSeedSplit(s3);
eq(s3.rateLoad, 300, 'seed: does not clobber an already-set load rate');
eq(s3.hrsMinUnload, 4, 'seed: does not clobber already-set hours (re-tick is safe)');

// ── calcQbTotals ─────────────────────────────────────────────────────────────
console.log('\n── calcQbTotals ──');
function runTotals(days, fees) {
  const fn = new Function('qbDays', 'qbFees', 'db',
    srcSplitTotals + '\n' + srcCalcTotals + '\n; return calcQbTotals();');
  return fn(days, fees || [], { settings: { rateBase: 225 } });
}
const tSplit = runTotals([splitDay]);
eq(tSplit.totalMin, 1205, 'split day labour min = 795 + 410');
eq(tSplit.totalMax, 1675, 'split day labour max = 1060 + 615');

const tLegacy = runTotals([{ crew: 3, rate: 225, hrsMin: 2, hrsMax: 4 }]);
eq(tLegacy.totalMin, 450, 'legacy hourly day unchanged (2 x 225)');
eq(tLegacy.totalMax, 900, 'legacy hourly day unchanged (4 x 225)');

const tSplitPack = runTotals([{ ...splitDay, packCrew: true, packRate: 180, packHrsMin: 2, packHrsMax: 3 }]);
eq(tSplitPack.totalMin, 1205 + 360, 'packing crew still stacks on top of a split day');
eq(tSplitPack.totalMax, 1675 + 540, 'packing crew max still stacks on a split day');

const tFlat = runTotals([{ flatRate: true, splitRates: true, flatPrice: 1500 }]);
eq(tFlat.totalMin, 1500, 'flat-rate day ignores split fields entirely');

const tMulti = runTotals([splitDay, { crew: 2, rate: 225, hrsMin: 2, hrsMax: 3 }]);
eq(tMulti.totalMin, 1205 + 450, 'multi-day: split day + legacy day sum correctly');

// ── renderer parity (invariant #1) ───────────────────────────────────────────
console.log('\n── renderer parity ──');
const officeBranch = HTML.indexOf('} else if(d.splitRates){');
const custBranch = QPJS.indexOf('} else if(d.splitRates){');
ok(officeBranch > -1, 'renderQuoteHTML has a splitRates branch');
ok(custBranch > -1, 'quote-page.js renderQuote has a splitRates branch');

function branchOf(src, from) { return src.slice(from, src.indexOf('} else {', from)); }
const ob = branchOf(HTML, officeBranch);
const cb = branchOf(QPJS, custBranch);

// Both must produce the same visible strings and the same styles.
['Movers \u2013 Load', 'Movers \u2013 Unload'].forEach(lbl => {
  ok(ob.includes(lbl.replace('\u2013', '\u2013')) || ob.includes('Movers – Load') || ob.includes('Movers – Unload'),
     'office branch carries the "' + lbl + '" label shape');
});
ok(/Load/.test(ob) && /Unload/.test(ob), 'office branch labels both segments');
ok(/Load/.test(cb) && /Unload/.test(cb), 'customer branch labels both segments');

const officeRows = (ob.match(/border-bottom:1px solid #f0ece4/g) || []).length;
const custRows = (cb.match(/border-bottom:1px solid #f0ece4/g) || []).length;
eq(officeRows, 2, 'office branch emits exactly 2 billing rows');
eq(custRows, 2, 'customer branch emits exactly 2 billing rows');
eq(officeRows, custRows, 'both renderers emit the same number of rows');

['padding:11px 6px', 'text-align:right;color:#6b6860', 'text-align:right;font-weight:600'].forEach(s => {
  eq((ob.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
     (cb.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
     'style "' + s + '" used equally often in both renderers');
});

['rateLoad', 'rateUnload', 'hrsMinLoad', 'hrsMaxLoad', 'hrsMinUnload', 'hrsMaxUnload', 'crewLoadDiff'].forEach(f => {
  ok(ob.includes(f) && cb.includes(f), 'both renderers read ' + f);
});

// Legacy path must be untouched in both files.
ok(HTML.includes('${fmt(d.hrsMin*d.rate)} – ${fmt(d.hrsMax*d.rate)}'),
   'office legacy hourly row still present verbatim');
ok(QPJS.includes("fmt(d.hrsMin*d.rate)+' \\u2013 '+fmt(d.hrsMax*d.rate)"),
   'customer legacy hourly row still present verbatim');

// ── blank-draft guards ───────────────────────────────────────────────────────
console.log('\n── blank-builder / shell-draft guards ──');
const _isDraftEmpty = new Function('db', srcDraftEmpty + '; return _isDraftEmpty;')({ settings: { rateBase: 225 } });

const shell = { status: 'draft', days: [{ crew: 2, hrsMin: 2, hrsMax: 4, rate: 225 }] };
ok(_isDraftEmpty(shell) === true, 'factory shell draft is still detected as empty (invariant #24 intact)');

const shellSplit = { status: 'draft', days: [{ crew: 2, hrsMin: 2, hrsMax: 4, rate: 225, splitRates: true, rateLoad: 265, hrsMinLoad: 3 }] };
ok(_isDraftEmpty(shellSplit) === false, 'split day with default base fields is NOT empty (wipe guard)');

ok(_isDraftEmpty({ status: 'draft', days: [{ crew: 4, hrsMin: 2, hrsMax: 4, rate: 225 }] }) === false,
   'edited crew still not empty');
ok(_isDraftEmpty({ status: 'sent', days: [{ crew: 2, hrsMin: 2, hrsMax: 4, rate: 225 }] }) === false,
   'sent quote never empty');

const blankGuardSrc = HTML.slice(HTML.indexOf('function _isBlankBuilderDays('), HTML.indexOf('function _quoteIsSubstantive('));
ok(blankGuardSrc.includes('if(d.splitRates)return false;'),
   'saveQuote blank-builder guard rejects split days');

// ── quoted hours (accuracy + AI training) ────────────────────────────────────
console.log('\n── resolveQuotedInfo quoted-hours sum ──');
const hoursIdx = HTML.indexOf('const _qHrs=(d,lo)=>d.splitRates');
ok(hoursIdx > -1, 'quoted-hours split helper located');
const hoursBlock = HTML.slice(hoursIdx, HTML.indexOf('_any=true;}});', hoursIdx)) + '_any=true;}});';
ok(hoursBlock.includes('hrsMinLoad') && hoursBlock.includes('hrsMinUnload'),
   'quoted min hours sums both segments');
ok(hoursBlock.includes('hrsMaxLoad') && hoursBlock.includes('hrsMaxUnload'),
   'quoted max hours sums both segments');

const simHours = new Function('_ds', `
  let _hmin=0,_hmax=0,_any=false;
  ${hoursBlock}
  return {_hmin,_hmax,_any};
`);
const rh = simHours([splitDay]);
eq(rh._hmin, 5, 'split day reports 5 quoted min hours, not 2');
eq(rh._hmax, 7, 'split day reports 7 quoted max hours, not 4');
const rhLegacy = simHours([{ hrsMin: 2, hrsMax: 4 }]);
eq(rhLegacy._hmin, 2, 'legacy day quoted hours unchanged');
eq(rhLegacy._hmax, 4, 'legacy day quoted hours unchanged');
const rhFlat = simHours([{ flatRate: true, splitRates: true, hrsMinLoad: 3 }]);
eq(rhFlat._any, false, 'flat-rate day contributes no hours, split fields ignored');

// ── builder wiring ───────────────────────────────────────────────────────────
console.log('\n── builder wiring ──');
ok(HTML.includes('toggleQbSplitRates('), 'toggle function exists and is wired');
ok(HTML.includes('Different rate &amp; hours for load vs unload'), 'toggle label rendered');
['rateLoad', 'hrsMinLoad', 'hrsMaxLoad', 'rateUnload', 'hrsMinUnload', 'hrsMaxUnload'].forEach(f => {
  ok(HTML.includes(`updateQbDay('${'${d.id}'}','${f}',this.value)`), 'builder field wired: ' + f);
});
const addDay = extract(HTML, 'function addQuoteDay(');
['splitRates', 'rateLoad', 'hrsMinLoad', 'hrsMaxLoad', 'rateUnload', 'hrsMinUnload', 'hrsMaxUnload'].forEach(f => {
  ok(addDay.includes(f + ':last.'), 'addQuoteDay carries ' + f + ' to the next day');
});
ok(HTML.includes("${d.flatRate?'':`") , 'split toggle is hidden on flat-rate days');

// ── summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`split_load_unload_rates_test.js: ${pass} passed, ${fail} failed`);
console.log('─'.repeat(60) + '\n');
process.exit(fail > 0 ? 1 : 0);
