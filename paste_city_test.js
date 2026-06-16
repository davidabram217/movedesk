// Guard: pasted-lead city backfill + fold-into-address
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

// Post-processor: backfill city after extraction
check('parsePasteToLead defines _cityFromAddr',/const _cityFromAddr=\(addr\)=>\{/.test(script));
check('parsePasteToLead defines _cityFromZip',/const _cityFromZip=\(zip\)=>\{/.test(script));
check('_cityFromZip maps SF 941xx to San Francisco',/if\(\/\^941\\d\\d\$\/\.test\(z\)\)return 'San Francisco';/.test(script));
check('backfills fromCity when missing',/if\(!extracted\.fromCity\)extracted\.fromCity=_cityFromAddr\(extracted\.fromAddress\)\|\|_cityFromZip\(extracted\.fromZip\);/.test(script));
check('backfills toCity when missing',/if\(!extracted\.toCity\)extracted\.toCity=_cityFromAddr\(extracted\.toAddress\)\|\|_cityFromZip\(extracted\.toZip\);/.test(script));

// Apply: fold city into the address (no separate city field exists)
check('applyPastedToForm defines _withCity',/const _withCity=\(addr,city\)=>\{/.test(script));
check('_withCity is case-insensitive dup-guarded',/a\.toLowerCase\(\)\.indexOf\(c\.toLowerCase\(\)\)===-1/.test(script));
check('from address folds in fromCity',/setIfEmpty\('nl-from',_withCity\(d\.fromAddress,d\.fromCity\)\);/.test(script));
check('to address folds in toCity',/setIfEmpty\('nl-to',_withCity\(d\.toAddress,d\.toCity\)\);/.test(script));

// Behavioral re-implementation (mirrors the in-file helpers) to lock extraction logic
const _cityFromAddr=(addr)=>{
  if(!addr)return '';
  const a=String(addr).trim();
  let m=a.match(/,\s*([A-Za-z][A-Za-z .'\-]{1,40}?)\s*,?\s+[A-Z]{2}\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  if(m&&m[1])return m[1].trim();
  m=a.match(/,\s*([A-Za-z][A-Za-z .'\-]{1,40}?)\s*,?\s+\d{5}(?:-\d{4})?\s*$/);
  if(m&&m[1])return m[1].trim();
  return '';
};
const cases=[
  ['975 Bryant St, San Francisco, CA 94103','San Francisco'],
  ['123 Main St, Oakland CA 94601','Oakland'],
  ['456 Elm Ave, Daly City, CA 94014','Daly City'],
  ['789 First St, San Jose, CA 95112','San Jose'],
  ['975 Bryant St','']
];
cases.forEach(([a,exp])=>check('city from "'+a+'" = "'+exp+'"',_cityFromAddr(a)===exp));

// Full California ZIP -> city map present and wired into _cityFromZip
check('CA_ZIP_CITY map is present',/const CA_ZIP_CITY=\{/.test(script));
check('_cityFromZip uses CA_ZIP_CITY',/if\(typeof CA_ZIP_CITY!=='undefined'&&CA_ZIP_CITY\[z\]\)return CA_ZIP_CITY\[z\];/.test(script));
// Behavioral: eval the embedded map and spot-check statewide coverage
try{
  const m=script.match(/const CA_ZIP_CITY=\{[\s\S]*?\};/);
  const vm=require('vm');const ctx={};vm.runInNewContext(m[0]+';globalThis.__m=CA_ZIP_CITY;',ctx);
  const M=ctx.__m;
  check('CA map has >2000 entries',Object.keys(M).length>2000);
  [['94103','San Francisco'],['90001','Los Angeles'],['94601','Oakland'],['95112','San Jose'],['92101','San Diego'],['95814','Sacramento'],['93701','Fresno']].forEach(([z,c])=>check('ZIP '+z+' -> '+c,M[z]===c));
}catch(e){check('CA map evaluates',false);}

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
