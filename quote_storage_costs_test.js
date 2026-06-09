// Tests for the Storage Costs quote line (mirrors Cash discount).
// Run: node quote_storage_costs_test.js index.html
const fs=require('fs');
const file=process.argv[2]||'index.html';
const idx=fs.readFileSync(file,'utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(name,cond){if(cond){pass++;}else{fail++;console.log('  ✗ '+name);}}

// Builder field, directly below cash discount
check('builder: Storage Costs field present',/<label>Storage Costs <span[^>]*>\(leave blank to hide\)<\/span><\/label>\s*<input type="text" id="qb-storage-costs"/.test(idx));
check('builder: storage field sits right after cash discount',/id="qb-cash-discount"[\s\S]{0,120}<\/div>\s*<div class="form-group"[^>]*>\s*<label>Storage Costs/.test(idx));

// Reset / load / two save paths
check('reset clears storage field',/qb-cash-discount'\)\.value='';\s*document\.getElementById\('qb-storage-costs'\)\.value='';/.test(script));
check('load reads q.storageCosts',/qb-storage-costs'\)\.value=q\.storageCosts\|\|'';/.test(script));
check('save path A (trim) writes storageCosts',/storageCosts:document\.getElementById\('qb-storage-costs'\)\?\.value\?\.trim\(\)\|\|'',/.test(script));
check('save path B writes storageCosts',/storageCosts:document\.getElementById\('qb-storage-costs'\)\.value,/.test(script));

// Green box render (shared renderer) — identical styling to cash discount, directly below it
check('render: storage green box mirrors cash discount styling',/q\.storageCosts\?`<div style="margin-top:12px;padding:10px 14px;background:#f0faf4;border-radius:6px;font-size:13px;color:#2d5a3d"><strong>Storage costs:<\/strong> \$\{esc\(q\.storageCosts\)\}<\/div>`:''/.test(script));
check('render: storage box sits right below cash discount box',/Cash discount:<\/strong> \$\{esc\(q\.cashDiscount\)\}<\/div>`:''\}\s*\$\{q\.storageCosts\?/.test(script));

// Plain-text version
check('plain-text reads storageCosts',/const storageCosts=document\.getElementById\('qb-storage-costs'\)\.value\.trim\(\);/.test(script));
check('plain-text appends Storage costs line',/if\(storageCosts\)txt\+='Storage costs: '\+storageCosts\+'\\n';/.test(script));

// Exact mirror: every qb-cash-discount / cashDiscount has a storage counterpart
const a=(script.match(/qb-cash-discount/g)||[]).length, b=(script.match(/qb-storage-costs/g)||[]).length;
check('qb-cash-discount and qb-storage-costs appear the same number of times',a===b&&a>0);
const c=(script.match(/cashDiscount/g)||[]).length, d=(script.match(/storageCosts/g)||[]).length;
check('cashDiscount and storageCosts appear the same number of times',c===d&&c>0);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
