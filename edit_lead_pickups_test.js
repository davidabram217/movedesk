// Guard: editing a lead must surface EVERY pickup/drop-off (not just the first) and round-trip them.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// ---- Extract + run the pure normalization helpers ----
const grab=(sig)=>{const i=src.indexOf(sig);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const ctx={};
new Function(grab('function _leadPickups(l)')+'\n'+grab('function _leadDropoffs(l)')+'\nthis._leadPickups=_leadPickups;this._leadDropoffs=_leadDropoffs;').call(ctx);
const {_leadPickups,_leadDropoffs}=ctx;

// A) Alison Ward: pickups live in loads[] (free quote form) — both must come back.
{
  const l={from:'68A Hancock St',loads:[{address:'68A Hancock St',access:'1 flight',parking:'Street parking'},{address:'2390 Mariner Square Dr',unit:'4089',access:'Elevator',parking:'Loading dock'}]};
  const p=_leadPickups(l);
  check('A: loads[] returns BOTH pickups',p.length===2);
  check('A: 2nd pickup is the Mariner Square address',p[1].address==='2390 Mariner Square Dr'&&p[1].access==='Elevator');
}
// B) Legacy shape: from + extraLoads.
{
  const l={from:'1 Main St',fromZip:'94103',accessLoad:'Flat',extraLoads:[{address:'2 Second St',access:'Elevator'}]};
  const p=_leadPickups(l);
  check('B: legacy from+extraLoads merges into one ordered list',p.length===2&&p[0].address==='1 Main St'&&p[1].address==='2 Second St');
  check('B: first pickup keeps its access/zip',p[0].access==='Flat'&&p[0].zip==='94103');
}
// C) Single pickup (from only).
{
  const p=_leadPickups({from:'Solo Address'});
  check('C: single from -> one pickup',p.length===1&&p[0].address==='Solo Address');
}
// D) No address -> empty (nothing to show).
{
  check('D: empty lead -> no pickups',_leadPickups({}).length===0);
  check('D: empty lead -> no dropoffs',_leadDropoffs({}).length===0);
}
// E) Drop-offs honor unloads[] then legacy to+extraUnloads.
{
  check('E: unloads[] preferred',_leadDropoffs({to:'x',unloads:[{address:'U1'},{address:'U2'}]}).length===2);
  check('E: legacy to+extraUnloads',_leadDropoffs({to:'T1',extraUnloads:[{address:'T2'}]}).map(u=>u.address).join(',')==='T1,T2');
}

// ---- Structural: open + save wiring ----
check('openEditLead clears stale extra blocks first',/function openEditLead[\s\S]{0,3000}resetExtraLocations\(\);/.test(src));
check('openEditLead rebuilds extra pickups from _leadPickups',/_leadPickups\(l\)[\s\S]{0,900}addLoadLocation\(\);/.test(src));
check('openEditLead rebuilds extra drop-offs from _leadDropoffs',/_leadDropoffs\(l\)[\s\S]{0,900}addUnloadLocation\(\);/.test(src));
check('saveLead (edit) collects extra locations',/const _ex=getExtraLocations\(\);\s*l\.extraLoads=_ex\.extraLoads;l\.extraUnloads=_ex\.extraUnloads;/.test(src));
check('saveLead (edit) rebuilds normalized l.loads',/l\.loads=\[\{address:l\.from,[\s\S]{0,200}\.\.\._ex\.extraLoads\]\.filter\(x=>x\.address\);/.test(src));
check('saveLead (edit) rebuilds normalized l.unloads',/l\.unloads=\[\{address:l\.to,[\s\S]{0,200}\.\.\._ex\.extraUnloads\]\.filter\(x=>x\.address\);/.test(src));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
