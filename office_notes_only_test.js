// Tests for the "office notes only" refactor.
// Verifies: customer-facing notes fields hidden, intake routes to officeNotes, propagator
// pushes officeNotes across lead/quote/bookedJob/completedJob, customer-facing rendering
// (quote page + office preview) no longer shows customer-facing notes.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');
const customerJs = fs.readFileSync('/home/claude/quote-page.js', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// ─── PART A: Wiring tests (verify all the code changes are present) ───
console.log('PART A: Wiring + UI hides');

// A1: Customer's free-quote-form additional notes route to officeNotes
check('Intake: customer notes from quote form route to officeNotes (not lead.notes)',
  /route to OFFICE NOTES only/.test(indexHtml) &&
  /notes:'',\s*officeNotes:d\.notes\|\|''/.test(indexHtml.replace(/\n/g, ' '))
);

// A2: New lead form — nl-notes hidden, kept in DOM
check('New lead form: nl-notes textarea hidden via display:none',
  /nl-notes is HIDDEN/.test(indexHtml) &&
  /<textarea id="nl-notes" style="display:none"/.test(indexHtml)
);

// A3: Quote Builder — qb-notes hidden, kept in DOM
check('Quote Builder: qb-notes textarea hidden via display:none',
  /qb-notes is HIDDEN/.test(indexHtml) &&
  /<textarea id="qb-notes" style="display:none"/.test(indexHtml)
);

// A4: QB prefill no longer reads lead.notes into qb-notes (force-clears unconditionally now)
check('QB force-clears qb-notes unconditionally (no leak from previous lead session)',
  /qb-notes is hidden and unused[\s\S]{0,400}if\(_qbNotesEl\)_qbNotesEl\.value=''/.test(indexHtml) &&
  !/if\(_qbNotesEl&&!_qbNotesEl\.value\)/.test(indexHtml)
);

// A5: Booking form — bj-crew-notes and bj-email-note hidden
check('Booking form: bj-crew-notes hidden',
  /bj-crew-notes HIDDEN/.test(indexHtml) &&
  /<textarea id="bj-crew-notes" style="display:none"/.test(indexHtml)
);
check('Booking form: bj-email-note hidden',
  /bj-email-note HIDDEN/.test(indexHtml) &&
  /<textarea id="bj-email-note" style="display:none"/.test(indexHtml)
);

// A6: openBooking no longer combines quote/lead notes into bj-email-note
check('openBooking: bj-email-note auto-prefill removed',
  /bj-email-note auto-prefill REMOVED/.test(indexHtml) &&
  !/setIfEmpty\('bj-email-note',_combinedEmailNote\)/.test(indexHtml)
);

// A7: Customer quote page doesn't render q.notes
check('Customer quote page: q.notes section is disabled',
  /Notes \u2014 DISABLED/.test(customerJs) &&
  !/if\(q\.notes\)\{[\s\S]*?esc\(q\.notes\)/.test(customerJs)
);

// A8: Office preview (renderQuoteHTML) doesn't render q.notes — must match customer page
check('Office preview: q.notes section is disabled (matches customer page)',
  /Greeting \/ notes \u2014 DISABLED/.test(indexHtml)
);

// ─── PART B: Propagator wiring ───
console.log('');
console.log('PART B: Office notes propagator');

// B1: Propagator handles 'quote' source type
check('Propagator: handles sourceType="quote"',
  indexHtml.includes("sourceType==='quote'") &&
  /} else if\(sourceType==='quote'\)\{[\s\S]*?const qt=\(db\.quotes\|\|\[\]\)\.find/.test(indexHtml)
);

// B2: Propagator pushes officeNotes to all quotes for this lead
check('Propagator: pushes lead.officeNotes onto all matching quotes',
  /\(db\.quotes\|\|\[\]\)\.filter\(q=>q\.leadId===lead\.id\)\.forEach\(qt=>\{[\s\S]*?qt\.officeNotes=lead\.officeNotes/.test(indexHtml)
);

// B3: Propagator pushes officeNotes to completed jobs
check('Propagator: pushes officeNotes onto matching completed jobs',
  /cj\.officeNotes=lead\.officeNotes/.test(indexHtml)
);

// B4: liveAutosaveNotes handles 'quote' source
check('liveAutosaveNotes: handles sourceType="quote"',
  /} else if\(sourceType==='quote'\)\{[\s\S]*?const q=\(db\.quotes\|\|\[\]\)\.find/.test(indexHtml)
);

// B5: liveAutosaveNotes handles officeNotes on completed
check('liveAutosaveNotes: completed type accepts officeNotes too',
  /} else if\(sourceType==='completed'\)\{[\s\S]*?if\('officeNotes' in fieldsObj\)j\.officeNotes/.test(indexHtml)
);

// B6: QB office-notes textarea triggers propagation on input
check('QB office-notes input: triggers liveAutosaveNotes for quote + lead',
  /liveAutosaveNotes\('quote',currentQuoteId/.test(indexHtml) &&
  /liveAutosaveNotes\('lead',currentQuoteLeadId/.test(indexHtml)
);

// ─── PART C: Behavior simulation ───
console.log('');
console.log('PART C: Simulate propagator behavior with sample data');

// Replicate propagator logic standalone
function makePropagator(db) {
  return function propagate(sourceType, sourceId, fields) {
    fields = fields || {};
    let lead = null;
    if (sourceType === 'lead') {
      lead = (db.leads || []).find(l => l.id === sourceId);
    } else if (sourceType === 'booked') {
      const bj = (db.bookedJobs || []).find(j => j.id === sourceId);
      if (bj && bj.leadId) lead = (db.leads || []).find(l => l.id === bj.leadId);
      if (lead) {
        if ('emailNote' in fields) lead.notes = fields.emailNote || '';
        if ('officeNotes' in fields) lead.officeNotes = fields.officeNotes || '';
      }
    } else if (sourceType === 'quote') {
      const qt = (db.quotes || []).find(q => q.id === sourceId);
      if (qt && qt.leadId) lead = (db.leads || []).find(l => l.id === qt.leadId);
      if (lead && 'officeNotes' in fields) lead.officeNotes = fields.officeNotes || '';
    } else if (sourceType === 'completed') {
      const cj = (db.completedJobs || []).find(j => j.id === sourceId);
      if (cj) {
        const bj = cj.bookedJobId ? (db.bookedJobs || []).find(j => j.id === cj.bookedJobId) : null;
        if (bj && bj.leadId) lead = (db.leads || []).find(l => l.id === bj.leadId);
        if (!lead && cj.name && cj.date) lead = (db.leads || []).find(l => l.name === cj.name && l.date === cj.date);
        if (lead) {
          if ('notes' in fields) lead.notes = fields.notes || '';
          if ('officeNotes' in fields) lead.officeNotes = fields.officeNotes || '';
        }
      }
    }
    if (!lead) return;
    (db.quotes || []).filter(q => q.leadId === lead.id).forEach(qt => {
      qt.officeNotes = lead.officeNotes || '';
    });
    (db.bookedJobs || []).filter(j => j.leadId === lead.id).forEach(bj => {
      bj.emailNote = lead.notes || '';
      bj.officeNotes = lead.officeNotes || '';
    });
    (db.completedJobs || []).forEach(cj => {
      let isMatch = false;
      if (cj.bookedJobId) {
        const bj = (db.bookedJobs || []).find(j => j.id === cj.bookedJobId);
        if (bj && bj.leadId === lead.id) isMatch = true;
      }
      if (!isMatch && cj.name === lead.name && cj.date === lead.date) isMatch = true;
      if (isMatch) {
        cj.notes = lead.notes || '';
        cj.officeNotes = lead.officeNotes || '';
      }
    });
  };
}

// C1: Edit officeNotes on lead → propagates to quote, bookedJob, completedJob
{
  const db = {
    leads: [{ id: 'L1', name: 'Alice', date: '2026-06-15', officeNotes: '' }],
    quotes: [{ id: 'Q1', leadId: 'L1', officeNotes: '' }],
    bookedJobs: [{ id: 'B1', leadId: 'L1', officeNotes: '' }],
    completedJobs: [{ id: 'C1', bookedJobId: 'B1', officeNotes: '' }]
  };
  const propagate = makePropagator(db);
  db.leads[0].officeNotes = 'Tricky parking on Bush St';
  propagate('lead', 'L1', { officeNotes: 'Tricky parking on Bush St' });
  check('Lead → Quote propagation', db.quotes[0].officeNotes === 'Tricky parking on Bush St');
  check('Lead → BookedJob propagation', db.bookedJobs[0].officeNotes === 'Tricky parking on Bush St');
  check('Lead → CompletedJob propagation', db.completedJobs[0].officeNotes === 'Tricky parking on Bush St');
}

// C2: Edit officeNotes on bookedJob → propagates back to lead AND forward to quote + completed
{
  const db = {
    leads: [{ id: 'L2', name: 'Bob', date: '2026-06-16', officeNotes: 'old' }],
    quotes: [{ id: 'Q2', leadId: 'L2', officeNotes: 'old' }],
    bookedJobs: [{ id: 'B2', leadId: 'L2', officeNotes: 'old' }],
    completedJobs: [{ id: 'C2', bookedJobId: 'B2', officeNotes: 'old' }]
  };
  const propagate = makePropagator(db);
  db.bookedJobs[0].officeNotes = 'new info from booking';
  propagate('booked', 'B2', { officeNotes: 'new info from booking' });
  check('BookedJob → Lead back-propagation', db.leads[0].officeNotes === 'new info from booking');
  check('BookedJob → Quote propagation (via lead)', db.quotes[0].officeNotes === 'new info from booking');
  check('BookedJob → CompletedJob propagation', db.completedJobs[0].officeNotes === 'new info from booking');
}

// C3: Edit officeNotes on quote → propagates back to lead, forward to bookedJob + completed
{
  const db = {
    leads: [{ id: 'L3', name: 'Carol', date: '2026-06-17', officeNotes: 'old' }],
    quotes: [{ id: 'Q3', leadId: 'L3', officeNotes: 'old' }],
    bookedJobs: [{ id: 'B3', leadId: 'L3', officeNotes: 'old' }],
    completedJobs: []
  };
  const propagate = makePropagator(db);
  db.quotes[0].officeNotes = 'note from quote builder';
  propagate('quote', 'Q3', { officeNotes: 'note from quote builder' });
  check('Quote → Lead back-propagation', db.leads[0].officeNotes === 'note from quote builder');
  check('Quote → BookedJob propagation (via lead)', db.bookedJobs[0].officeNotes === 'note from quote builder');
}

// C4: Edit officeNotes on completed → propagates to lead, then forward
{
  const db = {
    leads: [{ id: 'L4', name: 'Dave', date: '2026-06-18', officeNotes: 'old' }],
    quotes: [{ id: 'Q4', leadId: 'L4', officeNotes: 'old' }],
    bookedJobs: [{ id: 'B4', leadId: 'L4', officeNotes: 'old' }],
    completedJobs: [{ id: 'C4', bookedJobId: 'B4', officeNotes: 'old' }]
  };
  const propagate = makePropagator(db);
  db.completedJobs[0].officeNotes = 'post-completion observation';
  propagate('completed', 'C4', { officeNotes: 'post-completion observation' });
  check('Completed → Lead back-propagation (via bookedJobId)', db.leads[0].officeNotes === 'post-completion observation');
  check('Completed → Quote propagation', db.quotes[0].officeNotes === 'post-completion observation');
  check('Completed → BookedJob propagation', db.bookedJobs[0].officeNotes === 'post-completion observation');
}

// C5: Multiple quotes for same lead all get the same officeNotes
{
  const db = {
    leads: [{ id: 'L5', name: 'Eve', date: '2026-06-19', officeNotes: '' }],
    quotes: [
      { id: 'Q5a', leadId: 'L5', officeNotes: '' },
      { id: 'Q5b', leadId: 'L5', officeNotes: '' }
    ],
    bookedJobs: [],
    completedJobs: []
  };
  const propagate = makePropagator(db);
  db.leads[0].officeNotes = 'shared note';
  propagate('lead', 'L5', { officeNotes: 'shared note' });
  check('Multiple quotes for one lead: all get the same officeNotes', 
    db.quotes[0].officeNotes === 'shared note' && db.quotes[1].officeNotes === 'shared note'
  );
}

// C6: Empty officeNotes propagates (clearing in one place clears everywhere)
{
  const db = {
    leads: [{ id: 'L6', name: 'Frank', date: '2026-06-20', officeNotes: 'previous note' }],
    quotes: [{ id: 'Q6', leadId: 'L6', officeNotes: 'previous note' }],
    bookedJobs: [{ id: 'B6', leadId: 'L6', officeNotes: 'previous note' }],
    completedJobs: []
  };
  const propagate = makePropagator(db);
  db.leads[0].officeNotes = '';
  propagate('lead', 'L6', { officeNotes: '' });
  check('Clearing officeNotes propagates (clears quote)', db.quotes[0].officeNotes === '');
  check('Clearing officeNotes propagates (clears bookedJob)', db.bookedJobs[0].officeNotes === '');
}

// ─── PART D: Intake routing (simulated) ───
console.log('');
console.log('PART D: Intake routing — customer notes go to officeNotes');

function makeNewLead(d) {
  return {
    id: 'X',
    name: d.name || '',
    notes: '',
    officeNotes: d.notes || '',
    status: 'New'
  };
}

// D1: Customer-submitted intake with notes → officeNotes
{
  const intake = { name: 'Customer A', notes: 'I have a piano on second floor' };
  const lead = makeNewLead(intake);
  check('Intake "we have a piano" → goes to lead.officeNotes', lead.officeNotes === 'I have a piano on second floor');
  check('Intake notes do NOT go to lead.notes (which is customer-facing)', lead.notes === '');
}

// D2: Empty intake notes → empty officeNotes
{
  const intake = { name: 'Customer B' };
  const lead = makeNewLead(intake);
  check('Empty intake notes → empty officeNotes', lead.officeNotes === '');
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
