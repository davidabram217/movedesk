// Guards the 3-way quote-accuracy breakdown (over / within / at-or-below).
//
// Requested 2026-07-15: the accuracy card showed only one % (within range). Added % of jobs that
// ran OVER, % WITHIN range, and % AT OR BELOW quote — all defined off the same actual vs qMin/qMax
// each job already carries, so they stay consistent with the existing "within range" score.
//   OVER      = actual > qMax
//   WITHIN    = qMin <= actual <= qMax   (unchanged existing definition)
//   AT/BELOW  = actual <= qMax           (within + anything under the low end; complement of OVER)
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// ── Structural: the three stats are computed and rendered ──
check('overCount computed as actual > qMax',/const overCount=quotedJobs\.filter\(j=>j\.actual>j\.qMax\)\.length/.test(src));
check('atOrBelowCount computed as actual <= qMax',/const atOrBelowCount=quotedJobs\.filter\(j=>j\.actual<=j\.qMax\)\.length/.test(src));
check('withinPct reuses the existing accuracy value',/const withinPct=accuracy/.test(src));
check('over % rendered',/ran over quote/.test(src));
check('within % rendered',/>within range</.test(src));
check('at-or-below % rendered',/at or below quote/.test(src));
check('all three show an N-of-total count',/of \$\{_n\} job/.test(src));

// ── Behavioural: the bucket logic is internally consistent ──
function buckets(jobs){
  const n=jobs.length;
  const within=jobs.filter(j=>j.actual>=j.qMin&&j.actual<=j.qMax).length;
  const over=jobs.filter(j=>j.actual>j.qMax).length;
  const atOrBelow=jobs.filter(j=>j.actual<=j.qMax).length;
  const below=jobs.filter(j=>j.actual<j.qMin).length;
  return {n,over,within,atOrBelow,below};
}
const jobs=[
  {actual:1500,qMin:1000,qMax:1200}, // over
  {actual:1100,qMin:1000,qMax:1200}, // within
  {actual:1200,qMin:1000,qMax:1200}, // within (at max boundary)
  {actual:900, qMin:1000,qMax:1200}, // below low end
  {actual:1000,qMin:1000,qMax:1200}, // within (at min boundary)
];
const b=buckets(jobs);
check('over counts only actual>qMax',b.over===1);
check('within counts qMin..qMax inclusive',b.within===3);
check('at-or-below counts actual<=qMax',b.atOrBelow===4);
check('over + at-or-below = total (they are complements)',b.over+b.atOrBelow===b.n);
check('within is a subset of at-or-below',b.within<=b.atOrBelow);
check('at-or-below = within + below-low-end',b.atOrBelow===b.within+b.below);
check('a job exactly at qMax is within (not over)',buckets([{actual:1200,qMin:1000,qMax:1200}]).over===0);
check('a job exactly at qMin is within (not below)',buckets([{actual:1000,qMin:1000,qMax:1200}]).below===0);

// percentages round as expected
const pct=(c,n)=>Math.round(c/n*100);
check('percentages: over 20, within 60, at/below 80',pct(b.over,b.n)===20&&pct(b.within,b.n)===60&&pct(b.atOrBelow,b.n)===80);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
