// Guards the paste-to-booking feature: applyBookingExtract fills the right booking-form fields
// for single- and multi-day extractions, TBD dates are left blank, and the regex fallback
// pulls the basics from a real single-day email. Uses mocked extraction JSON from David's two
// example emails. Does NOT touch any locked booking logic — only the new fill/extract helpers.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};
function grab(sig){const i=src.indexOf(sig);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}

const applySrc=grab('function applyBookingExtract(ex)');
const extractSrc=grab('function extractBookingFromText(text)');
const parseDateSrc=grab('function _ptbParseDate(s)');

// ── Mock DOM + captured multi-day load ──
function makeEnv(){
  const store={};
  const el=id=>{ if(!(id in store)) store[id]={_v:'',get value(){return this._v;},set value(v){this._v=v;}}; return store[id]; };
  const captured={days:null};
  const env={
    document:{getElementById:el},
    _bjLoadMultiDay:(days)=>{captured.days=days;},
    bjAutoSave:()=>{},
    Number,String,Array,Date,isNaN
  };
  return {env,store,captured};
}
function runApply(ex){
  const {env,store,captured}=makeEnv();
  const args=Object.keys(env);
  new Function(...args, applySrc+'\n;applyBookingExtract('+JSON.stringify(ex)+');')(...args.map(k=>env[k]));
  return {val:id=>(store[id]?store[id]._v:''),captured};
}
function runExtract(text){
  const env={Number,String,Array,Date,isNaN};
  const args=Object.keys(env);
  return new Function(...args, parseDateSrc+'\n'+extractSrc+'\n;return extractBookingFromText('+JSON.stringify(text)+');')(...args.map(k=>env[k]));
}

// 1) SINGLE-DAY apply (Alex Park shape)
{
  const ex={isMultiDay:false,customerName:'Alex Park',phone:'(302) 272-9815',altPhone:'(415) 915-3820',
    email:'alexpark1990@proton.me',size:'1 Bdrm',packing:'No packing but needs boxes',source:'Google',
    date:'2026-06-15',arrivalWindow:'830am-930am',movers:3,rateRegular:225,rateCash:210,
    from:'2764 22nd street, San Francisco CA',to:'77 lenox ave #22 Oakland CA',
    feeFuel:60,feeMaterials:25,deposit:null,driveTime:'Return drive time',days:[]};
  const {val}=runApply(ex);
  check('single: date filled',val('bj-date')==='2026-06-15');
  check('single: arrival filled',val('bj-time')==='830am-930am');
  check('single: movers select set',val('bj-movers')==='3');
  check('single: regular rate',String(val('bj-rate-regular'))==='225');
  check('single: cash rate',String(val('bj-rate-cash'))==='210');
  check('single: fuel fee',String(val('bj-fee-fuel'))==='60');
  check('single: materials fee',String(val('bj-fee-materials'))==='25');
  check('single: addresses land in office notes',/2764 22nd street/.test(val('bj-office-notes'))&&/77 lenox/.test(val('bj-office-notes')));
  check('single: size + packing in office notes',/1 Bdrm/.test(val('bj-office-notes'))&&/needs boxes/.test(val('bj-office-notes')));
}

// 2) MULTI-DAY apply (Justin/Neha shape) with TBD dates
{
  const ex={isMultiDay:true,customerName:'Justin Piearcy and Neha Mohan',phone:'(831) 512-2687',
    email:'justin@justinpiearcy.com',feeFuel:450,feeMaterials:50,deposit:null,
    driveTime:'Drive time from San Francisco and return applies each day',
    days:[
      {date:'TBD',label:'Load & Return to Warehouse',from:'69 Vintage Circle #3159, Pleasanton, CA',movers:5,hoursMin:6.5,hoursMax:7.5,rateRegular:375,rateCash:350},
      {date:'TBD',label:'Delivery & Return to Warehouse',to:'25430 Loma Robles, Carmel Valley, CA',movers:5,hoursMin:8,hoursMax:9,rateRegular:375,rateCash:350}
    ]};
  const {val,captured}=runApply(ex);
  check('multi: _bjLoadMultiDay called with 2 days',captured.days&&captured.days.length===2);
  check('multi: day1 crew=5, rate=375, cash=350',captured.days[0].crew===5&&captured.days[0].rate===375&&captured.days[0].rateCash===350);
  check('multi: day1 hours 6.5-7.5',captured.days[0].hrsMin===6.5&&captured.days[0].hrsMax===7.5);
  check('multi: day2 hours 8-9',captured.days[1].hrsMin===8&&captured.days[1].hrsMax===9);
  check('multi: TBD dates stripped to blank in the day rows',captured.days[0].date===''&&captured.days[1].date==='');
  check('multi: shared fuel fee on top-level field',String(val('bj-fee-fuel'))==='450');
  check('multi: shared materials fee on top-level field',String(val('bj-fee-materials'))==='50');
  check('multi: bj-date left blank because Day 1 is TBD',val('bj-date')==='');
  check('multi: Day 1 movers mirrored to bj-movers',val('bj-movers')==='5');
  check('multi: drive time captured in office notes',/return applies each day/.test(val('bj-office-notes')));
}

// 3) Regex fallback on the raw Alex Park email
{
  const raw="Alex Park (302) 272-9815 or (415) 915-3820 alexpark1990@proton.me Unseen 1 Bdrm Home No Packing but needs boxes  Found us on Google   When: Monday June 15th 830am-930am From: 2764 22nd street, San Francisco ca. To: 77 lenox ave #22 Oakland ca.  3 Men $225 per hour or $210 cash rate 2 hour minimum  $25 material fee $60 Fuel fee Return drive time";
  const ex=runExtract(raw);
  check('fallback: movers=3',ex.movers===3);
  check('fallback: regular rate=225',ex.rateRegular===225);
  check('fallback: cash rate=210',ex.rateCash===210);
  check('fallback: fuel fee=60',ex.feeFuel===60);
  check('fallback: materials fee=25',ex.feeMaterials===25);
  check('fallback: arrival window captured',ex.arrivalWindow==='830am-930am');
  check('fallback: single-day (no multi-day hint)',ex.isMultiDay===false);
}

