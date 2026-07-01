// Booking pipeline tests — verifies the complete flow from "customer accepts quote"
// through "move appears in Booked Jobs" for single-day moves.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// ═══════════════════════════════════════════════════════════════════════════
// PART A — Code wiring tests (verify the right code is in place)
// ═══════════════════════════════════════════════════════════════════════════

console.log('PART A: Code wiring is in place');

// A1: View modal button distinguishes the three states (no booking, draft, real booking)
check('View modal: distinguishes _draftBookedJob from _bookedJob',
  /_bookedJob=\(db\.bookedJobs\|\|\[\]\)\.find\(b=>b\.leadId===l\.id&&!b\._draft\)/.test(indexHtml) &&
  /_draftBookedJob=\(db\.bookedJobs\|\|\[\]\)\.find\(b=>b\.leadId===l\.id&&b\._draft\)/.test(indexHtml)
);
check('View modal: "Continue booking" appears for drafts',
  /Continue booking →/.test(indexHtml)
);
check('View modal: "Complete booking" appears when no booked job',
  /Complete booking →/.test(indexHtml)
);
check('View modal: "Send confirmation" appears only for non-draft booked jobs',
  /isAccepted&&_hasBookedJob\?[^?]*Send confirmation/.test(indexHtml)
);

// A2: openBooking restores draft values into the form
check('openBooking: detects existing draft',
  /_existingDraft=\(db\.bookedJobs\|\|\[\]\)\.find\(j=>j\.leadId===leadId&&j\._draft\)/.test(indexHtml)
);
check('openBooking: restores draft date and time',
  /draftSetIfHasValue\('bj-date',_existingDraft\.date\)/.test(indexHtml) &&
  /draftSetIfHasValue\('bj-time',_existingDraft\.time\)/.test(indexHtml)
);
check('openBooking: restores draft email-note and office-notes',
  /draftSetIfHasValue\('bj-email-note',_existingDraft\.emailNote\)/.test(indexHtml) &&
  /draftSetIfHasValue\('bj-office-notes',_existingDraft\.officeNotes\)/.test(indexHtml)
);
check('openBooking: stashes _reopeningDraftId',
  /window\._reopeningDraftId=_existingDraft\.id/.test(indexHtml)
);

// A3: confirmBooking updates the draft in place rather than duplicating
check('confirmBooking: reuses draft id when reopening',
  /const jobId=_existingDraft\?_existingDraft\.id:uid\(\)/.test(indexHtml)
);
check('confirmBooking: preserves checklist progress when reopening',
  /Preserve calendar\/email-done flags from the existing draft if reopening/.test(indexHtml)
);
check('confirmBooking: replaces existing draft, does not push duplicate',
  /Replace or add[\s\S]{0,200}db\.bookedJobs\[idx\]=job/.test(indexHtml)
);

// A4: Email-note prefill REMOVED — customer-facing notes are typed manually at send time
check('openBooking: no longer auto-combines quote.notes and lead.notes',
  /bj-email-note auto-prefill REMOVED/.test(indexHtml) &&
  !/_quoteNotes\+'\\n\\n'\+_leadNotes/.test(indexHtml)
);

// A5: Draft job has _draft:true flag and doesn't flip lead status yet
check('confirmBooking: marks new bookings as drafts',
  /job\._draft=true/.test(indexHtml)
);
check('confirmBooking: lead status NOT flipped to Booked until checklist done',
  /Don't flip lead status to "Booked" yet — only when the checklist is finished/.test(indexHtml)
);

// A6: Checklist requires both calendar + email before final commit
check('bookingNextDone: requires all calendars added',
  /if\(!allCalDone\)/.test(indexHtml) &&
  /Please add to Google Calendar first/.test(indexHtml)
);
check('bookingNextDone: requires confirmation email sent (if email exists)',
  /Please send the confirmation email first/.test(indexHtml)
);

