// Guards the job-type ("move type") vocabulary across all six dropdowns.
//
// BACKGROUND (2026-07-15). MoveDesk grew TWO divergent label sets for the same job types:
//   lead form + Quote Builder : Move | Pack and move | Packing only | Move to storage |
//                               Pack and move to storage | Move out of storage |
//                               Load pod / truck only | Warehouse labor | Internal
//   completion + AI forms     : Move | Move & Pack | Packing only | Storage In | Storage Out |
//                               Warehouse labor | Internal
// Two silent failures resulted:
//   1. The AI applies a HARD FILTER — a quote only learns from completed jobs whose move type
//      normalizes to the SAME key. "Pack and move", "Move to storage" and "Move out of storage"
//      matched NOTHING, so those quotes fell to the empty state despite a full job history.
//   2. openComplete prefills cj-movetype from the booked job / lead. A <select> given a value with
//      no matching <option> goes to selectedIndex -1 — the job type silently blanked at close-out.
//
// FIX: all six dropdowns standardized onto the lead/quote wording, PLUS an alias map so the legacy
// wording still normalizes to the same key (no data migration — historical records keep matching),
// PLUS _canonMoveTypeLabel so prefilling a <select> from a legacy record resolves to a real option
// instead of blanking.
//
// Run: node job_type_options_test.js index.html
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// Load the REAL vocabulary out of index.html rather than re-implementing it.
let V=null;
try{
  const i=src.indexOf('const _MOVE_TYPE_CANONICAL');
  const j=src.indexOf('function _canonMoveTypeLabel');
  let d=0,end=-1;
  for(let p=src.indexOf('{',j);p<src.length;p++){
    if(src[p]==='{')d++;else if(src[p]==='}'){d--;if(!d){end=p+1;break;}}
  }
  V=new Function(src.slice(i,end)+'\nreturn{_normMoveType,_canonMoveTypeLabel,_MOVE_TYPE_CANONICAL,_MOVE_TYPE_ALIASES};')();
}catch(e){}
check('the job-type vocabulary block exists and evaluates',!!V);
if(!V){console.log('RESULTS: '+pass+' passed, '+(fail+1)+' failed');process.exit(1);}
const norm=V._normMoveType, canon=V._canonMoveTypeLabel;

function optionsOf(id){
  const i=src.indexOf('id="'+id+'"');
  if(i<0)return null;
  const close=src.indexOf('</select>',i);
  if(close<0)return null;
  return (src.slice(i,close).match(/<option[^>]*>([^<]*)<\/option>/g)||[])
    .map(o=>o.replace(/<[^>]*>/g,'').trim()).filter(o=>o&&o!=='Select\u2026');
}

const IDS=['nl-move-type','qb-move-type','ai-movetype','cj-movetype','cjmd-movetype','ecjmd-movetype'];
const CANON=V._MOVE_TYPE_CANONICAL;

// ── 1. Every dropdown offers the identical canonical list ──
IDS.forEach(id=>{
  const o=optionsOf(id);
  check(id+' exists',!!o);
  if(o)check(id+' offers exactly the canonical list, in order',JSON.stringify(o)===JSON.stringify(CANON));
});
// 10 since 2026-08-19 — "Unload pod / truck only" added alongside the Load variant.
check('canonical list has all 10 types',CANON.length===10);
['Pack and move to storage','Load pod / truck only','Unload pod / truck only','Warehouse labor'].forEach(t=>
  check('canonical list includes "'+t+'"',CANON.includes(t)));
check('no dropdown still offers the legacy "Move & Pack"',!IDS.some(id=>(optionsOf(id)||[]).includes('Move & Pack')));
check('no dropdown still offers the legacy "Storage In"',!IDS.some(id=>(optionsOf(id)||[]).includes('Storage In')));
check('no dropdown still offers the legacy "Storage Out"',!IDS.some(id=>(optionsOf(id)||[]).includes('Storage Out')));

