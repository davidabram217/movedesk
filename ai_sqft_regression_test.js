const fs=require('fs'),vm=require('vm');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  ❌ '+n);}};
function extract(name){const m=new RegExp('function\\s+'+name+'\\s*\\(').exec(script);let i=script.indexOf('{',m.index),d=0,s=false,sc='',t=false,e=false;for(let p=i;p<script.length;p++){const c=script[p];if(e){e=false;continue;}if(c==='\\'){e=true;continue;}if(s){if(c===sc)s=false;continue;}if(t){if(c==='`')t=false;continue;}if(c==='"'||c==="'"){s=true;sc=c;continue;}if(c==='`'){t=true;continue;}if(c==='{')d++;else if(c==='}'){d--;if(d===0)return script.slice(m.index,p+1);}}}

const ctx={Number,Array,Object,Math,String,console};
vm.createContext(ctx);
// mocks
ctx.getJobTrainingData=()=>ctx._data||[];
ctx.accessScore=()=>0; // neutralize access term so sqft delta is isolated in similarity()
vm.runInContext(extract('computeSqftRegression'),ctx);
vm.runInContext(extract('similarity'),ctx);

// --- regression fit: hours ≈ sqft/100 ---
ctx._data=[{sqft:800,actualHours:8},{sqft:1000,actualHours:10},{sqft:1200,actualHours:12},
           {sqft:1400,actualHours:14},{sqft:1600,actualHours:16},{sqft:2000,actualHours:20},
           {sqft:1886,actualHours:18.5}];
let reg=ctx.computeSqftRegression();
check('regression fits (returns object)',reg&&typeof reg.slope==='number');
check('positive slope ~0.01 per sqft',reg.slope>0.008&&reg.slope<0.013);
check('predicts big home (1886sqft) ~18–19.5 hrs',(()=>{const p=reg.intercept+reg.slope*1886;return p>=17&&p<=20;})());
check('predicts small home (900sqft) ~8–10 hrs',(()=>{const p=reg.intercept+reg.slope*900;return p>=7&&p<=11;})());
check('reports sample size n=7',reg.n===7);

// --- guards ---
ctx._data=[{sqft:1000,actualHours:10},{sqft:1200,actualHours:12},{sqft:1400,actualHours:14}];
check('null when <6 jobs',ctx.computeSqftRegression()===null);
ctx._data=Array.from({length:8},()=>({sqft:1200,actualHours:12}));
check('null when all same sqft (no slope)',ctx.computeSqftRegression()===null);
ctx._data=[{sqft:800,actualHours:20},{sqft:1000,actualHours:18},{sqft:1200,actualHours:16},
           {sqft:1400,actualHours:14},{sqft:1600,actualHours:12},{sqft:2000,actualHours:8}];
check('null when slope negative (bigger=fewer hrs is nonsense)',ctx.computeSqftRegression()===null);

// --- similarity: sqft now strongly differentiates by size ---
const base={size:'4 bedroom',packing:'',moveType:'',accessLoad:'Flat',accessUnload:'Flat'};
const inputs={...base,sqft:1886};
const big=ctx.similarity({...base,sqft:1886},inputs);
const small=ctx.similarity({...base,sqft:1100},inputs);
check('identical-sqft job scores higher than smaller same-bedroom job',big>small);
check('sqft gap (786) creates a meaningful spread (~14–17 pts)',(big-small)>=13&&(big-small)<=18);
check('identical sqft adds ~30 pts (was 10)',(()=>{const none=ctx.similarity({...base},{...base});const withSqft=ctx.similarity({...base,sqft:1886},inputs);return (withSqft-none)>=29&&(withSqft-none)<=30.5;})());

// --- wiring in generateAIQuote ---
check('sqft regression computed only when no vaults',/_sqftReg=\(!inputs\.vaults&&inputs\.sqft\)\?computeSqftRegression\(\):null/.test(script));
check('vaults still take priority over sqft',/if\(_vaultReg&&inputs\.vaults\)\{[\s\S]*?\}\s*else if\(_sqftReg&&inputs\.sqft\)\{/.test(script));
check('sqft blend weight 0.6',/SQFT_WEIGHT=0\.6;/.test(script));
check('sqft path sets _usedSqftReg',/_usedSqftReg=true;/.test(script));
check('range spread uses sqft regression error',/else if\(_usedSqftReg\)\{[\s\S]{0,400}_sqftReg\.meanAbsErr/.test(script));
check("header shows 'size-scaled' note",/_usedSqftReg\?' · size-scaled':''/.test(script));

console.log('\nRESULTS: '+pass+' passed, '+fail+' failed');
if(!fail)console.log('ALL TESTS PASSED ✅');
process.exit(fail?1:0);
