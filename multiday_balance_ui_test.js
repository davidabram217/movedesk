// Guard: multi-day completion form reflects partial payment (balance owing) at the bottom
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

// Wiring
check('cjmd-paid recalculates balance on input',/id="cjmd-paid"[^>]*oninput="calcMultiDayBalance\(\)"/.test(script));
check('multi-day balance bar exists',/id="cjmd-balance-bar"/.test(script));
check('multi-day balance label + amount exist',/id="cjmd-balance-label"/.test(script)&&/id="cjmd-balance-amount"/.test(script));
check('calcMultiDayTotal stashes numeric total',/window\._cjmdGrandTotal=grandWithCc;/.test(script));
check('calcMultiDayTotal refreshes balance (no recursion: reads stashed total)',/window\._cjmdGrandTotal=grandWithCc;\s*calcMultiDayBalance\(\);/.test(script));
check('calcMultiDayBalance defined',/function calcMultiDayBalance\(\)\{/.test(script));
check('calcMultiDayBalance reads stashed total, not calcMultiDayTotal()',/const total=Number\(window\._cjmdGrandTotal\)\|\|0;/.test(script)&&!/function calcMultiDayBalance\(\)\{[\s\S]{0,400}calcMultiDayTotal\(\)/.test(script));
check('neutral state when nothing entered',/if\(paidRaw===''\|\|paidRaw==null\|\|total<=0\)\{/.test(script));
check('shows Balance owing when paid < total',/label\.textContent='Balance owing'/.test(script));
check('owing button revealed on partial pay',/btnOwing\.style\.display='';/.test(script));

// Behavioral: re-implement the decision logic and verify David's example
function decide(total,paidRaw){
  if(paidRaw===''||paidRaw==null||total<=0)return 'neutral';
  const paid=Number(paidRaw)||0;const owing=total-paid;
  return owing>0.01?('owing:'+owing):'paid';
}
check('7000 total, 6500 paid -> owing 500',decide(7000,'6500')==='owing:500');
check('7000 total, 7000 paid -> paid in full',decide(7000,'7000')==='paid');
check('7000 total, blank -> neutral (no premature owing)',decide(7000,'')==='neutral');
check('7000 total, 7200 overpay -> paid (not negative owing)',decide(7000,'7200')==='paid');

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
