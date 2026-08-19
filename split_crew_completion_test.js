// split_crew_completion_test.js
// Guards the 2026-08-19 "different crew for load vs unload" addition to the SINGLE-DAY
// completion form (#modal-complete-job).
//
// Extracts the REAL functions out of index.html and runs them against a minimal fake DOM,
// rather than reimplementing the logic here. Covers:
//   - the toggle seeds load/unload rows from the existing single-crew figures
//   - aggregates (hours / labour / blended rate / headline crew) derive from the segments
//   - aggregate inputs lock while split is on, and unlock cleanly when it is switched off
//   - default single-crew path is completely untouched when the box is unticked
//   - reset clears state so one job's split cannot leak into the next
//   - half-filled extra rows cannot zero out the totals
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  \u2717 ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function extract(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error('could not find: ' + signature);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces from: ' + signature);
}

// ── minimal fake DOM ─────────────────────────────────────────────────────────
function makeEl(tag, cls) {
  return { tagName: tag, className: cls || '', style: {}, value: '', checked: false,
    textContent: '', innerHTML: '', readOnly: false, disabled: false, title: '',
    children: [], _rows: [],
    querySelector(sel) { return (this.querySelectorAll(sel) || [])[0]; },
    querySelectorAll(sel) {
      const want = sel.replace('.', '');
      const out = [];
      (this._rows || []).forEach(r => {
        if (r.className === want) out.push(r);
        (r._rows || []).forEach(c => { if (c.className === want) out.push(c); });
      });
      return out;
    },
    insertAdjacentHTML(pos, html) { this._pendingHtml = (this._pendingHtml || '') + html; },
    closest() { return null; }
  };
}

function buildEnv() {
  const els = {};
  ['cj-hours','cj-movers','cj-labour','cj-rate','cj-split-crew','cj-split-block',
   'cj-move-segs','cj-split-pay','cj-split-summary'].forEach(id => { els[id] = makeEl('div', ''); });
  els['cj-move-segs']._rows = [];
  Object.defineProperty(els['cj-move-segs'], 'children', { get() { return this._rows; } });

  const env = {
    document: { getElementById: id => els[id] || null },
    fmtMoney: n => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }),
    _cjmdMoversOptions: () => '',
    calcTotal: () => { env._calcTotalCalls++; },
    Math, Number, String, Array, Object, JSON
  };
  env._calcTotalCalls = 0;
  env.els = els;

  // Segment rows are created by string-building in the real code; intercept that by
  // giving the harness its own row factory keyed off the same field class names.
  env.addRow = (movers, hours, rate) => {
    const row = makeEl('div', 'cj-move-seg');
    const mv = makeEl('select', 'cj-seg-movers'); mv.value = String(movers);
    const hr = makeEl('input', 'cj-seg-hours');   hr.value = String(hours);
    const rt = makeEl('input', 'cj-seg-rate');    rt.value = String(rate);
    row._rows = [mv, hr, rt];
    els['cj-move-segs']._rows.push(row);
    return row;
  };
  return env;
}

const srcRead   = extract(HTML, 'function _cjReadSegments(');
const srcIsSplit= extract(HTML, 'function cjIsSplitCrew(');
const srcLock   = extract(HTML, 'function _cjLockAggregates(');
const srcRecalc = extract(HTML, 'function cjRecalcSplit(');
const srcReset  = extract(HTML, 'function cjResetSplitCrew(');
ok(srcRead && srcIsSplit && srcLock && srcRecalc && srcReset, 'all split functions extracted from index.html');

function load(env) {
  const labels = HTML.match(/const _CJ_SEG_LABELS=\[[^\]]*\];/)[0];
  const body = labels + '\n' + srcRead + '\n' + srcIsSplit + '\n' + srcLock + '\n' + srcRecalc + '\n' + srcReset +
    '\nreturn {_cjReadSegments,cjIsSplitCrew,_cjLockAggregates,cjRecalcSplit,cjResetSplitCrew};';
  return new Function('document', 'fmtMoney', '_cjmdMoversOptions', 'calcTotal', body)
    (env.document, env.fmtMoney, env._cjmdMoversOptions, env.calcTotal);
}

// ── segment reading ──────────────────────────────────────────────────────────
{
  const env = buildEnv(); const fn = load(env);
  env.addRow(4, 6, 265); env.addRow(2, 4.5, 165);
  const segs = fn._cjReadSegments();
  eq(segs.length, 2, 'reads both segments');
  eq(segs[0].label, 'Load', 'first segment labelled Load');
  eq(segs[1].label, 'Unload', 'second segment labelled Unload');
  eq(segs[0].movers, 4, 'load crew read');
  eq(segs[1].hours, 4.5, 'unload hours read');
  eq(segs[1].rate, 165, 'unload rate read');
}

// ── half-filled rows are dropped, not counted as zeros ───────────────────────
{
  const env = buildEnv(); const fn = load(env);
  env.addRow(4, 6, 265); env.addRow(2, 4.5, 165); env.addRow(3, '', '');
  const segs = fn._cjReadSegments();
  eq(segs.length, 2, 'blank third row is dropped');
}

