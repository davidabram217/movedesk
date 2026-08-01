// booking_unload_crew_test.js
// Guards the 2026-07-22 "different rate & crew for load vs unload at BOOKING" change (Section 3
// unlock). The quote already supports an unload crew (invariant #31); this propagates the same to
// the booking modal, its save/prefill/draft-restore, and the confirmation email + calendar block.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { console.log('\u2713 ' + name); pass++; }
  else { console.log('\u2717 ' + name + (info ? '\n  ' + info : '')); fail++; }
}
function eq(a, b, name) { check(name + '  (got ' + JSON.stringify(a) + ')', a === b); }

function extract(sig) {
  const start = indexHtml.indexOf(sig);
  if (start === -1) throw new Error('not found: ' + sig);
  let depth = 0;
  for (let i = indexHtml.indexOf('{', start); i < indexHtml.length; i++) {
    if (indexHtml[i] === '{') depth++;
    else if (indexHtml[i] === '}') { depth--; if (depth === 0) return indexHtml.slice(start, i + 1); }
  }
  throw new Error('unbalanced: ' + sig);
}

console.log('PART A: markup + wiring');

check('Booking modal has the unload-crew toggle',
  /id="bj-unload-crew"[^>]*onchange="toggleBjUnloadCrew\(\)"/.test(indexHtml));
['bj-unload-crew-size', 'bj-unload-rate', 'bj-unload-hrs-min', 'bj-unload-hrs-max'].forEach(id =>
  check('Booking modal has field ' + id, new RegExp('id="' + id + '"').test(indexHtml)));
check('Toggle handler toggleBjUnloadCrew defined', /function toggleBjUnloadCrew\(\)\{/.test(indexHtml));
check('The old crew-size toggle is still present (untouched)',
  /id="bj-crew-diff"[^>]*onchange="toggleBjCrewDiff\(\)"/.test(indexHtml));

check('bjWriteFields persists j.unloadCrew',
  /j\.unloadCrew=document\.getElementById\('bj-unload-crew'\)\?\.checked\|\|false/.test(indexHtml));
['unloadCrewSize', 'unloadRate', 'unloadHrsMin', 'unloadHrsMax'].forEach(f =>
  check('bjWriteFields persists j.' + f, new RegExp('j\\.' + f + '=document').test(indexHtml)));

check('openBooking resets the unload section on open',
  /uc\.checked=false;const ucf=document\.getElementById\('bj-unload-crew-fields'\)/.test(indexHtml));
check('openBooking prefills unload section from the quote day (invariant #31)',
  /if\(day\.unloadCrew\)\{[\s\S]{0,400}bj-unload-crew/.test(indexHtml));
check('Draft-restore path restores the unload section',
  /uc\.checked=!!j\.unloadCrew;const ucf=document\.getElementById\('bj-unload-crew-fields'\)/.test(indexHtml));

console.log('\nPART B: confirmation email / calendar block behaviour');

// Run the REAL buildMoveDetailsBlock with a booking that has an unload crew.
const helpers = 'function _fmtRate(r){r=Number(r)||0;return r%1===0?String(r):r.toFixed(2);}\n' +
                'function fmtDateWithDay(d){if(!d)return "";const dt=new Date(d+"T12:00:00");' +
                'return dt.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric",year:"numeric"});}\n' +
                'function fmtDate(d){return fmtDateWithDay(d);}\n';
const bmdb = new Function('l', 'bj', 'db',
  helpers + extract('function buildMoveDetailsBlock(') + '; return buildMoveDetailsBlock(l,bj);');

const baseBj = {
  date: '2026-08-11', time: '8:00 AM – 9:00 AM', movers: '3',
  rateRegular: '210', rateCash: '195', to: '', from: ''
};

// Without unload crew — the crew line must be exactly as before.
{
  const out = bmdb({}, Object.assign({}, baseBj), { leads: [], settings: {} });
  check('No unload crew: single "3 Movers @ $210" line, unchanged',
    /3 Movers @ \$210 Per Hour/.test(out) && !/Unload/.test(out), out);
}

// With unload crew — main line becomes Load, and a separate Unload line follows.
{
  const bj = Object.assign({}, baseBj, {
    unloadCrew: true, unloadCrewSize: '2', unloadRate: '180', unloadHrsMin: '2', unloadHrsMax: '3'
  });
  const out = bmdb({}, bj, { leads: [], settings: {} });
  check('Unload crew: load line relabelled "3 Movers – Load"',
    /3 Movers \u2013 Load @ \$210 Per Hour/.test(out), out);
  check('Unload crew: separate "2 Movers – Unload @ $180" line present',
    /2 Movers \u2013 Unload @ \$180 Per Hour/.test(out), out);
  check('Unload crew: unload line shows the hours range',
    /2 Movers \u2013 Unload[\s\S]{0,60}2\u20133 hrs/.test(out), out);
  check('Cash rate still shown on the load line', /\$195 If Paid Cash/.test(out), out);
}

// Unload flagged but no rate → treated as not set, no unload line, load line NOT relabelled.
{
  const bj = Object.assign({}, baseBj, { unloadCrew: true, unloadRate: '' });
  const out = bmdb({}, bj, { leads: [], settings: {} });
  check('Unload toggled but no rate: falls back to plain "3 Movers" line',
    /3 Movers @ \$210 Per Hour/.test(out) && !/Unload/.test(out), out);
}

// crewDiff (old feature) still works when there's no separate unload rate.
{
  const bj = Object.assign({}, baseBj, { crewDiff: true, crewLoad: '4', crewUnload: '2' });
  const out = bmdb({}, bj, { leads: [], settings: {} });
  check('crewDiff without unload rate: original "4 load / 2 unload movers" line preserved',
    /4 load \/ 2 unload movers @ \$210/.test(out), out);
}

// crewDiff AND a separate unload rate: unload rate wins the layout (Load / Unload lines).
{
  const bj = Object.assign({}, baseBj, {
    crewDiff: true, crewLoad: '4', crewUnload: '2',
    unloadCrew: true, unloadCrewSize: '2', unloadRate: '180'
  });
  const out = bmdb({}, bj, { leads: [], settings: {} });
  check('crewDiff + unload rate: load line uses the load crew count (4)',
    /4 Movers \u2013 Load @ \$210/.test(out), out);
  check('crewDiff + unload rate: unload line present at $180',
    /2 Movers \u2013 Unload @ \$180/.test(out), out);
}

console.log('\n' + '='.repeat(56));
console.log('booking_unload_crew_test.js: ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(56));
process.exit(fail > 0 ? 1 : 0);
