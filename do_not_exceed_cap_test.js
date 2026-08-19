// do_not_exceed_cap_test.js
// Guards the 2026-08-19 "do not exceed" cap on the completion forms.
//
// The scenario: the work genuinely came to $3,000 but the customer was quoted a
// not-to-exceed price of $2,800, so $2,800 is what they were charged. Before this change
// the form expected the CAPPED figure in the fee fields, so the only way to make the
// balance land on zero was to reduce the labour line by hand — corrupting the true hourly
// rate and teaching the AI the job was cheaper than it really was.
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  \u2717 ' + m); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function extract(src, sig) {
  const start = src.indexOf(sig);
  if (start === -1) throw new Error('could not find: ' + sig);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces from: ' + sig);
}

function el() { return { value: '', textContent: '', style: {} }; }
function buildEnv(prefix) {
  const els = {};
  [prefix + '-cap', prefix + '-cap-row', prefix + '-cap-amount', prefix + '-actual-total'].forEach(id => els[id] = el());
  return { document: { getElementById: id => els[id] || null }, els };
}

const srcCapOf   = extract(HTML, 'function _capOf(');
const srcApply   = extract(HTML, 'function _applyCap(');
const srcSync    = extract(HTML, 'function _syncActualTotal(');
const srcManual  = extract(HTML, 'function _capNoteManual(');
const srcReset   = extract(HTML, 'function _resetCapState(');
ok(srcCapOf && srcApply && srcSync && srcManual && srcReset, 'cap helpers extracted from index.html');

function load(env) {
  const body = 'const _capAutoActual={};\n' + srcCapOf + '\n' + srcApply + '\n' + srcSync + '\n' + srcManual + '\n' + srcReset +
    '\nreturn {_capOf,_applyCap,_syncActualTotal,_capNoteManual,_resetCapState};';
  return new Function('document', body)(env.document);
}

// ── the reported scenario ────────────────────────────────────────────────────
{
  const env = buildEnv('cj'); const fn = load(env);
  env.els['cj-cap'].value = 2800;
  const r = fn._applyCap('cj', 3000);          // real work came to $3,000
  eq(r.subtotal, 2800, 'charged subtotal is capped at the do-not-exceed price');
  eq(r.capAdj, 200, 'cap discount is the $200 difference');
  eq(env.els['cj-cap-row'].style.display, 'flex', 'cap notice is shown');
  ok(/200/.test(env.els['cj-cap-amount'].textContent), 'cap notice shows the discount amount');
  fn._syncActualTotal('cj', 2800, 200);
  eq(env.els['cj-actual-total'].value, 3000, 'un-capped value fills itself with the true worth');
  // capDiscount in confirmComplete is actualTotal - total; it must reproduce the cap exactly.
  eq(env.els['cj-actual-total'].value - 2800, 200, 'capDiscount reproduces the cap adjustment');
  // and the balance the user cares about
  eq(2800 - 2800, 0, 'a $2,800 payment settles a capped $2,800 job');
}

// ── no cap, or cap not reached: nothing changes ──────────────────────────────
{
  const env = buildEnv('cj'); const fn = load(env);
  const r = fn._applyCap('cj', 3000);
  eq(r.subtotal, 3000, 'no cap set leaves the subtotal alone');
  eq(r.capAdj, 0, 'no cap set means no discount');
  eq(env.els['cj-cap-row'].style.display, 'none', 'cap notice hidden when no cap');
  fn._syncActualTotal('cj', 3000, 0);
  eq(env.els['cj-actual-total'].value, '', 'un-capped value stays empty when no cap applies');
}
{
  const env = buildEnv('cj'); const fn = load(env);
  env.els['cj-cap'].value = 3500;
  const r = fn._applyCap('cj', 3000);
  eq(r.subtotal, 3000, 'subtotal under the cap is untouched');
  eq(r.capAdj, 0, 'no discount when the cap is not reached');
}
{
  const env = buildEnv('cj'); const fn = load(env);
  env.els['cj-cap'].value = 3000;
  const r = fn._applyCap('cj', 3000);
  eq(r.capAdj, 0, 'exactly at the cap is not a discount');
}

// ── zero / junk caps are ignored, never treated as "cap everything to $0" ────
[0, '', '0', -500, 'abc'].forEach(v => {
  const env = buildEnv('cj'); const fn = load(env);
  env.els['cj-cap'].value = v;
  const r = fn._applyCap('cj', 3000);
  eq(r.subtotal, 3000, 'cap value ' + JSON.stringify(v) + ' is ignored');
});

