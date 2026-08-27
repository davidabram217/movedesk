// flat_rate_booking_test.js
// Guards the 2026-08-19 addition: a flat-rate option on the SINGLE-DAY booking form.
//
// Everything downstream already understood flatRate/flatPrice/flatPriceCash — the
// confirmation email (both builders), both calendar builders, and the multi-day day rows all
// had the code path. index.html even carried the comment "Flat-rate single day — booking form
// doesn't override flat-rate amounts (no field for it)". Only the input was missing, so a job
// booked by phone at one agreed price had to be faked as an hourly rate.
//
// This is additive: with the box unticked every existing path must behave exactly as before.
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
const buildJobCalUrl = new Function('fmtDate', 'fmtDateWithDay', 'encodeURIComponent',
  ex('function buildJobCalUrl(') + ';return buildJobCalUrl;')(d => d, d => d, x => x);
const cal = j => decodeURIComponent(buildJobCalUrl(j).split('&details=')[1].split('&location=')[0]);

const BASE = { name: 'Phone Booking', from: 'A', to: 'B', movers: 3, date: '2026-09-10', feeFuel: 80 };

// ── flat rate reaches the calendar ───────────────────────────────────────────
{
  const d = cal(Object.assign({}, BASE, { flatRate: true, flatPrice: 1200, flatPriceCash: 1100 }));
  ok(/Move services: \$1,200 flat rate/.test(d), 'flat price on the calendar');
  ok(/\$1,100 If Paid Cash/.test(d), 'flat cash price on the calendar');
  ok(!/Per Hour/.test(d), 'no hourly line on a flat-rate job');
  ok(/\$80 Fuel Fee/.test(d), 'fees still print on a flat-rate job');
}
// ── hourly is completely unchanged ───────────────────────────────────────────
{
  const d = cal(Object.assign({}, BASE, { rateRegular: 225, rateCash: 210 }));
  ok(/3 movers @ \$225 Per Hour \(\$210 If Paid Cash\)/.test(d), 'hourly job unchanged');
  ok(!/flat rate/.test(d), 'no flat line on an hourly job');
}
// ── ticked but no price must fall through, not print an empty flat line ──────
{
  const d = cal(Object.assign({}, BASE, { flatRate: true, flatPrice: '' }));
  ok(!/flat rate/.test(d), 'no flat line when no price is entered');
  ok(/\$80 Fuel Fee/.test(d), 'the rest of the event still renders');
}
// ── a quote-driven flat day still wins its own path ──────────────────────────
{
  const d = cal(Object.assign({}, BASE, { quoteDays: [{ flatRate: true, flatPrice: 900, flatPriceCash: 850 }] }));
  ok(/\$900 flat rate/.test(d), 'quote-driven flat rate still renders');
}

// ── persistence: hourly rate must NOT be invented on a flat job ──────────────
ok(/j\.rateRegular=j\.flatRate\?'':document\.getElementById\('bj-rate-regular'\)\.value;/.test(HTML),
  'rateRegular left blank on a flat-rate job (no invented $/hr for AI training or staff stats)');
ok(/j\.rateCash=j\.flatRate\?'':document\.getElementById\('bj-rate-cash'\)\.value;/.test(HTML),
  'rateCash left blank on a flat-rate job');
ok(/j\.flatPrice=j\.flatRate\?\(document\.getElementById\('bj-flat-price'\)\|\|\{\}\)\.value\|\|'':'';/.test(HTML),
  'flatPrice only stored when the box is ticked');
ok(/j\.flatRate=!!\(document\.getElementById\('bj-flat-rate'\)\|\|\{\}\)\.checked;/.test(HTML),
  'flatRate persisted from the checkbox');

// ── form + toggle ────────────────────────────────────────────────────────────
ok(/id="bj-flat-rate" onchange="bjToggleFlatRate\(\)"/.test(HTML), 'checkbox wired to the toggle');
ok(/id="bj-flat-price"/.test(HTML) && /id="bj-flat-price-cash"/.test(HTML), 'both flat inputs exist');
ok(/function bjToggleFlatRate\(\)/.test(HTML), 'toggle handler defined');
ok(/\['bj-hourly-wrap-1','bj-hourly-wrap-2'\]/.test(HTML) && /\['bj-flat-wrap-1','bj-flat-wrap-2'\]/.test(HTML),
  'the toggle swaps hourly and flat fields');

// ── restore paths ────────────────────────────────────────────────────────────
// Deliberately not adjacency-based: other openBooking setup (e.g. the "Booked by" prefill)
// legitimately sits between these. What matters is that the reset happens before the modal opens.
ok(/_fr\.checked=false;/.test(HTML) &&
   HTML.indexOf('_fr.checked=false;') < HTML.indexOf("document.getElementById('bj-date').value=_bjLeadDate(l)"),
  'a fresh booking resets flat rate to off');
ok(/if\(_existingDraft\.flatRate\)\{[\s\S]{0,400}draftSetIfHasValue\('bj-flat-price',_existingDraft\.flatPrice\)/.test(HTML),
  'draft restore brings back the flat rate');
ok(/_fr\.checked=!!j\.flatRate;/.test(HTML), 'editBookedJob restores the flat rate');

// ── confirmation email: BOTH builders ────────────────────────────────────────
ok((HTML.match(/if\(bj&&bj\.flatRate&&Number\(bj\.flatPrice\)\)\{/g) || []).length === 2,
  'BOTH confirmation-email builders take the flat rate from the booking form');
ok(/d=Object\.assign\(\{\},d\|\|\{\},\{flatRate:true,flatPrice:bj\.flatPrice,flatPriceCash:bj\.flatPriceCash\}\)/.test(HTML),
  'the email overlays the flat rate onto the day without mutating the quote');

// ── nothing else disturbed ───────────────────────────────────────────────────
ok(/j\.feeMaterials=document\.getElementById\('bj-fee-materials'\)\.value;/.test(HTML), 'other fields untouched');
ok(/j\.doNotExceed=document\.getElementById\('bj-do-not-exceed'\)/.test(HTML), 'do-not-exceed untouched');

console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
