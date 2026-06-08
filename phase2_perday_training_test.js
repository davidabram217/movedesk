// Phase 2 — per-day AI training extraction test suite
// Run: node phase2_perday_training_test.js  (expects ./index.html)
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));

let pass=0,fail=0;
function check(name,cond){if(cond){pass++;}else{fail++;console.log('  ❌ '+name);}}

// ---- extract a top-level `function NAME(...)` body by brace matching ----
function extract(name){
  const re=new RegExp('function\\s+'+name.replace(/[$]/g,'\\$')+'\\s*\\(');
  const m=re.exec(script);
  if(!m)return null;
  let i=script.indexOf('{',m.index);
  let depth=0,inStr=false,strCh='',inTmpl=false,esc=false;
  for(let p=i;p<script.length;p++){
    const c=script[p];
    if(esc){esc=false;continue;}
    if(c==='\\'){esc=true;continue;}
    if(inStr){if(c===strCh)inStr=false;continue;}
    if(inTmpl){if(c==='`')inTmpl=false;continue;}
    if(c==='"'||c==="'"){inStr=true;strCh=c;continue;}
    if(c==='`'){inTmpl=true;continue;}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return script.slice(m.index,p+1);}
  }
  return null;
}

// ---- build a sandbox with the extracted functions + mocks ----
let _idc=0;
const sandbox={
  uid:()=>'id'+(++_idc),
  saveDB:()=>{},
  SPREADSHEET_TRAINING:[],
  resolveQuotedInfo:()=>({quotedMin:null,quotedMax:null,quotedHoursMin:null,quotedHoursMax:null,quotedRate:null,quotedCrew:null,estimatedVaults:null,source:null}),
  fmtMoney:n=>'$'+n,
  Math:Math,Number:Number,String:String,Array:Array,Object:Object,Date:Date,console:console,
  db:{aiTraining:[],completedJobs:[]}
};
// mock getAllTrainingData so the split helpers work without triggering self-heal
sandbox.getAllTrainingData=function(){return [].concat(sandbox.SPREADSHEET_TRAINING||[],sandbox.db.aiTraining||[]);};
vm.createContext(sandbox);

const need=['_normActivityType','buildDayTrainingRecord','ensureMultiDayDayRecords',
  'getJobTrainingData','getDayTrainingData','selfHealAITraining',
  '_sizeKey','_avg','_round5','computePerActivityInsights','computeMultiDayJobInsights'];
need.forEach(fn=>{
  const src=extract(fn);
  check('extract '+fn,!!src);
  if(src){try{vm.runInContext(src,sandbox);}catch(e){check('eval '+fn,false);console.log('     ',e.message);}}
});

// ============ BEHAVIOR ============
const C=sandbox; // shorthand

// T1 — activity normalization
check('normalize Packing',C._normActivityType('Packing')==='Packing');
check('normalize Pack and move',C._normActivityType('Pack and move')==='Pack and move');
check('normalize Load and move',C._normActivityType('Load and move')==='Load and move');
check('normalize Delivery',C._normActivityType('Delivery')==='Delivery');
check('normalize Moving',C._normActivityType('Moving')==='Moving');
check('normalize empty -> Moving',C._normActivityType('')==='Moving');

// T2 — per-day record shape
const cjSample={id:'cjA',bookedJobId:'bjA',name:'Acme',size:'3 bedroom',sqft:'2000',packing:'Full',moveType:'Local pack & move',from:'A',to:'B',fromZip:'1',toZip:'2',accessLoad:'Flat',accessUnload:'1 Flight'};
const daySample={date:'2026-06-01',type:'Packing',movers:0,moveHours:0,moveRate:0,packers:4,packHours:6,packRate:135,fuel:0,materials:50,parking:10};
const rec=C.buildDayTrainingRecord(cjSample,daySample,0);
check('day rec kind=day',rec.kind==='day');
check('day rec dayType=Packing',rec.dayType==='Packing');
check('day rec packMen=4',rec.packMen===4);
check('day rec packHours=6',rec.packHours===6);
check('day rec carries size',rec.size==='3 bedroom');
check('day rec carries sqft',String(rec.sqft)==='2000');
check('day rec completedJobId link',rec.completedJobId==='cjA');
check('day rec dayIndex',rec.dayIndex===0);
// whole-job money must NOT be on a day record
check('day rec has NO actualTotal',!('actualTotal'in rec));
check('day rec has NO feeInsurance',!('feeInsurance'in rec));
check('day rec has NO estimatedVaults',!('estimatedVaults'in rec));
check('day rec has NO vaults',!('vaults'in rec));

