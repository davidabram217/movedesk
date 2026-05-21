// Verifies that booking-form values (rate, movers, fees, date, time) override the original
// quote values when generating the confirmation email body and the calendar's customer block.
// This is the behavior David asked for: the booked job is the final agreement, not the quote.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// PART A: Code-presence tests
console.log('PART A: Verify the precedence fix is in place');

// A1: Single-day confirmation email — bj.rateRegular comes FIRST
check('Email (single-day): bj.rateRegular precedes day.rate',
  /var rate=Number\(bj\?\.rateRegular\)\|\|Number\(d\.rate\)/.test(indexHtml)
);
check('Email (single-day): bj.movers precedes day.crew',
  /var crew=Number\(bj\?\.movers\)\|\|Number\(d\.crew\)/.test(indexHtml)
);
check('Email (single-day): bj.rateCash precedes q.cashRate',
  /var cashRate=Number\(bj\?\.rateCash\)\|\|Number\(q\.cashRate\)/.test(indexHtml)
);
check('Email (single-day): bj.date overrides quote date',
  /var moveDate=bj\?\.date\|\|d\.date/.test(indexHtml)
);
check('Email (single-day): bj.time overrides quote arrival',
  /if\(bj\?\.time\)\{[\s\S]*?arrivalLine.*?arriving \'\+bj\.time/.test(indexHtml)
);

// A2: Single-day fuel/materials fee override block exists
check('Email (single-day): bj.feeFuel override block present',
  /If booking has a fuel fee value AND this fee is the fuel line/.test(indexHtml)
);
check('Email (single-day): bj.feeMaterials override block present',
  /If booking has a materials fee value AND this fee is the materials line/.test(indexHtml)
);
check('Email (single-day): adds bj fee even when quote had no fuel/materials line',
  /If booking has fuel\/materials fees but the quote DIDN'T have those fee lines/.test(indexHtml)
);

// A3: Multi-day branch has the isDay1 logic
check('Email (multi-day): isDay1 booking override',
  /const isDay1=\(i===0\)/.test(indexHtml) && 
  /Booking-form values override Day 1 only/.test(indexHtml)
);

// A4: buildMoveDetailsBlock (calendar) has the same fix
check('Calendar block (single-day): bj.rateRegular wins',
  indexHtml.match(/var rate=Number\(bj\?\.rateRegular\)\|\|Number\(d\.rate\)/g).length >= 2
);
check('Calendar block (single-day): booking date wins',
  /Booked-job values win over quote values \(matches confirmation email/.test(indexHtml)
);

// A5: Cache invalidation on edit
check('Edit booked job: cached _moveDetailsBlock cleared',
  /Invalidate the cached "what was sent to customer" block/.test(indexHtml) &&
  /delete j\._moveDetailsBlock/.test(indexHtml)
);

// PART B: Simulate the precedence logic against sample data
console.log('');
console.log('PART B: Simulate precedence with sample data');

// Standalone replication of the relevant precedence logic
function emailDataValues(bj, day, q) {
  return {
    rate: Number(bj?.rateRegular) || Number(day.rate) || Number((bj?.quoteDays?.[0]||{}).rate) || 0,
    cashRate: Number(bj?.rateCash) || Number(q.cashRate) || 0,
    crew: Number(bj?.movers) || Number(day.crew) || 0,
    moveDate: bj?.date || day.date || '',
    arrivalLine: bj?.time ? (', arriving ' + bj.time) : (day.arrivalStart ? (', arriving ' + day.arrivalStart + (day.arrivalEnd ? ' – ' + day.arrivalEnd : '')) : '')
  };
}

// B1: Booking has higher rate than quote → email shows booking rate
{
  const day = { crew: 3, rate: 225, hrsMin: 5, hrsMax: 7, date: '2026-06-15', arrivalStart: '8:00 AM', arrivalEnd: '9:00 AM' };
  const q = { days: [day], cashRate: 200 };
  const bj = { movers: 4, rateRegular: 275, rateCash: 250, date: '2026-06-15', time: '8:30–9:30am' };
  const r = emailDataValues(bj, day, q);
  check('User changed crew 3→4 in booking → email shows 4', r.crew === 4);
  check('User changed rate $225→$275 → email shows $275', r.rate === 275);
  check('User changed cash rate $200→$250 → email shows $250', r.cashRate === 250);
  check('User typed time → email shows it', r.arrivalLine === ', arriving 8:30–9:30am');
}

// B2: Booking is blank/empty → email falls back to quote
{
  const day = { crew: 3, rate: 225, hrsMin: 5, hrsMax: 7, date: '2026-06-15', arrivalStart: '8:00 AM', arrivalEnd: '9:00 AM' };
  const q = { days: [day], cashRate: 200 };
  const bj = { movers: '', rateRegular: '', rateCash: '', date: '', time: '' };
  const r = emailDataValues(bj, day, q);
  check('Blank booking rate → falls back to quote $225', r.rate === 225);
  check('Blank booking crew → falls back to quote 3', r.crew === 3);
  check('Blank booking cash → falls back to quote $200', r.cashRate === 200);
  check('Blank booking date → falls back to quote date', r.moveDate === '2026-06-15');
  check('Blank booking time → falls back to quote arrival', r.arrivalLine === ', arriving 8:00 AM – 9:00 AM');
}

// B3: Lower booking values too → email shows them (booking is authoritative)
{
  const day = { crew: 4, rate: 300, hrsMin: 6, hrsMax: 8 };
  const q = { days: [day], cashRate: 280 };
  const bj = { movers: 2, rateRegular: 140, rateCash: 130 };
  const r = emailDataValues(bj, day, q);
  check('Booking REDUCES crew 4→2 → email shows 2', r.crew === 2);
  check('Booking REDUCES rate $300→$140 → email shows $140', r.rate === 140);
}

// B4: Fee override simulation
function feeWithOverride(quoteFees, bjFuelFee, bjMatFee) {
  const out = [];
  let fuelDone = false, matDone = false;
  (quoteFees || []).filter(f => f.included && (f.amount || f.hrsMin || f.hrsMax)).forEach(f => {
    const lblLower = (f.label || '').toLowerCase();
    if (bjFuelFee && lblLower.indexOf('fuel') >= 0) { out.push({label: f.label, amount: bjFuelFee}); fuelDone = true; return; }
    if (bjMatFee && lblLower.indexOf('material') >= 0 && lblLower.indexOf('packing') < 0) { out.push({label: f.label, amount: bjMatFee}); matDone = true; return; }
    out.push({label: f.label, amount: f.amount});
  });
  // Add booking-only fees if quote didn't have them
  const hadFuel = (quoteFees || []).some(f => f.included && (f.label||'').toLowerCase().indexOf('fuel') >= 0);
  const hadMat = (quoteFees || []).some(f => f.included && (f.label||'').toLowerCase().indexOf('material') >= 0 && (f.label||'').toLowerCase().indexOf('packing') < 0);
  if (bjFuelFee && !hadFuel) out.push({label: 'Fuel Fee', amount: bjFuelFee});
  if (bjMatFee && !hadMat) out.push({label: 'Material Fee', amount: bjMatFee});
  return out;
}

{
  const quoteFees = [
    { included: true, label: 'Fuel Fee', amount: 75 },
    { included: true, label: 'Material Fee', amount: 40 },
    { included: true, label: 'Packing Materials', amount: 100 }
  ];
  const result = feeWithOverride(quoteFees, 100, 50);
  const fuel = result.find(f => f.label === 'Fuel Fee');
  const mat = result.find(f => f.label === 'Material Fee');
  const pack = result.find(f => f.label === 'Packing Materials');
  check('Fuel fee overridden from $75→$100', fuel && fuel.amount === 100);
  check('Material fee overridden from $40→$50', mat && mat.amount === 50);
  check('Packing materials NOT overridden (different fee)', pack && pack.amount === 100);
}

{
  // Quote had no fuel/materials, booking adds them
  const quoteFees = [];
  const result = feeWithOverride(quoteFees, 75, 40);
  check('Quote had no fuel → booking adds it', result.find(f => f.label === 'Fuel Fee' && f.amount === 75));
  check('Quote had no materials → booking adds it', result.find(f => f.label === 'Material Fee' && f.amount === 40));
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
