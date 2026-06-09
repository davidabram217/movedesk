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

**Locked on:** 2026-05-15 — Re-locked: 2026-05-21 (after office-notes-only refactor) — Re-locked: 2026-06-08 (after adding customer phone to the quote)
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
22. **(NEW 2026-06-08) Customer phone appears on the quote, under the customer name.** `saveQuote` persists `customerPhone:l?l.phone:''` on the saved quote object (so the customer page has it without needing the lead). Both renderers draw it immediately below the "Prepared for [name]" line, guarded by `q.customerPhone`, using identical markup: `<div style="font-size:13px;color:#9e9b94;margin-top:3px">[phone]</div>` — `renderQuoteHTML` (office Preview) and `renderQuote` in `quote-page.js` (customer page) must stay in sync. Legacy quotes saved before this (no `customerPhone`) render no phone line. The two renderers retain their pre-existing cosmetic divergences (inter-tag whitespace, `·` vs `&middot;`, and the customer page's live Accept button vs the office's inert preview button) — these are unchanged and render identically in a browser.

**Tests that guard this section:**
- `/mnt/user-data/outputs/quote_pipeline_test.js` (12 assertions)
- `/mnt/user-data/outputs/customer_view_test.js` (18 assertions)
- `/mnt/user-data/outputs/e2e_test.js` (30 assertions — includes the immutability USER STORY 2)
- `/mnt/user-data/outputs/office_notes_only_test.js` (32 assertions covering notes-only changes)
- `/mnt/user-data/outputs/office_notes_source_of_truth_test.js` (34 assertions covering single-source-of-truth + cross-customer fix)
- `/mnt/user-data/outputs/sent_quote_immutability_test.js` (42 assertions covering the absolute hard lock + clone-to-draft architecture)
- `/mnt/user-data/outputs/quote_phone_test.js` (10 assertions — phone persisted in saveQuote, drawn under the name in both renderers with identical markup, header parity, legacy graceful-omit)

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

