// Tests for the "Actual date" field on the single-day completion form.
// Run: node complete_actual_date_test.js index.html
const fs=require('fs');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}

// 1. The date field exists in the complete-job form, as a date input
check('cj-date field present',/<input type="date" id="cj-date">/.test(idx));
check('cj-date labeled "Actual date"',/Actual date[\s\S]{0,220}id="cj-date"/.test(idx));
// 2. It sits in the completion form (near Crew leader), not some other modal
check('cj-date next to Crew leader',/id="cj-date">[\s\S]{0,80}Crew leader/.test(idx));

// 3. openComplete prefills cj-date from the booked job date
check('openComplete prefills cj-date from j.date',/_cjDateEl=document\.getElementById\('cj-date'\);if\(_cjDateEl\)_cjDateEl\.value=j\.date\|\|'';/.test(script));

// 4. The completed-job record uses the field value, falling back to the booked date
check('completed.date uses cj-date then falls back to j.date',/date:\(document\.getElementById\('cj-date'\)&&document\.getElementById\('cj-date'\)\.value\)\|\|\(j\?j\.date:''\),/.test(script));

// 5. The AI-training record built at completion inherits completed.date (so it matches the actual date)
check('completion AI-training record uses completed.date',/date:completed\.date,/.test(script));

// 6. Fallback safety — if the field is empty, the booked date is used (expression has the ||(j?j.date:'') tail)
check('empty field falls back to booked date',/\)\.value\)\|\|\(j\?j\.date:''\)/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
