// Tests: quote-accuracy resolves the lead's ACCEPTED quote (matches the Quotes page), not a stale
// earlier draft the booking happens to be linked to.
// Run: node quote_accuracy_precedence_test.js index.html
const fs=require('fs');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}

// resolveQuotedInfo: most-recent quote (any status, by savedAt) comes BEFORE the booked.quoteId fallback
const recentIdx=script.indexOf("fq=[..._ls].sort((a,b)=>(b.savedAt||b._localEditedAt||b.sentAt||b.createdAt||'').localeCompare(a.savedAt||a._localEditedAt||a.sentAt||a.createdAt||''))[0]||null;");
const bookedIdx=script.indexOf("if(!fq&&_bk&&_bk.quoteId)fq=(db.quotes||[]).find(q=>q.id===_bk.quoteId);");
check('resolveQuotedInfo uses most-recent quote (any status)',recentIdx>-1);
check('resolveQuotedInfo: booked.quoteId is a fallback',bookedIdx>-1);
check('resolveQuotedInfo: recent quote before booked.quoteId',recentIdx>-1&&bookedIdx>-1&&recentIdx<bookedIdx);
check('resolveQuotedInfo sorts quotes by savedAt recency',/sort\(\(a,b\)=>\(b\.savedAt\|\|b\._localEditedAt\|\|b\.sentAt\|\|b\.createdAt\|\|''\)\.localeCompare/.test(script));

// findQuoteForCompletedJob (analytics $ chart) also prefers the accepted quote first
check('analytics finder has accepted path',/const qa=\(db\.quotes\|\|\[\]\)\.find\(q=>q\.leadId===_lead0\.id&&q\.status==='accepted'&&q\.totalMin&&q\.totalMax\);[\s\S]{0,60}return\{quote:qa,source:'accepted'\};/.test(script));
const accPathIdx=script.indexOf("return{quote:qa,source:'accepted'};");
const directPathIdx=script.indexOf("return{quote:q1,source:'direct'};");
check('analytics finder: accepted path before direct path',accPathIdx>-1&&directPathIdx>-1&&accPathIdx<directPathIdx);

// Still honors the exclude flag (unchanged)
check('analytics finder still honors excludeFromAccuracy',/if\(j\.excludeFromAccuracy\)return null;/.test(script));

// --- viewCompletedJob: lead lookup survives the booked job being deleted on completion ---
check('completed job stores leadId',/const completed=\{id:uid\(\),bookedJobId:currentCompleteJobId,leadId:\(j\?j\.leadId:null\),/.test(script));
check('viewCompletedJob resolves lead via leadId then booked then name',/const lead=\(j\.leadId\?db\.leads\.find\(l=>l\.id===j\.leadId\):null\)[\s\S]{0,200}\|\|\(j\.name\?db\.leads\.find\(l=>l\.name===j\.name\):null\);/.test(script));
check('viewCompletedJob uses most-recent quote (any status)',/quote=\[\.\.\._lq\]\.sort\(\(a,b\)=>\(b\.savedAt\|\|b\._localEditedAt\|\|b\.sentAt\|\|b\.createdAt\|\|''\)\.localeCompare/.test(script));
// aiRec refresh: stored snapshot is updated from the real quote so the "Saved for AI" box is right
check('viewCompletedJob refreshes stale aiRec from real quote',/if\(aiRec&&quote&&quote\.id&&db\.quotes\.some\(x=>x\.id===quote\.id\)\)\{[\s\S]{0,500}aiRec\.quotedMin=_qiR\.quotedMin;aiRec\.quotedMax=_qiR\.quotedMax;/.test(script));

// Explicit per-job quote pin (overrides automatic selection)
check('resolveQuotedInfo honors accuracyQuoteId pin first',/if\(j&&j\.accuracyQuoteId\)fq=\(db\.quotes\|\|\[\]\)\.find\(q=>q\.id===j\.accuracyQuoteId\)\|\|null;/.test(script));
check('viewCompletedJob honors accuracyQuoteId pin first',/if\(j\.accuracyQuoteId\)\{quote=db\.quotes\.find\(q=>q\.id===j\.accuracyQuoteId\)\|\|null;\}/.test(script));
check('setAccuracyQuote sets pin + saveDB + re-render',/function setAccuracyQuote\(jobId,quoteId\)\{[\s\S]{0,260}j\.accuracyQuoteId=quoteId\|\|null;[\s\S]{0,160}saveDB\(\);[\s\S]{0,120}viewCompletedJob\(jobId\);/.test(script));
check('completed view shows quote picker when 2+ quotes',/This customer has '\+_lq\.length\+' quotes/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
