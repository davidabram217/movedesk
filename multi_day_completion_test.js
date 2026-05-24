// Tests for the multi-day completion flow.
const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

console.log('PART A: Wiring');
check('Modal #modal-complete-job-multiday exists', /id="modal-complete-job-multiday"/.test(indexHtml));
check('Modal #modal-edit-completed-multiday exists', /id="modal-edit-completed-multiday"/.test(indexHtml));
check('Day type options array defined with 6 types',
  /_CJMD_DAY_TYPES=\['Packing','Moving','Pack and load','Pack and move','Load and move','Delivery'\]/.test(indexHtml)
);
check('openComplete routes multi-day to openCompleteMultiDay',
  /MULTI-DAY ROUTING[\s\S]{0,200}if\(j\.multiDay\|\|\(\(j\.quoteDays\|\|\[\]\)\.length>1\)\)\{return openCompleteMultiDay/.test(indexHtml)
);
check('openEditCompletedJob routes multi-day to openEditCompleteMultiDay',
  /if\(j\.multiDay\)\{return openEditCompleteMultiDay\(jobId\);?\}/.test(indexHtml)
);
check('Function openCompleteMultiDay defined', /function openCompleteMultiDay\(/.test(indexHtml));
check('Function renderMultiDayCompleteRows defined', /function renderMultiDayCompleteRows\(/.test(indexHtml));
check('Function calcMultiDayTotal defined', /function calcMultiDayTotal\(/.test(indexHtml));
check('Function confirmCompleteMultiDay defined', /function confirmCompleteMultiDay\(/.test(indexHtml));
check('Function openEditCompleteMultiDay defined', /function openEditCompleteMultiDay\(/.test(indexHtml));
check('Function renderEditMultiDayCompleteRows defined', /function renderEditMultiDayCompleteRows\(/.test(indexHtml));
check('Function calcEditMultiDayTotal defined', /function calcEditMultiDayTotal\(/.test(indexHtml));
check('Function saveEditedCompletedJobMultiDay defined', /function saveEditedCompletedJobMultiDay\(/.test(indexHtml));
check('bj-pack-crew-size has 12 packers',
  /<select id="bj-pack-crew-size">[\s\S]{0,500}<option>12<\/option>/.test(indexHtml)
);
check('cj-pack-movers has 12 packers',
  /<select id="cj-pack-movers">[\s\S]{0,500}<option>12<\/option>/.test(indexHtml)
);
check('ecj-pack-movers has 12 packers',
  /<select id="ecj-pack-movers">[\s\S]{0,500}<option>12<\/option>/.test(indexHtml)
);
check('confirmCompleteMultiDay sets multiDay:true', /confirmCompleteMultiDay[\s\S]{0,4000}multiDay:true/.test(indexHtml));
check('confirmCompleteMultiDay stores days array', /confirmCompleteMultiDay[\s\S]{0,4000}days:days/.test(indexHtml));
check('confirmCompleteMultiDay averages legacy hours/rate',
  /aggMoveHours\+=moveHours[\s\S]{0,2000}avgMoveRate=nMoveDays>0\?Math\.round\(aggMoveRate\/nMoveDays\)/.test(indexHtml)
);
check('renderCompleted shows day-count badge on multi-day jobs',
  /j\.multiDay&&j\.days&&j\.days\.length>1[\s\S]{0,200}\$\{j\.days\.length\}d/.test(indexHtml)
);
check('Lead-state exclusion self-heal still in place', /LEAD-STATE EXCLUSION SELF-HEAL/.test(indexHtml));
check('OfficeNotes self-heal still in place', /OFFICE NOTES SELF-HEAL/.test(indexHtml));

console.log('');
console.log('PART B: Behavior simulation');

function calcMultiDayTotalSim(days, wholeFees) {
  let grand = 0;
  days.forEach(d => {
    const movePay = d.moveHours * d.moveRate;
    const packPay = d.packHours * d.packRate;
    grand += movePay + packPay + d.fuel + d.materials + d.parking;
  });
  Object.values(wholeFees || {}).forEach(v => grand += Number(v) || 0);
  return grand;
}
function computeLegacyAverages(days) {
  let aggMoveHours = 0, aggPackHours = 0;
  let aggMovers = 0, aggPackers = 0;
  let aggMoveRate = 0, aggPackRate = 0;
  let nMoveDays = 0, nPackDays = 0;
  days.forEach(d => {
    if (d.moveHours > 0) { aggMoveHours += d.moveHours; aggMovers += d.movers; aggMoveRate += d.moveRate; nMoveDays++; }
    if (d.packHours > 0) { aggPackHours += d.packHours; aggPackers += d.packers; aggPackRate += d.packRate; nPackDays++; }
  });
  return {
    hoursTotal: Math.round((aggMoveHours + aggPackHours) * 10) / 10,
    avgMovers: nMoveDays > 0 ? Math.round(aggMovers / nMoveDays) : 0,
    avgMoveRate: nMoveDays > 0 ? Math.round(aggMoveRate / nMoveDays) : 0,
    avgPackHours: Math.round(aggPackHours * 10) / 10,
    avgPackers: nPackDays > 0 ? Math.round(aggPackers / nPackDays) : 0,
    avgPackRate: nPackDays > 0 ? Math.round(aggPackRate / nPackDays) : 0
  };
}

// Susan-style 2-day
{
  const days = [
    { type: 'Packing', movers: 0, moveHours: 0, moveRate: 0, packers: 3, packHours: 4, packRate: 135, fuel: 0, materials: 50, parking: 0 },
    { type: 'Moving',  movers: 5, moveHours: 7, moveRate: 225, packers: 0, packHours: 0, packRate: 0, fuel: 75, materials: 0, parking: 25 }
  ];
  const t = calcMultiDayTotalSim(days, { insurance: 100 });
  check('2-day Pack+Move total $2365', t === 2365, 'got '+t);
}
// 3-day
{
  const days = [
    { movers: 0, moveHours: 0, moveRate: 0, packers: 4, packHours: 8, packRate: 135, fuel: 0, materials: 100, parking: 0 },
    { movers: 0, moveHours: 0, moveRate: 0, packers: 4, packHours: 8, packRate: 135, fuel: 0, materials: 50, parking: 0 },
    { movers: 6, moveHours: 9, moveRate: 245, packers: 0, packHours: 0, packRate: 0, fuel: 100, materials: 0, parking: 50 }
  ];
  const t = calcMultiDayTotalSim(days, { insurance: 150 });
  check('3-day Pack+Pack+Move total $4815', t === 4815, 'got '+t);
}
// Averaging
{
  const days = [
    { movers: 3, moveHours: 4, moveRate: 225, packers: 3, packHours: 5, packRate: 135 },
    { movers: 5, moveHours: 7, moveRate: 225, packers: 0, packHours: 0, packRate: 0 }
  ];
  const a = computeLegacyAverages(days);
  check('Averaging: avgMovers = 4', a.avgMovers === 4);
  check('Averaging: avgMoveRate = $225', a.avgMoveRate === 225);
  check('Averaging: avgPackers = 3 (only pack-days counted)', a.avgPackers === 3);
  check('Averaging: avgPackRate = $135', a.avgPackRate === 135);
  check('Averaging: total hours = 16', a.hoursTotal === 16);
}
// Edge case: all-zero days
{
  const days = [
    { movers: 0, moveHours: 0, moveRate: 0, packers: 0, packHours: 0, packRate: 0 },
    { movers: 4, moveHours: 5, moveRate: 220, packers: 0, packHours: 0, packRate: 0 }
  ];
  const a = computeLegacyAverages(days);
  check('Zero-hour days skipped from averaging', a.avgMovers === 4 && a.avgMoveRate === 220);
  check('No pack-days → avgPackers=0', a.avgPackers === 0);
  check('No pack-days → avgPackRate=0', a.avgPackRate === 0);
}

console.log('');
console.log('PART C: Data shape and edit cycle');
check('Single-day modal #modal-complete-job still exists', /id="modal-complete-job"/.test(indexHtml));
check('Single-day confirmComplete still defined', /function confirmComplete\(paymentState\)/.test(indexHtml));
check('openEditCompleteMultiDay renders from cj.days[]',
  /function openEditCompleteMultiDay[\s\S]+?renderEditMultiDayCompleteRows\(j\)/.test(indexHtml)
);
check('renderEditMultiDayCompleteRows iterates j.days',
  /function renderEditMultiDayCompleteRows[\s\S]{0,1000}\(j\.days\|\|\[\]\)\.map/.test(indexHtml)
);
check('saveEditedCompletedJobMultiDay writes j.days in place',
  /function saveEditedCompletedJobMultiDay[\s\S]{0,3000}j\.days=days/.test(indexHtml)
);
check('Pre-fill from j.quoteDays[] on create',
  /const qDays=\(j\.quoteDays&&j\.quoteDays\.length\)\?j\.quoteDays/.test(indexHtml)
);
check('Day-type default infers from packCrewSize',
  /_defaultType[\s\S]{0,500}hasPack[\s\S]{0,300}'Pack and move'/.test(indexHtml)
);

console.log('');
console.log('PART D: Edge cases');
{
  const days = [{ movers: 3, moveHours: 5, moveRate: 200, packers: 0, packHours: 0, packRate: 0, fuel: 0, materials: 0, parking: 0 }];
  const t = calcMultiDayTotalSim(days, {});
  check('Single-row multi-day total works: $1000', t === 1000);
}
check('Whole-job fees use Number coercion',
  /Number\(document\.getElementById\('cjmd-insurance'\)\.value\)\|\|0/.test(indexHtml)
);
check('usedForAI flag persisted',
  /function confirmCompleteMultiDay[\s\S]+?usedForAI:useForAI/.test(indexHtml)
);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
