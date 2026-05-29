# LOCKED SECTIONS

**Purpose:** This file tracks parts of MoveDesk that are considered "done" and must not be changed without explicit unlock.

---

## ‼ MANDATORY READING FOR CLAUDE AT THE START OF EVERY SESSION ‼

If you are Claude reading this file at the start of a session: **stop, read every locked section below, and confirm to David that you have done so before making any changes.** Phrase your confirmation as: *"I have read LOCKED_SECTIONS.md. The currently locked sections are: [list]. I will not modify any of these without an explicit unlock."*

If at any point in this session David asks you to change something, you must first check whether the change would touch any locked section. If yes, **stop and ask for explicit unlock** before proceeding. Do not make the change.

**Unlock phrase (must be exact intent):** David says *"I am unlocking [section name] because..."* — only then can you change that section.

After any change to a locked section, you must re-run the listed test files against the modified code and confirm all assertions pass before declaring the work done.

---

## How locks work

- Each locked section has a clear scope, a list of invariants that must be preserved, and a test suite that verifies it works.
- A change that touches a locked section requires explicit unlock from David.
- Tests live in `/mnt/user-data/outputs/` and can be run with `node <filename>` against `index.html`.

---

## 🔒 CURRENTLY LOCKED SECTIONS 🔒

### 1. Build and Send — Single-Day Quote

**Locked on:** 2026-05-15 — Re-locked: 2026-05-21 (after office-notes-only refactor)
**Status:** LOCKED. Do not change without explicit unlock.

**Scope of what is locked:**
- The Quote Builder modal for single-day quotes (opening, editing, previewing)
- The save flow: `saveQuote()` function and its hard lock
- The send flow: `sendQuoteEmail()` re-snapshotting form state before send
- The customer's quote.html page rendering via `quote-page.js`'s `renderQuote()`
- The office Preview rendering via `renderQuoteHTML()`
- The resend flow: explicit Preview → Resend → Send with `{force:true}`
- The autosave behavior in the Quote Builder
- The cloud-sync merge behavior for quotes (`mergeTable` with `table==='quotes'`)

**What this section guarantees (invariants that must remain true):**

