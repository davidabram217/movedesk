// Tests: quote-accuracy resolves the lead's ACCEPTED quote (matches the Quotes page), not a stale
// earlier draft the booking happens to be linked to.
// Run: node quote_accuracy_precedence_test.js index.html
const fs=require('fs');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}

// resolveQuotedInfo: accepted-quote lookup comes BEFORE the booked.quoteId lookup
const acceptedIdx=script.indexOf("fq=(db.quotes||[]).find(q=>q.leadId===lead.id&&q.status==='accepted')||null;");
const bookedIdx=script.indexOf("if(!fq&&_bk&&_bk.quoteId)fq=(db.quotes||[]).find(q=>q.id===_bk.quoteId);");
check('resolveQuotedInfo has accepted-first lookup',acceptedIdx>-1);
check('resolveQuotedInfo: booked.quoteId is now a fallback',bookedIdx>-1);
check('resolveQuotedInfo: accepted is checked before booked.quoteId',acceptedIdx>-1&&bookedIdx>-1&&acceptedIdx<bookedIdx);

// The old behavior (booked.quoteId unconditionally first) is gone
check('old unconditional booked-first line removed',!/\n  if\(_bk&&_bk\.quoteId\)fq=\(db\.quotes\|\|\[\]\)\.find\(q=>q\.id===_bk\.quoteId\);\n  if\(!fq&&lead\)\{\n    const _ls=\(db\.quotes\|\|\[\]\)\.filter\(q=>q\.leadId===lead\.id\);\n    fq=_ls\.find\(q=>q\.status==='accepted'\)/.test(script));

// findQuoteForCompletedJob (analytics $ chart) also prefers the accepted quote first
check('analytics finder has accepted path',/const qa=\(db\.quotes\|\|\[\]\)\.find\(q=>q\.leadId===_lead0\.id&&q\.status==='accepted'&&q\.totalMin&&q\.totalMax\);[\s\S]{0,60}return\{quote:qa,source:'accepted'\};/.test(script));
const accPathIdx=script.indexOf("return{quote:qa,source:'accepted'};");
const directPathIdx=script.indexOf("return{quote:q1,source:'direct'};");
check('analytics finder: accepted path before direct path',accPathIdx>-1&&directPathIdx>-1&&accPathIdx<directPathIdx);

// Still honors the exclude flag (unchanged)
check('analytics finder still honors excludeFromAccuracy',/if\(j\.excludeFromAccuracy\)return null;/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
