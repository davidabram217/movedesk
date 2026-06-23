// Tests for the drop-a-day / convert-to-single-day control at booking.
// Run: node multiday_drop_day_test.js index.html
const fs=require('fs'),vm=require('vm');
const file=process.argv[2]||'index.html';
const idx=fs.readFileSync(file,'utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}
function extract(name){
  const m=new RegExp('function\\s+'+name+'\\s*\\(').exec(script);if(!m)return null;
  let i=script.indexOf('{',m.index),d=0,s=false,sc='',t=false,e=false;
  for(let p=i;p<script.length;p++){const c=script[p];
    if(e){e=false;continue;}if(c==='\\'){e=true;continue;}
    if(s){if(c===sc)s=false;continue;}if(t){if(c==='`')t=false;continue;}
    if(c==='"'||c==="'"){s=true;sc=c;continue;}if(c==='`'){t=true;continue;}
    if(c==='{')d++;else if(c==='}'){d--;if(d===0)return script.slice(m.index,p+1);}}
  return null;
}

// ---- Functional: _bookedScopeQuotedRange + _bjApplyDroppedDays ----
const ctx={Number,Math,Array,Object,JSON,console};
ctx.window={};
ctx._bjdate={value:''};
ctx.document={getElementById:id=>id==='bj-date'?ctx._bjdate:null};
vm.createContext(ctx);
ctx._bjKeptDays=[];
vm.runInContext('let _bjKeptDays=globalThis._bjKeptDays;',ctx);
['_bookedScopeQuotedRange','_bjApplyDroppedDays'].forEach(fn=>{const s=extract(fn);if(s)vm.runInContext(s,ctx);else{fail++;console.log('  ✗ extract '+fn);}});

// hourly day, no fees
let r=vm.runInContext('_bookedScopeQuotedRange([{hrsMin:4,hrsMax:6,rate:225}],{fees:[]})',ctx);
check('range hourly: 4-6h @225 = 900-1350',r.min===900&&r.max===1350);
// fees (amount + range)
r=vm.runInContext("_bookedScopeQuotedRange([{hrsMin:4,hrsMax:6,rate:225}],{fees:[{included:true,type:'amount',amount:100},{included:true,type:'range',hrsMin:50,hrsMax:80}]})",ctx);
check('range with fees: 1050-1530',r.min===1050&&r.max===1530);
// flat day
r=vm.runInContext('_bookedScopeQuotedRange([{flatRate:true,flatPrice:1200}],{fees:[]})',ctx);
check('range flat: 1200-1200',r.min===1200&&r.max===1200);
// pack crew adds labor
r=vm.runInContext('_bookedScopeQuotedRange([{hrsMin:4,hrsMax:6,rate:225,packCrew:2,packRate:100,packHrsMin:2,packHrsMax:3}],{fees:[]})',ctx);
check('range pack crew: 1100-1650',r.min===1100&&r.max===1650);

// _bjApplyDroppedDays — drop Day 1 (pack), keep Day 2 (move) → single-day + booked range
ctx.window._bjIsMultiDay=true;
ctx.window._bjQuoteDaysFull=[{date:'2026-06-01',crew:3,rate:225,flatRate:false,hrsMin:4,hrsMax:6},{date:'2026-06-02',crew:3,rate:225,flatRate:false,hrsMin:5,hrsMax:7}];
ctx.window._bjQuoteForScope={fees:[]};
ctx._bjKeptDays=[false,true];vm.runInContext('_bjKeptDays=globalThis._bjKeptDays;',ctx);
ctx.__j={};vm.runInContext('_bjApplyDroppedDays(globalThis.__j);',ctx);
check('drop: kept 1 day',ctx.__j.quoteDays&&ctx.__j.quoteDays.length===1);
check('drop: kept day is the move day',ctx.__j.quoteDays&&ctx.__j.quoteDays[0].date==='2026-06-02');
check('drop: multiDay false (collapsed to single)',ctx.__j.multiDay===false);
check('drop: keptDayFlags stored',JSON.stringify(ctx.__j._keptDayFlags)==='[false,true]');
check('drop: booked range = move day 5-7h@225 = 1125-1575',ctx.__j.bookedQuotedMin===1125&&ctx.__j.bookedQuotedMax===1575);

// date-override sync: kept Day 1 date follows the booking-form date (the calendar-date fix)
ctx._bjdate.value='2026-06-20';
ctx.__j={};vm.runInContext('_bjApplyDroppedDays(globalThis.__j);',ctx);
check('override: kept Day 1 date follows bj-date (20th, not the old 6th)',ctx.__j.quoteDays[0].date==='2026-06-20');
ctx._bjdate.value='';  // reset for remaining cases

// all days kept → no booked range, multiDay true
ctx._bjKeptDays=[true,true];vm.runInContext('_bjKeptDays=globalThis._bjKeptDays;',ctx);
ctx.__j={};vm.runInContext('_bjApplyDroppedDays(globalThis.__j);',ctx);
check('all kept: 2 days',ctx.__j.quoteDays&&ctx.__j.quoteDays.length===2);
check('all kept: multiDay true',ctx.__j.multiDay===true);
check('all kept: no booked range (uses original quote)',ctx.__j.bookedQuotedMin===undefined&&ctx.__j.bookedQuotedMax===undefined);

// not a quote-driven multi-day → no-op
ctx.window._bjIsMultiDay=false;
ctx.__j={untouched:1};vm.runInContext('_bjApplyDroppedDays(globalThis.__j);',ctx);
check('non-multi: no-op',ctx.__j.quoteDays===undefined&&ctx.__j.untouched===1);

// never zero days
ctx.window._bjIsMultiDay=true;ctx._bjKeptDays=[false,false];vm.runInContext('_bjKeptDays=globalThis._bjKeptDays;',ctx);
ctx.__j={untouched:2};vm.runInContext('_bjApplyDroppedDays(globalThis.__j);',ctx);
check('zero kept: refuses (no change)',ctx.__j.quoteDays===undefined&&ctx.__j.untouched===2);

// ---- Structural wiring ----
check('banner renders include checkboxes',/id="bj-qday-'\+i\+'"[\s\S]*?onchange="bjToggleQuoteDay\('\+i\+'\)"/.test(script));
check('banner has rows container + status line',/id="bj-mday-rows"/.test(idx)&&/id="bj-mday-status"/.test(idx));
check('openBooking stashes full days + inits kept',/window\._bjQuoteDaysFull=JSON\.parse\(JSON\.stringify\(_leadQuote\.days\)\);[\s\S]*?_bjKeptDays=_leadQuote\.days\.map\(\(\)=>true\);/.test(script));
check('openBooking renders banner after innerHTML',/book-job-summary'\)\.innerHTML=summaryHtml;\s*if\(_isMultiDay\)_renderBjQuoteDays\(\);/.test(script));
check('autosave persists dropped days',/_bjApplyMultiDay\(j\);\s*_bjApplyDroppedDays\(j\);/.test(script));
check('confirmBooking applies dropped days',/_bjApplyMultiDay\(job\);[\s\S]*?_bjApplyDroppedDays\(job\);/.test(script));
check('editBookedJob makes drop-day hook inert',/window\._bjIsMultiDay=false;_bjKeptDays=\[\];window\._bjQuoteDaysFull=\[\];/.test(script));
check('draft restore of kept-day flags',/_existingDraft\._keptDayFlags[\s\S]*?_bjKeptDays=_existingDraft\._keptDayFlags\.slice\(\);/.test(script));
check('email uses booking kept days when dropped',/if\(q0&&_bjDayCount&&_bjDayCount<=_qDayCount\)\{[\s\S]*?days:bj\.quoteDays/.test(script));
check('email isMulti recomputed from kept count',/isMulti=_bjDayCount>1;/.test(script));
check('resolveQuotedInfo booked-scope branch',/const _bkDropped=_bk&&Array\.isArray\(_bk\.quoteDays\)[\s\S]*?_bk\.quoteDays\.length<fq\.days\.length;/.test(script));
check('analytics accuracy booked-scope override',/const _dropped=_bkA&&_bkA\.bookedQuotedMin!=null[\s\S]*?_bkA\.quoteDays\.length<q\.days\.length;/.test(script));

// ---- Guard: untouched bookings behave as before ----
check('email uses booked days even when no day dropped (<=)',/_bjDayCount<=_qDayCount/.test(script));
check('resolveQuotedInfo: falls back to fq totals when not dropped',/_bkDropped&&_bk\.bookedQuotedMin!=null\)\?_bk\.bookedQuotedMin:\(fq\.totalMin\|\|null\)/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