// T3 — ensureMultiDayDayRecords: skips zero-hour day, dedups on re-run
C.db.aiTraining=[];
const cjMulti={id:'cjM',bookedJobId:'bjM',name:'Multi',size:'4 bedroom',sqft:'2600',packing:'Full',moveType:'pack',multiDay:true,days:[
  {date:'d1',type:'Packing',movers:0,moveHours:0,packers:4,packHours:6,packRate:135},
  {date:'d2',type:'Load and move',movers:5,moveHours:9,moveRate:240,packers:0,packHours:0},
  {date:'d3',type:'Moving',movers:0,moveHours:0,packers:0,packHours:0} // zero work -> skipped
]};
const added=C.ensureMultiDayDayRecords(cjMulti);
check('ensure adds 2 (skips zero-hour day)',added===2);
check('ensure no record for empty day',!C.db.aiTraining.some(r=>r.dayIndex===2));
const again=C.ensureMultiDayDayRecords(cjMulti);
check('ensure idempotent (re-run adds 0)',again===0);
check('ensure total day records = 2',C.db.aiTraining.filter(r=>r.kind==='day').length===2);
const packDay=C.db.aiTraining.find(r=>r.dayIndex===0);
check('pack day men=4 hrs=6',packDay.packMen===4&&packDay.packHours===6);
const moveDay=C.db.aiTraining.find(r=>r.dayIndex===1);
check('move day men=5 hrs=9 rate=240',moveDay.moveMen===5&&moveDay.moveHours===9&&moveDay.moveRate===240);

// T4 — job/day split; legacy (no kind) counts as job-level
C.db.aiTraining=[{completedJobId:'legacy1'/*no kind*/},{kind:'day',completedJobId:'x',dayIndex:0},{kind:'job',completedJobId:'y'}];
check('getDayTrainingData returns only day records',C.getDayTrainingData().length===1);
check('getJobTrainingData excludes day records',C.getJobTrainingData().length===2);
check('legacy no-kind treated as job-level',C.getJobTrainingData().some(r=>r.completedJobId==='legacy1'));

// T5 — selfHeal on a multi-day job: 1 job record (multiDay,dayCount) + per-day records, idempotent
C.db.aiTraining=[];
C.db.completedJobs=[{id:'cjM',bookedJobId:'bjM',usedForAI:true,name:'Multi',date:'2026-06-01',size:'4 bedroom',sqft:'2600',packing:'Full',moveType:'pack',hours:15,moveMen:'5',total:5000,multiDay:true,days:cjMulti.days}];
C.selfHealAITraining();
const jobRecs=C.db.aiTraining.filter(r=>r.kind!=='day'&&r.completedJobId==='cjM');
const dayRecs=C.db.aiTraining.filter(r=>r.kind==='day'&&r.completedJobId==='cjM');
check('selfHeal makes exactly 1 job record',jobRecs.length===1);
check('job record multiDay=true',jobRecs[0].multiDay===true);
check('job record dayCount=3',jobRecs[0].dayCount===3);
check('selfHeal makes 2 day records (skips empty)',dayRecs.length===2);
C.selfHealAITraining();
check('selfHeal idempotent: still 1 job record',C.db.aiTraining.filter(r=>r.kind!=='day'&&r.completedJobId==='cjM').length===1);
check('selfHeal idempotent: still 2 day records',C.db.aiTraining.filter(r=>r.kind==='day'&&r.completedJobId==='cjM').length===2);

// T6 — selfHeal on a single-day job: 1 job record, no day records
C.db.aiTraining=[];
C.db.completedJobs=[{id:'cjS',bookedJobId:'bjS',usedForAI:true,name:'Single',date:'2026-06-02',size:'2 bedroom',hours:7,moveMen:'3',total:1500}];
C.selfHealAITraining();
check('single-day: 1 job record',C.db.aiTraining.filter(r=>r.kind!=='day').length===1);
check('single-day: no day records',C.db.aiTraining.filter(r=>r.kind==='day').length===0);
check('single-day job record dayCount=1',C.db.aiTraining[0].dayCount===1);

