// Guards the job-type ("move type") dropdown options across all six forms.
//
// 2026-07-15: David asked for "Load truck / pod" and "pack & move to storage" as job types.
// They already existed on the lead form + Quote Builder, but were missing from the four
// completion/AI dropdowns — the same drift that hit "Warehouse labor" on 2026-06-08.
//
// WHY LABELS MUST MATCH VERBATIM: the AI engine applies a HARD FILTER —
//   _cands = _cands.filter(j => _normMoveType(j.moveType) === _normMoveType(inputs.moveType))
// so a quote's move type can only learn from completed jobs whose move type normalizes to the
// SAME key. Different wording for the same job type = the AI silently sees zero comparable jobs.
// openComplete also prefills cj-movetype from the booked job / lead moveType; a <select> given a
// value with no matching <option> silently goes blank, so mismatched labels also lose data.
//
// Run: node job_type_options_test.js index.html
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// mirrors _normMoveType in index.html
const norm=s=>String(s||'').toLowerCase().replace(/&/g,'and').replace(/[^a-z ]/g,'').replace(/\s+/g,' ').trim();

function optionsOf(id){
  const i=src.indexOf('id="'+id+'"');
  if(i<0)return null;
  const close=src.indexOf('</select>',i);
  if(close<0)return null;
  const seg=src.slice(i,close);
  return (seg.match(/<option[^>]*>([^<]*)<\/option>/g)||[])
    .map(o=>o.replace(/<[^>]*>/g,'').trim())
    .filter(o=>o&&o!=='Select\u2026');
}

const IDS=['nl-move-type','qb-move-type','ai-movetype','cj-movetype','cjmd-movetype','ecjmd-movetype'];
IDS.forEach(id=>check(id+' exists',!!optionsOf(id)));

// ── The two types requested on 2026-07-15 must exist in EVERY dropdown ──
const REQUIRED=['Pack and move to storage','Load pod / truck only'];
IDS.forEach(id=>{
  const o=optionsOf(id)||[];
  REQUIRED.forEach(r=>check(id+' offers "'+r+'"',o.includes(r)));
});

// ── Warehouse labor parity (guards the 2026-06-08 fix from regressing) ──
IDS.forEach(id=>check(id+' offers "Warehouse labor"',(optionsOf(id)||[]).includes('Warehouse labor')));

// ── The new types must NORMALIZE identically everywhere, or the AI hard filter breaks ──
REQUIRED.forEach(r=>{
  const keys=IDS.map(id=>{
    const o=optionsOf(id)||[];
    const hit=o.find(x=>norm(x)===norm(r));
    return hit?norm(hit):null;
  });
  check('"'+r+'" normalizes to ONE key across all 6 forms',
    keys.every(k=>k!==null)&&new Set(keys).size===1);
});

// ── A completion-form type must exist for each lead type we just added ──
const lead=optionsOf('nl-move-type')||[];
const comp=(optionsOf('cj-movetype')||[]).map(norm);
REQUIRED.forEach(r=>{
  check('lead type "'+r+'" has a matching completion type (AI can correlate)',
    lead.includes(r)&&comp.includes(norm(r)));
});

// ── Behavioural: the AI hard filter now finds these jobs ──
const hardFilter=(want,jobs)=>jobs.filter(j=>norm(j.moveType)===norm(want));
const jobs=[
  {name:'pod job',moveType:'Load pod / truck only',actualHours:4},
  {name:'storage pack',moveType:'Pack and move to storage',actualHours:9},
  {name:'plain move',moveType:'Move',actualHours:6},
];
check('AI filter: a "Load pod / truck only" quote finds its completed jobs',
  hardFilter('Load pod / truck only',jobs).length===1);
check('AI filter: a "Pack and move to storage" quote finds its completed jobs',
  hardFilter('Pack and move to storage',jobs).length===1);
check('AI filter: types still do not contaminate each other',
  hardFilter('Move',jobs).length===1);

// ── KNOWN PRE-EXISTING DRIFT (documented, not fixed here) ──
// These lead/quote labels still have NO completion equivalent, so the AI hard filter can never
// match them. Renaming existing labels would strand historical completed-job data, so it needs a
// deliberate migration decision. This assertion documents the gap rather than asserting it away.
const STILL_MISMATCHED=['Pack and move','Move to storage','Move out of storage'];
const unmatched=STILL_MISMATCHED.filter(l=>lead.includes(l)&&!comp.includes(norm(l)));
check('known drift is unchanged (3 lead types still lack a completion equivalent)',
  unmatched.length===3);
if(unmatched.length)console.log('  \u2139 still mismatched (pre-existing, needs a migration decision): '+unmatched.join(', '));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