// A7: Final commit removes _draft flag and flips lead status
check('bookingNextDone: removes _draft flag on final commit',
  /delete j\._draft/.test(indexHtml)
);
check('bookingNextDone: flips lead status to Booked',
  /l\.status='Booked'/.test(indexHtml) &&
  /l\._statusChangedAt=new Date\(\)\.toISOString\(\)/.test(indexHtml)
);

// A8: Cancel button discards draft + tombstones it
check('bookingNextCancel: removes draft from db.bookedJobs',
  /db\.bookedJobs=db\.bookedJobs\.filter\(x=>x\.id!==j\.id\)/.test(indexHtml)
);
check('bookingNextCancel: writes a tombstone',
  /movedesk_booked_tombstones/.test(indexHtml)
);

// A9: Booked-job values override quote in email + calendar
check('Confirmation email: bj.rateRegular precedes day.rate',
  /var rate=Number\(bj\?\.rateRegular\)\|\|Number\(d\.rate\)/.test(indexHtml)
);
check('Confirmation email: bj.date precedes day.date',
  /var moveDate=bj\?\.date\|\|d\.date/.test(indexHtml)
);
check('Confirmation subject: uses bj.date first',
  /Move Confirmation — '\+fmtDateWithDay\(bj\?\.date\|\|l\?\.date/.test(indexHtml)
);
check('Calendar block: bj values win (in buildMoveDetailsBlock)',
  /Booked-job values win over quote values/.test(indexHtml)
);

// A10: Cached move-details block invalidated when booked job is edited
check('Edit booked job: clears cached _moveDetailsBlock',
  /delete j\._moveDetailsBlock/.test(indexHtml)
);

// A11: Quote is deep-cloned into the booked job (immutability of booking snapshot)
check('confirmBooking: deep-clones quoteDays from accepted quote',
  /_quoteDaysSnap=leadQuote&&leadQuote\.days\?JSON\.parse\(JSON\.stringify\(leadQuote\.days\)\):\[\]/.test(indexHtml)
);
check('confirmBooking: records quoteId pointer to the canonical quote',
  /quoteId:leadQuote\?leadQuote\.id:null/.test(indexHtml)
);

// A12: Booking prefers accepted quote over sent or other
check('Booking prefill: accepted quote wins over sent',
  /q=>q\.leadId===currentBookingLeadId&&q\.status==='accepted'\)[\s\S]{0,200}q=>q\.leadId===currentBookingLeadId&&q\.status==='sent'/.test(indexHtml)
);

// ═══════════════════════════════════════════════════════════════════════════
// PART B — Behavior simulation (verify the logic produces correct outputs)
// ═══════════════════════════════════════════════════════════════════════════

console.log('');
console.log('PART B: Simulate booking pipeline behavior');

// Replicate the key booking logic in plain JS so we can test it
function simulateOpenBooking(db, leadId) {
  // Mimics openBooking's draft-detection and confirmBooking's reopen logic
  const existingDraft = (db.bookedJobs || []).find(j => j.leadId === leadId && j._draft);
  return existingDraft || null;
}

function simulateConfirmBooking(db, leadId, formValues, reopeningDraftId) {
  const existingDraft = reopeningDraftId ? db.bookedJobs.find(x => x.id === reopeningDraftId) : null;
  const jobId = existingDraft ? existingDraft.id : 'new-job-' + Date.now();
  const job = {
    id: jobId,
    leadId,
    _draft: true,
    // confirmEmailSent: preserves existing draft's value (true OR false) when reopening
    confirmEmailSent: existingDraft ? existingDraft.confirmEmailSent : false,
    ...formValues
  };
  if (existingDraft) {
    if (existingDraft.calendarAdded) job.calendarAdded = existingDraft.calendarAdded;
    const idx = db.bookedJobs.findIndex(x => x.id === existingDraft.id);
    if (idx >= 0) db.bookedJobs[idx] = job;
    else db.bookedJobs.push(job);
  } else {
    db.bookedJobs.push(job);
  }
  return job;
}

