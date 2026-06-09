const fs=require('fs');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;const check=(n,c,got)=>{if(c)pass++;else{fail++;console.log('  ❌ '+n+(got!==undefined?'  got: '+got:''));}};

// Pull the multi-day subject IIFE out of the source and evaluate it as a pure function of (bj,q),
// using the SAME fmtDateWithDay the app uses. This mirrors the exact code in openConfirmEmail.
const fmtDateWithDay=d=>{if(!d)return'—';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});};
const m=/'Multi-Day Move Confirmation — '\+(\(function\(\)\{[\s\S]*?\}\)\(\))/.exec(script);
check('found multi-day subject expression in source',!!m);
const subjFn=new Function('bj','q','fmtDateWithDay','return "Multi-Day Move Confirmation — "+'+m[1]+';');
const S=(bj,q)=>subjFn(bj,q,fmtDateWithDay);

// 1 day -> full weekday + year (unchanged behavior)
check('1 day: full weekday date',
  S({},{days:[{date:'2026-06-04'}]})==='Multi-Day Move Confirmation — Thursday, Jun 4, 2026',
  S({},{days:[{date:'2026-06-04'}]}));
// 2 days -> weekday on each, year once
check('2 days: weekday each + year once',
  S({},{days:[{date:'2026-06-04'},{date:'2026-06-05'}]})==='Multi-Day Move Confirmation — Thursday, Jun 4 & Friday, Jun 5, 2026',
  S({},{days:[{date:'2026-06-04'},{date:'2026-06-05'}]}));
// 3 days -> compact (no weekday), year once
check('3 days: compact, year once',
  S({},{days:[{date:'2026-06-04'},{date:'2026-06-05'},{date:'2026-06-06'}]})==='Multi-Day Move Confirmation — Jun 4, Jun 5 & Jun 6, 2026',
  S({},{days:[{date:'2026-06-04'},{date:'2026-06-05'},{date:'2026-06-06'}]}));
// booking-form date overrides Day 1 only
check('bj.date overrides Day 1',
  S({date:'2026-06-03'},{days:[{date:'2026-06-04'},{date:'2026-06-05'}]})==='Multi-Day Move Confirmation — Wednesday, Jun 3 & Friday, Jun 5, 2026',
  S({date:'2026-06-03'},{days:[{date:'2026-06-04'},{date:'2026-06-05'}]}));
// dedupe: bj override equal to day2 shouldn't duplicate
check('no duplicate consecutive dates',
  S({},{days:[{date:'2026-06-04'},{date:'2026-06-04'},{date:'2026-06-05'}]})==='Multi-Day Move Confirmation — Thursday, Jun 4 & Friday, Jun 5, 2026',
  S({},{days:[{date:'2026-06-04'},{date:'2026-06-04'},{date:'2026-06-05'}]}));

// scope discipline: single-day subject + body untouched
check('single-day subject unchanged',/:'Move Confirmation — '\+fmtDateWithDay\(bj\?\.date\|\|l\?\.date\|\|''\)/.test(script));
check('email body greeting line untouched',/Quick email confirming things for your upcoming move/.test(script));

console.log('\nRESULTS: '+pass+' passed, '+fail+' failed');
if(!fail)console.log('ALL TESTS PASSED ✅');
process.exit(fail?1:0);
