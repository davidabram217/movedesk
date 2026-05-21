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

**Locked on:** 2026-05-15
**Status:** LOCKED. Do not change without explicit unlock.

**Scope of what is locked:**
- The Quote Builder modal for single-day quotes (opening, editing, previewing)
- The save flow: `saveQuote()` function and its hard lock
- The send flow: `sendQuoteEmail()` re-snapshotting form state before send
- The customer's quote.html page rendering via `quote-page.js`'s `renderQuote()`
- The resend flow: explicit Preview → Resend → Send with `{force:true}`
- The autosave behavior in the Quote Builder
- The cloud-sync merge behavior for quotes (`mergeTable` with `table==='quotes'`)

**What this section guarantees:**

1. Customer sees the preview content. What appears in the office Preview and what the customer sees at quote.html?id=... are byte-for-byte equivalent for the same quote object.
2. `saveQuote` deep-clones days and fees on every save.
3. `saveQuote` enforces a hard lock on sent/accepted quotes (early-return unless `opts.force=true`).
4. `saveQuote` bumps `_localEditedAt` on every save.
5. `sendQuoteEmail` re-snapshots from current form state before pushing to Supabase.
6. `sendQuoteEmail` cancels all autosave timers.
7. `previewQuote` and `openQuoteGmail` pass `{force:true}`.
8. Quote merge in `refreshFromSupabase` respects `_localEditedAt`.
9. PublicId stable across resends.
10. One quote per lead, latest wins.

**Tests:**
- `/mnt/user-data/outputs/quote_pipeline_test.js` (12 assertions)
- `/mnt/user-data/outputs/customer_view_test.js` (18 assertions)
- `/mnt/user-data/outputs/e2e_test.js` (33 assertions)

**To unlock:** *"I am unlocking the Build and Send Single-Day Quote section because..."*

---

### 2. Customer Acceptance — Single-Day Quote

**Locked on:** 2026-05-15
**Status:** LOCKED. Do not change without explicit unlock.

**Scope of what is locked:**
- Customer-side `acceptQuote()` function in `quote-page.js`
- Supabase PATCH that updates the quote row with `status:'accepted'` and `acceptedAt`
- The "Quote accepted!" thank-you message on the customer's page
- EmailJS notification sent to `move@caremoremoving.com` on acceptance (including the quote link)
- Office-side self-heal in `refreshFromSupabase()` that flips lead status to "Quote accepted"
- The toast surfacing on any page when the office user is online during acceptance

**What this section guarantees:**

1. Customer can click Accept on their quote page.
2. Acceptance updates the Supabase quote row via PATCH with `status:'accepted'` and `acceptedAt:<ISO>`.
3. Customer's page re-renders to show the thank-you message immediately.
4. Office receives an email notification with the quote link.
5. Office lead status auto-flips from pre-acceptance states to "Quote accepted" within 60 seconds.
6. Status flip happens on any page, not just dashboard.
7. Status flip bumps `_statusChangedAt`.
8. Self-heal is idempotent.
9. Toast surfaces 🎉 [Name] accepted the quote.

**Tests:**
- `/mnt/user-data/outputs/customer_acceptance_test.js` (21 assertions)

**To unlock:** *"I am unlocking the Customer Acceptance Single-Day Quote section because..."*

---

### 3. Booking and Confirming — Single-Day Move

**Locked on:** 2026-05-15
**Status:** LOCKED. Do not change without explicit unlock.

**Scope of what is locked:**
- The "Complete booking" / "Continue booking" entry point from the lead view modal
- The booking form (`modal-book-job`) — pre-fill, draft creation, edit-mode update
- Draft handling: `_draft:true` flag, reopening a draft restores values, no duplicates
- The booking checklist (`modal-booking-next`): calendar + confirmation email requirements
- `bookingNextDone()` final commit — removes `_draft`, flips lead status to "Booked"
- `bookingNextCancel()` — discards draft, writes tombstone
- Confirmation email body and subject (`openConfirmEmail()`) — booking-form values override quote
- Calendar entry (`buildJobCalUrl()`, `buildMoveDetailsBlock()`) — booking-form values override quote
- Cached `_moveDetailsBlock` invalidation when a booked job is edited
- The deep-cloned `quoteDays`/`quoteFees`/`quoteId` snapshot stored on the booked job

**What this section guarantees:**

1. **Three button states in the lead view** for accepted leads:
   - No booked job → "📋 Complete booking →"
   - Draft booked job exists → "📋 Continue booking →" (NEW)
   - Real (non-draft) booked job exists → "✉ Send confirmation →"

2. **Booking form auto-populates from the accepted quote.** Crew, rate, hours, fees, date, time, scope all pre-filled. Email-note combines `quote.notes` + `lead.notes`. Office notes from lead.

3. **First "Confirm booking" creates a draft.** Lead status stays at "Quote accepted". Draft is filtered out of Booked Jobs page.

4. **Reopening a draft restores all field values.** Date, time, movers, rates, fees, drive time, deposit, quote, do-not-exceed, volume, scope, crew notes, email note, office notes, insurance type. Same draft `id` reused on re-confirm — no duplicates.

5. **Checklist progress is preserved across reopens.** `calendarAdded`, `confirmEmailSent`, and per-day calendar flags survive a back-and-forth.

6. **Checklist requires BOTH calendar + confirmation email** before "Confirm & move to Booked Jobs" activates. If the lead has no email, only calendar is required.

7. **Final commit** (`bookingNextDone`):
   - Removes `_draft` flag → job appears in Booked Jobs
   - Flips lead status to "Booked" with `_statusChangedAt` bumped
   - Lead disappears from active Leads list

8. **Booking-form values override quote values** in the confirmation email body, subject line, and calendar entry's "SENT TO CUSTOMER" block. Fields affected: rate, cash rate, crew, date, time, fuel fee, materials fee. Multi-day: Day 1 only. Blank booking fields fall back to quote.

9. **Editing a booked job later** invalidates the cached `_moveDetailsBlock` so future confirmation re-sends and calendar rebuilds reflect the latest values.

10. **Cancel mid-booking** discards the draft and writes a tombstone so cloud sync cannot resurrect it. Lead returns to "Quote accepted" state.

11. **The deep-cloned quote snapshot** (`quoteDays`, `quoteFees`, `quoteId`) on the booked job is immutable. Future quote edits cannot mutate the booking record.

12. **The accepted quote record is unchanged.** Customer's `quote.html?id=...` link still shows what they originally accepted. Booking-form overrides only affect downstream views (email/calendar), not the customer's quote link.

**Tests:**
- `/mnt/user-data/outputs/booking_pipeline_test.js` (56 assertions covering wiring + behavior)
- `/mnt/user-data/outputs/booking_overrides_test.js` (28 assertions on the booking-form override behavior)

**To unlock:** *"I am unlocking the Booking and Confirming Single-Day Move section because..."*

---

## Pending review (David is testing before locking)

_(none yet)_

---

## Change log

- **2026-05-15** — Locked "Build and Send — Single-Day Quote" section.
- **2026-05-15** — Locked "Customer Acceptance — Single-Day Quote" section (gaps fixed first: customer-accepted self-heal moved from `renderDashboard` to `refreshFromSupabase`; quote link added to office acceptance notification email).
- **2026-05-15** — Locked "Booking and Confirming — Single-Day Move" section (after adding: combined quote.notes + lead.notes email-note prefill, draft reopen with value restoration, "Continue booking" button state, booking-form overrides for confirmation email + calendar, subject line uses booking date, cached move-details block invalidation on edit).