// 4) Fallback multi-day detection
{
  const ex=runExtract("Two-day move. Day 1 load. Day 2 delivery. Crew: 5 movers. $375/hr standard $350 cash. Fuel Fee: $450");
  check('fallback: detects multi-day',ex.isMultiDay===true);
}

// 5) Structural — UI wiring present, and no locked logic touched
check('structural: booking form has the Paste button',/onclick="openPasteToBooking\(\)"/.test(src));
check('structural: paste-to-booking modal exists',/id="modal-paste-to-booking"/.test(src)&&/id="ptb-text"/.test(src));
check('structural: parse calls the parse-booking edge function',/functions\/v1\/parse-booking/.test(src));
check('structural: has a regex fallback wired',/extractBookingFromText\(text\)/.test(src));
check('structural: multi-day fill reuses existing _bjLoadMultiDay',/_bjLoadMultiDay==='function'\)_bjLoadMultiDay\(days\)/.test(src));
check('structural: locked confirmBooking draft behavior intact',/job\._draft=true/.test(src));
check('structural: locked "do not flip lead status yet" intact',/Don't flip lead status to/.test(src));

// 6) NEW preview renders every detail incl. the FULL notes
{
  const previewSrc=grab('function _renderBookingExtractPreview(ex)');
  let captured='';
  const doc={getElementById:()=>({set innerHTML(v){captured=v;},get innerHTML(){return captured;}})};
  const run=ex=>{captured='';new Function('document','window','isNaN','String','Array',previewSrc+'\n;_renderBookingExtractPreview('+JSON.stringify(ex)+');')(doc,{},isNaN,String,Array);return captured;};
  const ex={isMultiDay:true,customerName:'Justin & Neha',phone:'(831) 512-2687',feeFuel:450,feeMaterials:50,
    officeNotes:'Sleeper sofa was disassembled. Spiral staircase is tricky - bring straps.',
    days:[{date:'TBD',label:'Load',movers:5,hoursMin:6.5,hoursMax:7.5,rateRegular:375,rateCash:350},
          {date:'TBD',label:'Delivery',movers:5,hoursMin:8,hoursMax:9,rateRegular:375,rateCash:350}]};
  const html=run(ex);
  check('preview: shows the FULL notes text',/Sleeper sofa was disassembled/.test(html)&&/bring straps/.test(html));
  check('preview: has a Notes section',/Notes/.test(html));
  check('preview: shows Day 1 and Day 2',/Day 1/.test(html)&&/Day 2/.test(html));
  check('preview: shows per-day rate + movers (editable)',/value="375"/.test(html)&&/Movers/.test(html));
  check('preview: shows shared fuel + materials (editable)',/value="450"/.test(html)&&/value="50"/.test(html));
  check('preview: has the Apply button wired',/applyBookingExtract\(window\._ptbExtracted\)/.test(html));
  const html2=run({isMultiDay:false,date:'2026-06-15',movers:3,rateRegular:225});
  check('preview: single-day shows schedule + date',/Schedule/.test(html2)&&/2026-06-15/.test(html2));
  check('preview: notes is always an editable textarea',/<textarea oninput="_ptbEdit\('officeNotes'/.test(html2));
}

// 7) NEW editable preview: inputs render with edit handlers, and edits flow into window._ptbExtracted
{
  const editSrc=grab('function _ptbEdit(key,val)');
  const editDaySrc=grab('function _ptbEditDay(i,key,val)');
  const previewSrc=grab('function _renderBookingExtractPreview(ex)');
  let captured='';
  const doc={getElementById:()=>({set innerHTML(v){captured=v;},get innerHTML(){return captured;}})};
  const win={};
  new Function('document','window','isNaN','String','Array','Number',previewSrc+'\n;_renderBookingExtractPreview('+JSON.stringify({isMultiDay:false,date:'2026-06-15',movers:3,rateRegular:225,officeNotes:'note'})+');')(doc,win,isNaN,String,Array,Number);
  check('editable: renders inputs with _ptbEdit handlers',/oninput="_ptbEdit\('rateRegular',this\.value\)"/.test(captured));
  check('editable: notes is an editable textarea',/<textarea oninput="_ptbEdit\('officeNotes'/.test(captured));
  check('editable: input pre-filled with extracted value',/value="225"/.test(captured));
  const editRunner=(exObj,calls)=>{
    const w={_ptbExtracted:exObj};
    return new Function('window','Number','Array',editSrc+'\n'+editDaySrc+'\n'+calls+'\nreturn window._ptbExtracted;')(w,Number,Array);
  };
  const r1=editRunner({movers:3,rateRegular:225,days:null},"_ptbEdit('rateRegular','999');_ptbEdit('customerName','Jane');");
  check('editable: _ptbEdit coerces numeric to Number',r1.rateRegular===999);
  check('editable: _ptbEdit keeps text as string',r1.customerName==='Jane');
  const r2=editRunner({isMultiDay:true,days:[{movers:5,rateRegular:375}]},"_ptbEditDay(0,'movers','7');_ptbEditDay(0,'rateRegular','400');");
  check('editable: _ptbEditDay edits the right day',r2.days[0].movers===7&&r2.days[0].rateRegular===400);
  check('editable: clearing a numeric field yields null',editRunner({feeFuel:60},"_ptbEdit('feeFuel','');").feeFuel===null);
}

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
