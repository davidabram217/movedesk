// unload_pod_move_type_test.js
// Guards the 2026-08-19 addition of "Unload pod / truck only" to every move-type list.
//
// The lists are duplicated as static markup in eight places (six in index.html plus both
// customer-facing quote forms). That duplication is exactly how "Thumbtack" drifted before, so
// this test asserts the option exists in ALL of them and that the canonical/alias plumbing
// resolves it — including the case that matters most, that it does NOT collide with the
// existing "Load pod / truck only".
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const QUOTE = fs.readFileSync(path.join(__dirname, 'quote.html'), 'utf8');
const CQUOTE = fs.readFileSync(path.join(__dirname, 'caremore-quote.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } };
const eq = (a, b, m) => ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const OPT = '<option>Unload pod / truck only</option>';

// ── present in every list ────────────────────────────────────────────────────
eq((HTML.match(/<option>Unload pod \/ truck only<\/option>/g) || []).length, 6,
  'all six index.html move-type lists have it');
ok(QUOTE.includes(OPT), 'customer quote form has it');
ok(CQUOTE.includes(OPT), 'caremore quote form has it');

// Each named select must contain it.
['cj-movetype', 'cjmd-movetype', 'ecjmd-movetype', 'qb-move-type', 'ai-movetype', 'nl-move-type']
  .forEach(id => {
    const i = HTML.indexOf('id="' + id + '"');
    ok(i > -1, id + ' exists');
    const seg = HTML.slice(i, HTML.indexOf('</select>', i));
    ok(seg.includes(OPT), id + ' offers "Unload pod / truck only"');
    ok(seg.indexOf('Load pod / truck only') < seg.indexOf('Unload pod / truck only'),
      id + ' lists Unload directly after Load');
  });

// ── canonical + alias plumbing ───────────────────────────────────────────────
const canon = JSON.parse(HTML.match(/const _MOVE_TYPE_CANONICAL=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
const aliasSrc = HTML.match(/const _MOVE_TYPE_ALIASES=\{[\s\S]*?\n\};/)[0];
const normSrc = HTML.match(/function _rawNormMoveType\(s\)\{[^}]*\}/)[0];
const env = new Function(aliasSrc + '\n' + normSrc + '\nreturn {_MOVE_TYPE_ALIASES,_rawNormMoveType};')();
const canonMap = {}; canon.forEach(c => canonMap[env._rawNormMoveType(c)] = c);
const resolve = v => { const r = env._rawNormMoveType(v); return canonMap[env._MOVE_TYPE_ALIASES[r] || r] || null; };

ok(canon.includes('Unload pod / truck only'), 'in the canonical list');
ok(canon.includes('Load pod / truck only'), 'the Load type is still there');
eq(canon.length, 10, 'canonical list grew by exactly one');

eq(resolve('Unload pod / truck only'), 'Unload pod / truck only', 'exact value resolves');
eq(resolve('unload pod / truck only'), 'Unload pod / truck only', 'lowercase resolves');
eq(resolve('Unload Pod / Truck'), 'Unload pod / truck only', 'shorthand resolves');
eq(resolve('unload truck pod only'), 'Unload pod / truck only', 'word order variant resolves');
eq(resolve('pod unload'), 'Unload pod / truck only', 'free-typed "pod unload" resolves');
eq(resolve('unload pod'), 'Unload pod / truck only', 'free-typed "unload pod" resolves');

// THE COLLISION CHECK: _rawNormMoveType strips punctuation, so Load and Unload must still be
// distinguishable. If these ever collapse, historic pod jobs would be silently recategorised.
eq(resolve('Load pod / truck only'), 'Load pod / truck only', 'Load type is unaffected');
ok(resolve('Load pod / truck only') !== resolve('Unload pod / truck only'),
  'Load and Unload do NOT collide after normalisation');
eq(resolve('load pod truck'), 'Load pod / truck only', 'existing Load aliases still work');

// ── existing aliases untouched (the file warns: NEVER DELETE AN ALIAS) ───────
eq(resolve('Storage Out'), 'Move out of storage', 'legacy Storage Out alias intact');
eq(resolve('Storage In'), 'Move to storage', 'legacy Storage In alias intact');
eq(resolve('Move & Pack'), 'Pack and move', 'legacy Move & Pack alias intact');
eq(resolve('Move'), 'Move', 'plain Move resolves');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
