// Tests for booking a multi-day job directly, with NO quote.
// Run: node multiday_direct_booking_test.js index.html
const fs=require('fs'),vm=require('vm');
const file=process.argv[2]||'index.html';
const idx=fs.readFileSync(file,'utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));

let pass=0,fail=0;
function check(name,cond){if(cond){pass++;}else{fail++;console.log('  ✗ '+name);}}

// Brace-matched function extractor (string/template aware)
function extract(name){
  const m=new RegExp('function\\s+'+name+'\\s*\\(').exec(script);
  if(!m)return null;
  let i=script.indexOf('{',m.index),d=0,s=false,sc='',t=false,e=false;
  for(let p=i;p<script.length;p++){const c=script[p];
    if(e){e=false;continue;} if(c==='\\'){e=true;continue;}
    if(s){if(c===sc)s=false;continue;} if(t){if(c==='`')t=false;continue;}
    if(c==='"'||c==="'"){s=true;sc=c;continue;} if(c==='`'){t=true;continue;}
    if(c==='{')d++;else if(c==='}'){d--;if(d===0)return script.slice(m.index,p+1);}}
  return null;
}

// ---- Functional: _bjReadDays + _bjApplyMultiDay ----
const ctx={Number,String,Array,Object,Math,console};
vm.createContext(ctx);
ctx._bjDays=[];
ctx._doc={'bj-multiday':{checked:false}};
ctx.document={getElementById:id=>ctx._doc[id]||null};
vm.runInContext('let _bjDays=globalThis._bjDays;',ctx);
['_bjReadDays','_bjApplyMultiDay'].forEach(fn=>{const src=extract(fn);if(src)vm.runInContext(src,ctx);else{fail++;console.log('  ✗ could not extract '+fn);}});

// hourly day → numbers, flat fields blank
ctx._bjDays=[{date:'2026-06-10',crew:'4',rate:'225',rateCash:'200',flatRate:false,hrsMin:'4',hrsMax:'6',flatPrice:'',flatPriceCash:''}];
let r=ctx.document&&vm.runInContext('_bjReadDays()',Object.assign(ctx,{_bjDays:ctx._bjDays}));
// re-bind _bjDays inside context
vm.runInContext('_bjDays=globalThis._bjDays;',ctx);
r=vm.runInContext('_bjReadDays()',ctx);
check('hourly: date preserved',r[0].date==='2026-06-10');
check('hourly: crew is number 4',r[0].crew===4);
check('hourly: rate number 225',r[0].rate===225);
check('hourly: hrsMin/Max numbers',r[0].hrsMin===4&&r[0].hrsMax===6);
check('hourly: flatRate false',r[0].flatRate===false);
check('hourly: flatPrice blank',r[0].flatPrice==='');

// flat day → flatPrice number, hourly fields blank
ctx._bjDays=[{date:'2026-06-11',crew:'3',rate:'225',rateCash:'',flatRate:true,hrsMin:'4',hrsMax:'6',flatPrice:'1200',flatPriceCash:'1100'}];
vm.runInContext('_bjDays=globalThis._bjDays;',ctx);
r=vm.runInContext('_bjReadDays()',ctx);
check('flat: flatRate true',r[0].flatRate===true);
check('flat: flatPrice number 1200',r[0].flatPrice===1200);
check('flat: flatPriceCash number 1100',r[0].flatPriceCash===1100);
check('flat: hourly rate blanked',r[0].rate===''&&r[0].hrsMin===''&&r[0].hrsMax==='');

// _bjApplyMultiDay: toggle ON, 2 days → multiDay true + quoteDays length 2
ctx._bjDays=[{date:'2026-06-10',crew:'3',rate:'225',rateCash:'',flatRate:false,hrsMin:'4',hrsMax:'6',flatPrice:'',flatPriceCash:''},
             {date:'2026-06-11',crew:'2',rate:'200',rateCash:'',flatRate:false,hrsMin:'3',hrsMax:'5',flatPrice:'',flatPriceCash:''}];
vm.runInContext('_bjDays=globalThis._bjDays;',ctx);
ctx._doc['bj-multiday'].checked=true;
let job={};vm.runInContext('globalThis.__job={};',ctx);
ctx.__job={};
vm.runInContext('_bjApplyMultiDay(globalThis.__job);',ctx);
check('apply: multiDay true for 2 days',ctx.__job.multiDay===true);
check('apply: quoteDays length 2',Array.isArray(ctx.__job.quoteDays)&&ctx.__job.quoteDays.length===2);
check('apply: day2 crew preserved',ctx.__job.quoteDays&&ctx.__job.quoteDays[1].crew===2);

// toggle ON, 1 day → multiDay false but quoteDays set
ctx._bjDays=[{date:'2026-06-10',crew:'3',rate:'225',rateCash:'',flatRate:false,hrsMin:'4',hrsMax:'6',flatPrice:'',flatPriceCash:''}];
vm.runInContext('_bjDays=globalThis._bjDays;',ctx);
ctx.__job={};vm.runInContext('_bjApplyMultiDay(globalThis.__job);',ctx);
check('apply: 1 day → multiDay false',ctx.__job.multiDay===false);

// toggle OFF → no-op
ctx._doc['bj-multiday'].checked=false;
ctx.__job={untouched:1};vm.runInContext('_bjApplyMultiDay(globalThis.__job);',ctx);
check('apply: toggle off is a no-op',ctx.__job.multiDay===undefined&&ctx.__job.quoteDays===undefined&&ctx.__job.untouched===1);

// ---- Structural wiring ----
check('HTML: multi-day toggle present',/id="bj-multiday"[\s\S]*?onchange="toggleBjMultiDay\(\)"/.test(idx));
check('HTML: per-day list + add-day button',/id="bj-multiday-list"/.test(idx)&&/onclick="addBjDay\(\)"/.test(idx));
check('fn: toggleBjMultiDay defined',/function toggleBjMultiDay\(/.test(script));
check('fn: addBjDay / removeBjDay defined',/function addBjDay\(/.test(script)&&/function removeBjDay\(/.test(script));
check('fn: renderBjDays defined',/function renderBjDays\(/.test(script));
check('fn: _bjApplyMultiDay no-ops when toggle off',/if\(!cb\|\|!cb\.checked\|\|!_bjDays\.length\)return;/.test(script));
check('autosave persists rows (bjWriteFields → _bjApplyMultiDay)',/function bjWriteFields[\s\S]*?_bjApplyMultiDay\(j\);[\s\S]*?\n}/.test(script));
check('confirmBooking new mode applies rows',/multiDay:isMultiDayQuote,quoteDays:_quoteDaysSnap[\s\S]*?_bjApplyMultiDay\(job\);/.test(script));
check('confirmBooking edit mode applies rows',/j\.officeNotes=document\.getElementById\('bj-office-notes'\)\?\.value\|\|'';\s*\n\s*_bjApplyMultiDay\(j\);/.test(script));
check('openBooking resets multi-day UI (toggle hidden when quote-driven)',/_bjResetMultiDay\(!_isMultiDay\);/.test(script));
check('openBooking restores a direct multi-day draft',/!_isMultiDay&&_existingDraft\.multiDay&&_existingDraft\.quoteDays&&_existingDraft\.quoteDays\.length>1[\s\S]*?_bjLoadMultiDay\(_existingDraft\.quoteDays\)/.test(script));
check('editBookedJob loads multi-day editor',/if\(j\.multiDay&&j\.quoteDays&&j\.quoteDays\.length>1\)\{_bjLoadMultiDay\(j\.quoteDays\);\}/.test(script));

// Email synth
check('email: q is reassignable (let q=q0)',/let q=q0;/.test(script));
check('email: isMulti reassignable (let isMulti)',/let isMulti=q&&q\.jobType==='multi'/.test(script));
check('email: synthesizes multi-day q from booking when no quote',/if\(!isMulti&&bj&&bj\.multiDay&&bj\.quoteDays&&bj\.quoteDays\.length>1\)\{[\s\S]*?days:bj\.quoteDays,jobType:'multi'/.test(script));
check('email: synth provides fees + cashRate + totals',/fees:\(bj\.quoteFees[\s\S]*?cashRate:[\s\S]*?totalMin:0,totalMax:0/.test(script));

// Guard: single-day booking path not altered (no multiDay flag forced on)
check('single-day: confirmBooking still defaults multiDay:isMultiDayQuote',/multiDay:isMultiDayQuote,quoteDays:_quoteDaysSnap/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