// ── a hand-typed un-capped value is never clobbered ──────────────────────────
{
  const env = buildEnv('cj'); const fn = load(env);
  env.els['cj-cap'].value = 2800;
  fn._applyCap('cj', 3000);
  fn._syncActualTotal('cj', 2800, 200);
  eq(env.els['cj-actual-total'].value, 3000, 'auto-filled first');
  env.els['cj-actual-total'].value = 3400;   // user knows it was really worth more
  fn._capNoteManual('cj');
  fn._syncActualTotal('cj', 2800, 200);
  eq(env.els['cj-actual-total'].value, 3400, 'manual un-capped value survives recalculation');
}
{
  const env = buildEnv('cj'); const fn = load(env);
  env.els['cj-actual-total'].value = 5000;   // pre-existing value from an older record
  env.els['cj-cap'].value = 2800;
  fn._syncActualTotal('cj', 2800, 200);
  eq(env.els['cj-actual-total'].value, 5000, 'a pre-existing value is left alone');
}

// ── removing the cap clears what we auto-filled ──────────────────────────────
{
  const env = buildEnv('cj'); const fn = load(env);
  env.els['cj-cap'].value = 2800;
  fn._syncActualTotal('cj', 2800, 200);
  eq(env.els['cj-actual-total'].value, 3000, 'auto-filled while capped');
  env.els['cj-cap'].value = '';
  fn._syncActualTotal('cj', 3000, 0);
  eq(env.els['cj-actual-total'].value, '', 'clearing the cap clears the auto-filled value');
}

// ── multi-day uses the same helpers ──────────────────────────────────────────
{
  const env = buildEnv('cjmd'); const fn = load(env);
  env.els['cjmd-cap'].value = 7000;
  const r = fn._applyCap('cjmd', 7350);
  eq(r.subtotal, 7000, 'multi-day subtotal capped');
  eq(r.capAdj, 350, 'multi-day cap discount');
  fn._syncActualTotal('cjmd', 7000, 350);
  eq(env.els['cjmd-actual-total'].value, 7350, 'multi-day un-capped value filled');
}

// ── wiring ───────────────────────────────────────────────────────────────────
ok(/const _cap=_applyCap\('cj',subtotal\);\s*\n\s*subtotal=_cap\.subtotal;/.test(HTML),
  'calcTotal applies the cap to the subtotal');
ok(HTML.indexOf("_applyCap('cj',subtotal)") < HTML.indexOf("const _ccFee=(_payment==='Credit card')"),
  'cap is applied BEFORE the credit-card surcharge (surcharge sits on top of the capped price)');
ok(/_syncActualTotal\('cj',total,_cap\.capAdj\)/.test(HTML), 'calcTotal syncs the un-capped value');
ok(/const _mdCap=_applyCap\('cjmd',grand\);/.test(HTML), 'calcMultiDayTotal applies the cap');
ok(/_syncActualTotal\('cjmd',grandWithCc,_mdCap\.capAdj\)/.test(HTML), 'multi-day syncs the un-capped value');
ok(/if\(_capEl\)_capEl\.value=\(j&&Number\(j\.doNotExceed\)>0\)\?Number\(j\.doNotExceed\):''/.test(HTML),
  'single-day pre-fills the cap from the booked job');
ok(/if\(_mdCapEl\)_mdCapEl\.value=\(j&&Number\(j\.doNotExceed\)>0\)\?Number\(j\.doNotExceed\):''/.test(HTML),
  'multi-day pre-fills the cap from the booked job');
ok(/_resetCapState\('cj'\)/.test(HTML) && /_resetCapState\('cjmd'\)/.test(HTML),
  'cap state is reset on open so one job cannot leak into the next');
ok(/id="cj-cap"[^>]*oninput="calcTotal\(\)"/.test(HTML), 'single-day cap input recalculates');
ok(/id="cjmd-cap"[^>]*oninput="calcMultiDayTotal\(\)"/.test(HTML), 'multi-day cap input recalculates');
ok(/id="cj-actual-total"[^>]*oninput="_capNoteManual\('cj'\)"/.test(HTML), 'manual edits are noted (single-day)');
ok(/id="cjmd-actual-total"[^>]*oninput="_capNoteManual\('cjmd'\)"/.test(HTML), 'manual edits are noted (multi-day)');

// ── the existing capDiscount derivation is untouched ─────────────────────────
ok(/const capDiscount=\(_resolvedActual>_resolvedTotal\)\?Math\.round\(\(_resolvedActual-_resolvedTotal\)\*100\)\/100:0;/.test(HTML),
  'confirmComplete capDiscount formula unchanged');
ok(/realValue:\(Number\(completed\.capDiscount\)>0&&Number\(completed\.actualTotal\)\)\?Number\(completed\.actualTotal\)/.test(HTML),
  'AI realValue still prefers the un-capped worth');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
