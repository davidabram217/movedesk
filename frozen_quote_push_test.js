// frozen_quote_push_test.js
// Guards the 2026-08-19 fix for the permanent failed-push loop.
//
// A sent/accepted quote's contents are frozen by a DB constraint (23514, "MoveDesk lock").
// _pushTable only marks a row clean on a CONFIRMED success — correct for transient failures,
// but this rejection is permanent, so the row stayed dirty and EVERY saveDB() retried it,
// throwing 400s that buried real errors. Same loop on the self-heal re-push path.
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
const SRC = ex('function _noteFrozenQuoteRejection(');
ok(!!SRC, '_noteFrozenQuoteRejection extracted');
function fresh() {
  return new Function('const _frozenQuoteIds={};const console={info(){},warn(){},log(){}};' + SRC +
    ';return {note:_noteFrozenQuoteRejection, ids:_frozenQuoteIds};')();
}

// ── the two real errors from David's console ─────────────────────────────────
const ERR_SENT = '{"code":"23514","details":null,"hint":null,"message":"MoveDesk lock: quote qmt5191hms95t70 is sent and its contents are frozen (id=mt5191hmdujjxiadro). Issue a new quote instead of editing this one."}';
const ERR_ACC  = '{"code":"23514","message":"MoveDesk lock: quote qmtbr91wmec1wns is accepted and its contents are frozen (id=mtbr91wn7a0lnjfnjz7)."}';
{
  const f = fresh();
  f.note(ERR_SENT);
  ok(f.ids['mt5191hmdujjxiadro'], 'records the frozen SENT quote row id');
  f.note(ERR_ACC);
  ok(f.ids['mtbr91wn7a0lnjfnjz7'], 'records the frozen ACCEPTED quote row id');
  eq(Object.keys(f.ids).length, 2, 'exactly the two refused ids are recorded');
  // It must key on the row id (id=...), not the quote's public id, since that is what
  // db.quotes rows and the push payload use.
  ok(!f.ids['qmt5191hms95t70'], 'does not key on the public quote id');
}

// ── must ignore anything that is not the frozen-quote lock ───────────────────
{
  const f = fresh();
  // The real ai_training 404 also contains "id=" — it must not be captured.
  f.note('{"code":"PGRST205","message":"Could not find the table \'public.ai_training\' in the schema cache (id=nope)"}');
  f.note('{"code":"23505","message":"duplicate key value violates unique constraint (id=alsonope)"}');
  f.note('some transient 500 error');
  eq(Object.keys(f.ids).length, 0, 'unrelated errors record nothing');
}
{
  const f = fresh();
  [null, undefined, '', 0, false].forEach(v => f.note(v));
  eq(Object.keys(f.ids).length, 0, 'null/empty input is safe and records nothing');
}
{
  const f = fresh();
  f.note(ERR_SENT); f.note(ERR_SENT); f.note(ERR_SENT);
  eq(Object.keys(f.ids).length, 1, 'repeated identical rejections do not duplicate');
}
{
  // A single batch rejection naming two rows should capture both.
  const f = fresh();
  f.note('MoveDesk lock: quote a is sent and its contents are frozen (id=aaa). MoveDesk lock: quote b is accepted and its contents are frozen (id=bbb).');
  eq(Object.keys(f.ids).length, 2, 'multiple ids in one error body are all captured');
}

// ── the guard must skip ONLY refused rows ────────────────────────────────────
// This is the safety property: a newly-sent or accepted quote that has never been refused
// must still push, or sending a quote would silently stop syncing.
{
  const _frozen = { 'mt5191hmdujjxiadro': 1 };
  const _wouldDowngradeQuote = () => false;
  const quotes = [
    { id: 'q-draft', status: 'draft' },
    { id: 'q-newly-sent', status: 'sent' },
    { id: 'q-accepted-ok', status: 'accepted' },
    { id: 'mt5191hmdujjxiadro', status: 'sent' }
  ];
  const rows = quotes.filter(q => { if (_frozen[q.id]) return false; if (_wouldDowngradeQuote(q)) return false; return true; });
  eq(rows.length, 3, 'three quotes still push');
  ok(rows.some(q => q.id === 'q-newly-sent'), 'a NEWLY SENT quote still pushes (first upload must work)');
  ok(rows.some(q => q.id === 'q-accepted-ok'), 'an accepted quote that was never refused still pushes');
  ok(rows.some(q => q.id === 'q-draft'), 'drafts still push');
  ok(!rows.some(q => q.id === 'mt5191hmdujjxiadro'), 'only the refused row is skipped');
}

// ── wiring ───────────────────────────────────────────────────────────────────
ok(/_noteFrozenQuoteRejection\(t\);return null;/.test(HTML),
  'sbFetch records the rejection, still logs, still returns null');
ok(/if\(_frozenQuoteIds\[q\.id\]\)return false;/.test(HTML),
  'the push payload skips refused rows');
ok(/if\(_frozenQuoteIds\[qid\]\)return;/.test(HTML),
  'the self-heal re-push skips refused rows');
ok(/const _frozenQuoteIds=\{\};/.test(HTML), 'the set exists');
ok(!/localStorage[^;]*_frozenQuoteIds/.test(HTML),
  'NOT persisted \u2014 each id is retried once per session so a lifted freeze recovers on its own');

// The self-heal log must not claim success when the push was rejected.
ok(/if\(_r!==null\)\{ console\.log\('Cloud self-heal: re-pushed/.test(HTML),
  'success message only prints on an actual success');
ok(/was REJECTED/.test(HTML), 'a rejected re-push says so instead of claiming success');

// Nothing about the existing guards should have changed.
ok(/_wouldDowngradeQuote\(q\)/.test(HTML), '_wouldDowngradeQuote check still present');
ok(/if\(res!==null\)_markSynced\(table,dirty,key\);/.test(HTML),
  '_pushTable still only marks rows clean on confirmed success');
ok(/q\.jobType==='multi'&&_quoteDayCount\(q\)<=1/.test(HTML),
  'the multi-day collapse safety check is untouched');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
