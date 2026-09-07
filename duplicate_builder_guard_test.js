// duplicate_builder_guard_test.js
//
// This codebase has several places where near-identical logic exists in two or more copies:
// two confirmation-email builders, two office-notes self-heals, three rate-line branches, two
// calendar builders. Across one working session, FIVE separate fixes were applied to one copy
// and silently missed the others — per-day addresses, flat rate, quote line items, the hour
// minimum, and the frozen-quote self-heal. Each looked correct in review and each shipped a bug.
//
// These assertions pin the COUNT of each duplicated construct. If someone fixes one copy and not
// the rest, the count changes and this fails — which is the cheapest possible way to catch the
// single most common defect in this file.
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const eq = (a, b, m) => { if (a === b) pass++; else { fail++; console.log('  \u2717 ' + m + '  (found ' + a + ', expected ' + b + ')'); } };
const count = re => (HTML.match(re) || []).length;

// ── confirmation email: two builders ─────────────────────────────────────────
eq(count(/var d=q\.days\[0\];/g), 2,
  'single-day branch exists in BOTH confirmation-email builders');
eq(count(/if\(bj&&bj\.flatRate&&Number\(bj\.flatPrice\)\)\{/g), 2,
  'flat-rate overlay applied to BOTH email builders');
eq(count(/bjDay\.to\|\|bj\?\.to/g), 2,
  'per-day address fallback applied to BOTH email builders');
eq(count(/String\(f\.label\|\|f\.name\|\|''\)\.trim\(\)/g), 5,
  'line-item label filter applied to all 5 sites (4 email + 1 calendar)');

// ── confirmation email: three rate branches, each needs its minimum ──────────
{
  const i = HTML.indexOf('function openConfirmEmail(');
  const seg = HTML.slice(i, HTML.indexOf('function sendConfirmationEmail(', i));
  const rateLines = (seg.match(/moveDetailsSection\+='\\n'[^;]{0,240}Per Hour[^;]{0,240};/g) || []).length;
  const minLines = (seg.match(/moveDetailsSection\+='\\n2 Hour Minimum';/g) || []).length;
  eq(rateLines, 3, 'openConfirmEmail still has three rate branches');
  eq(minLines, 3, 'every rate branch emits an hour minimum');
  // The minimum is a FIXED company term, never the job's estimated hours floor.
  eq((seg.match(/hrsMin\)\|\|2\)\+' Hour Minimum'/g) || []).length, 0,
    'no rate branch derives the minimum from hrsMin');
}

// ── office-notes self-heal: two copies ───────────────────────────────────────
eq(count(/if\(q\.status==='sent'\|\|q\.status==='accepted'\)return;/g), 2,
  'frozen-quote guard present in BOTH office-notes self-heals (loadDB + refreshFromSupabase)');

// ── cloud pulls must never adopt an empty table over local data ──────────────
eq(count(/if\(Array\.isArray\(\w+\)\)db\.\w+=/g), 0,
  'no cloud pull adopts an empty result (would wipe local data on a newly created table)');

// ── local-only collections are hydrated before any await ────────────────────
{
  const iHyd = HTML.indexOf('_hydrateLocalOnly');
  const iLoad = HTML.indexOf('async function loadDB(){');
  const ok = iHyd > -1 && iHyd < iLoad;
  eq(ok, true, 'local-only collections hydrate synchronously BEFORE loadDB can run');
}

// ── calendar URL must not be served from a stale cache ──────────────────────
eq(count(/window\._bookingCalUrl=window\._bookingCalUrl\|\|/g), 0,
  'calendar URL is always rebuilt, never reused from an earlier session state');

// ── every parking list carries the same options ──────────────────────────────
eq(count(/<option>White zone<\/option>/g), 4,
  'White zone present in all index.html parking lists (incl. extra-stop templates)');

// ── move-type lists stay in lockstep ─────────────────────────────────────────
eq(count(/<option>Unload pod \/ truck only<\/option>/g), 6,
  'Unload pod / truck only present in all six index.html move-type lists');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
