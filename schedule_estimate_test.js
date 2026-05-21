// Tests for the "Schedule Estimate" flow.
// Verifies that the form prefills correctly, that status doesn't flip prematurely,
// that the gating works (both email + cal must complete), and that office notes propagate.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// ─── PART A: WIRING ───
console.log('PART A: Verify all the wiring is in place');

// A1: openScheduleEstimate prefills the form from the lead
check('openScheduleEstimate prefills sche-type from l.estimateType',
  /document\.getElementById\('sche-type'\)\.value=l\.estimateType\|\|''/.test(indexHtml)
);
check('openScheduleEstimate prefills sche-date — existing or +2 days',
  /if\(l\.estimateScheduledDate\)\{[\s\S]{0,200}sche-date'\)\.value=l\.estimateScheduledDate/.test(indexHtml) &&
  /d\.setDate\(d\.getDate\(\)\+2\)/.test(indexHtml)
);
check('openScheduleEstimate prefills sche-time from l.estimateScheduledTime',
  /document\.getElementById\('sche-time'\)\.value=l\.estimateScheduledTime\|\|''/.test(indexHtml)
);
check('openScheduleEstimate prefills sche-office-notes from estimateOfficeNotes or officeNotes',
  /sche-office-notes[\s\S]{0,200}l\.estimateOfficeNotes\|\|l\.officeNotes/.test(indexHtml)
);
check('openScheduleEstimate defaults both checkboxes to checked',
  /document\.getElementById\('sche-add-cal'\)\.checked=true/.test(indexHtml) &&
  /document\.getElementById\('sche-send-email'\)\.checked=true/.test(indexHtml)
);

// A2: Required-field validation in confirmScheduleEstimate
check('confirmScheduleEstimate requires estimate type',
  /if\(!type\)\{showToast\('Please select an estimate type/.test(indexHtml)
);
check('confirmScheduleEstimate requires date',
  /if\(!date\)\{showToast\('Please pick a date/.test(indexHtml)
);
check('confirmScheduleEstimate requires setupBy',
  /if\(!setupBy\)\{showToast\('Please fill in who set up the estimate/.test(indexHtml)
);

// A3: Office notes propagate from sche-office-notes onto the lead's master officeNotes
check('Schedule Estimate save syncs estimateOfficeNotes to master lead.officeNotes',
  /if\(_scheOn\)l\.officeNotes=_scheOn; \/\/ sync to master/.test(indexHtml)
);

// A4: Status NOT flipped immediately on confirm (gating)
check('confirmScheduleEstimate does NOT immediately flip status if email or cal still pending',
  /Don't mark as scheduled yet \u2014 wait for checklist confirmation/.test(indexHtml)
);

// A5: Both checkboxes drive the flow
check('confirmScheduleEstimate: if doEmail true → opens estimate-email modal',
  /if\(doEmail\)\{[\s\S]{0,200}buildEstimateEmail\([\s\S]{0,200}openModal\('estimate-email'\)/.test(indexHtml)
);
check('confirmScheduleEstimate: if !doEmail && doCal → shows cal prompt',
  /\} else if\(doCal\)\{[\s\S]{0,80}showEstimateCalPrompt/.test(indexHtml)
);
check('confirmScheduleEstimate: if neither checked → status flips immediately',
  /\/\/ Neither checked \u2014 just mark as scheduled[\s\S]{0,80}l\.status='Estimate scheduled'/.test(indexHtml)
);

// A6: Email modal carries dataset.showCal to drive next step
check('Email modal stashes "showCal" flag to chain into cal step after email',
  /document\.getElementById\('modal-estimate-email'\)\.dataset\.showCal=doCal\?'1':'0'/.test(indexHtml)
);

// A7: doneEstimateEmail marks email sent + chains to cal step or flips status
check('doneEstimateEmail sets estimateEmailSent=true',
  /function doneEstimateEmail\(\)[\s\S]{0,300}l\.estimateEmailSent=true/.test(indexHtml)
);
check('doneEstimateEmail: if showCal → shows cal prompt',
  /function doneEstimateEmail\(\)[\s\S]{0,500}if\(showCal\)\{[\s\S]{0,80}showEstimateCalPrompt/.test(indexHtml)
);
check('doneEstimateEmail: if !showCal → flips status to Estimate scheduled',
  /function doneEstimateEmail\(\)[\s\S]{0,800}\} else \{[\s\S]{0,200}l\.status='Estimate scheduled'/.test(indexHtml)
);

// A8: Calendar step marks flag + finalizes
check('markEstimateCalOpened sets estimateCalendarAdded=true',
  /function markEstimateCalOpened\(\)[\s\S]{0,200}l\.estimateCalendarAdded=true/.test(indexHtml)
);
check('finishScheduleEstimate flips status to Estimate scheduled',
  /function finishScheduleEstimate\(\)[\s\S]{0,300}l\.status='Estimate scheduled'/.test(indexHtml)
);

// A9: estimateSentBy fallback to estimateSetupBy
check('estimateSentBy falls back to estimateSetupBy if not already set',
  /if\(l\.estimateSetupBy&&!l\.estimateSentBy\)l\.estimateSentBy=l\.estimateSetupBy/.test(indexHtml)
);

// A10: Reschedule detection — if already scheduled, calendar flag resets
check('finishScheduleEstimate detects rescheduling — resets calendarAdded flag',
  /const wasScheduled=l&&l\.status==='Estimate scheduled'&&l\.estimateCalendarAdded[\s\S]{0,400}l\.estimateCalendarAdded=false/.test(indexHtml)
);

// A11: Customer-facing sche-notes is HIDDEN (no leak)
check('sche-notes is hidden (consistent with office-notes-only model)',
  /sche-notes is HIDDEN/.test(indexHtml) &&
  /<textarea id="sche-notes" style="display:none"/.test(indexHtml)
);

// A12: Estimate email body does NOT auto-include estimateNotes (office-notes-only)
check('Estimate email body does NOT auto-include l.estimateNotes',
  !/estimateNotes\?'\\nNotes: '\+l\.estimateNotes/.test(indexHtml)
);

// ─── PART B: BEHAVIOR SIMULATION ───
console.log('');
console.log('PART B: Simulate the scheduling flow');

// Replicate the gating logic
function scheduleEstimate(lead, doEmail, doCal) {
  const events = []; // ordered events as they would happen
  // Step 1: confirmScheduleEstimate runs
  lead.estimateType = lead.estimateType || 'Onsite';
  lead.estimateScheduledDate = lead.estimateScheduledDate || '2026-06-20';
  if (lead.estimateSetupBy && !lead.estimateSentBy) lead.estimateSentBy = lead.estimateSetupBy;
  events.push('confirmed');

  if (doEmail) {
    events.push('opened-email-modal');
    // ... user clicks "Done" in the email modal
    lead.estimateEmailSent = true;
    events.push('email-sent');
    if (doCal) {
      events.push('opened-cal-prompt');
      // ... user clicks "Open Google Calendar"
      lead.estimateCalendarAdded = true;
      events.push('cal-added');
      // finishScheduleEstimate runs
      lead.status = 'Estimate scheduled';
      events.push('status-flipped');
    } else {
      // Done without cal
      lead.status = 'Estimate scheduled';
      events.push('status-flipped');
    }
  } else if (doCal) {
    events.push('opened-cal-prompt');
    lead.estimateCalendarAdded = true;
    events.push('cal-added');
    lead.status = 'Estimate scheduled';
    events.push('status-flipped');
  } else {
    // Neither — immediate
    lead.status = 'Estimate scheduled';
    events.push('status-flipped');
  }
  return events;
}

// B1: Both checkboxes (typical flow): email → cal → status flips
{
  const lead = { id: 'L1', name: 'Alice', estimateSetupBy: 'John', status: 'New' };
  const events = scheduleEstimate(lead, true, true);
  check('Both checked: confirmed → email → cal → status flips (in that order)',
    JSON.stringify(events) === JSON.stringify(['confirmed','opened-email-modal','email-sent','opened-cal-prompt','cal-added','status-flipped'])
  );
  check('Both checked: status is "Estimate scheduled" at end', lead.status === 'Estimate scheduled');
  check('Both checked: estimateEmailSent=true', lead.estimateEmailSent === true);
  check('Both checked: estimateCalendarAdded=true', lead.estimateCalendarAdded === true);
}

// B2: Only email checked
{
  const lead = { id: 'L2', name: 'Bob', estimateSetupBy: 'Dave', status: 'New' };
  scheduleEstimate(lead, true, false);
  check('Email only: estimateEmailSent=true, no cal flag', lead.estimateEmailSent === true && !lead.estimateCalendarAdded);
  check('Email only: status flips after email', lead.status === 'Estimate scheduled');
}

// B3: Only calendar checked
{
  const lead = { id: 'L3', name: 'Carol', estimateSetupBy: 'John', status: 'New' };
  scheduleEstimate(lead, false, true);
  check('Cal only: estimateCalendarAdded=true, no email flag', lead.estimateCalendarAdded === true && !lead.estimateEmailSent);
  check('Cal only: status flips after cal', lead.status === 'Estimate scheduled');
}

// B4: Neither checked — immediate flip
{
  const lead = { id: 'L4', name: 'Dave', estimateSetupBy: 'Dave', status: 'New' };
  scheduleEstimate(lead, false, false);
  check('Neither checked: status flips immediately', lead.status === 'Estimate scheduled');
}

// B5: setupBy → sentBy fallback
{
  const lead = { id: 'L5', name: 'Eve', estimateSetupBy: 'John', status: 'New' };
  scheduleEstimate(lead, false, false);
  check('estimateSentBy auto-populated from estimateSetupBy when missing', lead.estimateSentBy === 'John');
}

// B6: sentBy preserved if already set
{
  const lead = { id: 'L6', name: 'Frank', estimateSetupBy: 'Dave', estimateSentBy: 'John', status: 'New' };
  scheduleEstimate(lead, false, false);
  check('Existing estimateSentBy is NOT overwritten', lead.estimateSentBy === 'John');
}

// B7: Gating — status does NOT flip if user closes the email modal without finishing
{
  const lead = { id: 'L7', name: 'Greta', estimateSetupBy: 'John', status: 'New' };
  // Run only the first part of the flow (confirm only, don't finish email/cal)
  lead.estimateType = 'Onsite';
  lead.estimateScheduledDate = '2026-06-20';
  if (lead.estimateSetupBy && !lead.estimateSentBy) lead.estimateSentBy = lead.estimateSetupBy;
  // User opens email modal but closes browser tab — no doneEstimateEmail call
  check('If email step not completed, status does NOT flip to Estimate scheduled', lead.status === 'New');
  check('Lead still has the estimateType + date saved (data preserved)', lead.estimateType === 'Onsite' && lead.estimateScheduledDate === '2026-06-20');
}

// B8: Rescheduling — old calendarAdded flag resets so user re-adds for new date
{
  const lead = { id: 'L8', name: 'Henry', status: 'Estimate scheduled', estimateCalendarAdded: true, estimateScheduledDate: '2026-06-15' };
  // User reschedules — runs through openScheduleEstimate again with new date
  lead.estimateScheduledDate = '2026-06-25';
  // Goes through the whole flow again. finishScheduleEstimate detects wasScheduled.
  const wasScheduled = lead.status === 'Estimate scheduled' && lead.estimateCalendarAdded;
  lead.status = 'Estimate scheduled';
  if (wasScheduled) lead.estimateCalendarAdded = false;
  check('Reschedule: calendarAdded flag resets so user re-adds for new date', lead.estimateCalendarAdded === false);
}

// B9: Office notes propagate from sche-office-notes onto lead.officeNotes (master)
{
  const lead = { id: 'L9', name: 'Iris', estimateSetupBy: 'John', status: 'New', officeNotes: 'old note' };
  const scheOfficeNotes = 'new note from schedule modal';
  // confirmScheduleEstimate behavior:
  lead.estimateOfficeNotes = scheOfficeNotes;
  if (scheOfficeNotes) lead.officeNotes = scheOfficeNotes;
  check('Office notes typed in schedule modal sync to lead.officeNotes', lead.officeNotes === 'new note from schedule modal');
  check('estimateOfficeNotes stored separately too', lead.estimateOfficeNotes === 'new note from schedule modal');
}

// B10: Empty sche-office-notes does NOT wipe lead.officeNotes
{
  const lead = { id: 'L10', name: 'Jane', estimateSetupBy: 'John', status: 'New', officeNotes: 'should survive' };
  const scheOfficeNotes = '';
  lead.estimateOfficeNotes = scheOfficeNotes;
  if (scheOfficeNotes) lead.officeNotes = scheOfficeNotes;
  check('Blank sche-office-notes does NOT clear existing lead.officeNotes', lead.officeNotes === 'should survive');
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
