// Guard: "TBD" option when sending out an estimate (se-date)
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

check('se-date TBD checkbox present',/id="se-date-tbd"[^>]*onchange="seToggleDateTBD\(\)"/.test(script));
check('seToggleDateTBD defined',/function seToggleDateTBD\(\)\{/.test(script));
check('toggle clears + disables se-date when checked',/function seToggleDateTBD\(\)\{[\s\S]{0,260}if\(cb\.checked\)\{dEl\.value='';dEl\.disabled=true;/.test(script));
check('confirmEstimate stores TBD when checked',/l\.estimateDate=\(document\.getElementById\('se-date-tbd'\)&&document\.getElementById\('se-date-tbd'\)\.checked\)\?'TBD':document\.getElementById\('se-date'\)\.value;/.test(script));
check('openSendEstimate round-trips TBD on open',/_seTb\.checked=\(l\.estimateDate==='TBD'\);seToggleDateTBD\(\);/.test(script));
// This flow is NOT the locked schedule-estimate flow
check('confirmEstimate (send) is the target, not confirmScheduleEstimate',/function confirmEstimate\(\)\{/.test(script));
// fmtDate already handles TBD (hardened earlier) -> estimate timeline/displays show TBD cleanly
check('fmtDate still handles TBD',/function fmtDate\(d\)\{if\(!d\)return'—';if\(d==='TBD'\)return'TBD';/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
