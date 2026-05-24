// Tests for the 2026-05-22 legacy l.notes deprecation.
// Locks in the office-notes-only invariant end-to-end: nothing reads, writes, displays,
// or relays the deprecated l.notes field anywhere user-facing or internally.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

console.log('PART A: saveLead no longer writes l.notes');
check('saveLead has deprecation comment for l.notes',
  /l\.notes \(the customer-facing legacy field\) is DEPRECATED/.test(indexHtml)
);
check('saveLead does NOT have an executable l.notes write from nl-notes',
  // The deprecation comment contains the removed line for documentation. Check that the
  // line isn't an actual statement (would have ; and be on its own line, not after "Removed:")
  !/^[\s]+l\.notes=document\.getElementById\('nl-notes'\)\.value\.trim\(\);$/m.test(indexHtml)
);
check('saveLead propagator call no longer carries notes field',
  /propagateNotesEdits\('lead',l\.id,\{officeNotes:l\.officeNotes\}\)/.test(indexHtml)
);

console.log('');
console.log('PART B: New lead creation writes notes:\'\' not from hidden DOM');
check('New lead creation has notes:\'\' (empty string)',
  /estimateNotes:'',notes:'',officeNotes:document\.getElementById\('nl-office-notes'\)/.test(indexHtml)
);
check('Draft save no longer reads nl-notes',
  /\/\/ notes deprecated — office-notes-only policy/.test(indexHtml)
);

console.log('');
console.log('PART C: View modal no longer displays l.notes');
check('View modal does NOT have an l.notes display block',
  !/\$\{l\.notes\?\`<div style="margin-top:12px;font-size:12\.5px"><div style="font-size:10\.5px;color:var\(--text3\);margin-bottom:2px">Notes<\/div>/.test(indexHtml)
);
check('View modal still displays l.officeNotes (Office notes block intact)',
  /\$\{l\.officeNotes\?`<div[^`]*🔒 Office notes only/.test(indexHtml)
);

console.log('');
console.log('PART D: Call Summary email no longer auto-includes l.notes');
check('Call Summary email body does NOT include l.notes content',
  !/\(l\.notes\?'\\nAdditional notes:\\n'\+l\.notes:''\)/.test(indexHtml)
);

console.log('');
console.log('PART E: One-time migration in loadDB merges l.notes → l.officeNotes');
check('loadDB has ONE-TIME MIGRATION block',
  /ONE-TIME MIGRATION: l\.notes → l\.officeNotes/.test(indexHtml)
);
check('Migration: when officeNotes is empty, takes l.notes content',
  /if\(!lon\)\{[\s\S]{0,100}l\.officeNotes=ln;/.test(indexHtml)
);
check('Migration: when both have content, merges with blank line separator',
  /l\.officeNotes=lon\+'\\n\\n'\+ln/.test(indexHtml)
);
check('Migration: clears l.notes after merging',
  /l\.notes='';[\s\S]{0,150}_legacyMigrated\+\+/.test(indexHtml)
);
check('Migration: idempotent (skips if l.notes is empty)',
  /if\(!ln\)return;[\s\S]{0,150}migrate/.test(indexHtml)
);

console.log('');
console.log('PART F: refreshFromSupabase also runs the migration');
check('Refresh-time migration block exists',
  /LEGACY NOTES MIGRATION/.test(indexHtml)
);
check('Refresh migration logs what it did',
  /Refresh-time migration: '\+_legacyMigratedRefresh\+' lead/.test(indexHtml)
);

console.log('');
console.log('PART G: Propagator no longer mirrors lead.notes anywhere');
check('Propagator: booked source no longer writes lead.notes from emailNote',
  !/lead\.notes=fields\.emailNote/.test(indexHtml)
);
check('Propagator: completed source no longer writes lead.notes from notes',
  !/lead\.notes=fields\.notes/.test(indexHtml)
);
check('Propagator: forward propagation no longer writes bj.emailNote=lead.notes',
  !/bj\.emailNote=lead\.notes/.test(indexHtml)
);
check('Propagator: forward propagation no longer writes cj.notes=lead.notes',
  !/cj\.notes=lead\.notes/.test(indexHtml)
);
check('Propagator: STILL propagates officeNotes to quotes',
  /qt\.officeNotes=lead\.officeNotes/.test(indexHtml)
);
check('Propagator: STILL propagates officeNotes to bookedJobs',
  /bj\.officeNotes=lead\.officeNotes/.test(indexHtml)
);
check('Propagator: STILL propagates officeNotes to completedJobs',
  /cj\.officeNotes=lead\.officeNotes/.test(indexHtml)
);
check('Propagator: deprecation comment present',
  /l\.notes is DEPRECATED/.test(indexHtml)
);

console.log('');
console.log('PART H: Migration logic — behavioral simulation');

function runMigration(leads) {
  let migrated = 0;
  leads.forEach(l => {
    if (!l) return;
    const ln = typeof l.notes === 'string' ? l.notes.trim() : '';
    const lon = typeof l.officeNotes === 'string' ? l.officeNotes.trim() : '';
    if (!ln) return;
    if (!lon) {
      l.officeNotes = ln;
    } else if (lon.indexOf(ln) >= 0) {
      // already contains
    } else {
      l.officeNotes = lon + '\n\n' + ln;
    }
    l.notes = '';
    migrated++;
  });
  return migrated;
}

// H1: Ruari case — both fields have content, merge
{
  const leads = [{ id: 'R', notes: 'There\'s not much furniture', officeNotes: 'sent video to daves phone' }];
  const n = runMigration(leads);
  check('Ruari case: migration count = 1', n === 1);
  check('Ruari case: officeNotes = office + blank line + legacy', leads[0].officeNotes === 'sent video to daves phone\n\nThere\'s not much furniture');
  check('Ruari case: notes cleared', leads[0].notes === '');
}

// H2: Only l.notes has content
{
  const leads = [{ id: 'L1', notes: 'Customer typed this', officeNotes: '' }];
  runMigration(leads);
  check('Notes-only: officeNotes takes l.notes content', leads[0].officeNotes === 'Customer typed this');
  check('Notes-only: notes cleared', leads[0].notes === '');
}

// H3: Only officeNotes has content
{
  const leads = [{ id: 'L2', notes: '', officeNotes: 'office content' }];
  const n = runMigration(leads);
  check('Office-only: migration count = 0 (nothing to migrate)', n === 0);
  check('Office-only: officeNotes unchanged', leads[0].officeNotes === 'office content');
}

// H4: Both empty
{
  const leads = [{ id: 'L3', notes: '', officeNotes: '' }];
  const n = runMigration(leads);
  check('Both empty: migration count = 0', n === 0);
}

// H5: Idempotent — running twice does nothing the second time
{
  const leads = [{ id: 'L4', notes: 'foo', officeNotes: '' }];
  runMigration(leads);
  const second = runMigration(leads);
  check('Idempotent: second run migrates 0 records', second === 0);
}

// H6: Skip duplicate content
{
  const leads = [{ id: 'L5', notes: 'same text', officeNotes: 'same text' }];
  runMigration(leads);
  check('Duplicate content: officeNotes not double-appended', leads[0].officeNotes === 'same text');
  check('Duplicate content: notes still cleared', leads[0].notes === '');
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
