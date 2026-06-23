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

// --- Per-day fuel + materials fees (Day 2+) ---
check('rows render editable Fuel fee per day',/bjEditQuoteDay\('\+i\+',\\'feeFuel\\',this\.value\)/.test(s));
check('rows render editable Materials fee per day',/bjEditQuoteDay\('\+i\+',\\'feeMaterials\\',this\.value\)/.test(s));
check('both renderers compute per-day fuel from day.feeFuel',(s.match(/isDay1\?\(Number\(bj\?\.feeFuel\)\|\|0\):\(Number\(day\.feeFuel\)\|\|0\)/g)||[]).length===2);
check('both renderers compute per-day materials from day.feeMaterials',(s.match(/isDay1\?\(Number\(bj\?\.feeMaterials\)\|\|0\):\(Number\(day\.feeMaterials\)\|\|0\)/g)||[]).length===2);
check('Day 2+ emits a Fuel Fee line when no matching quote fee (both renderers)',(s.match(/!_fuelShown(Multi|MD)\)[^\n]*Fuel Fee/g)||[]).length===2);
check('Day 2+ emits a Material Fee line when no matching quote fee (both renderers)',(s.match(/!_matShown(Multi|MD)\)[^\n]*Material Fee/g)||[]).length===2);
check('quote-path after-loop gated to Day 2+ (buildMoveDetailsBlock)',/if\(!isDay1\)\{\s*if\(bjFuelFeeMD&&!_fuelShownMD/.test(s));
check('email after-loop also fires for direct Day 1 (openConfirmEmail)',/if\(!isDay1\|\|_isDirectMulti\)\{\s*if\(bjFuelFeeMulti&&!_fuelShownMulti/.test(s));

// --- Direct (hand-built) multi-day editor: per-day fuel/materials/arrival ---
check('direct editor blank day seeds feeFuel/feeMaterials/arrivalWindow',/feeFuel:'',feeMaterials:'',arrivalWindow:''/.test(s));
check('direct editor renders per-day Fuel input',/id="bjd-fuel-'\+i\+'"/.test(s));
check('direct editor renders per-day Materials input',/id="bjd-mat-'\+i\+'"/.test(s));
check('direct editor renders per-day Arrival input',/id="bjd-arrival-'\+i\+'"/.test(s));
check('direct editor change-handler reads the 3 new fields',/d\.arrivalWindow=g\('bjd-arrival-'\+i\);d\.feeFuel=g\('bjd-fuel-'\+i\);d\.feeMaterials=g\('bjd-mat-'\+i\)/.test(s));
check('direct editor Day 1 mirrors fuel to bj-fee-fuel',/_ff=document\.getElementById\('bj-fee-fuel'\)/.test(s));
check('direct editor Day 1 mirrors materials to bj-fee-materials',/_fm=document\.getElementById\('bj-fee-materials'\)/.test(s));
check('direct editor Day 1 mirrors arrival to bj-time',/_ar=document\.getElementById\('bj-time'\)/.test(s));
check('_bjReadDays emits arrivalWindow/feeFuel/feeMaterials',/arrivalWindow:d\.arrivalWindow\|\|'',feeFuel:Number\(d\.feeFuel\)\|\|'',feeMaterials:Number\(d\.feeMaterials\)\|\|''/.test(s));
check('_bjLoadMultiDay restores arrivalWindow/feeFuel/feeMaterials',/arrivalWindow:d\.arrivalWindow\|\|'',feeFuel:d\.feeFuel\|\|'',feeMaterials:d\.feeMaterials\|\|''/.test(s));
check('email surfaces Day-1 fuel/materials for direct bookings (ungated)',/if\(!isDay1\|\|_isDirectMulti\)\{/.test(s));
check('direct-multi flag set in the no-quote branch',/isMulti=true;_isDirectMulti=true;/.test(s));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
