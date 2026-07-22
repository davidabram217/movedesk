// zip_coverage_test.js
// Guards the 2026-07-22 "full California zip coverage" change to ALL_ZIP_COORDS.
//
// Background: 95628 (Fair Oaks) was absent, so zipMiles() returned null and estimateFuelAndTime()
// collapsed to a flat $75 / 0 drive-hours fallback. That same null also zeroed _jobDriveHours(),
// leaving drive time inside completed-job work hours and skewing AI training.
//
// This suite runs the REAL functions out of index.html.

const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  \u2713 ' + m); } else { fail++; console.log('  \u2717 FAIL: ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function extract(sig) {
  const start = HTML.indexOf(sig);
  if (start === -1) throw new Error('not found: ' + sig);
  let depth = 0;
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('unbalanced: ' + sig);
}

const tblStart = HTML.indexOf('const ALL_ZIP_COORDS={');
const tblEnd = HTML.indexOf('\n};', tblStart);
const TABLE_SRC = HTML.slice(tblStart, tblEnd + 3);
const env = new Function(
  TABLE_SRC + ';' + extract('function isSFZip(') + ';' + extract('function zipMiles(') + ';' +
  extract('function estimateFuelAndTime(') +
  '; return {ALL_ZIP_COORDS,isSFZip,zipMiles,estimateFuelAndTime};'
)();
const T = env.ALL_ZIP_COORDS;

// ── the reported bug ─────────────────────────────────────────────────────────
console.log('\n\u2500\u2500 reported case: 95628 Fair Oaks \u2500\u2500');
ok(!!T['95628'], '95628 is in the table');
const fo = env.estimateFuelAndTime('94131', '95628', 3, 225);
ok(!fo.unknown, '95628 no longer returns unknown:true');
ok(fo.note !== 'Zip not recognised — enter fuel manually', 'no longer falls back to the manual-fuel note');
ok(fo.fuel !== 75, 'fuel is no longer the flat $75 fallback');
ok(fo.driveHours > 3, 'drive hours are real, not 0  (got ' + fo.driveHours.toFixed(2) + ')');
ok(fo.totalMiles > 150 && fo.totalMiles < 320, 'round-trip miles plausible for SF\u2192Sacramento area  (got ' + fo.totalMiles + ')');
ok(env.zipMiles('94124', '95628') !== null, 'zipMiles resolves warehouse \u2192 95628');

// ── originals preserved byte-for-byte ────────────────────────────────────────
console.log('\n\u2500\u2500 pre-existing entries untouched \u2500\u2500');
const ORIGINALS = {
  '94102': [37.779, -122.419], '94124': [37.731, -122.387], '94131': [37.745, -122.437],
  '95814': [38.580, -121.493], '95030': [37.227, -121.980], '94062': [37.435, -122.245],
  '94820': [37.960, -122.291], '95811': [38.576, -121.497], '95843': [38.718, -121.371]
};
Object.keys(ORIGINALS).forEach(z => {
  const want = ORIGINALS[z], got = T[z];
  ok(!!got && got[0] === want[0] && got[1] === want[1],
     z + ' unchanged  (' + JSON.stringify(got) + ')');
});
// The warehouse must never move — every fuel figure is measured from it.
eq(JSON.stringify(T['94124']), JSON.stringify([37.731, -122.387]), 'warehouse zip 94124 coordinates unchanged');

// ── coverage ─────────────────────────────────────────────────────────────────
console.log('\n\u2500\u2500 California coverage \u2500\u2500');
const keys = Object.keys(T);
ok(keys.length > 2500, 'table has grown past 2,500 entries  (got ' + keys.length + ')');
const caKeys = keys.filter(k => Number(k) >= 90001 && Number(k) <= 96162);
ok(caKeys.length > 2300, 'CA range well covered  (got ' + caKeys.length + ')');