1. Customer sees the preview content. Office Preview and customer quote.html are byte-for-byte equivalent for the same quote object.
2. `saveQuote` deep-clones days and fees on every save.
3. **(STRENGTHENED 2026-05-26) Sent and accepted quotes are ABSOLUTELY IMMUTABLE.** The hard lock now refuses ALL writes to existing sent/accepted quotes unless `opts.fromSendButton===true` is passed. `force:true` alone is no longer sufficient. The ONLY caller authorized to pass `fromSendButton:true` is the explicit Send Email button in `sendQuoteEmail` (for double-click race protection). This is the root-cause fix for the Matt Fickett quote-corruption bug, where clicking Preview on a sent quote with default-state form values clobbered the saved data.
4. `saveQuote` bumps `_localEditedAt` on every save.
5. `sendQuoteEmail` re-snapshots from current form state by calling `saveQuote('sent', {fromSendButton:true})` before pushing to Supabase.
6. `sendQuoteEmail` cancels all autosave timers.
7. **(REPLACED 2026-05-26) `previewQuote` and `previewQuoteFromList` READ saved quotes directly for sent/accepted status** — they render from the saved object via `renderQuoteHTML`, never invoking `saveQuote`. For drafts only, Preview calls `saveQuote('draft')` (no force, no token) so latest edits are captured before display.
8. Quote merge in `refreshFromSupabase` respects `_localEditedAt`.
9. PublicId is stable across resends — but since sent quotes can no longer be edited, "resend" doesn't exist in the old sense. A new send to the same customer requires `cloneSentQuoteToDraft` which generates a fresh publicId. The old publicId on the old quote remains forever.
10. **(REPLACED 2026-05-26) Multiple sent quotes per lead are allowed.** "One quote per lead" no longer applies — when a user wants to send updated numbers, they click "Start new quote based on this one" which creates a sibling draft (separate id, separate publicId). Each sent quote becomes a permanent record.
11. **(2026-05-21) Customer-facing notes (`q.notes`) are NOT rendered on either the customer page OR the office Preview.** The `q.notes` data is still preserved for legacy quotes but the UI section is removed from both renderers.
12. **(2026-05-21) `qb-notes` textarea is hidden via `style="display:none"` and is NOT prefilled from `lead.notes`.** Field kept in DOM so legacy quote loads continue to populate the field without errors.
13. **(2026-05-21) `qb-office-notes` triggers `liveAutosaveNotes` for both 'quote' AND 'lead' source types** on every keystroke (debounced), so changes propagate to the lead + all linked records.
14. **(2026-05-21, updated to enforce single source of truth) Quote Builder reads `qb-office-notes` from `lead.officeNotes` ONLY** — never from `quote.officeNotes`. A stale quote synced in from the cloud cannot display wrong office notes. The denormalized `quote.officeNotes` field still exists for downstream consumers but is not the display source.
15. **(2026-05-21) Cloud sync runs an "OfficeNotes self-heal" after every merge** that forces every quote's, bookedJob's, and completedJob's `officeNotes` to match its lead's `officeNotes`. Stale data from the cloud gets corrected within the 60-second refresh cycle.
16. **(2026-05-21) Initial-load notes reconciliation also covers quotes and completedJob officeNotes** — page open / reload eliminates any pre-existing drift.
17. **(2026-05-22) `openQuoteBuilder` UNCONDITIONALLY sets `qb-office-notes.value` from `lead.officeNotes`** — no `!_qbOn.value` guard. The textarea is always force-loaded from the lead so that stale DOM content from a previous lead's Quote Builder session cannot bleed into the next lead. Same treatment for `qb-notes` (always force-cleared). This is the root-cause fix for the Ruari-style cross-customer contamination bug.
18. **(NEW 2026-05-26) `openQuoteBuilder` only opens DRAFTS for editing.** Sent and accepted quotes are NEVER auto-loaded into the editable Builder. If a lead has only sent/accepted quotes (no draft), `openQuoteBuilder` creates a fresh blank draft and shows the "prior sent quotes" banner pointing to the Estimates list.
19. **(NEW 2026-05-26) `cloneSentQuoteToDraft(sourceQuoteId)` is the ONLY way to send updated numbers based on a previous sent/accepted quote.** It deep-clones the source's editable data into a fresh quote with new `id`, new `publicId`, `status='draft'`, cleared `sentAt`/`acceptedAt`, and `clonedFromQuoteId` set for analytics. The source quote is left completely untouched — its publicId / customer link continues to return the original numbers indefinitely.
20. **(NEW 2026-05-26) Estimates list rows for sent/accepted quotes have NO Edit button.** Only Preview, "📋 New from this" (clone), and delete are shown. `openQuoteFromList` refuses to open sent/accepted quotes for editing and redirects to `previewQuoteFromList`.
21. **(NEW 2026-05-26) Quote Builder has a "prior sent quote" banner** (`#qb-prior-quote-banner`) that surfaces when there are sent/accepted quotes for this lead. Banner offers "View latest" and "📋 New based on latest" buttons. Rendered by `_renderPriorSentBanner(leadId, currentDraftId)`.

**Tests that guard this section:**
- `/mnt/user-data/outputs/quote_pipeline_test.js` (12 assertions)
- `/mnt/user-data/outputs/customer_view_test.js` (18 assertions)
- `/mnt/user-data/outputs/e2e_test.js` (30 assertions — includes the immutability USER STORY 2)
- `/mnt/user-data/outputs/office_notes_only_test.js` (32 assertions covering notes-only changes)
- `/mnt/user-data/outputs/office_notes_source_of_truth_test.js` (34 assertions covering single-source-of-truth + cross-customer fix)
- `/mnt/user-data/outputs/sent_quote_immutability_test.js` (42 assertions covering the absolute hard lock + clone-to-draft architecture)

