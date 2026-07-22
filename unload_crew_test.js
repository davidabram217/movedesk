// unload_crew_test.js
// Guards the 2026-07-22 "separate unload crew line on the quote" change to Section 1.
//
// Model: the existing "Move crew" block IS the load half of the job. A new optional "Unload crew"
// section adds its own mover count, rate and hours, and bills as a second customer-facing line —
// deliberately shaped like the packing crew that already works this way.
//
// Extracts and RUNS the real functions from index.html / quote-page.js rather than reimplementing.

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const QPJS = fs.readFileSync(path.join(__dirname, 'quote-page.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  \u2713 ' + m); } else { fail++; console.log('  \u2717 FAIL: ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function extract(src, sig) {
  const start = src.indexOf(sig);
  if (start === -1) throw new Error('not found: ' + sig);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced: ' + sig);
}

console.log('\n\u2500\u2500 extraction \u2500\u2500');
const srcCalc = extract(HTML, 'function calcQbTotals(');
const srcDraftEmpty = extract(HTML, 'function _isDraftEmpty(');
const srcToggle = extract(HTML, 'function toggleQbUnloadCrew(');
const srcAddDay = extract(HTML, 'function addQuoteDay(');
ok(!!srcCalc, 'calcQbTotals extracted');
ok(!!srcDraftEmpty, '_isDraftEmpty extracted');
ok(!!srcToggle, 'toggleQbUnloadCrew extracted');

// ── day fixtures ─────────────────────────────────────────────────────────────
const loadOnly = { crew: 3, rate: 210, hrsMin: 2, hrsMax: 3 };
const withUnload = {
  crew: 3, rate: 210, hrsMin: 2, hrsMax: 3,
  unloadCrew: true, unloadCrewSize: 2, unloadRate: 180, unloadHrsMin: 2, unloadHrsMax: 4
};

// ── totals ───────────────────────────────────────────────────────────────────
console.log('\n\u2500\u2500 calcQbTotals \u2500\u2500');
function totals(days, fees) {
  return new Function('qbDays', 'qbFees', 'db', srcCalc + '; return calcQbTotals();')
    (days, fees || [], { settings: { rateBase: 225 } });
}
const tLoad = totals([loadOnly]);
eq(tLoad.totalMin, 420, 'load-only day min unchanged (2 x 210)');
eq(tLoad.totalMax, 630, 'load-only day max unchanged (3 x 210)');

const tBoth = totals([withUnload]);
eq(tBoth.totalMin, 420 + 360, 'unload min added (2 x 180)');
eq(tBoth.totalMax, 630 + 720, 'unload max added (4 x 180)');

eq(totals([{ ...withUnload, unloadCrew: false }]).totalMin, 420,
   'toggling unload off drops it from the total');
eq(totals([{ ...withUnload, unloadRate: '' }]).totalMin, 420,
   'unload with no rate contributes nothing (matches packing-crew gating)');

const tStack = totals([{ ...withUnload, packCrew: true, packRate: 150, packHrsMin: 2, packHrsMax: 2 }]);
eq(tStack.totalMin, 420 + 360 + 300, 'load + unload + packing all stack');

eq(totals([{ flatRate: true, flatPrice: 1500, unloadCrew: true, unloadRate: 180, unloadHrsMin: 2 }]).totalMin,
   1500, 'flat-rate day ignores unload fields');

eq(totals([withUnload, loadOnly]).totalMin, 780 + 420, 'multi-day sums correctly');

// ── toggle seeding ───────────────────────────────────────────────────────────
console.log('\n\u2500\u2500 toggleQbUnloadCrew seeding \u2500\u2500');
function runToggle(day, checked) {
  const days = [{ id: 'd1', ...day }];
  new Function('qbDays', 'renderQbDays', 'qbAutoSave',
    srcToggle + "; toggleQbUnloadCrew('d1', " + checked + ");")(days, () => {}, () => {});
  return days[0];
}
let seeded = runToggle({ crew: 3, rate: 210, hrsMin: 2, hrsMax: 3 }, true);
eq(seeded.unloadCrew, true, 'toggle sets the flag');
eq(Number(seeded.unloadCrewSize), 3, 'seeds mover count from the day crew');
eq(Number(seeded.unloadRate), 210, 'seeds rate from the day rate');
eq(Number(seeded.unloadHrsMin), 2, 'seeds min hours from the day');
eq(Number(seeded.unloadHrsMax), 3, 'seeds max hours from the day');

let seededDiff = runToggle({ crew: 3, rate: 210, hrsMin: 2, hrsMax: 3, crewLoadDiff: true, crewLoad: 3, crewUnload: 2 }, true);
eq(Number(seededDiff.unloadCrewSize), 2, 'seeds mover count from crewUnload when crew-diff was already set');

let preset = runToggle({ crew: 3, rate: 210, hrsMin: 2, hrsMax: 3, unloadRate: 175, unloadCrewSize: 4, unloadHrsMin: 1, unloadHrsMax: 2 }, true);
eq(Number(preset.unloadRate), 175, 're-ticking does not clobber an edited rate');
eq(Number(preset.unloadCrewSize), 4, 're-ticking does not clobber an edited mover count');

eq(runToggle(withUnload, false).unloadCrew, false, 'unticking clears the flag');

// ── renderer parity (invariant #1) ───────────────────────────────────────────
console.log('\n\u2500\u2500 renderer parity \u2500\u2500');
const rqhIdx = HTML.indexOf('function renderQuoteHTML(');
const oIdx = HTML.indexOf('if(d.unloadCrew&&d.unloadRate){', rqhIdx);
const cIdx = QPJS.indexOf('if(d.unloadCrew&&d.unloadRate){');
ok(oIdx > -1, 'renderQuoteHTML emits an unload row');
ok(cIdx > -1, 'quote-page.js renderQuote emits an unload row');

const oRow = HTML.slice(oIdx, HTML.indexOf('if(d.packCrew&&d.packRate){', oIdx));
const cRow = QPJS.slice(cIdx, QPJS.indexOf('if(d.packCrew&&d.packRate){', cIdx));
eq((oRow.match(/border-bottom:1px solid #f0ece4/g) || []).length, 1, 'office unload row is exactly one <tr>');
eq((cRow.match(/border-bottom:1px solid #f0ece4/g) || []).length, 1, 'customer unload row is exactly one <tr>');

['padding:11px 6px', 'text-align:right;color:#6b6860', 'text-align:right;font-weight:600'].forEach(st => {
  const re = new RegExp(st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  eq((oRow.match(re) || []).length, (cRow.match(re) || []).length, 'style parity: ' + st);
});
['unloadCrewSize', 'unloadRate', 'unloadHrsMin', 'unloadHrsMax'].forEach(f => {
  ok(oRow.includes(f) && cRow.includes(f), 'both renderers read ' + f);
});
ok(oRow.includes('Movers – Unload') || oRow.includes('Movers \u2013 Unload'), 'office unload label reads "Movers – Unload"');
ok(cRow.includes('Movers \\u2013 Unload'), 'customer unload label reads "Movers – Unload"');
ok(oRow.includes("'Unload crew'") && cRow.includes("'Unload crew'"), 'both fall back to "Unload crew" with no mover count');

// The move row must relabel to "Load" in BOTH renderers, and only when an unload crew exists.
ok(HTML.includes('Movers – Load') || HTML.includes('Movers \u2013 Load'), 'office relabels the move row to Load');
ok(QPJS.includes("' Movers \\u2013 Load'"), 'customer relabels the move row to Load');
ok(HTML.includes('d.unloadCrew&&d.unloadRate\n      ?`${d.crewLoadDiff?(d.crewLoad||d.crew):d.crew} Movers – Load`'),
   'office Load label is gated on an unload crew existing');

// Legacy rows untouched in both files.
ok(HTML.includes('${fmt(d.hrsMin*d.rate)} – ${fmt(d.hrsMax*d.rate)}'), 'office legacy hourly row verbatim');
ok(QPJS.includes("fmt(d.hrsMin*d.rate)+' \\u2013 '+fmt(d.hrsMax*d.rate)"), 'customer legacy hourly row verbatim');
ok(HTML.includes("d.crewLoadDiff?`${d.crewLoad||d.crew} load / ${d.crewUnload||d.crew} unload movers`"),
   'office legacy crew-diff label still reachable for old quotes');
ok(QPJS.includes("d.crewLoadDiff?(d.crewLoad||d.crew)+' load / '+(d.crewUnload||d.crew)+' unload movers'"),
   'customer legacy crew-diff label still reachable for old quotes');

// ── blank-draft guards ───────────────────────────────────────────────────────
console.log('\n\u2500\u2500 blank-builder / shell-draft guards \u2500\u2500');
const _isDraftEmpty = new Function('db', srcDraftEmpty + '; return _isDraftEmpty;')({ settings: { rateBase: 225 } });
ok(_isDraftEmpty({ status: 'draft', days: [{ crew: 2, hrsMin: 2, hrsMax: 4, rate: 225 }] }) === true,
   'factory shell still detected as empty (invariant #24 intact)');
ok(_isDraftEmpty({ status: 'draft', days: [{ crew: 2, hrsMin: 2, hrsMax: 4, rate: 225, unloadCrew: true, unloadRate: 180 }] }) === false,
   'day with an unload crew is NOT empty (wipe guard)');
ok(_isDraftEmpty({ status: 'sent', days: [{ crew: 2, hrsMin: 2, hrsMax: 4, rate: 225 }] }) === false,
   'sent quote never empty');
const blankGuard = HTML.slice(HTML.indexOf('function _isBlankBuilderDays('), HTML.indexOf('function _quoteIsSubstantive('));
ok(blankGuard.includes('if(d.unloadCrew)return false;'), 'saveQuote blank-builder guard rejects unload days');

// ── quoted hours (accuracy + AI training) ────────────────────────────────────
console.log('\n\u2500\u2500 resolveQuotedInfo quoted hours \u2500\u2500');
const uhIdx = HTML.indexOf('const _uh=(d,lo)=>');
ok(uhIdx > -1, 'unload-hours helper present');
const hoursBlock = HTML.slice(uhIdx, HTML.indexOf('_any=true;}});', uhIdx)) + '_any=true;}});';
const simHours = new Function('_ds', 'let _hmin=0,_hmax=0,_any=false;' + hoursBlock + 'return {_hmin,_hmax,_any};');
let r = simHours([withUnload]);
eq(r._hmin, 4, 'quoted min hours = 2 load + 2 unload');
eq(r._hmax, 7, 'quoted max hours = 3 load + 4 unload');
r = simHours([loadOnly]);
eq(r._hmin, 2, 'load-only day quoted hours unchanged');
eq(r._hmax, 3, 'load-only day quoted hours unchanged');
r = simHours([{ hrsMin: 7, hrsMax: 9 }, { hrsMin: 7, hrsMax: 9 }]);
eq(r._hmin, 14, 'legacy multi-day summation preserved (14)');
eq(r._hmax, 18, 'legacy multi-day summation preserved (18)');
ok(simHours([{ flatRate: true, unloadCrew: true, unloadRate: 180, unloadHrsMin: 3 }])._any === false,
   'flat-rate day contributes no hours');
ok(simHours([{ hrsMin: 2, hrsMax: 3, unloadCrew: true, unloadRate: '' }])._hmin === 2,
   'unload with no rate adds no hours');

// ── builder wiring ───────────────────────────────────────────────────────────
console.log('\n\u2500\u2500 builder wiring \u2500\u2500');
ok(HTML.includes('toggleQbUnloadCrew('), 'toggle wired into the day card');
ok(HTML.includes('Add unload crew (separate crew, rate &amp; hours)'), 'toggle label rendered');
['unloadCrewSize', 'unloadRate', 'unloadHrsMin', 'unloadHrsMax'].forEach(f => {
  ok(HTML.includes("updateQbDay('${d.id}','" + f + "',this.value)"), 'field wired: ' + f);
});
['unloadCrew', 'unloadCrewSize', 'unloadRate', 'unloadHrsMin', 'unloadHrsMax'].forEach(f => {
  ok(srcAddDay.includes(f + ':last.'), 'addQuoteDay carries ' + f + ' to the next day');
});
ok(HTML.includes("${d.unloadCrew?'':`"), 'crew-size-diff toggle hides when the unload section is on');
ok(HTML.includes('(d.crewLoadDiff&&!d.unloadCrew)'), 'crew-diff summary chip hides when the unload section is on');

console.log('\n' + '\u2500'.repeat(60));
console.log(`unload_crew_test.js: ${pass} passed, ${fail} failed`);
console.log('\u2500'.repeat(60) + '\n');
process.exit(fail > 0 ? 1 : 0);