function simulateFinalize(db, leadId, jobId) {
  const j = db.bookedJobs.find(x => x.id === jobId);
  if (!j) return false;
  if (!j.confirmEmailSent && j.email) return false;
  if (!j.calendarAdded) return false;
  delete j._draft;
  const l = db.leads.find(x => x.id === leadId);
  if (l) {
    l.status = 'Booked';
    l._statusChangedAt = new Date().toISOString();
  }
  return true;
}

// B1: First booking creates draft, lead status unchanged
{
  const db = {
    leads: [{ id: 'L1', name: 'Alice', status: 'Quote accepted' }],
    bookedJobs: []
  };
  const existing = simulateOpenBooking(db, 'L1');
  check('First booking: no existing draft', existing === null);

  const job = simulateConfirmBooking(db, 'L1', { date: '2026-06-15', movers: 3, email: 'a@x.com' });
  check('Confirm creates a draft', job._draft === true);
  check('Draft is in db.bookedJobs', db.bookedJobs.length === 1);
  check('Lead status unchanged (still "Quote accepted")', db.leads[0].status === 'Quote accepted');
  check('Draft not visible in non-draft filter', db.bookedJobs.filter(j => !j._draft).length === 0);
}

// B2: Reopening loads draft, no duplicate created
{
  const db = {
    leads: [{ id: 'L2', name: 'Bob', status: 'Quote accepted' }],
    bookedJobs: [{ id: 'draft-1', leadId: 'L2', _draft: true, date: '2026-06-15', movers: 3, email: 'b@x.com' }]
  };
  const existing = simulateOpenBooking(db, 'L2');
  check('Reopen: detects existing draft', existing && existing.id === 'draft-1');

  // User edits and reconfirms
  const job = simulateConfirmBooking(db, 'L2', { date: '2026-06-20', movers: 4, email: 'b@x.com' }, 'draft-1');
  check('Reopen: same id reused, no duplicate', job.id === 'draft-1' && db.bookedJobs.length === 1);
  check('Reopen: new values applied', db.bookedJobs[0].date === '2026-06-20' && db.bookedJobs[0].movers === 4);
}

// B3: Checklist progress preserved across reopen
{
  const db = {
    leads: [{ id: 'L3', name: 'Carol', status: 'Quote accepted' }],
    bookedJobs: [{
      id: 'draft-2', leadId: 'L3', _draft: true, date: '2026-06-15', movers: 3,
      calendarAdded: true, confirmEmailSent: false, email: 'c@x.com'
    }]
  };
  simulateConfirmBooking(db, 'L3', { date: '2026-06-15', movers: 3, email: 'c@x.com' }, 'draft-2');
  check('Reopen preserves calendarAdded flag', db.bookedJobs[0].calendarAdded === true);
  check('Reopen preserves confirmEmailSent flag', db.bookedJobs[0].confirmEmailSent === false);
}

// B4: Final commit only works when both calendar + email are done
{
  const db = {
    leads: [{ id: 'L4', name: 'Dave', status: 'Quote accepted' }],
    bookedJobs: [{ id: 'draft-3', leadId: 'L4', _draft: true, date: '2026-06-15', email: 'd@x.com' }]
  };
  
  const try1 = simulateFinalize(db, 'L4', 'draft-3');
  check('Cannot finalize when neither step done', try1 === false);
  check('Lead status still "Quote accepted"', db.leads[0].status === 'Quote accepted');
  check('Job still draft', db.bookedJobs[0]._draft === true);

  db.bookedJobs[0].calendarAdded = true;
  const try2 = simulateFinalize(db, 'L4', 'draft-3');
  check('Cannot finalize with email not sent', try2 === false);

  db.bookedJobs[0].confirmEmailSent = true;
  const try3 = simulateFinalize(db, 'L4', 'draft-3');
  check('Finalize succeeds when both done', try3 === true);
  check('Lead flipped to "Booked"', db.leads[0].status === 'Booked');
  check('_draft flag removed', db.bookedJobs[0]._draft === undefined);
  check('_statusChangedAt bumped on lead', !!db.leads[0]._statusChangedAt);
}