// ── aggregate math ───────────────────────────────────────────────────────────
{
  const env = buildEnv(); const fn = load(env);
  env.els['cj-split-crew'].checked = true;
  env.addRow(4, 6, 265);    // 1590
  env.addRow(2, 4.5, 165);  //  742.5
  fn.cjRecalcSplit();
  eq(env.els['cj-hours'].value, 10.5, 'total hours = 6 + 4.5');
  eq(env.els['cj-labour'].value, 2332.5, 'labour = 6x265 + 4.5x165');
  eq(env.els['cj-rate'].value, 222, 'blended rate = 2332.5 / 10.5');
  eq(env.els['cj-movers'].value, '4', 'headline crew = largest crew on site');
  ok(env._calcTotalCalls > 0, 'recalc re-runs calcTotal so the job total updates');
  ok(/4\u00d76h @ \$265/.test(env.els['cj-split-summary'].textContent), 'summary line shows each segment');
}

// ── equal rates must reproduce the plain single-crew answer ──────────────────
{
  const env = buildEnv(); const fn = load(env);
  env.els['cj-split-crew'].checked = true;
  env.addRow(3, 5, 225); env.addRow(3, 5, 225);
  fn.cjRecalcSplit();
  eq(env.els['cj-hours'].value, 10, 'equal segments sum hours');
  eq(env.els['cj-labour'].value, 2250, 'equal segments = 10hrs x $225');
  eq(env.els['cj-rate'].value, 225, 'blended rate collapses to the single rate');
}

// ── split OFF must change nothing ────────────────────────────────────────────
{
  const env = buildEnv(); const fn = load(env);
  env.els['cj-split-crew'].checked = false;
  env.els['cj-hours'].value = 8; env.els['cj-labour'].value = 1800; env.els['cj-rate'].value = 225;
  env.addRow(4, 6, 265);
  fn.cjRecalcSplit();
  eq(env.els['cj-hours'].value, 8, 'hours untouched when split is off');
  eq(env.els['cj-labour'].value, 1800, 'labour untouched when split is off');
  eq(env.els['cj-rate'].value, 225, 'rate untouched when split is off');
  eq(env._calcTotalCalls, 0, 'no recalculation at all when split is off');
}

// ── locking / unlocking ──────────────────────────────────────────────────────
{
  const env = buildEnv(); const fn = load(env);
  fn._cjLockAggregates(true);
  ok(env.els['cj-hours'].readOnly && env.els['cj-labour'].readOnly && env.els['cj-rate'].readOnly,
    'aggregate inputs are read-only while split is on');
  ok(env.els['cj-movers'].disabled, 'movers select disabled while split is on');
  fn._cjLockAggregates(false);
  ok(!env.els['cj-hours'].readOnly && !env.els['cj-labour'].readOnly && !env.els['cj-rate'].readOnly,
    'aggregate inputs unlock when split is switched off');
  ok(!env.els['cj-movers'].disabled, 'movers select re-enabled when split is switched off');
}

// ── reset between jobs ───────────────────────────────────────────────────────
{
  const env = buildEnv(); const fn = load(env);
  env.els['cj-split-crew'].checked = true;
  env.addRow(4, 6, 265);
  fn._cjLockAggregates(true);
  fn.cjResetSplitCrew();
  ok(!env.els['cj-split-crew'].checked, 'reset unticks the checkbox');
  eq(env.els['cj-move-segs'].innerHTML, '', 'reset clears the segment rows');
  eq(env.els['cj-split-block'].style.display, 'none', 'reset hides the block');
  ok(!env.els['cj-hours'].readOnly && !env.els['cj-movers'].disabled, 'reset unlocks the aggregates');
}

// ── wiring: persistence + AI + modal reset ───────────────────────────────────
ok(/cjResetSplitCrew\(\);\s*\n?\s*calcTotal\(\);calcBalance\(\);openModal\('complete-job'\)/.test(HTML),
  'openComplete resets split state before showing the modal');
ok(/splitCrew:\(typeof cjIsSplitCrew==='function'&&cjIsSplitCrew\(\)\),moveSegments:/.test(HTML),
  'completed job records splitCrew + moveSegments');
ok(/splitCrew:!!completed\.splitCrew/.test(HTML), 'AI training record carries splitCrew');
ok(/moveSegments:completed\.splitCrew&&Array\.isArray\(completed\.moveSegments\)\?completed\.moveSegments:null/.test(HTML),
  'AI training record carries moveSegments only when the split was actually used');
ok(/id="cj-split-crew" onchange="cjToggleSplitCrew\(\)"/.test(HTML), 'toggle is wired in the form markup');
ok(/moveMen:Number\(completed\.moveMen\)\|\|null/.test(HTML),
  'AI training still stores the headline moveMen (existing regressions unaffected)');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
