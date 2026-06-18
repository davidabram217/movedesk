// Guard: "TBD" option on the new-lead preferred move date
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

check('TBD checkbox present on the date field',/id="nl-date-tbd"[^>]*onchange="nlToggleDateTBD\(\)"/.test(script));
check('nlToggleDateTBD defined',/function nlToggleDateTBD\(\)\{/.test(script));
check('toggle clears + disables date when checked',/if\(cb\.checked\)\{dEl\.value='';dEl\.disabled=true;/.test(script));
check('save stores TBD when checked',/date:\(document\.getElementById\('nl-date-tbd'\)&&document\.getElementById\('nl-date-tbd'\)\.checked\)\?'TBD':\(document\.getElementById\('nl-date'\)\?\.value\|\|''\),/.test(script));
check('editLead round-trips TBD',/document\.getElementById\('nl-date'\)\.value=\(l\.date==='TBD'\)\?'':\(l\.date\|\|''\);/.test(script)&&/_tb\.checked=\(l\.date==='TBD'\);nlToggleDateTBD\(\);/.test(script));
check('draft restore round-trips TBD',/set\('nl-date',d\.date==='TBD'\?'':d\.date\);/.test(script)&&/_tb\.checked=\(d\.date==='TBD'\);nlToggleDateTBD\(\);/.test(script));
check('resetNewLeadForm unchecks TBD + re-enables',/_tbR=document\.getElementById\('nl-date-tbd'\);if\(_tbR\)_tbR\.checked=false;nlToggleDateTBD\(\);/.test(script));
check('fmtDate returns TBD for TBD',/function fmtDate\(d\)\{if\(!d\)return'—';if\(d==='TBD'\)return'TBD';/.test(script));
check('fmtDate guards invalid dates to dash',/if\(isNaN\(dt\)\)return'—';/.test(script));

// Behavioral: fmtDate
const m=script.match(/function fmtDate\(d\)\{.*\}/);
let fmtDate; try{ fmtDate=eval('('+m[0].replace('function fmtDate','function')+')'); }catch(e){}
if(typeof fmtDate==='function'){
  check('fmtDate("TBD")==="TBD"',fmtDate('TBD')==='TBD');
  check('fmtDate("")==="—"',fmtDate('')==='—');
  check('fmtDate real date formats',/\d{4}/.test(fmtDate('2026-07-01')));
}

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
