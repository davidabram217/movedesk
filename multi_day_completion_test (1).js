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
check('confirmCompleteMultiDay sets multiDay:true', /confirmCompleteMultiDay[\s\S]{0,6000}multiDay:true/.test(indexHtml));
check('confirmCompleteMultiDay stores days array', /confirmCompleteMultiDay[\s\S]{0,6000}days:days/.test(indexHtml));
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

// ─── Phase 1 (2026-05-29): Job Context + Misc Charges fields added to multi-day form ───
check('Multi-day modal: Job Context section present',
  /id="cjmd-size"[\s\S]{0,500}id="cjmd-sqft"[\s\S]{0,500}id="cjmd-movetype"[\s\S]{0,500}id="cjmd-access-load"[\s\S]{0,500}id="cjmd-access-unload"/.test(indexHtml)
);
check('Multi-day modal: 3 Misc Charges rows present',
  /id="cjmd-misc-1-label"[\s\S]{0,2000}id="cjmd-misc-2-label"[\s\S]{0,2000}id="cjmd-misc-3-label"/.test(indexHtml)
);
check('Multi-day modal: Misc rows have AI-include checkboxes',
  /id="cjmd-misc-1-ai"/.test(indexHtml)&&/id="cjmd-misc-2-ai"/.test(indexHtml)&&/id="cjmd-misc-3-ai"/.test(indexHtml)
);
check('openCompleteMultiDay prefills size from j.size with lead fallback',
  /_sizeEl\.value=_pick\(j\.size,_l\?_l\.size:''\)/.test(indexHtml)
);
check('openCompleteMultiDay prefills access fields',
  /cjmd-access-load[\s\S]{0,200}_pick\(j\.accessLoad/.test(indexHtml)&&/cjmd-access-unload[\s\S]{0,200}_pick\(j\.accessUnload/.test(indexHtml)
);
check('confirmCompleteMultiDay reads Job Context from form fields',
  /const ctxSize=document\.getElementById\('cjmd-size'\)/.test(indexHtml)&&
  /const ctxMoveType=document\.getElementById\('cjmd-movetype'\)/.test(indexHtml)&&
  /const ctxAccessLoad=document\.getElementById\('cjmd-access-load'\)/.test(indexHtml)
);
check('confirmCompleteMultiDay collects miscCharges array',
  /const miscCharges=\[\];[\s\S]{0,500}for\(let i=1;i<=3;i\+\+\)/.test(indexHtml)
);
check('cj.miscCharges saved + miscTotal added to total',
  /miscCharges:miscCharges/.test(indexHtml)&&
  /total:Math\.round\(\(Number\(total\)\|\|0\)\+miscTotal\)/.test(indexHtml)
);
check('calcMultiDayTotal includes misc rows in running total',
  /let miscSum=0;[\s\S]{0,300}for\(let i=1;i<=3;i\+\+\)\{miscSum\+=Number/.test(indexHtml)&&
  /grand\+=miscSum/.test(indexHtml)
);
check('cj record uses form-sourced Job Context (ctxSize/ctxMoveType, not raw j.size)',
  /size:ctxSize,sqft:ctxSqft,moveType:ctxMoveType/.test(indexHtml)
);

// ─── 2026-05-29: Add Day support on both completion forms ───
check('_buildCjmdDayCard helper defined (reusable day-card builder)',
  /function _buildCjmdDayCard\(dayIndex, prefill\)/.test(indexHtml)
);
check('cjmdAddDay function defined',
  /function cjmdAddDay\(\)/.test(indexHtml)&&
  /container\.insertAdjacentHTML\('beforeend',_buildCjmdDayCard/.test(indexHtml)
);
check('cjmdRemoveDay function defined with min-1 guard',
  /function cjmdRemoveDay\(idx\)/.test(indexHtml)&&
  /container\.children\.length<=1/.test(indexHtml)
);
check('cjConvertToMultiDay function defined',
  /function cjConvertToMultiDay\(\)/.test(indexHtml)
);
check('cjConvertToMultiDay closes single-day modal and opens multi-day',
  /cjConvertToMultiDay[\s\S]{0,3000}closeModal\('complete-job'\)[\s\S]{0,500}openCompleteMultiDay\(jobId\)/.test(indexHtml)
);
check('cjConvertToMultiDay snapshots Job Context fields',
  /cjConvertToMultiDay[\s\S]{0,3000}size:_read\('cj-size'\)/.test(indexHtml)&&
  /cjConvertToMultiDay[\s\S]{0,3000}movetype:_read\('cj-movetype'\)/.test(indexHtml)
);
check('cjConvertToMultiDay snapshots Day 1 hours + crew',
  /cjConvertToMultiDay[\s\S]{0,3000}moveHours:_readNum\('cj-hours'\)/.test(indexHtml)&&
  /cjConvertToMultiDay[\s\S]{0,3000}packHours:_readNum\('cj-pack-hours'\)/.test(indexHtml)
);
check('cjConvertToMultiDay snapshots Misc Charges rows',
  /cjConvertToMultiDay[\s\S]{0,4000}misc:\[1,2,3\]\.map/.test(indexHtml)
);
check('cjConvertToMultiDay overlays Day 1 then adds blank Day 2',
  /cjConvertToMultiDay[\s\S]{0,5000}cjmdAddDay\(\)/.test(indexHtml)
);
check('Multi-day form: + Add another day button present',
  /onclick="cjmdAddDay\(\)"/.test(indexHtml)
);
check('Single-day form: + Add another day button present (triggers convert)',
  /onclick="cjConvertToMultiDay\(\)"/.test(indexHtml)
);
check('Per-day card has × remove button',
  /onclick="cjmdRemoveDay\(\$\{i\}\)"/.test(indexHtml)
);
check('Confirmation prompt before switching to multi-day (loss-of-state safety)',
  /confirm\('Switch to multi-day mode\?/.test(indexHtml)
);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
