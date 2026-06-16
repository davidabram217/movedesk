// Tests for the "Exclude from Quote Accuracy" option on the completion + edit-multiday forms.
// Run: node exclude_accuracy_test.js index.html
const fs=require('fs');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}

// Checkboxes exist on the completion forms (previously only on the edit form)
check('single-day completion has exclude-accuracy checkbox',/id="cj-exclude-accuracy"/.test(idx));
check('multi-day completion has exclude-accuracy checkbox',/id="cjmd-exclude-accuracy"/.test(idx));
check('edit-multiday has exclude-accuracy checkbox',/id="ecjmd-exclude-accuracy"/.test(idx));
check('edit single-day already had it',/id="ecj-exclude-accuracy"/.test(idx));
check('exclude checkbox labeled clearly',/⚠ Exclude from Quote Accuracy/.test(idx));

// Reset on open
check('single-day open resets cj-exclude-accuracy',/_cjExEl=document\.getElementById\('cj-exclude-accuracy'\);if\(_cjExEl\)_cjExEl\.checked=false;/.test(script));
check('multi-day open resets cjmd-exclude-accuracy',/_exEl=document\.getElementById\('cjmd-exclude-accuracy'\);if\(_exEl\)_exEl\.checked=false;/.test(script));

// Stored on the completed-job record at completion
check('single-day completion stores excludeFromAccuracy',/usedForAI:useForAI,excludeFromAccuracy:\(document\.getElementById\('cj-exclude-accuracy'\)\?document\.getElementById\('cj-exclude-accuracy'\)\.checked:false\),/.test(script));
check('multi-day completion stores excludeFromAccuracy',/excludeFromAccuracy:\(document\.getElementById\('cjmd-exclude-accuracy'\)\?document\.getElementById\('cjmd-exclude-accuracy'\)\.checked:false\),/.test(script));

// Edit-multiday prefill + save
check('edit-multiday prefills excludeFromAccuracy',/_exAccEl=document\.getElementById\('ecjmd-exclude-accuracy'\);if\(_exAccEl\)_exAccEl\.checked=!!j\.excludeFromAccuracy;/.test(script));
check('edit-multiday saves excludeFromAccuracy',/j\.excludeFromAccuracy=document\.getElementById\('ecjmd-exclude-accuracy'\)\?document\.getElementById\('ecjmd-exclude-accuracy'\)\.checked:!!j\.excludeFromAccuracy;/.test(script));

// Analytics quote-accuracy chart skips excluded jobs (the consumer of the flag)
check('analytics quote-accuracy skips excluded jobs',/if\(j\.excludeFromAccuracy\)return null;/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
