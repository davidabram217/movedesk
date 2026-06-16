// Tests for the credit-card surcharge on the multi-day completion + edit forms.
// Run: node multiday_cc_surcharge_test.js index.html
const fs=require('fs'),vm=require('vm');
const idx=fs.readFileSync(process.argv[2]||'index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}

// ---- brace-matched extractor ----
function extract(name){
  const m=script.indexOf('function '+name);
  if(m<0)return null;
  let i=script.indexOf('{',m),d=0,inStr=false,q='';
  for(;i<script.length;i++){const c=script[i];
    if(inStr){if(c===q&&script[i-1]!=='\\')inStr=false;continue;}
    if(c==='"'||c==="'"||c==='`'){inStr=true;q=c;continue;}
    if(c==='{')d++;else if(c==='}'){d--;if(d===0){return script.slice(m,i+1);}}
  }
  return null;
}

// ---- DOM mock factory for a multi-day form ----
function makeDom(prefix,days,fees,misc,payment){
  const els={};
  const mk=v=>({value:(v==null?'':String(v)),textContent:'',style:{display:''}});
  // day cards
  const cards=days.map((d,i)=>({
    getAttribute:a=>a==='data-day-index'?String(i):null,
    querySelector:sel=>{
      const key=sel.replace('.'+prefix+'-day-','');
      const map={'move-hours':d.mh,'move-rate':d.mr,'pack-hours':d.ph,'pack-rate':d.pr,'fuel':d.fuel,'materials':d.mat,'parking':d.park};
      if(key in map)return mk(map[key]);
      return {textContent:''}; // pay/subtotal display cells
    }
  }));
  const container={children:cards,querySelectorAll:()=>[]};
  els[prefix+'-days-container']=container;
  ['insurance','coi','dump','yelp','damage'].forEach(f=>els[prefix+'-'+f]=mk(fees[f]||0));
  for(let i=1;i<=3;i++)els[prefix+'-misc-'+i+'-amount']=mk(misc[i-1]||0);
  els[prefix+'-payment']=mk(payment);
  els[prefix+'-total-display']=mk(0);
  els[prefix+'-cc-fee-row']=mk(0);
  els[prefix+'-cc-fee-amount']=mk(0);
  return {getElementById:id=>els[id]||null,_els:els};
}

function runCalc(fnName,prefix,days,fees,misc,payment){
  const fn=extract(fnName);
  if(!fn){check('extract '+fnName,false);return null;}
  const win={};
  const ctx={document:makeDom(prefix,days,fees,misc,payment),window:win,Number,Math,String,document_undefined:undefined};
  ctx.window=win;
  vm.createContext(ctx);
  // expose window globals referenced as bare `window`
  vm.runInContext('var window=this.window;'+fn+';this.__ret='+fnName+'();',ctx);
  return {ret:ctx.__ret,win,dom:ctx.document};
}

// 1 day: move 5h@200=1000, fuel 50 -> subtotal 1050; no payment -> no surcharge
let r=runCalc('calcMultiDayTotal','cjmd',[{mh:5,mr:200,fuel:50}],{},[],'');
check('cjmd no payment: total = 1050 (no surcharge)',r&&Math.round(r.ret)===1050);
check('cjmd no payment: stashed fee 0',r&&(Number(r.win._cjmdCcFee)||0)===0);

// Same but Credit card -> +3.5% of 1050 = 36.75 -> 1086.75
r=runCalc('calcMultiDayTotal','cjmd',[{mh:5,mr:200,fuel:50}],{},[],'Credit card');
check('cjmd CC: total = 1086.75',r&&Math.abs(r.ret-1086.75)<0.01);
check('cjmd CC: stashed fee = 36.75',r&&Math.abs(Number(r.win._cjmdCcFee)-36.75)<0.01);
check('cjmd CC: indicator row shown',r&&r.dom._els['cjmd-cc-fee-row'].style.display==='flex');

// 2 days + whole-job fee + misc, Credit card: (1000+50)+(800)+ins100 + misc200 = 2150; +3.5%=75.25 ->2225.25
r=runCalc('calcMultiDayTotal','cjmd',[{mh:5,mr:200,fuel:50},{mh:4,mr:200}],{insurance:100},[200],'Credit card');
check('cjmd CC 2-day+fees+misc: subtotal 2150 + 75.25 = 2225.25',r&&Math.abs(r.ret-2225.25)<0.01);

// Edit form parity
r=runCalc('calcEditMultiDayTotal','ecjmd',[{mh:5,mr:200,fuel:50}],{},[],'Credit card');
check('ecjmd CC: total = 1086.75',r&&Math.abs(r.ret-1086.75)<0.01);
check('ecjmd CC: stashed fee = 36.75',r&&Math.abs(Number(r.win._ecjmdCcFee)-36.75)<0.01);
r=runCalc('calcEditMultiDayTotal','ecjmd',[{mh:5,mr:200,fuel:50}],{},[],'Cash');
check('ecjmd Cash: no surcharge (1050)',r&&Math.round(r.ret)===1050);

// ---- structural checks ----
check('cjmd-payment recalcs on change',/id="cjmd-payment" onchange="calcMultiDayTotal\(\)"/.test(idx));
check('ecjmd-payment recalcs on change',/id="ecjmd-payment" onchange="calcEditMultiDayTotal\(\)"/.test(idx));
check('cjmd cc indicator row exists',/id="cjmd-cc-fee-row"/.test(idx)&&/id="cjmd-cc-fee-amount"/.test(idx));
check('ecjmd cc indicator row exists',/id="ecjmd-cc-fee-row"/.test(idx)&&/id="ecjmd-cc-fee-amount"/.test(idx));
check('completion commit uses stashed cc fee',/const _ccFee=Number\(window\._cjmdCcFee\)\|\|0;/.test(script));
check('completion saved total no longer double-counts misc',/total:Math\.round\(Number\(total\)\|\|0\),/.test(script));
check('completion feeLabour subtracts cc',/aggParking\+_ccFee\)\)\|\|0,/.test(script));
check('edit-save records feeCC',/j\.feeCC=_ecjCcFee\|\|0;/.test(script));
check('edit-save feeLabour subtracts cc',/aggParking\+miscTotal\+_ecjCcFee\)\)\|\|0;/.test(script));
check('single-day surcharge unchanged (still 3.5% of subtotal)',/_ccFee=\(_payment==='Credit card'\)\?Math\.round\(subtotal\*0\.035\*100\)\/100:0;/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
