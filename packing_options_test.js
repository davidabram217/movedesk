// Guards the packing-scope vocabulary across all seven dropdowns.
//
// BACKGROUND (2026-07-15). The Quote Builder (`qb-packing`) offered "No — just moving | Full pack |
// Partial pack | Fragiles only | Kitchen pack | Unpack only" and stored its LABELS. Every other
// form offered a shorter set stored via value= attributes ("No" | "Kitchen pack only" |
// "All breakables" | "Full"). Three hand-rolled if/else chains bridged them, each losing data:
//   • "Partial pack"  -> "All breakables" (single-day) or "No" (multi-day — no partial branch!)
//   • "Fragiles only" -> "No — just moving"   <- packing work recorded as NO packing
//   • "Unpack only"   -> "No — just moving"   <- ditto
// The field feeds AI quote training, and packScope() selects "packing jobs" by excluding No/'' —
// so those jobs looked like plain moves with zero packing.
//
// FIX: "Partial pack", "Fragiles only", "Unpack only" are real options on every form, and ONE
// resolver (_canonPackingValue) replaces the three divergent chains.
// David's instruction: "existing ones are fine but lets make them separate options going forward"
// -> NO data migration. 'No' / 'Kitchen pack only' / 'All breakables' / 'Full' remain valid option
// values so historical records prefill exactly as before.
//
// Run: node packing_options_test.js index.html
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// Load the REAL resolver out of index.html rather than re-implementing it.
let P=null;
try{
  const i=src.indexOf('const _PACKING_OPTION_VALUES');
  const j=src.indexOf('function _canonPackingValue');
  let d=0,end=-1;
  for(let p=src.indexOf('{',j);p<src.length;p++){
    if(src[p]==='{')d++;else if(src[p]==='}'){d--;if(!d){end=p+1;break;}}
  }
  P=new Function(src.slice(i,end)+'\nreturn{_canonPackingValue,_PACKING_OPTION_VALUES};')();
}catch(e){}
check('the packing vocabulary block exists and evaluates',!!P);
if(!P){console.log('RESULTS: '+pass+' passed, '+(fail+1)+' failed');process.exit(1);}
const canon=P._canonPackingValue, OPTS=P._PACKING_OPTION_VALUES;

function optionsOf(id){
  const i=src.indexOf('id="'+id+'"');
  if(i<0)return null;
  const close=src.indexOf('</select>',i);
  if(close<0)return null;
  return (src.slice(i,close).match(/<option[^>]*>([^<]*)<\/option>/g)||[])
    .map(o=>o.replace(/<[^>]*>/g,'').trim()).filter(o=>o&&o!=='Select\u2026');
}

// ── 1. The three new options exist on every non-quote form ──
const FORMS=['nl-packing','ai-packing','cj-packing','cjmd-packing','ecj-packing','ecjmd-packing'];
const NEW=['Partial pack','Fragiles only','Unpack only'];
FORMS.forEach(id=>{
  const o=optionsOf(id);
  check(id+' exists',!!o);
  if(o)NEW.forEach(t=>check(id+' offers "'+t+'"',o.includes(t)));
});
// Quote Builder already had all three (which is why no Section 1 unlock was needed) — guard that.
const qb=optionsOf('qb-packing')||[];
NEW.forEach(t=>check('qb-packing still offers "'+t+'" (unchanged, locked section)',qb.includes(t)));

// ── 2. The ORIGINAL options survive — existing records must still prefill ──
['No — just moving','Kitchen pack only','All breakables','Full pack'].forEach(t=>{
  FORMS.forEach(id=>{
    const o=optionsOf(id)||[];
    check(id+' still offers "'+t+'"',o.includes(t));
  });
});

// ── 3. Quote wording now passes through instead of collapsing ──
[['No — just moving','No'],
 ['Full pack','Full'],
 ['Partial pack','Partial pack'],     // was "All breakables" (single) / "No" (multi)
 ['Fragiles only','Fragiles only'],   // was "No — just moving"
 ['Kitchen pack','Kitchen pack only'],
 ['Unpack only','Unpack only']        // was "No — just moving"
].forEach(function(p){
  check('quote "'+p[0]+'" records as "'+p[1]+'"',canon(p[0])===p[1]);
});

// ── 4. NO MIGRATION: existing stored values resolve to themselves ──
['No','Kitchen pack only','All breakables','Full'].forEach(v=>
  check('existing record "'+v+'" is unchanged',canon(v)===v));

// ── 5. The resolver can only ever return a REAL option (else the <select> blanks) ──
['No — just moving','Full pack','Partial pack','Fragiles only','Kitchen pack','Unpack only',
 'No','Kitchen pack only','All breakables','Full','','Full Pack','PARTIAL','fragiles',null,undefined
].forEach(v=>check('"'+String(v)+'" resolves to a real option ("'+canon(v)+'")',OPTS.indexOf(canon(v))>=0));
check('blank/unknown defaults to No',canon('')==='No'&&canon('wat')==='No');

// ── 6. Ordering trap: "Unpack only" must not be caught by the pack/full branches ──
check('"Unpack only" is not mistaken for a pack scope',canon('Unpack only')==='Unpack only');
check('"Full pack" still wins the full branch',canon('Full pack')==='Full');

// ── 7. All three translation chains are gone, replaced by the one resolver ──
check('openComplete uses the resolver',/_packEl\.value=_canonPackingValue\(_packPreset\)/.test(src));
check('openCompleteMultiDay uses the resolver',/_packEl\.value=_canonPackingValue\(_packScope\)/.test(src));
check('openEditCompletedJob uses the resolver',/_ecjPack\.value=_canonPackingValue\(j\.packing\)/.test(src));
check('no hand-rolled packing if/else chain survives',!/includes\('partial'\)\)_packEl\.value='All breakables'/.test(src));

// ── 8. The AI packing normalizer understands the new options ──
const i=src.indexOf('const _normPack=');
const seg=src.slice(i,i+700);
check('AI _normPack maps "fragile" -> breakables (else it scores as unknown)',/includes\('fragile'\)\)return 'breakables'/.test(seg));
check('AI _normPack treats "unpack" as unknown, not a pack scope',/includes\('unpack'\)\)return 'unknown'/.test(seg));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