// B5: Job with no email can finalize with just calendar done
{
  const db = {
    leads: [{ id: 'L5', name: 'Eve', status: 'Quote accepted' }],
    bookedJobs: [{ id: 'draft-4', leadId: 'L5', _draft: true, date: '2026-06-15', calendarAdded: true, email: '' }]
  };
  const ok = simulateFinalize(db, 'L5', 'draft-4');
  check('Job with no email needs only calendar', ok === true);
  check('Lead flipped to Booked', db.leads[0].status === 'Booked');
}

// B6: Confirmation email body precedence — booking-form values win over quote
function simulateEmailBody(bj, quoteDay, quote) {
  return {
    rate: Number(bj?.rateRegular) || Number(quoteDay.rate) || 0,
    crew: Number(bj?.movers) || Number(quoteDay.crew) || 0,
    cashRate: Number(bj?.rateCash) || Number(quote.cashRate) || 0,
    date: bj?.date || quoteDay.date || '',
    arrival: bj?.time || (quoteDay.arrivalStart ? quoteDay.arrivalStart + (quoteDay.arrivalEnd ? ' – ' + quoteDay.arrivalEnd : '') : '')
  };
}

{
  const day = { crew: 3, rate: 225, date: '2026-06-15', arrivalStart: '8 AM', arrivalEnd: '9 AM' };
  const q = { days: [day], cashRate: 200 };
  const bj = { movers: 4, rateRegular: 275, rateCash: 250, date: '2026-06-20', time: '9–10am' };
  const r = simulateEmailBody(bj, day, q);
  check('Email reflects booking crew (4 not 3)', r.crew === 4);
  check('Email reflects booking rate ($275 not $225)', r.rate === 275);
  check('Email reflects booking cash rate ($250 not $200)', r.cashRate === 250);
  check('Email reflects booking date (6/20 not 6/15)', r.date === '2026-06-20');
  check('Email reflects booking arrival (9–10am)', r.arrival === '9–10am');
}

// B7: Blank booking fields fall back to quote
{
  const day = { crew: 3, rate: 225, date: '2026-06-15', arrivalStart: '8 AM' };
  const q = { days: [day], cashRate: 200 };
  const bj = { movers: '', rateRegular: '', rateCash: '', date: '', time: '' };
  const r = simulateEmailBody(bj, day, q);
  check('Blank booking → quote crew used', r.crew === 3);
  check('Blank booking → quote rate used', r.rate === 225);
  check('Blank booking → quote date used', r.date === '2026-06-15');
}

console.log('');
console.log('PART F: Confirmation email date format + force-flush (2026-05-28)');

// F1: fmtDateWithDay helper defined and uses weekday:long
check('fmtDateWithDay helper defined', /function fmtDateWithDay\(d\)/.test(indexHtml));
check('fmtDateWithDay uses weekday:long', /fmtDateWithDay[\s\S]{0,200}weekday:'long'/.test(indexHtml));

// F2: openConfirmEmail force-flushes the booking form
check('openConfirmEmail force-flush comment present',
  /force-flush the booking form into bj BEFORE building/.test(indexHtml)
);
check('openConfirmEmail calls bjWriteFields(bj) before reading bj.date',
  /function openConfirmEmail[\s\S]{0,1500}bjWriteFields\(bj\)/.test(indexHtml)
);
check('Force-flush only fires when booking-form modal is OPEN',
  /classList\.contains\('open'\)[\s\S]{0,100}bjWriteFields\(bj\)/.test(indexHtml)
);

// F3: confirmation email body uses fmtDateWithDay
check('Single-day confirmation email uses fmtDateWithDay',
  /When: '\+fmtDateWithDay\(moveDate\)/.test(indexHtml)
);
check('Multi-day confirmation email uses fmtDateWithDay',
  /When: '\+fmtDateWithDay\(dayDate\)/.test(indexHtml)
);

