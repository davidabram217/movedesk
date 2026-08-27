// multiday_per_day_addresses_test.js
// Guards the 2026-08-19 fix: a multi-day job booked DIRECTLY (no quote) showed
// "To: Load trucks only" under every day in the confirmation email.
//
// Cause: _bjReadDays() captured date/crew/rates/hours/arrival/fees but NO addresses, so the
// booked job's quoteDays had no from/to. The email resolved unloads as
// `day.to || bjDay.to` — both undefined — so hasUnloads was false on every day and each fell
// to the load-only branch, even though the addresses were on the booked job all along.
//
// Fix: per-day From/To fields on the multi-day booking form, plus a fallback to the JOB's
// main From/To when a day leaves them blank (the common case: same route every day).
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } };
const eq = (a, b, m) => ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

// ── the resolution the email performs ────────────────────────────────────────
function resolve(day, bjDay, bj) {
  const loads = (day.loads && day.loads.length) ? day.loads : [{ address: day.from || bjDay.from || (bj && bj.from) || '' }];
  const unloads = (day.unloads && day.unloads.length) ? day.unloads : [{ address: day.to || bjDay.to || (bj && bj.to) || '' }];
  const hasUnloads = unloads.some(u => u.address);
  return {
    from: loads.map(u => u.address).filter(Boolean).join(', '),
    to: hasUnloads ? unloads.map(u => u.address).filter(Boolean).join(', ') : 'Load trucks only'
  };
}
const JOB = { from: '314 Wildwood Ave', to: '925 Palou Ave' };

// THE BUG: a directly-booked day with no per-day addresses must use the job's.
{
  const r = resolve({}, {}, JOB);
  eq(r.from, '314 Wildwood Ave', 'blank day falls back to the job From');
  eq(r.to, '925 Palou Ave', 'blank day falls back to the job To (was "Load trucks only")');
  ok(r.to !== 'Load trucks only', 'REGRESSION: a blank day is not treated as load-only');
}
// Both days of a two-day direct booking resolve, not just day 1.
{
  const days = [{}, {}];
  const outs = days.map(d => resolve(d, {}, JOB));
  ok(outs.every(o => o.to === '925 Palou Ave'), 'every day of a direct booking resolves');
}
// Per-day addresses win when supplied \u2014 the storage case.
{
  const r = resolve({ from: '925 Palou Ave', to: '12 New St' }, {}, JOB);
  eq(r.from, '925 Palou Ave', 'per-day From overrides the job address');
  eq(r.to, '12 New St', 'per-day To overrides the job address');
}
{
  // Day 1 house -> warehouse, Day 2 warehouse -> new house.
  const d1 = resolve({ to: '925 Palou Ave' }, {}, JOB);
  const d2 = resolve({ from: '925 Palou Ave', to: '12 New St' }, {}, JOB);
  eq(d1.from, '314 Wildwood Ave', 'day 1 From falls back to the job address');
  eq(d1.to, '925 Palou Ave', 'day 1 To is the warehouse');
  eq(d2.from, '925 Palou Ave', 'day 2 From is the warehouse');
  eq(d2.to, '12 New St', 'day 2 To is the new house');
}
// Quote-driven days still take precedence \u2014 that path was already correct.
{
  const r = resolve({ loads: [{ address: 'A' }], unloads: [{ address: 'B' }] }, {}, JOB);
  eq(r.from, 'A', 'quote loads win');
  eq(r.to, 'B', 'quote unloads win');
}
// "Load trucks only" must still be possible when there is genuinely no destination.
{
  const r = resolve({}, {}, { from: '314 Wildwood Ave', to: '' });
  eq(r.to, 'Load trucks only', 'a genuine load-only day still says so');
}
{
  const r = resolve({}, {}, undefined);
  eq(r.to, 'Load trucks only', 'no booked job at all still degrades safely');
  eq(r.from, '', 'no addresses anywhere yields empty From, not a crash');
}

// ── wiring ───────────────────────────────────────────────────────────────────
ok(/const unloads=\(day\.unloads&&day\.unloads\.length\)\?day\.unloads:\[\{address:day\.to\|\|bjDay\.to\|\|bj\?\.to\|\|''\}\]/.test(HTML),
  'the email falls back to the job To');
ok(/const loads=\(day\.loads&&day\.loads\.length\)\?day\.loads:\[\{address:day\.from\|\|bjDay\.from\|\|bj\?\.from\|\|''\}\]/.test(HTML),
  'the email falls back to the job From');
eq((HTML.match(/bjDay\.to\|\|bj\?\.to/g) || []).length, 2,
  'BOTH confirmation-email builders were updated, not just one');
ok(/from:'',to:''\};\}/.test(HTML), '_bjBlankDay carries from/to');
ok(/d\.from=g\('bjd-from-'\+i\);d\.to=g\('bjd-to-'\+i\);/.test(HTML), 'bjDayChanged reads the new fields');
ok(/from:\(d\.from\|\|''\)\.trim\(\),to:\(d\.to\|\|''\)\.trim\(\)/.test(HTML), '_bjReadDays persists them');
ok(/from:d\.from\|\|'',to:d\.to\|\|''\}\)\)/.test(HTML), '_bjLoadMultiDay restores them');
ok(/id="bjd-from-'\+i\+'"/.test(HTML) && /id="bjd-to-'\+i\+'"/.test(HTML), 'the day card renders From/To inputs');
ok(/d0\.from=\(document\.getElementById\('bj-from'\)\|\|\{\}\)\.value\|\|'';/.test(HTML),
  'day 1 seeds its From from the booking form');
ok(/placeholder="same as job From"/.test(HTML), 'the blank-means-job-address behaviour is signposted in the UI');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