**To unlock:** *"I am unlocking the Build and Send Single-Day Quote section because..."*

---

### 2. Customer Acceptance — Single-Day Quote

**Locked on:** 2026-05-15
**Status:** LOCKED. Do not change without explicit unlock.

**Scope of what is locked:**
- Customer-side `acceptQuote()` function in `quote-page.js`
- The Supabase PATCH that updates the quote row with `status:'accepted'` and `acceptedAt` timestamp
- The "Quote accepted!" thank-you message rendered on the customer's quote page after acceptance
- The EmailJS notification sent to `move@caremoremoving.com` when a customer accepts
- The office-side self-heal in `refreshFromSupabase()` that flips lead status to "Quote accepted"
- The toast surfacing on any page (not just dashboard) when the office user is online during acceptance

**Invariants:**
1. Customer can click Accept on their quote page.
2. Acceptance updates the Supabase quote row via PATCH with `status:'accepted'` and `acceptedAt`.
3. Customer's page re-renders to show the thank-you message.
4. Office receives an email at `move@caremoremoving.com` with subject "Quote accepted - [Name] ($min - $max)".
5. Email body includes the quote link.
6. Office lead status auto-flips from pre-acceptance state to "Quote accepted" within 60 seconds.
7. Status flip happens on any page, not just dashboard.
8. Status flip bumps `_statusChangedAt`.
9. Self-heal is idempotent — already-accepted or later-status leads are not touched.
10. Toast surfaces to the office user on the next render (🎉 [Name] accepted the quote).
11. **(NEW 2026-05-28) `acceptQuote` fetches the LATEST quote from Supabase BEFORE patching.** It does NOT write `window._currentQuote` back to Supabase — that would let a stale browser tab overwrite the real saved quote with old data. The PATCH body is built by merging only `{status:'accepted', acceptedAt}` onto the freshly-fetched cloud version. Root-cause fix for the Matt Fickett 2026-05-28 corruption where a customer's stale link locked in $115-$955 over the real $725-$1,145.
12. **(NEW 2026-05-28) `acceptQuote` is idempotent.** If the fetched cloud version already has `status==='accepted'` with an `acceptedAt`, it does not re-patch — it just re-renders the accepted page. Prevents a second click (or page reload) from updating `acceptedAt` to a later timestamp.
13. **(NEW 2026-05-28) `mergeTable` in `refreshFromSupabase` blocks status regressions on quotes.** A remote quote with `status:'draft'` cannot overwrite a local quote with `status:'sent'` or `'accepted'`. A remote `status:'sent'` cannot overwrite a local `status:'accepted'`. Status only ever moves forward (draft → sent → accepted). Backward moves are treated as cloud corruption and rejected with a `console.warn`.