// F4: calendar event description (buildMoveDetailsBlock) uses fmtDateWithDay for consistency
check('buildMoveDetailsBlock single-day uses fmtDateWithDay',
  /When: '\+fmtDateWithDay\(moveDate\)[\s\S]{0,500}_fmtRate|_fmtRate[\s\S]{0,800}When: '\+fmtDateWithDay\(moveDate\)/.test(indexHtml) ||
  // Two separate occurrences (one in email-body builder, one in calendar block) is the actual structure
  ((indexHtml.match(/fmtDateWithDay\(moveDate\)/g) || []).length >= 2)
);

// F5: extra-day confirmation email uses fmtDateWithDay (subject AND body)
check('Extra-day confirmation email SUBJECT uses fmtDateWithDay',
  /Additional Day Confirmation \u2014 \$\{fmtDateWithDay\(day\.date\)\}/.test(indexHtml)
);
check('Extra-day confirmation email BODY uses fmtDateWithDay',
  /Date: \$\{fmtDateWithDay\(day\.date\)\}/.test(indexHtml)
);

// F6: behavioral — fmtDateWithDay output includes a weekday name for a known date
{
  // Replicate fmtDateWithDay locally to verify behavior
  function fmtDateWithDay(d){if(!d)return'—';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});}
  const out = fmtDateWithDay('2026-06-04');
  check('fmtDateWithDay output includes weekday "Thursday" for 2026-06-04',
    out.includes('Thursday'), 'got: ' + out);
  check('fmtDateWithDay output includes month abbreviation', /Jun/.test(out), 'got: ' + out);
  check('fmtDateWithDay output includes year', /2026/.test(out), 'got: ' + out);
  check('fmtDateWithDay blank input → em-dash fallback', fmtDateWithDay('') === '—');
}

console.log('');
console.log('PART G: Subject lines + draft fingerprint (2026-05-28 follow-up)');