// ── 2. LEGACY wording still normalizes to the canonical key (no data migration) ──
// This is what stops the standardization from stranding every pre-2026-07-15 completed job.
[['Move & Pack','Pack and move'],
 ['Storage In','Move to storage'],
 ['Storage Out','Move out of storage'],
 ['Move','Move'],
 ['Packing only','Packing only'],
 ['Warehouse labor','Warehouse labor'],
 ['Internal','Internal'],
 ['Pack and move to storage','Pack and move to storage'],
 ['Load pod / truck only','Load pod / truck only']
].forEach(function(p){
  check('legacy "'+p[0]+'" still matches canonical "'+p[1]+'"',norm(p[0])===norm(p[1]));
});

// ── 3. Every canonical type normalizes to a UNIQUE key (no accidental collisions) ──
check('all 10 canonical types have distinct keys',new Set(CANON.map(norm)).size===10);
// norm() strips punctuation, so Load/Unload must stay distinguishable or historic pod jobs
// would be silently recategorised.
check('"Load pod / truck only" does not collide with "Unload pod / truck only"',
  norm('Load pod / truck only')!==norm('Unload pod / truck only'));
check('"Move" does not collide with "Move to storage"',norm('Move')!==norm('Move to storage'));
check('"Pack and move" does not collide with "Pack and move to storage"',
  norm('Pack and move')!==norm('Pack and move to storage'));

// ── 4. _canonMoveTypeLabel resolves legacy -> a REAL option (or the select blanks) ──
['Move & Pack','Storage In','Storage Out'].forEach(function(l){
  const r=canon(l);
  check('"'+l+'" resolves to a canonical option ("'+r+'")',CANON.indexOf(r)>=0);
});
check('canonical input is returned unchanged',canon('Move to storage')==='Move to storage');
check('blank input stays blank',canon('')===''&&canon(null)==='');
check('unknown value passes through (no worse than before)',canon('Something Odd')==='Something Odd');

// ── 5. The prefill points actually USE the resolver ──
check('openComplete prefill canonicalizes',/_movetypeEl\.value=_canonMoveTypeLabel\(_pick\(j\.moveType,_lead/.test(src));
check('openCompleteMultiDay prefill canonicalizes',/_movetypeEl\.value=_canonMoveTypeLabel\(_pick\(j\.moveType,_l\?/.test(src));
check('edit-multi-day prefill canonicalizes (reads COMPLETED jobs — the legacy hotspot)',
  /_setVal\('ecjmd-movetype',_canonMoveTypeLabel\(j\.moveType\)\)/.test(src));
check('lead form prefill canonicalizes',/'nl-move-type'\)\.value=_canonMoveTypeLabel\(l\.moveType\)/.test(src));

// ── 6. The alias map must never be emptied ──
check('alias map retains the legacy completion wording',
  V._MOVE_TYPE_ALIASES['move and pack']==='pack and move'&&
  V._MOVE_TYPE_ALIASES['storage in']==='move to storage'&&
  V._MOVE_TYPE_ALIASES['storage out']==='move out of storage');

// ── 7. Behavioural: the AI hard filter now sees legacy history ──
const hardFilter=(want,jobs)=>jobs.filter(j=>norm(j.moveType)===norm(want));
const history=[
  {name:'legacy storage-in',moveType:'Storage In',actualHours:7},   // recorded pre-fix
  {name:'legacy pack+move',moveType:'Move & Pack',actualHours:9},   // recorded pre-fix
  {name:'new storage',moveType:'Move to storage',actualHours:6},    // recorded post-fix
  {name:'plain move',moveType:'Move',actualHours:5},
  {name:'pod job',moveType:'Load pod / truck only',actualHours:4},
  {name:'storage pack',moveType:'Pack and move to storage',actualHours:11},
];
check('AI: a "Move to storage" quote now finds BOTH the legacy and the new job',
  hardFilter('Move to storage',history).length===2);
check('AI: a "Pack and move" quote now finds the legacy "Move & Pack" job',
  hardFilter('Pack and move',history).map(j=>j.name).join()==='legacy pack+move');
check('AI: "Load pod / truck only" finds its job',hardFilter('Load pod / truck only',history).length===1);
check('AI: "Pack and move to storage" finds its job',hardFilter('Pack and move to storage',history).length===1);
check('AI: "Move" is NOT contaminated by storage jobs',
  hardFilter('Move',history).map(j=>j.name).join()==='plain move');
check('AI: storage-in and storage-out stay separate',
  hardFilter('Move out of storage',history).length===0);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
