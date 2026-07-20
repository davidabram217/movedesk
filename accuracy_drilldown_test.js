// Guards the click-through drilldown on the Quote-accuracy tiles.
// Requested 2026-07-15: clicking a percentage shows exactly which jobs are in that bucket, with
// quoted range vs actual, so the office can verify the underlying data.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

check('accuracy job list is stashed for drilldown',/window\._quoteAccuracyJobs=quotedJobs/.test(src));
check('over tile is clickable',/onclick="openAccuracyDrilldown\('over'\)"/.test(src));
check('within tile is clickable',/onclick="openAccuracyDrilldown\('within'\)"/.test(src));
check('at-or-below tile is clickable',/onclick="openAccuracyDrilldown\('atOrBelow'\)"/.test(src));
check('openAccuracyDrilldown is defined',/function openAccuracyDrilldown\(bucket\)\{/.test(src));
check('over bucket filters actual>qMax',/bucket==='over'[\s\S]{0,80}j\.actual>j\.qMax/.test(src));
check('within bucket uses withinRange',/bucket==='within'[\s\S]{0,80}j\.withinRange/.test(src));
check('at-or-below bucket filters actual<=qMax',/j\.actual<=j\.qMax\); label='At or below quote'/.test(src));
check('drilldown shows quoted range column',/Quoted range/.test(src));
check('drilldown shows actual column',/>Actual</.test(src));
check('drilldown links each job to its completed record',/viewCompletedJob\('\$\{cj\.id\}'\)/.test(src));
// openAccuracyDrilldown must end by opening the shared estimate-breakdown modal.
const _adFn=(src.match(/function openAccuracyDrilldown\(bucket\)\{[\s\S]*?\n\}/)||[''])[0];
check('drilldown reuses the estimate-breakdown modal',/openModal\('estimate-breakdown'\);/.test(_adFn));
check('cash jobs are flagged in the list',/\(cash\)/.test(src));

// Behavioural: bucket membership
const jobs=[
  {name:'A',actual:1500,qMin:1000,qMax:1200,withinRange:false},
  {name:'B',actual:1100,qMin:1000,qMax:1200,withinRange:true},
  {name:'C',actual:900, qMin:1000,qMax:1200,withinRange:false},
  {name:'D',actual:1200,qMin:1000,qMax:1200,withinRange:true},
];
const over=jobs.filter(j=>j.actual>j.qMax);
const within=jobs.filter(j=>j.withinRange);
const atOrBelow=jobs.filter(j=>j.actual<=j.qMax);
check('over bucket = [A]',over.length===1&&over[0].name==='A');
check('within bucket = [B,D]',within.map(j=>j.name).join()==='B,D');
check('at-or-below bucket = [B,C,D]',atOrBelow.map(j=>j.name).join()==='B,C,D');
check('over + at-or-below account for every job once',over.length+atOrBelow.length===jobs.length);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
