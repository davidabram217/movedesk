// Tests for the "job stuck in both Booked and Completed" fix.
// Run: node booked_completed_dedupe_test.js index.html
const fs=require('fs');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}

// 1. Multi-day completion now tombstones AND cloud-deletes the booked job
check('multi-day completion removes booked job',/db\.bookedJobs=db\.bookedJobs\.filter\(x=>x\.id!==j\.id\);/.test(script));
check('multi-day completion writes booked tombstone',/tombstones\[j\.id\]=new Date\(\)\.toISOString\(\);[\s\S]{0,160}localStorage\.setItem\('movedesk_booked_tombstones'/.test(script));
check('multi-day completion cloud-deletes booked job',/db\.bookedJobs=db\.bookedJobs\.filter\(x=>x\.id!==j\.id\);[\s\S]{0,420}sbDelete\('booked_jobs',j\.id\)/.test(script));

// 2. Single-day completion now tombstones (it already cloud-deleted)
check('single-day completion writes booked tombstone',/tombstones\[_completedBookedJobId\]=new Date\(\)\.toISOString\(\);/.test(script));
check('single-day completion still cloud-deletes',/sbDelete\('booked_jobs',_completedBookedJobId\);/.test(script));

// 3. loadDB orphan cleanup now tombstones the orphans (durable cleanup for existing dupes like Louis)
check('orphan cleanup detects booked jobs that are also completed',/completedBookedIds=new Set\(\(db\.completedJobs\|\|\[\]\)\.map\(j=>j\.bookedJobId\)/.test(script));
check('orphan cleanup writes tombstones for orphans',/orphans\.forEach\(j=>\{_bt\[j\.id\]=new Date\(\)\.toISOString\(\);\}\);[\s\S]{0,120}localStorage\.setItem\('movedesk_booked_tombstones'/.test(script));
check('orphan cleanup still cloud-deletes orphans',/orphans\.forEach\(j=>\{try\{sbDelete\('booked_jobs',j\.id\);\}catch\(_\)\{\}\}\);/.test(script));

// 4. loadDB drops tombstoned booked rows when loading from cloud (so tombstones actually block them)
check('cloud booked load filters out tombstoned ids',/db\.bookedJobs=\(bookedJobs\|\|\[\]\)\.filter\(r=>!_bookedTombs\[r\.id\]\)/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
