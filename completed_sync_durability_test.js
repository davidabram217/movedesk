// Guard: completed-job local edits (e.g. Exclude-from-Accuracy) survive cloud sync
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

// saveDB stamps _localEditedAt on changed completed jobs
check('saveDB builds prev completed-job map',/const _prevCompById=\{\};/.test(script));
check('saveDB iterates db.completedJobs for edits',/\(db\.completedJobs\|\|\[\]\)\.forEach\(j=>\{/.test(script));
check('saveDB stamps _localEditedAt on completed-job change',/if\(changed\)j\._localEditedAt=_nowIso;/.test(script));

// mergeTable has a completedJobs guard
check('mergeTable has completedJobs branch',/if\(table==='completedJobs'&&local&&rec\)\{/.test(script));
check('completedJobs guard keeps local on newer _localEditedAt',/if\(table==='completedJobs'[\s\S]{0,260}if\(localEditIso>=remoteEditIso\)return;/.test(script));

// the merge call passes the table name so the guard activates
check('completedJobs merge call passes table name',/db\.completedJobs=mergeTable\(completedResFiltered,db\.completedJobs,'id','completedJobs'\);/.test(script));

// Behavioral: re-implement the guard decision and confirm a local edit beats a stale remote re-push
function localWins(local,remote,remoteTime){
  const localEditIso=local._localEditedAt||'';
  const remoteEditIso=remote._localEditedAt||'';
  if(localEditIso&&remoteEditIso){ if(localEditIso>=remoteEditIso)return true; }
  else if(localEditIso){ if(localEditIso>=remoteTime)return true; }
  return false;
}
// Scenario: user excluded locally at T2; another device re-pushed its stale copy (no flag) with a
// newer table updated_at T3 but an OLD _localEditedAt T1. Local edit must win.
const local={id:'c1',excludeFromAccuracy:true,_localEditedAt:'2026-06-10T10:00:00.000Z'};
const remoteStale={id:'c1',_localEditedAt:'2026-06-01T09:00:00.000Z'};
check('local exclude beats stale remote re-push (newer updated_at, older edit)',localWins(local,remoteStale,'2026-06-15T00:00:00.000Z')===true);
// Scenario: a genuinely newer remote edit (another device toggled it later) should win
const remoteNewer={id:'c1',_localEditedAt:'2026-06-12T12:00:00.000Z'};
check('genuinely newer remote edit wins',localWins(local,remoteNewer,'2026-06-12T12:00:00.000Z')===false);
// Scenario: local has no edit stamp -> remote may apply (no false protection)
check('unedited local does not falsely block remote',localWins({id:'c1'},remoteNewer,'2026-06-12T12:00:00.000Z')===false);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
