// multiday_calendar_costs_test.js
// Guards the 2026-08-19 fix: adding each day of a DIRECTLY booked multi-day job to the calendar
// carried only the hourly rate. Flat-rate days, hour minimums, and the per-day fuel/materials
// fees typed on the booking form were all dropped.
//
// Cause: buildDayCalUrl sourced every fee from j.quoteFees, which is populated by the QUOTE.
// A directly booked job has no quote, so that array is empty and the fee loop found nothing.
// The per-day feeFuel/feeMaterials that _bjReadDays() does capture were never rendered, and
// day.flatRate/flatPrice were not handled at all — only `if(rate)` was.
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } };

function ex(sig) {
  const st = HTML.indexOf(sig);
  if (st === -1) throw new Error('could not find: ' + sig);
  let d = 0, i = HTML.indexOf('{', st);
  for (; i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}') { d--; if (!d) return HTML.slice(st, i + 1); } }
}
const buildDayCalUrl = new Function('fmtDate', 'encodeURIComponent',
  ex('function buildDayCalUrl(') + ';return buildDayCalUrl;')(d => d, x => x);

function details(j, day, n) {
  const url = buildDayCalUrl(j, day, n);
  return decodeURIComponent(url.split('&details=')[1].split('&location=')[0]);
}

const JOB = { name: 'Test Client', phone: '415-555-0100', from: '314 Wildwood Ave', to: '925 Palou Ave',
  rateCash: 0, packing: 'No \u2014 just moving', quoteDays: [{}, {}], quoteFees: [] };

// ── hourly day with fees ─────────────────────────────────────────────────────
{
  const d = details(JOB, { date: '2026-09-10', crew: 4, rate: 265, hrsMin: 6, hrsMax: 8,
    feeFuel: 190, feeMaterials: 40, to: '925 Palou Ave' }, 1);
  ok(/4 men @ \$265\.00 Per Hour/.test(d), 'hourly rate still shown');
  ok(/6 hour minimum/.test(d), 'hour minimum now shown');
  ok(/Estimated 6\u20138 hours/.test(d), 'hour range now shown');
  ok(/\$40\.00 Material Fee/.test(d), 'per-day material fee now shown');
  ok(/\$190\.00 Fuel Fee/.test(d), 'per-day fuel fee now shown');
}

// ── flat-rate day ────────────────────────────────────────────────────────────
{
  const d = details(JOB, { date: '2026-09-11', crew: 3, flatRate: true, flatPrice: 1200,
    flatPriceCash: 1100, feeFuel: 95, from: '925 Palou Ave', to: '12 New St' }, 2);
  ok(/Move services: \$1,200\.00 flat rate/.test(d), 'flat price now shown');
  ok(/\$1,100\.00 If Paid Cash/.test(d), 'flat cash price now shown');
  ok(/3 movers/.test(d), 'crew shown on a flat-rate day');
  ok(/\$95\.00 Fuel Fee/.test(d), 'fees shown on a flat-rate day too');
  ok(!/Per Hour/.test(d), 'a flat-rate day does NOT also print an hourly line');
}
{
  // A flat day with no price set must not print an empty flat line.
  const d = details(JOB, { date: '2026-09-11', crew: 3, flatRate: true, flatPrice: 0 }, 2);
  ok(!/flat rate/.test(d), 'no flat line when no flat price is set');
}

// ── zero / missing fees must not print $0 lines ──────────────────────────────
{
  const d = details(JOB, { date: '2026-09-10', crew: 4, rate: 265 }, 1);
  ok(!/Material Fee/.test(d), 'no material fee line when there is none');
  ok(!/Fuel Fee/.test(d), 'no fuel fee line when there is none');
  ok(!/hour minimum/.test(d), 'no hour-minimum line when not set');
}

// ── day 1 falls back to the job-level fees (where the single-day form writes them) ──
{
  const j2 = Object.assign({}, JOB, { feeFuel: 150, feeMaterials: 60 });
  const d1 = details(j2, { date: '2026-09-10', crew: 4, rate: 265 }, 1);
  ok(/\$150\.00 Fuel Fee/.test(d1), 'day 1 falls back to the job fuel fee');
  ok(/\$60\.00 Material Fee/.test(d1), 'day 1 falls back to the job material fee');
  const d2 = details(j2, { date: '2026-09-11', crew: 3, rate: 225 }, 2);
  ok(!/Fuel Fee/.test(d2), 'day 2 does NOT inherit the job-level fee (would double-charge)');
}
{
  // A per-day fee must win over the job-level one on day 1.
  const j2 = Object.assign({}, JOB, { feeFuel: 150 });
  const d1 = details(j2, { date: '2026-09-10', crew: 4, rate: 265, feeFuel: 190 }, 1);
  ok(/\$190\.00 Fuel Fee/.test(d1) && !/\$150\.00/.test(d1), 'per-day fee overrides the job fee');
}

// ── packing materials fall back to the booking form range ────────────────────
{
  // A "pack day" is one with NO destination at any level (that is how isPackDay is defined).
  const j2 = Object.assign({}, JOB, { packMatMin: 150, packMatMax: 300, packing: 'Yes', to: '' });
  const d = details(j2, { date: '2026-09-10', crew: 4, rate: 265 }, 1);
  ok(/Packing Materials: \$150 – \$300/.test(d), 'packing materials range shown on a pack day');
  // A day WITH a destination is a move day, so materials stay off it — unchanged behaviour.
  const d2 = details(Object.assign({}, JOB, { packMatMin: 150, packMatMax: 300 }),
    { date: '2026-09-10', crew: 4, rate: 265, to: '925 Palou Ave' }, 1);
  ok(!/Packing Materials/.test(d2), 'a day with a destination is not treated as a pack day');
}

// ── quote-driven jobs unchanged ──────────────────────────────────────────────
{
  const j2 = Object.assign({}, JOB, { quoteFees: [{ label: 'Fuel Fee', amount: 200, included: true }] });
  const d = details(j2, { date: '2026-09-10', crew: 4, rate: 265 }, 1);
  ok(/\$200\.00 Fuel Fee/.test(d), 'quote fees still render');
}

// ── wiring ───────────────────────────────────────────────────────────────────
ok(/if\(day\.flatRate\)\{[\s\S]{0,400}flatPrice/.test(HTML), 'buildDayCalUrl handles flat-rate days');
ok(/const _dayFuel=Number\(day\.feeFuel\|\|0\)\|\|\(dayNum===1\?Number\(j\.feeFuel\|\|0\):0\)/.test(HTML),
  'per-day fuel fee with a day-1-only job fallback');
ok(/const _dayMat=Number\(day\.feeMaterials\|\|0\)\|\|\(dayNum===1\?Number\(j\.feeMaterials\|\|0\):0\)/.test(HTML),
  'per-day material fee with a day-1-only job fallback');
ok(/else if\(j\.packMatMin\|\|j\.packMatMax\)/.test(HTML), 'packing materials fall back to the booking form');
ok(/if\(day\.hrsMin\)lines\.push\(day\.hrsMin\+' hour minimum'\)/.test(HTML), 'hour minimum is printed');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