// Every region that previously failed outright.
const REGIONS = {
  '95628': 'Fair Oaks', '95608': 'Carmichael', '95610': 'Citrus Heights', '95621': 'Citrus Heights',
  '95630': 'Folsom', '95662': 'Orangevale', '95670': 'Rancho Cordova', '95742': 'Rancho Cordova',
  '95202': 'Stockton', '95350': 'Modesto', '95965': 'Oroville', '96001': 'Redding',
  '93901': 'Salinas', '93940': 'Monterey', '93101': 'Santa Barbara', '93401': 'San Luis Obispo',
  '95531': 'Crescent City', '96150': 'South Lake Tahoe', '92201': 'Indio', '93534': 'Lancaster'
};
Object.keys(REGIONS).forEach(z => ok(!!T[z], z + ' ' + REGIONS[z] + ' resolves'));

// Previously-empty prefixes now populated.
['952', '953', '955', '956', '957', '959', '960', '961', '939', '931', '934'].forEach(p => {
  ok(keys.filter(k => k.startsWith(p)).length > 0, 'prefix ' + p + 'xx now populated');
});

// ── data sanity ──────────────────────────────────────────────────────────────
console.log('\n\u2500\u2500 data sanity \u2500\u2500');
let badShape = 0, offMap = 0, dupes = 0;
const seen = new Set();
keys.forEach(k => {
  const v = T[k];
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number' ||
      isNaN(v[0]) || isNaN(v[1])) badShape++;
  if (seen.has(k)) dupes++; seen.add(k);
  // Continental US bounding box - anything outside is a data error.
  if (v && (v[0] < 24 || v[0] > 50 || v[1] < -125 || v[1] > -66)) offMap++;
});
eq(badShape, 0, 'every entry is a [lat, lng] number pair');
eq(offMap, 0, 'every coordinate sits inside the continental US');
eq(dupes, 0, 'no duplicate keys');
const nullIsland = keys.filter(k => T[k][0] === 0 || T[k][1] === 0);
eq(nullIsland.length, 0, 'no [0,0] placeholder coords — these would silently quote a ~7,000mi trip');
ok(keys.every(k => /^\d{5}$/.test(k)), 'every key is a 5-digit zip string');

// Spot-check that added coords land where they should (~15mi tolerance).
function miles(a, b) {
  const R = 3958.8, r = x => x * Math.PI / 180;
  const dLat = r(b[0] - a[0]), dLon = r(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}
const SPOT = {
  '95628': [38.64, -121.27], '95630': [38.68, -121.16], '95202': [37.96, -121.29],
  '96001': [40.59, -122.39], '93901': [36.68, -121.66], '93101': [34.42, -119.70],
  '96150': [38.93, -119.98], '92201': [33.72, -116.22]
};
Object.keys(SPOT).forEach(z => {
  const d = miles(T[z], SPOT[z]);
  ok(d < 15, z + ' lands within 15mi of its known location  (' + d.toFixed(1) + 'mi)');
});

// ── behaviour preserved ──────────────────────────────────────────────────────
console.log('\n\u2500\u2500 existing behaviour preserved \u2500\u2500');
const sf = env.estimateFuelAndTime('94110', '94131', 3, 225);
ok(!sf.unknown, 'SF\u2192SF still resolves');
ok(env.isSFZip('94131') === true, 'isSFZip still true for 941xx');
ok(!env.isSFZip('95628'), 'isSFZip false for Sacramento');
const sac = env.estimateFuelAndTime('94131', '95814', 3, 225);
eq(sac.totalMiles, 196, 'SF\u2192Sacramento-proper trip miles unchanged (regression canary)');
eq(sac.fuel, 390, 'SF\u2192Sacramento-proper fuel unchanged (regression canary)');

// A genuinely unknown zip must still fail loudly rather than silently guessing.
const unknown = env.estimateFuelAndTime('94131', '00000', 3, 225);
ok(unknown.unknown === true, 'a truly unknown zip still flags unknown:true');
eq(unknown.fuel, 75, 'unknown zip still falls back to $75 so it is visibly wrong');
const noZip = env.estimateFuelAndTime('', '95628', 3, 225);
eq(noZip.note, 'Estimated (no zip provided)', 'empty zip path unchanged');

console.log('\n' + '\u2500'.repeat(60));
console.log(`zip_coverage_test.js: ${pass} passed, ${fail} failed`);
console.log('\u2500'.repeat(60) + '\n');
process.exit(fail > 0 ? 1 : 0);
