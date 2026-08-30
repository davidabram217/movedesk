// job_time_by_size_test.js
// Guards the 2026-08-19 addition to the "Per-day & multi-day benchmarks" card: total job time
// by size, split into MOVE-ONLY and FULL PACK & MOVE.
//
// The pre-existing per-activity table answers "how long does packing take on a 2-bed" by
// splitting a job into its moving and packing halves. This answers a different question: how
// long does the WHOLE job take. Quoting a full pack off the move-only figure is how a full
// pack gets under-quoted.
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
const CONSTS = [/const _PACK_MOVE_ONLY=\[[^\]]*\];/,/const _PACK_FULL=\[[^\]]*\];/,/const _SIZE_EXCLUDE=\[[^\]]*\];/,/const _MAX_SINGLE_DAY_HOURS=\d+;/].map(r=>HTML.match(r)[0]).join('\n');
const SRC = CONSTS + '\n' + ex('function _packBucket(') + '\n' + ex('function _sizeKey(') + '\n' + ex('function _vaultKey(') + '\n' + ex('function computeJobTimeBySize(');
const run = jobs => new Function('db', SRC + ';return computeJobTimeBySize();')({ completedJobs: jobs });
const bucketOf = new Function(CONSTS + '\n' + ex('function _packBucket(') + ';return _packBucket;')();

// ── bucketing ────────────────────────────────────────────────────────────────
['No \u2014 just moving', 'no - just moving', 'No', 'none', 'just moving', '', null, undefined]
  .forEach(v => eq(bucketOf(v), 'moveOnly', JSON.stringify(v) + ' \u2192 move only'));
['Full pack', 'full pack', 'FULL PACK', 'Pack and move']
  .forEach(v => eq(bucketOf(v), 'fullPack', JSON.stringify(v) + ' \u2192 full pack'));
['Kitchen pack only', 'Partial pack', 'Fragiles only', 'All breakables', 'Unpack only']
  .forEach(v => eq(bucketOf(v), 'other', JSON.stringify(v) + ' \u2192 excluded from both'));

// ── totals ───────────────────────────────────────────────────────────────────
{
  const out = run([
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 6, packHoursActual: 0, moveMen: 3 },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 7.5, packHoursActual: 0, moveMen: 3 },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 5, packHoursActual: 0, moveMen: 2 },
    { size: '2 bedroom', packing: 'Full pack', hours: 7, packHoursActual: 5, moveMen: 3, packMen: 2 },
    { size: '2 bedroom', packing: 'Full pack', hours: 8, packHoursActual: 6, moveMen: 4, packMen: 2 }
  ]);
  eq(out.moveOnly['2 bedroom'].length, 3, 'three move-only jobs bucketed');
  eq(out.fullPack['2 bedroom'].length, 2, 'two full-pack jobs bucketed');
  const mo = out.moveOnly['2 bedroom'].map(r => r.total);
  eq(mo.reduce((a, b) => a + b, 0) / 3, 6.166666666666667, 'move-only average is move hours only');
  const fp = out.fullPack['2 bedroom'].map(r => r.total);
  eq(fp[0], 12, 'full-pack total is pack + move (7 + 5)');
  eq(fp[1], 14, 'full-pack total is pack + move (8 + 6)');
  ok(fp[0] > mo[0], 'a full pack takes longer than a move of the same size \u2014 the whole point');
  // man-hours must use the PACK crew for pack hours, not the move crew
  eq(out.fullPack['2 bedroom'][0].manHours, 7 * 3 + 5 * 2, 'man-hours uses packMen for pack hours');
}
{
  // packMen missing falls back to moveMen rather than dropping the pack hours from man-hours
  const out = run([{ size: '1 bedroom', packing: 'Full pack', hours: 4, packHoursActual: 3, moveMen: 2 }]);
  eq(out.fullPack['1 bedroom'][0].manHours, 4 * 2 + 3 * 2, 'packMen defaults to moveMen');
}