**Tests that guard this section:**
- `/mnt/user-data/outputs/customer_acceptance_test.js` (21 assertions)
- `/mnt/user-data/outputs/corruption_prevention_test.js` (23 assertions — covers fixes #11, #12, #13)

**To unlock:** *"I am unlocking the Customer Acceptance Single-Day Quote section because..."*

---

### 3. Booking and Confirming — Single-Day Move

**Locked on:** 2026-05-15 — Re-locked: 2026-05-21 (after office-notes-only refactor) — Re-locked: 2026-05-28 (after confirmation-email date fix)
**Status:** LOCKED. Do not change without explicit unlock.

**Scope of what is locked:**
- `openBooking()` pre-fill behavior from accepted quote
- Draft booking system with `_draft` flag
- Draft restore: openBooking detects existing draft and restores user's typed values into the form
- The "Almost Done" checklist (calendar entry + confirmation email required before final commit)
- `bookingNextDone()` final commit that flips lead status to "Booked"
- `bookingNextCancel()` discard flow with tombstones
- View modal button logic: distinguishes "Continue booking" (draft exists) from "Send confirmation" (real booking)
- Confirmation email body assembly via `openConfirmEmail()` — booking-form values override quote values
- Calendar entry assembly via `buildJobCalUrl()` and `buildMoveDetailsBlock()` — same override
- Subject line on confirmation email uses booking-form date first
- Cached `_moveDetailsBlock` invalidated when booked job is edited

**Invariants:**
1. Booking form pre-fills from the accepted quote (date, time, movers, rates, fees, addresses, etc.).
2. Booking creates a DRAFT (`_draft: true`) — lead is NOT flipped to "Booked" until checklist done.
3. Reopening a lead with a draft brings you back to the booking FORM (not directly to confirmation email).
4. Draft restore preserves user's previously typed values (deposit, drive time, notes, etc.).
5. Draft restore preserves checklist progress (calendarAdded, confirmEmailSent flags).
6. View modal button: "Continue booking →" for drafts, "Send confirmation →" only for non-draft bookings.
7. Almost Done checklist requires BOTH calendar entry AND confirmation email before commit button activates.
8. Final commit (`bookingNextDone`) removes `_draft` flag, flips lead to "Booked", bumps `_statusChangedAt`.
9. Cancel (`bookingNextCancel`) discards the draft + creates a tombstone (cloud sync won't resurrect it).
10. Quote data is deep-cloned into the booked job (`quoteDays`, `quoteFees`, `quoteId`) so future quote edits cannot mutate the booking.
11. Confirmation email body uses booking-form values over quote values: `bj.movers`, `bj.rateRegular`, `bj.rateCash`, `bj.date`, `bj.time`, `bj.feeFuel`, `bj.feeMaterials`.
12. Calendar entry's "SENT TO CUSTOMER" block uses the same precedence (built from same `_moveDetailsBlock`).
13. Subject line: `bj.date || l.date` (single-day), `bj.date || q.days[0].date` (multi-day).
14. Editing a booked job invalidates the cached `_moveDetailsBlock` so the next regeneration uses the latest values.
15. Multi-day quotes: only Day 1 receives booking-form overrides; Days 2+ keep their per-day quote values.
16. **(NEW 2026-05-21) Booking form's `bj-crew-notes` and `bj-email-note` textareas are hidden via `style="display:none"`.** Customer-facing email content is composed manually in the confirmation email modal at send time.
17. **(NEW 2026-05-21) `bj-email-note` is NOT auto-prefilled from quote.notes or lead.notes.** The old "combine quote+lead notes" logic is removed. Field stays in DOM for legacy data only.
18. **(NEW 2026-05-21) `bj-office-notes` is NOT prefilled from `quote.officeNotes`** — lead is the single source of truth. The fallback `setIfEmpty('bj-office-notes',l.officeNotes||l.estimateOfficeNotes)` is the only prefill path. Stale quote data cannot leak into the booking form.
19. **(NEW 2026-05-21) Cloud sync's "OfficeNotes self-heal" also covers bookedJobs and completedJobs** — every linked record's `officeNotes` is forced to match its lead's after every merge.
20. **(NEW 2026-05-28) `openConfirmEmail` force-flushes the booking form into `bj` BEFORE building the email body.** Calls `bjWriteFields(bj)` synchronously when the `modal-booking-form` is open, so any pending autosave changes (the form has an 800ms debounce) are captured immediately rather than potentially after the email body is composed. Eliminates the race where a just-typed move date doesn't make it into the email.
21. **(NEW 2026-05-28) Customer-facing confirmation emails show the weekday alongside the date.** A dedicated `fmtDateWithDay` helper (formats as "Thursday, Jun 4, 2026") is used in: the single-day email body, the multi-day email body (each day), the additional-day email body and subject line, AND the calendar event description (`buildMoveDetailsBlock`, both branches) for consistency. The standard `fmtDate` (no weekday) remains the format for all office UI displays — lead cards, day chips, booking-next modal — where space is tight.

**Tests that guard this section:**
- `/mnt/user-data/outputs/booking_overrides_test.js` (28 assertions)
- `/mnt/user-data/outputs/booking_commit_test.js` (45 assertions)
- `/mnt/user-data/outputs/booking_pipeline_test.js` (70 assertions — 14 added 2026-05-28 for date fix + day-of-week format)
- `/mnt/user-data/outputs/office_notes_only_test.js` (32 assertions covering notes-only changes)
- `/mnt/user-data/outputs/office_notes_source_of_truth_test.js` (34 assertions covering single-source-of-truth fix)

**To unlock:** *"I am unlocking the Booking and Confirming Single-Day Move section because..."*

---

### 4. Scheduling an Estimate

**Locked on:** 2026-05-21
**Status:** LOCKED. Do not change without explicit unlock.

**Scope of what is locked:**
- The Schedule Estimate modal (open, prefill, save flow) — `openScheduleEstimate()` and `confirmScheduleEstimate()`
- The estimate confirmation email modal — `buildEstimateEmail()` body assembly + `doneEstimateEmail()` chaining
- The estimate Google Calendar prompt — `showEstimateCalPrompt()`, `markEstimateCalOpened()`, `buildCalUrl()`
- The status-flip gate: `finishScheduleEstimate()` flips lead.status to "Estimate scheduled"
- Reschedule detection: `estimateCalendarAdded` flag resets so user re-adds the new date

**What this section guarantees (invariants):**

1. Schedule Estimate form prefills from the lead: `estimateType`, `estimateScheduledDate` (existing or today+2 days), `estimateScheduledTime`, `estimateSetupBy`, `estimateOfficeNotes` (falling back to `officeNotes`).
2. Both "Send confirmation email" and "Add to calendar" checkboxes default to checked.
3. Required fields validated: estimate type, date, and setupBy.
4. Saving the form does NOT immediately flip lead status to "Estimate scheduled" — gating depends on which checkboxes are ticked.
5. If both checkboxes ticked: flow is `confirm → email modal → email-sent → cal prompt → cal-added → status flips`.
6. If only email ticked: status flips after `doneEstimateEmail`.
7. If only calendar ticked: status flips after `markEstimateCalOpened` and `finishScheduleEstimate`.
8. If neither ticked: status flips immediately on confirm.
9. `estimateSentBy` falls back to `estimateSetupBy` when not already set; existing `estimateSentBy` is never overwritten.
10. Closing the email modal without finishing means status stays at the previous value (data preserved, but no premature flip).
11. Rescheduling an already-scheduled estimate resets `estimateCalendarAdded` so the user re-adds for the new date; toast says "Estimate updated — please delete the old calendar event and add the new date".
12. Office notes typed in `sche-office-notes` sync to master `lead.officeNotes` (when non-empty). Blank sche-office-notes does NOT wipe an existing `lead.officeNotes`.
13. Customer-facing `sche-notes` field is HIDDEN (office-notes-only policy). The estimate email body does NOT auto-include `l.estimateNotes`.

**Tests that guard this section:**
- `/mnt/user-data/outputs/schedule_estimate_test.js` (40 assertions covering wiring + behavior simulation)

**To unlock:** *"I am unlocking the Scheduling an Estimate section because..."*

---

## Notes architecture (system-wide reference)

**Single source of truth: `lead.officeNotes`** — this is enforced at three layers:

1. **Display:** Quote Builder + Booking form ALWAYS read office notes from `lead.officeNotes`. The denormalized copies on `quote.officeNotes` and `bookedJob.officeNotes` are NOT used for display.
2. **Write:** Any change to office notes (in any modal) is applied to the lead first, then `propagateNotesEdits` pushes to all linked quotes/bookedJobs/completedJobs.
3. **Self-heal:** After every cloud sync (60s) AND on every page load, every quote/bookedJob/completedJob's `officeNotes` is forced to match its lead's `officeNotes`. Even if a stale row comes down from the cloud, the user sees corrected data immediately.

**(NEW 2026-05-22) `lead.notes` is fully DEPRECATED.** The office-notes-only consolidation:

- `saveLead` no longer writes to `l.notes`. The hidden `nl-notes` textarea is ignored.
- New leads are created with `notes:''`.
- The View Lead modal no longer renders the `l.notes` block — only "🔒 Office notes only".
- The Call Summary email body no longer auto-includes `l.notes`.
- `propagateNotesEdits` no longer reads or writes `lead.notes` from any source — completedJob.notes and bookedJob.emailNote are now their own independent fields (not tied to lead.notes).
- A one-time migration in `loadDB` and `refreshFromSupabase` silently merges any existing `l.notes` content into `l.officeNotes` (preserving both via blank-line separator if both have content). Idempotent.

After the 2026-05-22 fixes, notes flow like this:

- **Intake** — Customer's "additional notes" from the free quote form route into `lead.officeNotes` (NOT `lead.notes`). Set in `index.html` near line 9380.
- **Office editing** — `nl-office-notes`, `qb-office-notes`, `bj-office-notes` are the only visible notes fields. Each triggers `liveAutosaveNotes` on input → `propagateNotesEdits` pushes the change to lead → all linked quotes → all linked bookedJobs → all linked completedJobs.
- **Customer-facing** — `q.notes`, `bj.emailNote`, `nl-notes`, `qb-notes`, `bj-crew-notes`, `sche-notes`, `se-notes` are HIDDEN in the UI but kept in DOM/data for legacy records. NO auto-prefill from these anywhere. Customer-facing content is typed manually in the confirmation email modal at send time.
- **Customer page (`quote.html`)** — does NOT render `q.notes`.
- **Confirmation email body** — does NOT auto-include `bj.emailNote`. User types directly into the modal.
- **Call Summary email** — does NOT auto-include `l.notes`.

This is intentional: nothing the customer typed is auto-relayed back to them in quotes or confirmation emails. And nothing stale can show different office notes in different places — the self-heal guarantees consistency. The legacy `l.notes` field is preserved in old data but no longer read, written, displayed, or propagated anywhere.

---

## Pending review (David is testing before locking)

_(none yet)_

---

## Change log

- **2026-05-15** — Locked "Build and Send — Single-Day Quote" section.
- **2026-05-15** — Locked "Customer Acceptance — Single-Day Quote" section.
- **2026-05-15** — Locked "Booking and Confirming — Single-Day Move" section.
- **2026-05-21** — Unlocked sections 1 and 3 for the office-notes-only refactor. Refactor done: customer-facing notes fields hidden (kept in DOM for legacy data); intake routes customer notes → officeNotes; officeNotes propagator extended to include quotes; both sections re-locked with new invariants (3 added to section 1, 2 added to section 3).
- **2026-05-21** — Locked "Scheduling an Estimate" section after gap-fix (estimateNotes auto-include removed from email body, sche-notes hidden) — 40-assertion test suite added.
- **2026-05-21** — Unlocked sections 1 and 3 to fix the Tim Satron drift bug (stale `quote.officeNotes` from cloud was showing through to Quote Builder display). Fix: lead is the single source of truth — QB and booking form read from `lead.officeNotes` only, never from the denormalized copies. Cloud sync + initial load now self-heal any drifted copies. Both sections re-locked with updated invariants (3 added to section 1, 2 added to section 3). 27-assertion `office_notes_source_of_truth_test.js` added.
- **2026-05-22** — Unlocked section 1 to fix the Ruari cross-customer contamination bug. Root cause: `openQuoteBuilder` had `if(_qbOn && !_qbOn.value)` guard which preserved stale DOM textarea content between leads — typing notes for Customer A then opening Customer B's QB carried A's text into B's modal, and the next save permanently wrote A's notes to B's lead. Fix: unconditional load from `lead.officeNotes` (no DOM-state preservation). Same treatment for hidden `qb-notes` field. Re-locked with new invariant #17. Test suite extended: `office_notes_source_of_truth_test.js` now 34 assertions (up from 27), `office_notes_only_test.js` test updated to assert the unconditional clear.
- **2026-05-22** — `lead.notes` fully deprecated (office-notes-only consolidation). 5 fixes: (1) `saveLead` no longer reads `nl-notes` or writes `l.notes`; (2) View modal no longer renders `l.notes` block; (3) Call Summary email no longer auto-includes `l.notes`; (4) one-time migration in `loadDB` + `refreshFromSupabase` silently merges any existing `l.notes` content into `l.officeNotes`; (5) `propagateNotesEdits` no longer reads/writes `lead.notes` from any source. `cj.notes` and `bj.emailNote` are now their own independent fields, no longer tied to `lead.notes`. New `legacy_notes_deprecation_test.js` (34 assertions). All 13 suites passing (419 total).
- **2026-05-26** — Unlocked section 1 to fix the Matt Fickett quote-corruption bug. Root cause: Preview/Send paths used `{force:true}` to bypass the hard lock on sent quotes, so when a sent quote was opened with form defaults (load glitch, race, etc.), clicking Preview clobbered the saved quote with empty values. Fix is architectural — sent and accepted quotes are now ABSOLUTELY IMMUTABLE. The hard lock requires `{fromSendButton:true}` (not just force) to write to sent/accepted quotes, and only `sendQuoteEmail` passes that token. To send updated numbers, the user clones the sent quote to a fresh draft via `cloneSentQuoteToDraft` (new id, new publicId, deep-cloned editable data). The old quote stays untouched. Updated 8 invariants in section 1 (#3, #7, #9, #10 changed; #18, #19, #20, #21 new). New 42-assertion `sent_quote_immutability_test.js`. All 14 suites passing (461 total).
- **2026-05-28** — Unlocked Customer Acceptance section to fix the corruption that re-hit Matt Fickett's quote even after the immutability fix. Two root causes, both fixed: (1) the customer-side `acceptQuote` in `quote-page.js` was writing `window._currentQuote` (whatever the customer's browser had cached) back to Supabase — a customer with a stale tab could overwrite the real quote with old/corrupted data; fix now fetches the latest from Supabase first and merges only `{status, acceptedAt}` onto it, with idempotency to prevent double-clicks; (2) `mergeTable` in `refreshFromSupabase` was applying remote updates that regressed status (e.g. a cloud `draft` overwriting a local `sent`) — that path silently propagated corruption from any single broken row to all synced devices; fix blocks any backward status move (sent→draft, accepted→draft, accepted→sent) and logs a warning. New 23-assertion `corruption_prevention_test.js`. Added invariants #11, #12, #13 to Customer Acceptance section. All 16 suites passing (513 total).
- **2026-05-28** — Unlocked Booking and Confirming Single-Day Move section to fix the confirmation email date issue. Two fixes: (1) `openConfirmEmail` now force-flushes the booking form into `bj` synchronously (via `bjWriteFields`) before building the email body, so a freshly-typed move date is captured immediately rather than waiting on the 800ms autosave debounce; (2) new `fmtDateWithDay` helper added — used in the single-day email, multi-day email (each day), additional-day email body + subject, AND the calendar event description for consistency. The standard `fmtDate` (no weekday) is preserved for all office UI displays where space is tight. Added invariants #20 and #21 to Section 3. Extended `booking_pipeline_test.js` from 56 to 70 assertions covering wiring + behavior (e.g. "Thursday" appears in the weekday output for 2026-06-04). All 16 suites passing (527 total).
