// Guards the 2026-06-30 change: "New from this" reuses an untouched shell draft instead of
// blocking, while a real in-progress draft is left completely alone (existing behavior).
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

function grab(sig){const i=src.indexOf(sig);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
const isEmptySrc=grab('function _isDraftEmpty(d)');
const cloneSrc=grab('function cloneSentQuoteToDraft(sourceQuoteId)');

// ── Environment ──
function makeEnv(){
  const calls={confirm:0,saveDB:0,load:0,toast:0,openBuilder:0};
  const env={
    db:{settings:{rateBase:225},quotes:[],leads:[{id:'L1',name:'Alice'}]},
    currentQuoteId:null,currentQuoteLeadId:null,
    showToast:()=>{calls.toast++;},
    confirm:()=>{calls.confirm++;return true;},
    uid:()=>'NEWDRAFT'+(Math.random().toString(36).slice(2,7)),
    loadQuoteIntoBuilder:()=>{calls.load++;},
    closeModal:()=>{},
    openModal:(m)=>{if(m==='quote-builder')calls.openBuilder++;},
    saveDB:()=>{calls.saveDB++;},
    Date,JSON,Math,Number
  };
  return {env,calls};
}
function runClone(dbState,sourceId){
  const {env,calls}=makeEnv();
  env.db=dbState;
  const args=Object.keys(env);
  const fn=new Function(...args, isEmptySrc+'\n'+cloneSrc+'\n;cloneSentQuoteToDraft('+JSON.stringify(sourceId)+');\nreturn {currentQuoteId,currentQuoteLeadId};');
  const out=fn(...args.map(k=>env[k]));
  return {db:env.db,calls,cur:out.currentQuoteId};
}
// standalone _isDraftEmpty for unit checks (uses the real source)
function makeIsEmpty(dbState){
  return new Function('db','d', isEmptySrc.replace(/^function _isDraftEmpty\(d\)\{/,'').replace(/\}$/,'')+'').bind(null,dbState);
}

const shell={id:'D1',leadId:'L1',status:'draft',publicId:'pshell',days:[{crew:2,hrsMin:2,hrsMax:4,rate:225}],fees:[{label:'Fuel Fee',amount:75,included:true}]};
const sent={id:'S1',leadId:'L1',status:'sent',publicId:'psent',sentAt:'2026-06-01',acceptedAt:null,days:[{crew:4,hrsMin:5,hrsMax:7,rate:300}],fees:[{label:'Fuel Fee',amount:90,included:true}],totalMin:1500,totalMax:2100};

// 1) Empty shell present → reuse it (no prompt, no duplicate, filled with sent's data)
{
  const db={settings:{rateBase:225},leads:[{id:'L1'}],quotes:[JSON.parse(JSON.stringify(sent)),JSON.parse(JSON.stringify(shell))]};
  const {db:after,calls,cur}=runClone(db,'S1');
  const drafts=after.quotes.filter(q=>q.status==='draft');
  check('empty shell: no confirm prompt shown',calls.confirm===0);
  check('empty shell: still exactly ONE draft (no duplicate)',drafts.length===1);
  check('empty shell: the draft reuses the shell id D1',drafts[0].id==='D1');
  check('empty shell: draft now carries the sent quote data (crew 4)',drafts[0].days[0].crew===4);
  check('empty shell: draft marked clonedFromQuoteId=S1',drafts[0].clonedFromQuoteId==='S1');
  check('empty shell: draft got a fresh publicId (not the shell/sent one)',drafts[0].publicId!=='pshell'&&drafts[0].publicId!=='psent');
  check('empty shell: sentAt cleared',drafts[0].sentAt==='');
  check('empty shell: source sent quote untouched (still crew 4, status sent)',after.quotes.find(q=>q.id==='S1').status==='sent');
  check('empty shell: builder opened on the reused draft',calls.openBuilder===1&&cur==='D1');
  check('empty shell: saved',calls.saveDB===1);
}

// 2) Real in-progress draft (crew edited to 3) → NOT reused, existing behavior (prompt path)
{
  const worked=JSON.parse(JSON.stringify(shell));worked.id='D2';worked.days[0].crew=3;
  const db={settings:{rateBase:225},leads:[{id:'L1'}],quotes:[JSON.parse(JSON.stringify(sent)),worked]};
  const {db:after,calls}=runClone(db,'S1');
  check('real draft: confirm prompt WAS shown (existing behavior)',calls.confirm===1);
  check('real draft: draft NOT overwritten with clone (crew still 3)',after.quotes.find(q=>q.id==='D2').days[0].crew===3);
  check('real draft: not tagged clonedFromQuoteId',!after.quotes.find(q=>q.id==='D2').clonedFromQuoteId);
}

// 3) No existing draft → fresh clone created (unchanged create path)
{
  const db={settings:{rateBase:225},leads:[{id:'L1'}],quotes:[JSON.parse(JSON.stringify(sent))]};
  const {db:after,calls}=runClone(db,'S1');
  const drafts=after.quotes.filter(q=>q.status==='draft');
  check('no draft: a fresh clone draft is created',drafts.length===1&&drafts[0].clonedFromQuoteId==='S1');
  check('no draft: fresh clone has a new id (not the sent id)',drafts[0].id!=='S1');
  check('no draft: no confirm prompt',calls.confirm===0);
}

// 4) _isDraftEmpty unit checks
{
  const isEmpty=makeIsEmpty({settings:{rateBase:225}});
  check('detector: factory shell → empty',isEmpty({status:'draft',days:[{crew:2,hrsMin:2,hrsMax:4,rate:225}]})===true);
  check('detector: crew edited → not empty',isEmpty({status:'draft',days:[{crew:3,hrsMin:2,hrsMax:4,rate:225}]})===false);
  check('detector: hours edited → not empty',isEmpty({status:'draft',days:[{crew:2,hrsMin:4,hrsMax:6,rate:225}]})===false);
  check('detector: rate edited → not empty',isEmpty({status:'draft',days:[{crew:2,hrsMin:2,hrsMax:4,rate:275}]})===false);
  check('detector: multi-day → not empty',isEmpty({status:'draft',days:[{crew:2,hrsMin:2,hrsMax:4,rate:225},{crew:2}]})===false);
  check('detector: flat rate → not empty',isEmpty({status:'draft',days:[{flatRate:true,flatPrice:1000,crew:2,hrsMin:2,hrsMax:4,rate:225}]})===false);
  check('detector: already a clone → not empty',isEmpty({status:'draft',clonedFromQuoteId:'X',days:[{crew:2,hrsMin:2,hrsMax:4,rate:225}]})===false);
  check('detector: a sent quote → not empty',isEmpty({status:'sent',days:[{crew:2,hrsMin:2,hrsMax:4,rate:225}]})===false);
  check('detector: respects a non-default base rate (300)',makeIsEmpty({settings:{rateBase:300}})({status:'draft',days:[{crew:2,hrsMin:2,hrsMax:4,rate:300}]})===true);
}

// 5) Structural: immutability guard untouched — force:true still cannot write sent/accepted
check('structural: fromSendButton hard-lock still present',/opts\.fromSendButton/.test(src));
check('structural: the non-empty confirm prompt is still there verbatim',/Clicking OK will open that existing draft instead/.test(src));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