**Locked on:** 2026-05-15 — Re-locked: 2026-05-21 (after office-notes-only refactor) — Re-locked: 2026-05-28 (after confirmation-email date fix + subject lines + draft staleness) — Re-locked: 2026-05-29 (after calendar URL cache invalidation) — Re-locked: 2026-06-08 (after multi-day subject lists all days)
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
13. Subject line: `bj.date || l.date` (single-day). **(UPDATED 2026-06-08)** Multi-day subject lists ALL day dates, compact: Day 1 = `bj.date || q.days[0].date` (booking override wins for Day 1 only), Days 2+ from the quote; weekday shown on each day for a 2-day job, omitted for 3+ to keep it short, year shown once at the end (e.g. "Thursday, Jun 4 & Friday, Jun 5, 2026" / "Jun 4, Jun 5 & Jun 6, 2026"). Built inline in `openConfirmEmail` using `new Date(d+'T12:00:00')` (same parse as `fmtDate`/`fmtDateWithDay`); consecutive duplicate dates are de-duped. Was previously Day 1's date only.
14. Editing a booked job invalidates the cached `_moveDetailsBlock` so the next regeneration uses the latest values.
15. Multi-day quotes: only Day 1 receives booking-form overrides; Days 2+ keep their per-day quote values.
16. **(NEW 2026-05-21) Booking form's `bj-crew-notes` and `bj-email-note` textareas are hidden via `style="display:none"`.** Customer-facing email content is composed manually in the confirmation email modal at send time.
17. **(NEW 2026-05-21) `bj-email-note` is NOT auto-prefilled from quote.notes or lead.notes.** The old "combine quote+lead notes" logic is removed. Field stays in DOM for legacy data only.
18. **(NEW 2026-05-21) `bj-office-notes` is NOT prefilled from `quote.officeNotes`** — lead is the single source of truth. The fallback `setIfEmpty('bj-office-notes',l.officeNotes||l.estimateOfficeNotes)` is the only prefill path. Stale quote data cannot leak into the booking form.
19. **(NEW 2026-05-21) Cloud sync's "OfficeNotes self-heal" also covers bookedJobs and completedJobs** — every linked record's `officeNotes` is forced to match its lead's after every merge.
20. **(NEW 2026-05-28) `openConfirmEmail` force-flushes the booking form into `bj` BEFORE building the email body.** Calls `bjWriteFields(bj)` synchronously when the `modal-booking-form` is open, so any pending autosave changes (the form has an 800ms debounce) are captured immediately rather than potentially after the email body is composed. Eliminates the race where a just-typed move date doesn't make it into the email.
21. **(NEW 2026-05-28, EXPANDED) Customer-facing confirmation emails show the weekday alongside the date — IN BOTH SUBJECT AND BODY.** A dedicated `fmtDateWithDay` helper (formats as "Thursday, Jun 4, 2026") is used in: the single-day email subject AND body, the multi-day email subject AND body (each day), the additional-day email body and subject line, the "Updated Move Confirmation" email subject AND body (sent after editing a booked job), AND the calendar event description (`buildMoveDetailsBlock`, both branches) for consistency. The standard `fmtDate` (no weekday) remains the format for all office UI displays — lead cards, day chips, booking-next modal — where space is tight. **(AMENDED 2026-06-08) Exception — the multi-day confirmation SUBJECT now lists all day dates compactly (see inv #13): weekday is shown per day only for a 2-day job and omitted for 3+ jobs, with the year shown once. The multi-day email BODY still shows the full weekday date for each day via `fmtDateWithDay` (unchanged).**
22. **(NEW 2026-05-28) Saved confirmation-email drafts include a `sourceFingerprint`** of the auto-generated source fields (date, time, from, to, movers, rateRegular, rateCash, feeFuel, feeMaterials) captured at autosave time. On modal reopen, the current `bj`'s fingerprint is compared to the saved one — if they differ, the saved body+subject are treated as stale and the freshly-built versions are used instead. This preserves user-typed customizations when the underlying job hasn't changed but rebuilds when the user has modified booking details since the draft was last saved. The "to" field is always restored regardless (recipient email is the one thing the user may have manually corrected that should always carry over). Drafts saved before this fix shipped (no `sourceFingerprint`) are treated as stale to force a fresh rebuild.
23. **(NEW 2026-05-28) The no-quote fallback branches in `openConfirmEmail` AND `buildMoveDetailsBlock` use `bj.date` first (then fall back to `l.date`) AND use `fmtDateWithDay`.** Originally these branches used `l.date || bj.date` with bare `fmtDate`, which meant a lead with no quote on file would show the stale `lead.date` value in the email body with no weekday — even after the user had changed the move date in the booking form. Precedence now matches the with-quote branches and the subject line (`bj.date || l.date`), and format matches all other customer-facing dates (`fmtDateWithDay`).
24. **(NEW 2026-05-29) `sendConfirmationEmail` rebuilds the cached `window._bookingCalUrl` AFTER capturing `_sentDetailsBlock`.** The calendar URL is pre-built and cached when the confirmation email modal opens (in `openConfirmEmail`), BEFORE `_sentDetailsBlock` exists. Without this rebuild, "Add to calendar" embeds the old auto-generated `_moveDetailsBlock` content, which can diverge from what the customer actually received (e.g. user-typed extras like "*Storage costs..." or edited fee lines). The rebuild is wrapped in try/catch so a failure can never block the send flow.

**Tests that guard this section:**
- `/mnt/user-data/outputs/booking_overrides_test.js` (28 assertions)
- `/mnt/user-data/outputs/booking_commit_test.js` (45 assertions)
- `/mnt/user-data/outputs/booking_pipeline_test.js` (95 assertions — 39 added 2026-05-28/29 across date fix + day-of-week + subject lines + draft fingerprint + no-quote fallback + calendar URL cache invalidation)
- `/mnt/user-data/outputs/multiday_subject_test.js` (8 assertions — 2026-06-08, multi-day subject lists all day dates: 1/2/3-day formats, Day-1 booking override, de-dupe, single-day + body untouched)
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

**Phase 2 — Per-day AI training extraction (built 2026-06-08).** Multi-day jobs now emit BOTH a whole-job training record AND one record per worked day (`kind:'day'`), so the AI can learn per-activity benchmarks ("packing a 2,000 sq ft home took 4 men, 6 hrs") as well as whole-job benchmarks ("a pack+move+unload at this size took N days"). Not locked yet — pending David's testing.

Scope of the change (all OUTSIDE the four locked sections — job completion / extraction is not locked):
- New helpers near `getAllTrainingData`: `getJobTrainingData()` (records where `kind!=='day'`) and `getDayTrainingData()` (records where `kind==='day'`); `_normActivityType`, `buildDayTrainingRecord`, `ensureMultiDayDayRecords`.
- `selfHealAITraining` now (a) matches only whole-job records when checking existence (`kind!=='day'`), so the job record always gets built; (b) tags whole-job records with `multiDay`/`dayCount`; (c) for multi-day jobs, calls `ensureMultiDayDayRecords` to create one record per worked day. Idempotent / dedups on `(completedJobId, dayIndex)`.
- `confirmCompleteMultiDay` calls `selfHealAITraining()` on completion (when AI training is on) so records appear immediately.
- `saveEditedCompletedJobMultiDay` drops the job's training records and rebuilds them after an edit.
- `viewCompletedJob`'s AI-record lookup excludes `kind:'day'` so the Quote-vs-Actual panel always uses the whole-job record.
- Whole-job analytics (packing-materials estimator, vaults→hours regression, crew→vaults regression, `generateAIQuote` ×2, `renderAIQuote`) now read `getJobTrainingData()` so per-day records never skew them or triple-weight multi-day jobs. Provably a no-op on existing data (no day records exist yet).
- New readout card on Analytics (`#perday-insights-chart`, rendered by `renderPerDayInsights`): per-activity benchmarks (avg crew × hours by activity and home size, pulling day records AND single-day jobs) plus full multi-day jobs by home size (avg days / total hours / total $).

Data-model invariants to verify before locking:
1. Per-day records carry ONLY that day's actuals (move/pack crew, hours, rate, fuel, materials, parking) + home context. Whole-job money (insurance, COI, dump, vaults, misc, grand total) is NEVER on a day record — it stays on the whole-job record, so summing never double-counts.
2. Days with no hours logged emit no record.
3. Single-day jobs are unchanged: one whole-job record, no day records. Single-day completion/edit code paths were not modified.
4. Legacy records (no `kind`) count as whole-job records everywhere.

Test guard: `phase2_perday_training_test.js` (65 assertions — extraction, dedup/idempotency, job/day split, self-heal for multi-day vs single-day, the two readout computations, and wiring checks). All passing against `index.html`.

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
- **2026-05-28** (follow-up) — Same Booking section still unlocked, two more fixes: (A) the main confirmation email SUBJECT lines (single-day, multi-day, and "Updated Move Confirmation") were still using bare `fmtDate` — switched to `fmtDateWithDay` so subjects also include the weekday and match the body format; (B) saved confirmation-email drafts now include a `sourceFingerprint` of the auto-generated source fields. On modal reopen, the current `bj`'s fingerprint is compared to the saved one — if they differ, the saved body+subject are discarded and rebuilt fresh from current data. This stops the bug where an old draft (saved before today's deploy or before the user changed a booking detail) overrode the freshly-built email body. The "to" field is always restored regardless of fingerprint. Drafts without a fingerprint (saved before this fix shipped) are treated as stale to force fresh rebuilds. Expanded invariant #21 and added new invariant #22 to Section 3. Extended `booking_pipeline_test.js` from 70 to 89 assertions including 6 fingerprint behavior simulations. All 16 suites passing (546 total).
- **2026-05-28** (third follow-up) — Same Booking section still unlocked, found another branch I'd missed. Meagan Given's lead had `bj.date='2026-06-02'` (newly updated in booking form) and `lead.date='2026-06-04'` (original date, never updated when booking changed). Confirmation email subject correctly showed Jun 2 (built from `bj.date||l.date`), but body showed Jun 4 with no weekday. Root cause: the no-quote fallback branches at line 5200 (in `openConfirmEmail`) and line 4990 (in `buildMoveDetailsBlock`) used `fmtDate(l?.date||bj?.date)` — wrong precedence (l first instead of bj first) AND wrong helper (bare fmtDate, no weekday). Both branches now use `fmtDateWithDay(bj?.date||l?.date||'')`, matching the precedence + format used in the with-quote branches and subject line. Added invariant #23 to Section 3. Extended `booking_pipeline_test.js` from 89 to 93 assertions. All 16 suites passing (550 total).
- **2026-05-29** — Unlocked Booking and Confirming Single-Day Move section to fix the calendar-URL-cache-invalidation bug. The earlier 2026-05-28 fix (capture `_sentDetailsBlock` from the email body on send) was correct but incomplete: the "Add to calendar" URL is pre-built and cached in `window._bookingCalUrl` when the confirmation email modal OPENS, BEFORE `_sentDetailsBlock` exists. So even though the capture worked (verified on Alisa Sedghifar's booked job — `_sentDetailsBlock` contained the correct sent content), the cached URL still embedded the old auto-generated `_moveDetailsBlock` and the calendar event showed content that diverged from the email. Fix: rebuild `window._bookingCalUrl = buildJobCalUrl(j)` in `sendConfirmationEmail` right after `_sentDetailsBlock` is set, wrapped in try/catch so a failure never blocks the send. Added invariant #24 to Section 3. Extended `booking_pipeline_test.js` from 93 to 95 assertions. All 16 suites passing (552 total).
- **2026-06-08** — Phase 2: per-day AI training extraction (NOT a locked-section change — completion/extraction is unlocked). Multi-day jobs now emit a whole-job record PLUS one `kind:'day'` record per worked day, enabling per-activity benchmarks alongside whole-job ones. Changed `selfHealAITraining` (existence check now `kind!=='day'`; tags `multiDay`/`dayCount`; creates per-day records via new `ensureMultiDayDayRecords`), added `getJobTrainingData`/`getDayTrainingData`/`buildDayTrainingRecord`/`_normActivityType`, wired `confirmCompleteMultiDay` + `saveEditedCompletedJobMultiDay` to emit/re-extract, guarded `viewCompletedJob`'s AI lookup to whole-job records, repointed all 6 whole-job analytics consumers to `getJobTrainingData()` (no-op on current data), and added a per-day/multi-day benchmarks readout to Analytics. New `phase2_perday_training_test.js` (65 assertions, all passing). Single-day completion/edit paths untouched. Pending David's testing before locking. NOTE: the existing suites were not re-run this session — the test files were not available in the working environment.
- **2026-06-08** — Unlocked Build and Send Single-Day Quote section to add the customer's phone number to the quote (David's explicit unlock). Three surgical edits, nothing else changed: (1) `saveQuote` now persists `customerPhone:l?l.phone:''` on the saved quote so the customer page has it; (2) `renderQuoteHTML` (office Preview) draws the phone under the customer name, guarded by `q.customerPhone`; (3) `renderQuote` in `quote-page.js` (customer page) draws the identical line. `buildQuoteHTML` already carried `customerPhone` so no change there. Verified the header region (incl. phone) renders identically across both renderers after normalizing the three pre-existing cosmetic divergences (inter-tag whitespace, `·` vs `&middot;`, live vs inert Accept button) — those were left untouched. Added invariant #22 to Section 1. New `quote_phone_test.js` (10 assertions, all passing). Section 1 re-locked. NOTE: existing Build-and-Send suites were not re-run — test files not available in the working environment. Built on top of the Phase 2 `index.html`, so this deliverable contains both Phase 2 and the phone change.

