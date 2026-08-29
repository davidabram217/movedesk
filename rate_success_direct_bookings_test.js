// rate_success_direct_bookings_test.js
// Guards the 2026-08-19 addition: jobs booked on a call with no estimate now appear in the
// Hourly rate success table, in their own "Booked on call" column.
//
// Before: both gates in getEstimateEvents required a price to have been RECORDED (rough quote
// or formal estimate), so a phone booking never reached the chart at all — even though a rate
// was quoted verbally on the call and stored as rateRegular on the booked job.
//
// The rate used is ALWAYS the REGULAR rate, never the cash rate: quoted "$195/hr or $180 cash"
// means $195 is the rate that won the job, however the customer later paid.
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } };
const eq = (a, b, m) => ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

// ── bucketing: direct bookings must never move sent/accepted ─────────────────
function bucket(events) {
  const _rg = {};
  events.forEach(e => {
    if (!e.rate) return;
    const b = '$' + e.rate + '/hr';
    if (!_rg[b]) _rg[b] = { sent: 0, accepted: 0, direct: 0, rate: e.rate };
    if (e.direct) { _rg[b].direct++; return; }
    _rg[b].sent++;
    if (e.booked) _rg[b].accepted++;
  });
  return _rg;
}
{
  const g = bucket([
    { rate: 195, booked: true }, { rate: 195, booked: false }, { rate: 195, booked: true },
    { rate: 195, direct: true }, { rate: 195, direct: true },
    { rate: 180, direct: true }
  ]);
  eq(g['$195/hr'].sent, 3, 'only estimate events count as quoted');
  eq(g['$195/hr'].accepted, 2, 'only estimate events count as accepted');
  eq(g['$195/hr'].direct, 2, 'phone bookings counted separately');
  eq(Math.round(g['$195/hr'].accepted / g['$195/hr'].sent * 100), 67,
    'acceptance rate is NOT inflated by phone bookings');
  eq(g['$180/hr'].sent, 0, 'a rate seen only on calls has no quoted count');
  eq(g['$180/hr'].direct, 1, 'and is still visible via the direct column');
}

// ── which rate is used ───────────────────────────────────────────────────────
// The event builder reads rateRegular from the booked job, falling back to the completed job's
// preserved quotedRate. The cash rate must never be the one bucketed.
{
  const bj = { rateRegular: '195', rateCash: '180' };
  const cj = { quotedRate: 195, cashRate: 180, hourlyRateCharged: 180 };
  const rate = Math.round(Number(bj && bj.rateRegular) || Number(cj && cj.quotedRate) || 0);
  eq(rate, 195, 'uses the REGULAR rate, not the $180 cash rate');
  const rateAfterCompletion = Math.round(Number(null) || Number(cj.quotedRate) || 0);
  eq(rateAfterCompletion, 195, 'still $195 after completion, when the booked job is gone');
  ok(rate !== cj.hourlyRateCharged, 'and not the $180 actually charged for paying cash');
}
{
  // Flat-rate bookings store no hourly rate and must be skipped, not bucketed at $0.
  const bj = { rateRegular: '', flatRate: true, flatPrice: '1200' };
  eq(Math.round(Number(bj.rateRegular) || 0), 0, 'flat-rate job yields no rate');
}

// ── source wiring ────────────────────────────────────────────────────────────
ok(/const _rate=Math\.round\(Number\(_bj&&_bj\.rateRegular\)\|\|Number\(_cj&&_cj\.quotedRate\)\|\|0\);/.test(HTML),
  'rate comes from the booking form, falling back to the preserved quotedRate');
ok(!/_cj&&_cj\.cashRate/.test(HTML.slice(HTML.indexOf('Booked on call'), HTML.indexOf('Booked on call') + 800)),
  'the cash rate is never used as the bucket');
ok(/_quotedRate=j\?Number\(j\.rateRegular\)/.test(HTML),
  'completion preserves the booked regular rate as quotedRate');

// ── exclusions in the direct pass ────────────────────────────────────────────
ok(/if\(!\['Booked','Completed'\]\.includes\(l\.status\)\)return;/.test(HTML), 'only booked/completed leads');
ok(/if\(l\.roughQuoteDate\|\|l\.roughQuoteMin\|\|l\.roughQuote\)return;/.test(HTML), 'rough-quoted leads excluded');
ok(/if\(l\.estimateType\|\|l\.estimateSentBy\)return;/.test(HTML), 'estimate leads excluded');
ok(/if\(\(db\.quotes\|\|\[\]\)\.some\(q=>q\.leadId===l\.id\)\)return;/.test(HTML), 'quoted leads excluded');
ok(/booked:false,lost:false,pending:false,direct:true/.test(HTML),
  'direct events are neither booked nor lost nor pending, so no other metric can pick them up');

// ── chart rendering ──────────────────────────────────────────────────────────
ok(/if\(e\.direct\)\{_rg\[bucket\]\.direct\+\+;return;\}/.test(HTML),
  'direct events short-circuit before sent/accepted');
ok(/>Booked on call<\/th>/.test(HTML), 'the column header exists');
ok(/const _noSent=d\.sent===0;/.test(HTML), 'rows with no quotes are detected');
ok(/\$\{_noSent\?'\\u2014':pct\+'%'\}/.test(HTML) || /_noSent\?'—':pct\+'%'/.test(HTML),
  'a direct-only rate shows a dash, not a misleading 0%');

// ── the AI corpus is deliberately unchanged ──────────────────────────────────
ok(/actualRate/.test(HTML), 'AI training still records actualRate');
ok(/hourlyRateCharged:_chargedRate/.test(HTML),
  'the charged (cash) rate is still stored separately \u2014 real money is not overwritten');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
