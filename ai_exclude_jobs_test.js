const fs=require('fs'),vm=require('vm');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  ❌ '+n);}};
function extract(name){const m=new RegExp('function\\s+'+name+'\\s*\\(').exec(script);let i=script.indexOf('{',m.index),d=0,s=false,sc='',t=false,e=false;for(let p=i;p<script.length;p++){const c=script[p];if(e){e=false;continue;}if(c==='\\'){e=true;continue;}if(s){if(c===sc)s=false;continue;}if(t){if(c==='`')t=false;continue;}if(c==='"'||c==="'"){s=true;sc=c;continue;}if(c==='`'){t=true;continue;}if(c==='{')d++;else if(c==='}'){d--;if(d===0)return script.slice(m.index,p+1);}}}

// --- _trainKey + _aiTrainingPool behavior ---
const ctx={Number,Array,Object,Math,String,Set,console,_aiExcludedKeys:new Set()};
vm.createContext(ctx);
ctx.getJobTrainingData=()=>ctx._pool||[];
vm.runInContext('let _aiExcludedKeys=globalThis._aiExcludedKeys;'+extract('_trainKey'),ctx);
vm.runInContext(extract('_aiTrainingPool'),ctx);

const jobs=[
  {id:'a',name:'Kinsella',date:'2026-05-01',size:'4 bedroom',sqft:1886,actualHours:18.5},
  {id:'b',name:'Smith',date:'2026-04-01',size:'4 bedroom',sqft:1100,actualHours:9},
  {id:'c',name:'Jones',date:'2026-03-01',size:'3 bedroom',sqft:900,actualHours:7},
];
ctx._pool=jobs;
check('pool returns all jobs when nothing excluded',ctx._aiTrainingPool().length===3);
check('_trainKey is stable & distinct',ctx._trainKey(jobs[0])!==ctx._trainKey(jobs[1]) && ctx._trainKey(jobs[0])===ctx._trainKey({...jobs[0]}));
ctx._aiExcludedKeys.add(ctx._trainKey(jobs[0]));
check('excluding Kinsella removes exactly that job',ctx._aiTrainingPool().length===2 && !ctx._aiTrainingPool().some(j=>j.name==='Kinsella'));
ctx._aiExcludedKeys.clear();
check('reset (clear) restores full pool',ctx._aiTrainingPool().length===3);

// --- wiring checks ---
check('fresh quote resets exclusions, recalc preserves them',/function generateAIQuote\(isRecalc\)\{\s*if\(!isRecalc\)_aiExcludedKeys=new Set\(\);/.test(script));
check('neighbor pool uses filtered _aiTrainingPool',/const allData=_aiTrainingPool\(\);/.test(script));
check('vault regression uses filtered pool',/const data=_aiTrainingPool\(\)\.filter\(j=>j\.actualHours&&j\.estimatedVaults/.test(script));
check('sqft regression uses filtered pool',/const data=_aiTrainingPool\(\)\.filter\(j=>j\.actualHours&&j\.sqft/.test(script));
check('scored list captured for checkbox mapping',/_aiLastScored=scored;/.test(script));
check('readout lists jobs with checkboxes',/class="ai-job-incl" data-idx="\$\{i\}" checked/.test(script));
check('readout shows name/size/sqft/hours/score',/\$\{j\.actualHours\} hrs[\s\S]{0,80}match \$\{Math\.round\(j\.score\)\}/.test(script));
check('recalc button present',/onclick="recalcAIQuote\(\)"/.test(script));
check('recalcAIQuote collects unchecked into exclusions',/recalcAIQuote\(\)\{[\s\S]{0,260}if\(!cb\.checked\)[\s\S]{0,160}_aiExcludedKeys\.add\(_trainKey\(rec\)\)/.test(script));
check('resetAIExclusions clears and re-runs',/function resetAIExclusions\(\)\{_aiExcludedKeys=new Set\(\);generateAIQuote\(true\);\}/.test(script));
check('empty-state offers reset when jobs hidden',/hidden '\+_aiExcludedKeys\.size[\s\S]{0,140}resetAIExclusions\(\)/.test(script));
check('readout copy stresses non-destructive',/this estimate only[\s\S]{0,120}Nothing is deleted/.test(script));

console.log('\nRESULTS: '+pass+' passed, '+fail+' failed');
if(!fail)console.log('ALL TESTS PASSED ✅');
process.exit(fail?1:0);