- **2026-06-08** — Added multi-day "true job value vs charged" capture (NOT a locked-section change — completion/extraction is unlocked; extends the Phase 2 multi-day work still pending review). Scenario: on a multi-day job an extra mover was sent for free, so the customer was charged less than the job was really worth, and the AI was at risk of learning the discounted figure. Brought the single-day `actualTotal`/`capDiscount` pattern to the multi-day complete + edit forms: new "True job value" field (`cjmd-actual-total` / `ecjmd-actual-total`); `confirmCompleteMultiDay` and `saveEditedCompletedJobMultiDay` now store `actualTotal` (true value) and `capDiscount` (true − charged) on the completed job; `openCompleteMultiDay` clears the field and `openEditCompleteMultiDay` prefills it only when a discount was recorded. Because a day's pay is `hours × rate` (crew rate, independent of mover count), the user logs the real crew (e.g. 4 movers) to capture effort in the per-day records while the money still reflects what was charged; the True job value field captures the goodwill gap. `getQuoteCompareTotal` already consumes `actualTotal`/`capDiscount`, so multi-day quote-accuracy now uses the real value automatically. All four whole-job training-record builders (`confirmComplete`, `saveJobForAI`, `viewCompletedJob` rebuild, `selfHealAITraining`) now also carry `realValue` + `capDiscount` (additive fields). New `goodwill_truevalue_test.js` (18 assertions, all passing); Phase 2 (65) and phone (10) suites still green.
- **2026-06-08** — Two completion-form UI tweaks (NOT locked-section changes): (1) the multi-day completion + edit insurance-type dropdowns (`cjmd-insurance-type`, `ecjmd-insurance-type`) now use the same option set as the single-day form, showing the charge beside each option (Option 1 — Actual Cash Value ($150), the three Option 2 / Full Value Protection variants, Option 3 — Basic Liability (included)). Previously they were a mismatched list (None / Released Value / FVP / 3rd Party) with no fees. Booking form already showed fees. (2) The per-day "Movers" dropdown in both multi-day day-card builders now includes 0 and 1 (was 2–8); the default-prefill logic was adjusted so a real 0 isn't bumped up to 2. Parse-verified; goodwill (18), Phase 2 (65), phone (10) suites still green.
- **2026-06-08** — Bug fix (NOT a locked-section change): multi-day quoted-hours summation. The Quote-vs-Actual "Hours" row in `viewCompletedJob` and the quoted-hours in `resolveQuotedInfo` (which feeds AI training records + the synthetic-quote fallback) read only `quote.days[0]`, so a 2-day job quoted 7–9 hrs/day showed "7–9" instead of "14–18". Both now sum `hrsMin`/`hrsMax` (and labour = hrs×rate) across ALL quote days; flat-rate days contribute 0 hours. Single-day quotes are unchanged (one day = same value). Found on David Kinsella's completed 2-day job. New `quoted_hours_multiday_test.js` (7 assertions). All suites green (Phase 2 65, phone 10, goodwill 18, quoted-hours 7).
- **2026-06-08** — AI quote multi-day awareness (NOT a locked-section change). The AI quote engine (`generateAIQuote`) predicted a single continuous move and never split big jobs into days — so a 4-bed/1886sqft pack+move that really needs ~18.5 hrs over 2 days was shown as a single ~8.5–10.5 hr quote (≈ one day's pace). Added a hard 9.5 hr/day cap: `estDays = ceil(estimatedTotalHours / 9.5)`; when >1 day, the result shows "N-day job · ~per-day hrs/day" in the labour tile and an "N-day job" badge in the summary header. Total hours and total cost are unchanged (you still bill total hours); the split is informational. New `ai_multiday_split_test.js` (13 assertions). NOTE for David: the split only produces the right day count when the predicted TOTAL is right — that depends on similar big jobs being in the training data. Kinsella's own 18.5-hr job must be flagged "use for AI" and present as a training record (re-save the completed job to re-extract) for future similar quotes to predict ~18.5 and trigger the 2-day split. All suites green (Phase 2 65, phone 10, goodwill 18, quoted-hours 7, multi-day split 13).
- **2026-06-08** — AI quote: square footage now drives the hours estimate (NOT a locked-section change). Root cause of big jobs being under-quoted: in `similarity()`, bedroom-count matched +40 (dominant) while sqft was capped at a token +10 with steep decay, so a 1,886 sqft 4-bed scored almost identically to a small 4-bed and its high actual hours got averaged away by smaller same-bedroom jobs. Two changes: (1) new `computeSqftRegression()` mirroring `computeVaultRegression()` — fits TOTAL hours ≈ intercept + slope×sqft over completed jobs with a recorded sqft (MIN_JOBS=6, positive-slope guard). In `generateAIQuote`, vaults keep priority; when no vault count but sqft is present, it blends the sqft-regression prediction (crew-adjusted, baseline ≈ 3-man) with the neighbor average at SQFT_WEIGHT=0.6, sets `_usedSqftReg`, drives the range spread from the regression's mean abs error, and tags the header "· size-scaled". (2) `similarity()` sqft weight raised from `max(0,10-diff/100)` to `max(0,30-diff/50)` so big homes match other big homes. Combined with the 9.5h/day cap, a large sqft → large total → multi-day split. New `ai_sqft_regression_test.js` (17 assertions). All suites green (Phase 2 65, phone 10, goodwill 18, quoted-hours 7, multi-day split 13, sqft regression 17). NOTE: regression needs ≥6 completed jobs spanning a range of sizes to engage; below that (or a noisy/negative fit) it falls back to the neighbor estimate, which the heavier sqft similarity weight still improves. Iterating expected.
- **2026-06-08** — AI quote: per-quote "jobs used" readout + non-destructive exclude (NOT a locked-section change). Each AI quote now has an expandable "🔍 Jobs used for this estimate (N)" section listing every matched job (name, size, sqft, actual hours, match score). Each row has a checkbox; unchecking jobs + "↻ Recalculate without unchecked" re-runs the estimate with those jobs dropped FROM THAT QUOTE ONLY. Nothing is deleted — jobs flagged for AI training stay permanently in the data; exclusions are in-memory, key-based (`_trainKey` = id|name|date|hours|sqft|vaults), accumulate across recalcs, and clear on any fresh quote or via "Reset (use all jobs)". The exclusion filter (`_aiTrainingPool()`) is applied to the neighbor pool, the vault + sqft regressions, the crew recommendation, and the packing-materials estimate, so a dropped job's influence is fully removed. Empty-state offers a Reset if exclusions hide everything. New helpers: `_aiExcludedKeys`, `_aiLastScored`, `_trainKey`, `_aiTrainingPool`, `recalcAIQuote`, `resetAIExclusions`; `generateAIQuote(isRecalc)` resets exclusions only on a fresh run. New `ai_exclude_jobs_test.js` (16 assertions). All suites green (Phase2 65, phone 10, goodwill 18, quoted-hrs 7, multiday 13, sqft 17, exclude 16).
- **2026-06-08** — AI quote "jobs used" readout: redesigned as detailed stacked cards (NOT a locked-section change). The earlier single-row layout only showed name/size/hrs/match and broke when a record had a blank name (empty flex spacer pushed the detail off to the side). Each job is now a left-aligned card: top line = name (or "(no name on record)") + "match N · seed data/your job"; then date · size · sqft · vaults; then move type · packing · access(load→unload) · movers · packers; then "Quoted X–Y → actual Z hrs" with a "⚠ ran over" flag when actual exceeded the quoted max; plus a 📝 notes line when present. Gives enough to judge keep/drop at a glance. Checkbox/recalc wiring unchanged. ai_exclude_jobs_test.js expanded to 19 assertions. All suites green (exclude 19, sqft 17, multiday 13, quoted-hrs 7, goodwill 18, phase2 66, phone 10).
- **2026-06-08** — AI quote: retuned matching to owner's priority order + move type as a HARD FILTER (NOT a locked-section change). Per owner's field model (move type ≫ volume ≫ access ≫ driving): (1) move type is now a hard filter in generateAIQuote — only jobs of the same `_normMoveType` as the input are ever scored (Move / Move & Pack / Storage In/Out / etc. kept apart; pack-only still has its own path). Empty state explains when no same-type jobs exist; header shows "· limited data for this move type" when <4. (2) similarity() reweighted: move-type weight removed (now filtered); vaults 20→35 (top volume signal); sqft kept 30 (volume proxy); access 10→13 per end (26 total); bedroom count 40→15 (volume now carries size); packing scope 25/12/3→15/7/2 (refinement within a type). (3) NEW driving match: `_driveBucket(z1,z2)` buckets by real road miles via zipMiles (local <30 / regional 30–100 / long-haul >100), falling back to SF-local-vs-not when coords unknown; same bucket +20, adjacent +8, far 0, neutral when zips absent — so an SF job no longer learns from a 2-hr-away job. New helpers `_normMoveType`, `_driveBucket`. New `ai_movetype_weights_test.js` (25 assertions; delta-based weight checks). All suites green (movetype 25, exclude 19, sqft 17, multiday 13, quoted-hrs 7, goodwill 18, phase2 66, phone 10).
- **2026-06-08** — AI quote: driving is now a clean SEPARATE CALCULATION, not a matching factor (NOT a locked-section change). Reverses the prior turn's driving-as-similarity weight. Rationale (owner): a job's loading/unloading WORK is the same whether local or 100mi away — only the drive differs — so the work estimate must be distance-independent and driving added from the trip's zips. Changes: (1) removed the driving term from similarity() and the `_driveBucket` helper. (2) New `_jobWorkHours(j)` / `_jobDriveHours(j)`: SF jobs (clock-on-arrival) keep recorded hours as work; out-of-area jobs (clock warehouse-to-warehouse) get their own drive stripped out → pure work hours. (3) generateAIQuote neighbor average + percentile spread now use `_work`; vault + sqft regressions fit on `_jobWorkHours(j)` instead of raw actualHours — so drive-inflated out-of-area jobs no longer skew the volume→hours lines or double-count when the trip drive is re-added via existing extraDriveHours. (4) Calibrated estimateFuelAndTime out-of-area drive speed: was a flat 20mph (a 100mi haul came out ~10h); now ≤60 round-mi at ~25mph, longer at ~45mph blended (100mi haul ≈ 4.5h). Result: unusual combos like "1-bed going 100mi" work by estimating the 1-bed work from local 1-beds + adding the calculated drive once. Requires zips (owner always has them). New `ai_drive_decomposition_test.js` (16). All suites green (drive 16, movetype 19, exclude 19, sqft 17, multiday 13, quoted-hrs 7, goodwill 18, phase2 66, phone 10).
- **2026-06-08** — Unlocked Booking and Confirming Single-Day Move section to make the multi-day confirmation email subject list ALL day dates (David's explicit unlock; instruction: change ONLY the subject line, nothing else). Previously the multi-day subject showed only Day 1 (`fmtDateWithDay(bj.date||q.days[0].date)`). Now built inline in `openConfirmEmail`: collects Day 1 (`bj.date||q.days[0].date`, booking override wins for Day 1 only) + Days 2+ from the quote, de-dupes consecutive duplicates, and formats compactly — weekday per day for a 2-day job, omitted for 3+, year once at the end (e.g. "Thursday, Jun 4 & Friday, Jun 5, 2026" / "Jun 4, Jun 5 & Jun 6, 2026"). 1-day case unchanged (full weekday date). Parse uses `new Date(d+'T12:00:00')`, identical to `fmtDate`/`fmtDateWithDay`. ONLY the subject-line expression (and its code comment) changed — single-day subject, email body, calendar block, and everything else untouched. Updated invariants #13 and #21; added `multiday_subject_test.js` (8 assertions, all passing) to Section 3's guard list. Section 3 re-locked. NOTE: the original `booking_pipeline_test.js` (95 assertions) was not available in the working environment this session, so it could not be re-run; the new 8-assertion test plus the other available suites (drive 16, movetype 19, phase2 66, phone 10) all pass, and the change is confined to the subject string.
- **2026-06-08** — AI quote "jobs used" readout: rebuilt the job card as flat block layout (NOT a locked-section change). The flex-based card (`display:flex` row with a `flex:1;min-width:0` content column + a `white-space:nowrap` "match · source" span) collapsed in the AI result panel — the content column shrank to near-zero and every word wrapped onto its own line in a narrow strip (two screenshots from David). Replaced with pure block flow: the checkbox is inline at the start of the name line (`vertical-align:middle`), the "match N · source" sits inline after the name, and the detail lines (date·size·sqft·vaults / move·pack·access·crew / quoted→actual / notes) are block divs indented `margin-left:24px`. Card has `overflow-wrap:anywhere;word-break:break-word`. No flex, no nowrap, no `justify-content:space-between` — fills the container width and wraps normally at any width. Checkbox `class="ai-job-incl" data-idx` and recalc wiring unchanged. ai_exclude_jobs_test.js still 19/19. All suites green.
- **2026-06-08** — AI quote: volume guard on the neighbour pool (NOT a locked-section change). Reported: a 1-bed/800sqft/3-vault quote listed a 3-bed/1460sqft/8-vault job among its sources. Cause: neighbour selection took the top-8 same-move-type jobs by score with NO similarity floor, and the access+packing points can prop up a very different-sized job when there aren't 8 close matches. Fix: after the move-type filter, drop any job whose volume is more than VOL_RATIO_MAX (=2.2) × different from the quote — compared on vaults when both have them, else sqft (so the 8-vault job is excluded from a 3-vault quote: 8/3=2.67>2.2). If the guard empties the pool, it falls back to the same-type top-8 and flags `_volFallback` → header shows "· closest available differ in size". The vault/sqft regressions are intentionally NOT gated (they span all sizes to extrapolate); only the neighbour list/readout is tightened. VOL_RATIO_MAX is tunable. New `ai_volume_guard_test.js` (14 assertions). All suites green (volume 14, exclude 19, drive 16, movetype 19, sqft 17, subject 8, phase2 66, phone 10, goodwill 18).
- **2026-06-08** — AI quote: rebalanced blend so matched jobs drive the estimate (NOT a locked-section change). Symptom: unchecking a job barely moved the number. Cause: the estimate leaned ~65% on the vaults/sqft regression (a volume-only trend line) and only ~35% on the neighbour jobs — and move type, access, driving, packing, AND the user's exclusions only affect the neighbour portion, so curation nudged just a third of the calc. Since neighbour selection is now strong (same-move-type hard filter + volume guard + work-hours cleaning + access/driving), the neighbours are the richer signal. Flipped the blend: `VAULT_WEIGHT` 0.65→0.35 and `SQFT_WEIGHT` 0.6→0.35, so the regression is a lighter assist (mainly for extrapolating to sizes with no close neighbours) and the matched jobs carry ~65%. Effect: exclusions now visibly move the number, and the owner's priority factors actually count. `ai_sqft_regression_test.js` weight assertion updated to 0.35 (still 17/17). All suites green (sqft 17, volume 14, exclude 19, drive 16, movetype 19, multiday 13, subject 8, phase2 66, phone 10, goodwill 18, quoted-hrs 7).
