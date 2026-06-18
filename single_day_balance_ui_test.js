// Guard: single-day completion form opens neutral (no premature "Paid in full"), no clobbering
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

// calcTotal no longer auto-fills (and clobbers) the amount paid
check('calcTotal no longer auto-fills cj-paid',!/document\.getElementById\('cj-paid'\)\.value=total\|\|'';/.test(script));
// calcBalance is neutral when nothing has been entered
check('calcBalance neutral when amount paid is blank',/if\(total<=0\|\|paidRaw===''\|\|paidRaw==null\)\{[\s\S]{0,200}btnOwing\.style\.display='none';btnPaid\.style\.display='';/.test(script));
check('calcBalance reads raw paid value (to detect blank)',/const paidRaw=paidEl\?paidEl\.value:'';/.test(script));
// openComplete clears the amount paid on open
check('openComplete clears cj-paid on open',/const _cjPaidEl=document\.getElementById\('cj-paid'\);if\(_cjPaidEl\)_cjPaidEl\.value='';/.test(script));
// "Paid in full" button records full payment even if the box was left blank
check('confirmComplete: paid-in-full button defaults paid to total when blank',/let paid=document\.getElementById\('cj-paid'\)\.value;if\(\(paid===''\|\|paid==null\)&&paymentState==='paid'\)paid=total;/.test(script));
check('confirmCompleteMultiDay: same paid-in-full default',/let paid=document\.getElementById\('cjmd-paid'\)\.value;if\(\(paid===''\|\|paid==null\)&&paymentState==='paid'\)paid=total;/.test(script));

// Behavioral: replicate the balance decision (mirrors calcBalance / calcMultiDayBalance)
function state(total,paidRaw){
  if(total<=0||paidRaw===''||paidRaw==null)return 'neutral';
  const owing=total-(Number(paidRaw)||0);
  return owing>0.01?('owing:'+owing):'paid';
}
check('opens neutral (blank) on a $3603 job',state(3603,'')==='neutral');
check('3603 paid -> paid in full',state(3603,'3603')==='paid');
check('3000 paid -> owing 603',state(3603,'3000')==='owing:603');
// Confirm logic: paid-in-full button with blank box records full payment (owing 0)
function confirmPaid(total,paidRaw,btn){
  let paid=paidRaw;
  if((paid===''||paid==null)&&btn==='paid')paid=total;
  return Math.max(0,(Number(total)||0)-(Number(paid)||0));
}
check('blank + paid-in-full button -> owing 0',confirmPaid(3603,'','paid')===0);
check('3000 entered + owing button -> owing 603',confirmPaid(3603,'3000','owing')===603);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
