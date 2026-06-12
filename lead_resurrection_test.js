// Tests for the lead-resurrection fix: terminal-status merge guard + status stamps.
// Run: node lead_resurrection_test.js index.html
const fs=require('fs');
const file=process.argv[2]||'index.html';
const idx=fs.readFileSync(file,'utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
let pass=0,fail=0;
function check(n,c){if(c){pass++;}else{fail++;console.log('  ✗ '+n);}}

// ---- Functional: replicate the guard predicate exactly and verify behavior ----
function guardKeepsLocal(localStatus,remoteStatus,localIso,remoteIso){
  const _isTerminal=s=>s==='Booked'||s==='Completed'||s==='Did not book';
  if(_isTerminal(localStatus)&&!_isTerminal(remoteStatus)){
    const _remoteNewer=localIso&&remoteIso&&remoteIso>localIso;
    if(!_remoteNewer)return true; // keep local terminal — blocks resurrection
  }
  return false;
}
// Stale cloud tries to revert a booked lead → blocked
check('booked vs stale Estimate sent (older remote) → keep local',guardKeepsLocal('Booked','Estimate sent','2026-06-08T10:00:00Z','2026-06-01T10:00:00Z')===true);
// Completed lead, remote non-terminal with NO timestamp → keep local
check('completed vs non-terminal remote w/o stamp → keep local',guardKeepsLocal('Completed','Need to follow up','2026-06-08T10:00:00Z','')===true);
// Did not book, remote non-terminal equal timestamp → keep local
check('did-not-book vs equal-timestamp remote → keep local',guardKeepsLocal('Did not book','Estimate sent','2026-06-08T10:00:00Z','2026-06-08T10:00:00Z')===true);
// Genuine reactivation from another device (strictly newer remote) → allow remote
check('terminal vs strictly-newer reactivation → allow remote',guardKeepsLocal('Did not book','Estimate sent','2026-06-08T10:00:00Z','2026-06-09T10:00:00Z')===false);
// Local non-terminal, remote terminal (another device booked it) → guard inert
check('non-terminal local vs terminal remote → guard inert',guardKeepsLocal('Estimate sent','Booked','2026-06-08T10:00:00Z','2026-06-09T10:00:00Z')===false);
// Both terminal → guard inert (normal logic decides)
check('both terminal → guard inert',guardKeepsLocal('Booked','Completed','2026-06-08T10:00:00Z','2026-06-09T10:00:00Z')===false);
// Local terminal but NO local stamp + remote has stamp → still keep local (can't confirm reactivation)
check('terminal local w/o stamp vs remote-only stamp → keep local',guardKeepsLocal('Booked','Estimate sent','','2026-06-09T10:00:00Z')===true);

// ---- Structural: the guard is present in the merge ----
check('merge has terminal-status guard',/const _isTerminal=s=>s==='Booked'\|\|s==='Completed'\|\|s==='Did not book';/.test(script));
check('guard keeps local unless remote strictly newer',/if\(_isTerminal\(local\.status\)&&!_isTerminal\(rec\.status\)\)\{[\s\S]*?const _remoteNewer=localStatusIso&&remoteStatusIso&&remoteStatusIso>localStatusIso;[\s\S]*?if\(!_remoteNewer\)return;/.test(script));

// ---- Structural: every terminal/transition now stamps _statusChangedAt ----
check('confirmDidNotBook stamps _statusChangedAt',/l\.status='Did not book';\s*l\.statusUpdatedAt=[^\n]*\s*l\._statusChangedAt=new Date\(\)\.toISOString\(\);/.test(script));
check('reactivateLead stamps _statusChangedAt',/l\.statusUpdatedAt=new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\];\s*l\._statusChangedAt=new Date\(\)\.toISOString\(\);\s*\/\/ Clear did-not-book/.test(script));
check('completion stamps _statusChangedAt',/if\(lead\)\{lead\.status='Completed';lead\.statusUpdatedAt=[^\n]*lead\._statusChangedAt=new Date\(\)\.toISOString\(\);\}/.test(script));
check('booking still stamps _statusChangedAt (unchanged)',/l\.status='Booked';l\.statusUpdatedAt=[^\n]*l\._statusChangedAt=new Date\(\)\.toISOString\(\);/.test(script));

// ---- Guard: renderLeads still hides terminal statuses ----
check('renderLeads hides Booked/Completed/Did not book',/if\(l\.status==='Did not book'\|\|l\.status==='Booked'\|\|l\.status==='Completed'\)return false;/.test(script));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
