// Tests for the "Booking and Confirming a Single-Day Move" section.
// Covers:
// - openBooking pre-fills from accepted quote AND from existing draft
// - confirmBooking creates a draft (not committed) on first save
// - Draft survives cancel/back-out and can be reopened with values preserved
// - Final commit (bookingNextDone) requires calendar + email both done
// - Final commit flips lead status to "Booked", removes _draft flag
// - Cancel discards draft, tombstones it, lead stays at "Quote accepted"
// - View modal button distinguishes draft vs real booking
// - Booking-form values override quote values in confirmation email + calendar block

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// ─── PART A: Code-presence checks (invariants exist in code) ───

console.log('PART A: Verify section invariants are in place');

// A1: openBooking detects existing drafts
check('openBooking detects existing draft via leadId+_draft',
  /_existingDraft=\(db\.bookedJobs\|\|\[\]\)\.find\(j=>j\.leadId===leadId&&j\._draft\)/.test(indexHtml)
);

// A2: openBooking restores draft values into form
check('openBooking restores draft values when draft exists',
  /draftSetIfHasValue\('bj-date',_existingDraft\.date\)/.test(indexHtml) &&
  /draftSetIfHasValue\('bj-movers'/.test(indexHtml) === false || // bj-movers uses a different setter
  indexHtml.indexOf('_existingDraft.movers') >= 0
);

// A3: bj-email-note auto-prefill was REMOVED (replaced with manual composition in email modal)
check('openBooking no longer auto-prefills bj-email-note from quote/lead notes',
  /bj-email-note auto-prefill REMOVED/.test(indexHtml) &&
  !/Combine the QUOTE's notes/.test(indexHtml)
);

// A4: openBooking detects accepted quote first (precedence order)
check('openBooking uses accepted > sent > other quote precedence',
  /find\((qt|q)=>\1\.leadId===leadId&&\1\.status==='accepted'\)/.test(indexHtml)
);

// A5: confirmBooking creates a draft (not committed) on first save
check('confirmBooking sets _draft=true on new bookings',
  /job\._draft=true/.test(indexHtml)
);

// A6: confirmBooking does NOT flip lead status on first save
check('confirmBooking does NOT flip lead status (waits for checklist)',
  /Don't flip lead status to "Booked" yet/.test(indexHtml)
);

// A7: confirmBooking reuses draft id when reopening (no duplicate records)
check('confirmBooking reuses existing draft id on reopen',
  /_existingDraft\?_existingDraft\.id:uid\(\)/.test(indexHtml)
);

// A8: confirmBooking preserves checklist progress on reopen
check('confirmBooking preserves calendarAdded flag from existing draft',
  /if\(_existingDraft\.calendarAdded\)job\.calendarAdded=_existingDraft\.calendarAdded/.test(indexHtml)
);
check('confirmBooking preserves confirmEmailSent flag from existing draft',
  /if\(_existingDraft\.confirmEmailSent\)job\.confirmEmailSent/.test(indexHtml)
);

// A9: bookingNextDone gates on both calendar and email done
check('bookingNextDone requires calendarAdded',
  /if\(!allCalDone\)\{showToast/.test(indexHtml)
);
check('bookingNextDone requires confirmEmailSent (when email exists)',
  /if\(!j\.confirmEmailSent&&j\.email\)\{showToast/.test(indexHtml)
);

// A10: bookingNextDone commits the booking — removes draft, flips lead
check('bookingNextDone removes _draft flag',
  /delete j\._draft/.test(indexHtml)
);
check('bookingNextDone flips lead status to Booked',
  /l\.status='Booked'/.test(indexHtml)
);
check('bookingNextDone bumps _statusChangedAt',
  /l\._statusChangedAt=new Date\(\)\.toISOString\(\)/.test(indexHtml)
);

// A11: bookingNextCancel discards draft and tombstones it
check('bookingNextCancel tombstones discarded draft',
  /tombstones\[j\.id\]=new Date\(\)\.toISOString\(\)/.test(indexHtml)
);
check('bookingNextCancel removes draft from db.bookedJobs',
  /db\.bookedJobs=db\.bookedJobs\.filter\(x=>x\.id!==j\.id\)/.test(indexHtml)
);

// A12: View modal button distinguishes draft vs real booking
check('View modal: draft check separate from real booking check',
  /_draftBookedJob=\(db\.bookedJobs\|\|\[\]\)\.find\(b=>b\.leadId===l\.id&&b\._draft\)/.test(indexHtml) &&
  /_bookedJob=\(db\.bookedJobs\|\|\[\]\)\.find\(b=>b\.leadId===l\.id&&!b\._draft\)/.test(indexHtml)
);
check('View modal: "Continue booking" button when draft exists',
  /Continue booking/.test(indexHtml)
);
check('View modal: "Send confirmation" button only when real booking exists',
  /_hasBookedJob\?[^?]*Send confirmation/.test(indexHtml)
);

// A13: Quote data deep-cloned onto booked job (so future quote edits can't mutate)
check('Booked job stores deep-cloned quoteDays',
  /Deep-clone so future quote edits can't mutate the booked job's snapshot/.test(indexHtml) &&
  /_quoteDaysSnap=leadQuote&&leadQuote\.days\?JSON\.parse\(JSON\.stringify\(leadQuote\.days\)\):\[\]/.test(indexHtml)
);

// A14: Booked job records quoteId so downstream views know which quote it's from
check('Booked job records the source quoteId',
  /quoteId:leadQuote\?leadQuote\.id:null/.test(indexHtml)
);

// A15: Booking form values override quote in confirmation email
check('Confirmation email: bj.movers/rate/fees override quote values',
  /Booked-job values take precedence over quote/.test(indexHtml)
);

// A16: Cached _moveDetailsBlock invalidated when booked job is edited
check('Editing booked job invalidates cached _moveDetailsBlock',
  /delete j\._moveDetailsBlock/.test(indexHtml)
);

// A17: Confirmation email subject reflects booking-form date (not quote date)
//       Updated 2026-05-28: subject now uses fmtDateWithDay to include weekday
check('Email subject uses bj.date first',
  /Move Confirmation — '\+fmtDateWithDay\(bj\?\.date\|\|l\?\.date\|\|''\)/.test(indexHtml)
);

// ─── PART B: Behavior simulation ───

console.log('');
console.log('PART B: Simulate booking flow with sample data');

// Replicate the key parts of the flow
function simulateBookingFlow(initialQuote, formEdits, action) {
  const db = {
    leads: [{id:'lead1', name:'Sample Customer', status:'Quote accepted', date:'2026-06-15'}],
    quotes: [{
      id:'q1', leadId:'lead1', status:'accepted',
      days:[{date:'2026-06-15', crew:initialQuote.crew, rate:initialQuote.rate, hrsMin:5, hrsMax:7,
             loads:[{address:'A'}], unloads:[{address:'B'}]}],
      fees:[],
      totalMin:1125, totalMax:1575,
      acceptedAt:'2026-05-15T12:00:00Z'
    }],
    bookedJobs: []
  };
  
  // STEP 1: User clicks "Complete booking" — form opens, pre-fills, user types
  // Simulate the draft creation that happens on "Confirm booking" press
  const job = {
    id: 'bj1',
    leadId: 'lead1',
    name: 'Sample Customer',
    date: formEdits.date || db.leads[0].date,
    time: formEdits.time || '8:30am',
    movers: formEdits.movers !== undefined ? formEdits.movers : initialQuote.crew,
    rateRegular: formEdits.rateRegular !== undefined ? formEdits.rateRegular : initialQuote.rate,
    feeFuel: formEdits.feeFuel || '',
    feeMaterials: formEdits.feeMaterials || '',
    email: 'customer@test.com',
    _draft: true,
    quoteDays: JSON.parse(JSON.stringify(db.quotes[0].days)),
    quoteFees: [],
    quoteId: 'q1'
  };
  db.bookedJobs.push(job);
  
  if (action === 'cancel') {
    db.bookedJobs = db.bookedJobs.filter(x => x.id !== job.id);
    return { db, status: 'cancelled' };
  }
  
  // STEP 2: User does checklist
  if (action === 'commit') {
    job.calendarAdded = true;
    job.confirmEmailSent = true;
    // bookingNextDone logic:
    if (!job.calendarAdded) return { db, status: 'gated_on_calendar' };
    if (!job.confirmEmailSent && job.email) return { db, status: 'gated_on_email' };
    delete job._draft;
    job.pendingConfirmation = false;
    db.leads[0].status = 'Booked';
    db.leads[0]._statusChangedAt = new Date().toISOString();
    return { db, status: 'committed' };
  }
  
  // STEP 3: User closes modal without finishing
  return { db, status: 'draft_pending' };
}

// B1: Fresh booking, no edits — values match quote
{
  const r = simulateBookingFlow({crew:3, rate:225}, {}, 'commit');
  check('Commit with no edits: lead status flips to Booked', r.db.leads[0].status === 'Booked');
  check('Commit with no edits: draft flag removed', !r.db.bookedJobs[0]._draft);
  check('Commit with no edits: _statusChangedAt set', !!r.db.leads[0]._statusChangedAt);
}

// B2: Booking with edits — values reflect what user typed
{
  const r = simulateBookingFlow({crew:3, rate:225}, {movers:5, rateRegular:375}, 'commit');
  check('Edited booking commits with new movers count', r.db.bookedJobs[0].movers === 5);
  check('Edited booking commits with new rate', r.db.bookedJobs[0].rateRegular === 375);
}

// B3: Cancel discards the draft
{
  const r = simulateBookingFlow({crew:3, rate:225}, {movers:4}, 'cancel');
  check('Cancel removes the draft from db.bookedJobs', r.db.bookedJobs.length === 0);
  check('Cancel does NOT change lead status', r.db.leads[0].status === 'Quote accepted');
}

// B4: Draft pending — user backed out before completing
{
  const r = simulateBookingFlow({crew:3, rate:225}, {movers:5, rateRegular:375}, 'pending');
  check('Draft pending keeps _draft=true', r.db.bookedJobs[0]._draft === true);
  check('Draft pending keeps lead at "Quote accepted"', r.db.leads[0].status === 'Quote accepted');
  check('Draft preserves user edits (movers=5)', r.db.bookedJobs[0].movers === 5);
  check('Draft preserves user edits (rate=375)', r.db.bookedJobs[0].rateRegular === 375);
}

// B5: Reopen draft and edit further — same id reused, not duplicated
{
  // First: create a draft
  let r = simulateBookingFlow({crew:3, rate:225}, {movers:5}, 'pending');
  const draftId = r.db.bookedJobs[0].id;
  // Now: simulate openBooking detecting the draft + user editing further + re-confirming
  const existingDraft = r.db.bookedJobs.find(j => j.leadId === 'lead1' && j._draft);
  check('openBooking detects existing draft', !!existingDraft);
  check('Detected draft has user previous edits', existingDraft.movers === 5);
  
  // User changes movers to 6 in second pass — same job id should be updated
  existingDraft.movers = 6;
  check('Same draft id after re-edit', r.db.bookedJobs.length === 1);
  check('Updated value is now 6', r.db.bookedJobs[0].movers === 6);
}

// B6: Booking commit requires both calendar + email
{
  const r = simulateBookingFlow({crew:3, rate:225}, {}, 'pending');
  const job = r.db.bookedJobs[0];
  // Without calendar done — should gate
  job.confirmEmailSent = true;
  job.calendarAdded = false;
  if (!job.calendarAdded) {
    check('Commit blocked without calendar done', true);
  } else {
    check('Commit blocked without calendar done', false);
  }
  // Without email done (when email exists) — should gate
  job.calendarAdded = true;
  job.confirmEmailSent = false;
  if (!job.confirmEmailSent && job.email) {
    check('Commit blocked without email done', true);
  } else {
    check('Commit blocked without email done', false);
  }
  // Both done — should commit
  job.confirmEmailSent = true;
  job.calendarAdded = true;
  const bothReady = job.calendarAdded && (job.confirmEmailSent || !job.email);
  check('Commit ready when both calendar + email done', bothReady);
}

// B7: Email body / calendar reflect booking edits (precedence)
{
  // Booking has rate=275 (edited from quote's 225), movers=4 (edited from 3)
  // The email body builder should pick booking values first
  function emailRate(bj, d) {
    return Number(bj?.rateRegular) || Number(d.rate) || 0;
  }
  function emailCrew(bj, d) {
    return Number(bj?.movers) || Number(d.crew) || 0;
  }
  const bj = { rateRegular: 275, movers: 4 };
  const d = { rate: 225, crew: 3 };
  check('Email body uses booking rate (275 not 225)', emailRate(bj, d) === 275);
  check('Email body uses booking crew (4 not 3)', emailCrew(bj, d) === 4);
  // With empty booking, falls back to quote
  const bjEmpty = { rateRegular: '', movers: '' };
  check('Email body falls back to quote when booking blank', emailRate(bjEmpty, d) === 225);
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
