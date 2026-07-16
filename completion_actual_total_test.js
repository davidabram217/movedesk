// Guards the single-day completion "Actual job total" (actualTotal) leak + correction path.
//
// Reported 2026-07-15 (Ian Remmel): analytics showed his job value as $3208 when he paid $796,
// and editing the job could not fix it. Two compounding bugs:
//   1. LEAK — `openComplete` cleared ~38 fields between jobs but NOT `cj-actual-total`. The field
//      persists for the whole browser session, so a value typed on an earlier job was still
//      sitting there when the next job was closed out, and got saved as that job's true value.
//      (The MULTI-DAY form always cleared its equivalent `cjmd-actual-total` — single-day, being
//      older, never got the same treatment.)
//   2. UNCORRECTABLE — the single-day EDIT form had NO actualTotal field. `saveEditedCompletedJob`
//      read `j.actualTotal` straight back into itself, so a wrong value was permanent. Worse:
//      editing the total recomputed `capDiscount` from the stale actualTotal, and analytics
//      (`realJobValue`) PREFERS actualTotal whenever capDiscount>0 — so the edit that should have
//      fixed it was exactly what locked the wrong number in.
//
// Run: node completion_actual_total_test.js index.html
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};
function grab(sig){const i=src.indexOf(sig);if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';}

// ── 1. The leak is closed: openComplete clears cj-actual-total ──
const oc=grab('function openComplete(jobId){');
check('openComplete exists',!!oc);
// NOTE: grab() brace-matches, and openComplete's body runs on into confirmComplete (which also
// references cj-actual-total), so a bare /'cj-actual-total'/ test on `oc` FALSE-PASSES against the
// unfixed file. Assert against the clear-list array itself — that is the thing being guarded.
check('openComplete CLEARS cj-actual-total, inside the cj-labour clear-list (the leak fix)',/\['cj-labour'[^\]]*'cj-actual-total'[^\]]*\]/.test(oc));
check('the clear-list still blanks the money fields',/'cj-labour'/.test(oc)&&/'cj-paid'/.test(oc)&&/'cj-hours'/.test(oc));

// ── 2. The single-day EDIT form can now correct it ──
check('edit form HAS a True job value input',/id="ecj-actual-total"/.test(src));
const oe=grab('function openEditCompletedJob(jobId){');
check('openEditCompletedJob prefills it only when a discount was recorded',/_ecjAtEl.*Number\(j\.capDiscount\)>0&&j\.actualTotal.*j\.actualTotal:''/s.test(oe));
const se=grab('function saveEditedCompletedJob(){');
check('save READS the field (not j.actualTotal back into itself)',/getElementById\('ecj-actual-total'\)/.test(se));
check('save no longer self-assigns from j.actualTotal',!/const _editActual=Number\(j\.actualTotal\)/.test(se));
check('blank field resets actualTotal to the total ("charged full price")',/j\.actualTotal=_ecjAt\|\|total\|\|null/.test(se));
check('capDiscount recomputed from the FIELD, not the stale record',/j\.capDiscount=\(_ecjAt&&_ecjAt>total\)/.test(se));

// ── 3. Behavioural: reproduce the bug, then the fix ──
// analytics (index.html ~line 4868)
const realJobValue=j=>{
  const cap=Number(j.capDiscount)||0,at=Number(j.actualTotal)||0,tot=Number(j.total)||0;
  return cap>0&&at?at:(tot||at||Number(j.paid)||0);
};
// completion commit
const complete=(total,actualTotalField)=>{
  const at=actualTotalField?Number(actualTotalField):null;
  const rt=Number(total)||0,ra=Number(at)||0;
  return {total:rt,paid:rt,actualTotal:at||rt||null,capDiscount:ra>rt?Math.round((ra-rt)*100)/100:0};
};
// single-day edit save (fixed)
const editSave=(j,total,actualTotalField)=>{
  const _ecjAt=actualTotalField?Number(actualTotalField):null;
  return Object.assign({},j,{total:Number(total)||0,actualTotal:_ecjAt||Number(total)||null,
    capDiscount:(_ecjAt&&_ecjAt>Number(total))?Math.round((_ecjAt-Number(total))*100)/100:0});
};

// THE BUG: 3208 left in the field from a previous job, Ian's real total 796
const ian=complete(796,3208);
check('repro: leaked field produces capDiscount 2412',ian.capDiscount===2412);
check('repro: analytics reports 3208, not the 796 charged',realJobValue(ian)===3208);

// THE FIX (data): open edit, blank the True job value field, save
const fixed=editSave(ian,796,'');
check('fix: blanking the field resets actualTotal to 796',fixed.actualTotal===796);
check('fix: capDiscount drops to 0',fixed.capDiscount===0);
check('fix: analytics now reports the 796 actually charged',realJobValue(fixed)===796);

// THE FIX (cause): field cleared, so nothing leaks into the next job
const clean=complete(796,'');
check('cause fixed: cleared field -> actualTotal equals total',clean.actualTotal===796);
check('cause fixed: no phantom discount',clean.capDiscount===0);
check('cause fixed: analytics reports 796',realJobValue(clean)===796);

// A GENUINE discount must still work (do not over-correct)
const genuine=complete(1000,1500); // charged 1000, job really worth 1500
check('genuine discount still records capDiscount 500',genuine.capDiscount===500);
check('genuine discount: analytics uses the true value 1500',realJobValue(genuine)===1500);
const genuineKept=editSave(genuine,1000,1500);
check('genuine discount survives an edit',genuineKept.actualTotal===1500&&genuineKept.capDiscount===500);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