// ── exclusions that protect the averages ─────────────────────────────────────
{
  const out = run([{ size: '2 bedroom', packing: 'Full pack', hours: 7, packHoursActual: 0, moveMen: 3 }]);
  eq(Object.keys(out.fullPack).length, 0,
    'a full-pack job with NO pack hours recorded is skipped, not averaged in as if packing took no time');
}
{
  const out = run([{ size: '2 bedroom', packing: 'No \u2014 just moving', hours: 0, packHoursActual: 0, moveMen: 3 }]);
  eq(Object.keys(out.moveOnly).length, 0, 'a job with zero hours is skipped');
}
{
  const out = run([{ size: '3 bedroom', packing: 'Kitchen pack only', hours: 8, packHoursActual: 2, moveMen: 4 }]);
  eq(Object.keys(out.moveOnly).length + Object.keys(out.fullPack).length, 0,
    'a partial pack appears in NEITHER table');
}
{
  const out = run([{ packing: 'No \u2014 just moving', hours: 5, moveMen: 2 }]);
  ok(out.moveOnly['Unknown size'], 'a job with no size recorded is grouped under Unknown size, not dropped');
}
{
  eq(Object.keys(run([]).moveOnly).length, 0, 'no completed jobs yields empty, no throw');
}

// ── wiring ───────────────────────────────────────────────────────────────────
// Headings live inside template literals, so in SOURCE the em dash is the literal text
// backslash-u2014 (verified to render as a real em dash at runtime). Match either form.
ok(HTML.includes('Total job time by size ')&&/moving only<\/div>/.test(HTML), 'move-only heading rendered');
ok(/full pack &amp; move<\/div>/.test(HTML), 'full-pack heading rendered');
ok(HTML.indexOf('moving only') < HTML.indexOf('full pack &amp; move'),
  'move-only table comes first, full pack below it');
ok(/_jobTimeTable\(_jt\.moveOnly,/.test(HTML) && /_jobTimeTable\(_jt\.fullPack,/.test(HTML),
  'both tables are rendered');
ok(/Partial packs \(kitchen only, fragiles, part pack\) are excluded/.test(HTML),
  'the exclusion is explained on screen, not silent');
ok(/const thin=rows\.length<3;/.test(HTML), 'thin samples are flagged rather than presented as solid');
ok(/Avg total hrs/.test(HTML) && /Man-hrs/.test(HTML) && /Avg crew/.test(HTML),
  'crew and man-hours shown alongside hours (8h with 2 movers \u2260 8h with 4)');

// ── implausible single-day hours are excluded and COUNTED ────────────────────
// David's real data: one 2-bedroom job recorded 60.75 hours in a single day with 3 movers
// (a mistyped 6.75). On its own it moved the 2-bed average from ~7.5h to 18h and pushed the
// row above the 3-bedroom one. NOTE: my first theory was that multi-day jobs were leaking in;
// the diagnostic disproved it — every job in that row was single-day. One bad keystroke.
{
  const out = run([
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 8.25, moveMen: 5 },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 60.75, moveMen: 3 },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 8, moveMen: 5 },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 3, moveMen: 4 },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 10, moveMen: 3 }
  ]);
  eq(out.moveOnly['2 bedroom'].length, 4, 'the 60.75h single-day job is excluded');
  eq(out.skipped, 1, 'and counted, so the exclusion is visible rather than silent');
  const t = out.moveOnly['2 bedroom'].map(r => r.total);
  eq(Math.max.apply(null, t), 10, 'the outlier no longer sets the range');
}
{
  // A MULTI-DAY job legitimately exceeds 24h across its days and must NOT be capped.
  const out = run([{ size: '4+ bedroom', packing: 'No \u2014 just moving', hours: 40, moveMen: 4, multiDay: true }]);
  eq(out.skipped, 0, 'multi-day jobs are not treated as implausible');
  eq(out.moveOnly['4+ bedroom'].length, 1, 'and are still counted');
}
{
  const out = run([{ size: '1 bedroom', packing: 'No \u2014 just moving', hours: 24, moveMen: 2 }]);
  eq(out.skipped, 0, 'exactly 24h is allowed (boundary)');
}

