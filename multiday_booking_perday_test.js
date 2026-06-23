// Guard: per-day schedule editing when booking a multi-day job
const fs=require('fs');
const file=process.argv[2]||'index.html';
const s=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

// --- Editable per-day rows (Day 2+) ---
check('rows render an editable Date per day',/bjEditQuoteDay\('\+i\+',\\'date\\',this\.value\)/.test(s));
check('rows render an editable Arrival window per day',/bjEditQuoteDay\('\+i\+',\\'arrivalWindow\\',this\.value\)/.test(s));
check('rows render an editable Movers select per day',/bjEditQuoteDay\('\+i\+',\\'crew\\',this\.value\)/.test(s));
check('rows render editable Rate + Rate cash per day',/bjEditQuoteDay\('\+i\+',\\'rate\\',this\.value\)/.test(s)&&/bjEditQuoteDay\('\+i\+',\\'rateCash\\',this\.value\)/.test(s));
check('flat-rate days expose Flat price + Flat cash',/bjEditQuoteDay\('\+i\+',\\'flatPrice\\',this\.value\)/.test(s)&&/bjEditQuoteDay\('\+i\+',\\'flatPriceCash\\',this\.value\)/.test(s));
check('first kept day is read-only (set in Day 1 fields)',/set in the Day 1 fields below/.test(s));
check('first kept day computed via findIndex',/const firstKept=_bjKeptDays\.findIndex\(Boolean\);/.test(s));

// --- Edit handler writes to working day list + autosaves ---
check('bjEditQuoteDay defined, writes to _bjQuoteDaysFull + autosaves',/function bjEditQuoteDay\(i,field,val\)\{[\s\S]{0,160}full\[i\]\[field\]=val;[\s\S]{0,40}bjAutoSave\(\);/.test(s));

// --- Email/calendar reflect per-day edits ---
check('openConfirmEmail uses bj.quoteDays even when no day dropped (<=)',/_bjDayCount<=_qDayCount/.test(s));
check('buildMoveDetailsBlock swaps in booked days',/if\(isMulti&&bj&&bj\.quoteDays&&bj\.quoteDays\.length\)\{q=Object\.assign\(\{\},q,\{days:bj\.quoteDays\}\);\}/.test(s));
check('both renderers honor per-day arrival window',(s.match(/day\.arrivalWindow\?', arriving '\+day\.arrivalWindow/g)||[]).length===2);
check('both renderers honor per-day cash rate',(s.match(/\(!isDay1&&Number\(day\.rateCash\)\)\?Number\(day\.rateCash\)/g)||[]).length===2);

// --- Draft reopen restores per-day edits ---
check('draft reopen merges saved per-day edits back into the full list',/_bjKeptDays\.forEach\(\(kept,idx\)=>\{if\(kept&&_existingDraft\.quoteDays\[_k\]\)\{window\._bjQuoteDaysFull\[idx\]=Object\.assign/.test(s));

// --- Untouched: first-kept-day date still synced from the canonical bj-date ---
check('first kept day date still synced from bj-date in _bjApplyDroppedDays',/if\(_cdEl&&_cdEl\.value&&j\.quoteDays\[0\]\)j\.quoteDays\[0\]\.date=_cdEl\.value;/.test(s));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