// T7 — computePerActivityInsights: day records + single-day jobs
C.db.aiTraining=[
  {kind:'day',completedJobId:'a',dayType:'Packing',packMen:4,packHours:6,moveHours:0,size:'2000 sqft'},
  {kind:'day',completedJobId:'b',dayType:'Packing',packMen:2,packHours:4,moveHours:0,size:'2000 sqft'},
  {kind:'day',completedJobId:'c',dayType:'Load and move',moveMen:5,moveHours:9,packHours:0,size:'2000 sqft'}
];
C.db.completedJobs=[{id:'s1',usedForAI:true,multiDay:false,moveMen:'3',hours:5,packMen:'2',packHoursActual:3,size:'2000 sqft'}];
const ins=C.computePerActivityInsights();
check('per-activity has Packing bucket',!!ins['Packing']);
check('Packing pulls day records + single-day pack',ins['Packing'].all.length===3); // 2 day + 1 single-day
check('per-activity has Moving / loading bucket',!!ins['Moving / loading']||!!ins['Moving / loading ']);
check('Moving bucket includes day + single-day move',(ins['Moving / loading']||{all:[]}).all.length===2);
check('per-activity groups by size',!!ins['Packing'].bySize['2000 sqft']);

// T8 — computeMultiDayJobInsights
C.db.completedJobs=[
  {id:'m1',usedForAI:true,multiDay:true,days:[{},{}],hours:20,total:6000,size:'4 bedroom'},
  {id:'m2',usedForAI:true,multiDay:true,days:[{},{},{}],hours:30,total:9000,size:'4 bedroom'},
  {id:'m3',usedForAI:true,multiDay:false,size:'4 bedroom'} // single-day excluded
];
const mins=C.computeMultiDayJobInsights();
check('multiDay insights counts only multi-day jobs',mins.n===2);
check('multiDay grouped by size',mins.bySize['4 bedroom'].length===2);
check('multiDay avg days = 2.5',(mins.bySize['4 bedroom'].reduce((s,x)=>s+x.days,0)/2)===2.5);

// ============ WIRING (string checks on the file) ============
function has(re,name){check(name,re.test(script));}
has(/confirmCompleteMultiDay[\s\S]*?if\(useForAI\)\{try\{selfHealAITraining\(\)/,'confirmCompleteMultiDay emits records when useForAI');
has(/saveEditedCompletedJobMultiDay[\s\S]*?db\.aiTraining=\(db\.aiTraining\|\|\[\]\)\.filter\(r=>r\.completedJobId!==j\.id\)[\s\S]*?if\(j\.usedForAI\)selfHealAITraining\(\)/,'multi-day edit re-extracts training records');
has(/find\(r=>r\.kind!=='day'&&r\.completedJobId===j\.id\)\|\|\s*db\.aiTraining\.find\(r=>r\.kind!=='day'&&r\.bookedJobId===j\.bookedJobId/,'viewCompletedJob lookup excludes day records');
has(/const existing=db\.aiTraining\.find\(r=>r\.kind!=='day'&&r\.completedJobId===j\.id\)/,'selfHeal existence check excludes day records');
has(/if\(j\.multiDay&&Array\.isArray\(j\.days\)\)healed\+=ensureMultiDayDayRecords\(j\)/,'selfHeal adds per-day records for multi-day jobs');
has(/try\{renderPerDayInsights\(\);\}catch/,'renderAnalytics calls renderPerDayInsights');
check('analytics card #perday-insights-chart present',/id="perday-insights-chart"/.test(html));
// no whole-job consumer still calls getAllTrainingData directly (only def + 2 split helpers)
const callMatches=(script.match(/getAllTrainingData\(\)/g)||[]).length;
check('getAllTrainingData() referenced only by def + 2 split helpers ('+callMatches+')',callMatches===3);
has(/estimatePackingMaterials[\s\S]*?const allData=getJobTrainingData\(\)/,'packing-materials estimator uses job-level data');
has(/const data=getJobTrainingData\(\)\.filter\(j=>j\.actualHours&&j\.estimatedVaults/,'vaults regression uses job-level data');

console.log('\n═══════════════════════════════════════');
console.log('RESULTS: '+pass+' passed, '+fail+' failed');
if(fail===0)console.log('ALL TESTS PASSED ✅');
console.log('═══════════════════════════════════════');
process.exit(fail?1:0);
