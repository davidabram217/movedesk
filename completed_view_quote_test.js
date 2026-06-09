// Tests for the "View quote" button on a completed job.
// Run: node completed_view_quote_test.js index.html
const fs=require('fs');
const file=process.argv[2]||'index.html';
const idx=fs.readFileSync(file,'utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(name,cond){if(cond){pass++;}else{fail++;console.log('  ✗ '+name);}}

// The read-only viewer we reuse must exist and take a quote id.
check('previewQuoteFromList(quoteId) exists',/function previewQuoteFromList\(quoteId\)\{/.test(script));

// _realQuoteId captured from a quote that is actually in db.quotes (not a synthetic/rough rebuild).
check('_realQuoteId captured from real db.quotes entry',/const _realQuoteId=\(quote&&quote\.id&&db\.quotes\.some\(x=>x\.id===quote\.id\)\)\?quote\.id:null;/.test(script));

// Capture must happen BEFORE the synthetic/rough reassignments of `quote`.
const idxReal=script.indexOf('const _realQuoteId=');
const idxSynthA=script.indexOf('quote._fromRoughQuote');
const idxSynthHeader=script.indexOf('📊 Quote vs Actual');
check('_realQuoteId captured before the Quote-vs-Actual synthetic header',idxReal>0&&idxSynthHeader>idxReal);

// Footer button: gated on _realQuoteId, opens previewQuoteFromList, closes the view modal first.
check('footer renders View quote button only when a real quote exists',/\$\{_realQuoteId\?`<button[^`]*onclick="closeModal\('view'\);previewQuoteFromList\('\$\{_realQuoteId\}'\)"[^`]*>📋 View quote<\/button>`:''\}/.test(script));

// Must NOT show for synthetic-only (gating relies on _realQuoteId being null in that case) — assert
// the button text appears exactly once and inside the conditional.
const occurrences=(script.match(/📋 View quote/g)||[]).length;
check('View quote button appears exactly once',occurrences===1);

// Single-day / no-quote completed jobs (direct multi-day booking) → _realQuoteId null → no button.
// (Logic guarantee, asserted structurally via the gate above.)

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