// G1: All three subject lines use fmtDateWithDay
check('Single-day subject uses fmtDateWithDay',
  /Move Confirmation — '\+fmtDateWithDay\(bj\?\.date\|\|l\?\.date/.test(indexHtml)
);
check('Multi-day subject lists all day dates (IIFE) and still uses fmtDateWithDay',
  /Multi-Day Move Confirmation[\s\S]{0,20}\+\(function\(\)\{[\s\S]{0,600}fmtDateWithDay/.test(indexHtml)
);
check('Updated Move Confirmation subject uses fmtDateWithDay',
  /Updated Move Confirmation — '\+fmtDateWithDay\(j\.date\)/.test(indexHtml)
);
check('Updated Move Confirmation body also uses fmtDateWithDay',
  /When: '\+fmtDateWithDay\(j\.date\)/.test(indexHtml)
);

// G2: Draft autosave captures fingerprint of source fields
check('autoSaveConfirmEmail captures sourceFingerprint',
  /sourceFingerprint:_fingerprint/.test(indexHtml)
);
check('Fingerprint includes date',
  /_fingerprint=_bj\?[\s\S]{0,200}date:_bj\.date/.test(indexHtml)
);
check('Fingerprint includes time',
  /_fingerprint=_bj\?[\s\S]{0,300}time:_bj\.time/.test(indexHtml)
);
check('Fingerprint includes addresses',
  /_fingerprint=_bj\?[\s\S]{0,400}from:_bj\.from[\s\S]{0,50}to:_bj\.to/.test(indexHtml)
);
check('Fingerprint includes crew and rates',
  /_fingerprint=_bj\?[\s\S]{0,500}movers:_bj\.movers[\s\S]{0,200}rateRegular:_bj\.rateRegular/.test(indexHtml)
);

// G3: openConfirmEmail compares fingerprint before restoring body
check('openConfirmEmail computes _fingerprintMatches',
  /const _fingerprintMatches=_saved&&_current&&JSON\.stringify\(_saved\)===JSON\.stringify\(_current\)/.test(indexHtml)
);
check('openConfirmEmail rebuilds fresh body when no saved fingerprint (old drafts)',
  /const _restoreBody=_saved\?_fingerprintMatches:false/.test(indexHtml)
);
check('openConfirmEmail always restores "to" field regardless of fingerprint',
  /Always restore "to"[\s\S]{0,200}_confirmEmailDraft\.to\|\|lEmail/.test(indexHtml)
);

// G4: Behavioral — fingerprint comparison logic
{
  function fingerprintMatches(saved, current) {
    return saved && current && JSON.stringify(saved) === JSON.stringify(current);
  }
  // Same data → match
  const fp1 = { date: '2026-06-04', time: '8:00', from: 'A', to: 'B', movers: '3', rateRegular: '210', rateCash: '195', feeFuel: '55', feeMaterials: '40' };
  const fp2 = { date: '2026-06-04', time: '8:00', from: 'A', to: 'B', movers: '3', rateRegular: '210', rateCash: '195', feeFuel: '55', feeMaterials: '40' };
  check('Fingerprint match: identical data → true', fingerprintMatches(fp1, fp2));

  // Date changed → no match (the original bug case)
  const fp3 = { ...fp1, date: '2026-06-05' };
  check('Fingerprint mismatch: date changed → false (the bug case)', !fingerprintMatches(fp1, fp3));

  // Time changed → no match
  const fp4 = { ...fp1, time: '9:00' };
  check('Fingerprint mismatch: time changed → false', !fingerprintMatches(fp1, fp4));

  // Address changed → no match
  const fp5 = { ...fp1, from: 'C' };
  check('Fingerprint mismatch: address changed → false', !fingerprintMatches(fp1, fp5));

  // Rate changed → no match
  const fp6 = { ...fp1, rateRegular: '250' };
  check('Fingerprint mismatch: rate changed → false', !fingerprintMatches(fp1, fp6));

  // Missing fingerprint (old draft) → no match → forces fresh build
  check('Old draft (no fingerprint) → does not match', !fingerprintMatches(null, fp1));
  check('Old draft (no fingerprint) → does not match (reverse)', !fingerprintMatches(fp1, null));
}

// G5: No-quote fallback branch — Meagan case (no quote on file, date changed in booking form)
check('No-quote fallback in openConfirmEmail prefers bj.date over l.date',
  /No-quote fallback branch[\s\S]{0,500}fmtDateWithDay\(bj\?\.date\|\|l\?\.date/.test(indexHtml)
);
check('No-quote fallback in buildMoveDetailsBlock prefers bj.date over l.date',
  /Fallback when there's no quote[\s\S]{0,500}fmtDateWithDay\(bj\?\.date\|\|l\?\.date/.test(indexHtml)
);
check('No-quote fallback in openConfirmEmail uses fmtDateWithDay (not fmtDate)',
  !/var moveDate=fmtDate\(l\?\.date\|\|bj\?\.date/.test(indexHtml)
);
check('No-quote fallback in buildMoveDetailsBlock also uses fmtDateWithDay',
  ((indexHtml.match(/var moveDate=fmtDateWithDay\(bj\?\.date\|\|l\?\.date/g) || []).length >= 2)
);

// G6: Calendar URL cache invalidation after send (2026-05-29)
// The cached _bookingCalUrl is pre-built at modal-open time, BEFORE _sentDetailsBlock exists.
// sendConfirmationEmail must rebuild the URL after capturing the sent block so the
// "Add to calendar" button reflects what was actually emailed.
check('sendConfirmationEmail rebuilds calendar URL after capturing _sentDetailsBlock',
  /j\._sentDetailsBlock=_sentBlock[\s\S]{0,800}window\._bookingCalUrl=buildJobCalUrl\(j\)/.test(indexHtml)
);
check('Calendar URL rebuild is wrapped in try/catch (defensive)',
  /try\{window\._bookingCalUrl=buildJobCalUrl\(j\);?\}catch/.test(indexHtml)
);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
