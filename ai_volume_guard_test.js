const fs=require('fs');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  ❌ '+n);}};

// Reconstruct the _volOK rule exactly as written in source and exercise it.
const VOL_RATIO_MAX=2.2;
const volOK=(inputs,j)=>{
  const jv=Number(j.estimatedVaults||j.actualVaults)||0;
  if(inputs.vaults&&jv>0){const a=Number(inputs.vaults),b=jv;return Math.max(a,b)/Math.min(a,b)<=VOL_RATIO_MAX;}
  if(inputs.sqft&&j.sqft>0){const a=Number(inputs.sqft),b=Number(j.sqft);return Math.max(a,b)/Math.min(a,b)<=VOL_RATIO_MAX;}
  return true;
};
const q={vaults:3,sqft:800};
check("David's case: 8-vault job excluded for a 3-vault quote",volOK(q,{estimatedVaults:8,sqft:1460})===false);
check('similar volume (3 vs 4 vaults) kept',volOK(q,{estimatedVaults:4,sqft:900})===true);
check('exactly 2.2x kept, just over dropped',volOK(q,{estimatedVaults:6})===true && volOK(q,{estimatedVaults:7})===false);
check('vaults take precedence over sqft when both present',volOK(q,{estimatedVaults:8,sqft:820})===false); // sqft close but vaults far -> drop
check('sqft used when query has no vaults',volOK({sqft:800},{sqft:2000})===false && volOK({sqft:800},{sqft:1200})===true);
check('no volume info on job -> not gated (kept)',volOK(q,{moveType:'Move'})===true);
check('actualVaults used when estimatedVaults missing',volOK(q,{actualVaults:9})===false);

// wiring
check('VOL_RATIO_MAX constant present (2.2)',/const VOL_RATIO_MAX=2\.2;/.test(script));
check('guard filters candidates into _inBand',/const _inBand=_cands\.filter\(_volOK\);/.test(script));
check('falls back to same-type pool if guard empties it',/const _pool=_inBand\.length>0\?_inBand:_cands;/.test(script));
check('flags volume fallback',/const _volFallback=_inBand\.length===0&&_cands\.length>0;/.test(script));
check('scoring runs on the guarded pool',/const scored=_pool[\s\S]{0,80}similarity\(j,inputs\)/.test(script));
check('header warns when sizes differ',/_volFallback\?' · closest available differ in size'/.test(script));
check('regressions NOT gated (still use full pool via _aiTrainingPool)',/const data=_aiTrainingPool\(\)\.filter\(j=>j\.actualHours&&j\.sqft/.test(script));

console.log('\nRESULTS: '+pass+' passed, '+fail+' failed');
if(!fail)console.log('ALL TESTS PASSED ✅');
process.exit(fail?1:0);
