const fs=require('fs'),vm=require('vm');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  ❌ '+n);}};

function extract(name){const m=new RegExp('function\\s+'+name+'\\s*\\(').exec(script);let i=script.indexOf('{',m.index),d=0,s=false,sc='',t=false,e=false;for(let p=i;p<script.length;p++){const c=script[p];if(e){e=false;continue;}if(c==='\\'){e=true;continue;}if(s){if(c===sc)s=false;continue;}if(t){if(c==='`')t=false;continue;}if(c==='"'||c==="'"){s=true;sc=c;continue;}if(c==='`'){t=true;continue;}if(c==='{')d++;else if(c==='}'){d--;if(d===0)return script.slice(m.index,p+1);}}}
const ctx={Number,Array,Object,Math,String,console,db:{bookedJobs:[],leads:[],quotes:[]}};
vm.createContext(ctx);
vm.runInContext(extract('resolveQuotedInfo'),ctx);

// multi-day: two days each 7-9 -> 14-18
ctx.db.bookedJobs=[{id:'bj1',leadId:'l1',quoteId:'q1'}];
ctx.db.leads=[{id:'l1',name:'David Kinsella'}];
ctx.db.quotes=[{id:'q1',leadId:'l1',totalMin:5000,totalMax:6000,estimatedVaults:20,days:[{hrsMin:7,hrsMax:9,rate:225,crew:3},{hrsMin:7,hrsMax:9,rate:225,crew:3}]}];
let r=ctx.resolveQuotedInfo({bookedJobId:'bj1',name:'David Kinsella'});
check('multi-day quoted hours min summed = 14',r.quotedHoursMin===14);
check('multi-day quoted hours max summed = 18',r.quotedHoursMax===18);
check('quotedRate still day-level (225)',r.quotedRate===225);

// single-day: one day 7-9 -> 7-9 (unchanged)
ctx.db.quotes=[{id:'q1',leadId:'l1',totalMin:2000,totalMax:2500,days:[{hrsMin:7,hrsMax:9,rate:225}]}];
r=ctx.resolveQuotedInfo({bookedJobId:'bj1',name:'David Kinsella'});
check('single-day quoted hours unchanged (7-9)',r.quotedHoursMin===7&&r.quotedHoursMax===9);

// flat-rate day contributes 0 hours
ctx.db.quotes=[{id:'q1',leadId:'l1',days:[{hrsMin:7,hrsMax:9,rate:225},{flatRate:true,flatPrice:1500}]}];
r=ctx.resolveQuotedInfo({bookedJobId:'bj1',name:'David Kinsella'});
check('flat-rate day excluded from hours (still 7-9)',r.quotedHoursMin===7&&r.quotedHoursMax===9);

// wiring: viewCompletedJob sums across all quote days
check('viewCompletedJob sums quoted hours across _qDays',/_qDays=\(quote&&Array\.isArray\(quote\.days\)\)\?quote\.days:\[\][\s\S]{0,400}_qhMin\+=hmin;_qhMax\+=hmax/.test(script));
check('resolveQuotedInfo sums quoted hours across days',/_ds\.forEach\(d=>\{if\(!d\|\|d\.flatRate\)return;[\s\S]{0,120}_hmin\+=a;_hmax\+=b/.test(script));

console.log('\nRESULTS: '+pass+' passed, '+fail+' failed');
if(!fail)console.log('ALL TESTS PASSED ✅');
process.exit(fail?1:0);