// ── excluded sizes ───────────────────────────────────────────────────────────
{
  const out = run([
    { size: 'Other', packing: 'No \u2014 just moving', hours: 5, moveMen: 3 },
    { size: 'Storage unit', packing: 'No \u2014 just moving', hours: 4, moveMen: 2 },
    { size: 'storage UNIT', packing: 'No \u2014 just moving', hours: 4, moveMen: 2 },
    { size: '1 bedroom', packing: 'No \u2014 just moving', hours: 4, moveMen: 2 }
  ]);
  ok(!out.moveOnly['Other'], '"Other" excluded from the size table');
  ok(!out.moveOnly['Storage unit'], '"Storage unit" excluded');
  ok(!out.moveOnly['storage UNIT'], 'exclusion is case-insensitive');
  ok(out.moveOnly['1 bedroom'], 'real sizes still counted');
}
{
  // "Unknown size" is deliberately KEPT — it is not a chosen category, it is missing data, and
  // hiding it would hide how much is going uncaptured.
  const out = run([{ packing: 'No \u2014 just moving', hours: 5, moveMen: 2 }]);
  ok(out.moveOnly['Unknown size'], '"Unknown size" is still shown');
}

// ── vault tables ─────────────────────────────────────────────────────────────
{
  const out = run([
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 8, moveMen: 5, vaults: '8' },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 8.25, moveMen: 5, vaults: '7.5' },
    { size: '1 bedroom', packing: 'No \u2014 just moving', hours: 4, moveMen: 2, vaults: '1' },
    { size: '3 bedroom', packing: 'Full pack', hours: 9, packHoursActual: 6, moveMen: 4, packMen: 2, vaults: '8' },
    { size: '2 bedroom', packing: 'No \u2014 just moving', hours: 3, moveMen: 4, vaults: null }
  ]);
  eq(out.vaultMoveOnly['8 vaults'].length, 2, '7.5 and 8 vaults round into the same bucket');
  eq(out.vaultMoveOnly['1 vault'].length, 1, 'singular label for one vault');
  eq(out.vaultFullPack['8 vaults'].length, 1, 'full-pack vault table is separate');
  eq(out.vaultFullPack['8 vaults'][0].total, 15, 'full-pack vault total is pack + move');
  ok(!out.vaultMoveOnly['0 vaults'], 'a job with no vault count does not appear');
  eq(Object.values(out.vaultMoveOnly).reduce((a, r) => a + r.length, 0), 3,
    'only jobs with a vault count are in the vault tables');
}
{
  // Vault tables are independent of size, so an excluded SIZE still contributes vault data.
  const out = run([{ size: 'Storage unit', packing: 'No \u2014 just moving', hours: 4, moveMen: 2, vaults: '1' }]);
  ok(!out.moveOnly['Storage unit'], 'excluded from the size table');
  eq(out.vaultMoveOnly['1 vault'].length, 1, 'but still counted by vaults — volume is volume');
}

// ── rendering ────────────────────────────────────────────────────────────────
ok(/_jobTimeTable\(_jt\.vaultMoveOnly,[^,]*,'Vaults'\)/.test(HTML), 'move-only vault table rendered');
ok(/_jobTimeTable\(_jt\.vaultFullPack,[^,]*,'Vaults'\)/.test(HTML), 'full-pack vault table rendered');
ok(/single-day job\$\{_jt\.skipped===1\?'':'s'\} excluded for implausible hours/.test(HTML),
  'the implausible-hours exclusion is surfaced on screen');
ok(/const _isVault=colLabel==='Vaults';/.test(HTML), 'vault rows sort numerically, not by sample size');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
