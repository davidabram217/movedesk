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

**What this section guarantees (the invariants that must remain true):**

1. Customer sees the preview content. What appears in the office Preview and what the customer sees at quote.html?id=... are byte-for-byte equivalent for the same quote object.
2. `saveQuote` deep-clones days and fees on every save. Form mutations after a save cannot reach back and corrupt the saved record.
3. `saveQuote` enforces a hard lock on sent/accepted quotes. The early-return block must remain at the top.
4. `saveQuote` bumps `_localEditedAt` on every save. Cloud-sync merge uses this to recognise local edits.
5. `sendQuoteEmail` re-snapshots from current form state before pushing to Supabase. Calls `saveQuote('sent',{force:true})` first.
6. `sendQuoteEmail` cancels all autosave timers. Both `_qbAutoSaveTimer` and `_globalAutoSaveTimer`.
7. `previewQuote` and `openQuoteGmail` pass `{force:true}` to `saveQuote`. Explicit user actions can override the lock.
8. Quote merge in `refreshFromSupabase` respects `_localEditedAt`. Prevents stale cloud data from overwriting freshly-edited local quotes.
9. PublicId is stable across resends. Customer's link does not change.
10. One quote per lead, latest wins. Opening Quote Builder loads existing (draft → sent → accepted precedence).

**Tests that guard this section:**
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
- The Supabase PATCH that updates the quote row with `status:'accepted'` and `acceptedAt` timestamp
- The "Quote accepted!" thank-you message rendered on the customer's quote page after acceptance
- The EmailJS notification sent to `move@caremoremoving.com` when a customer accepts
- The office-side self-heal in `refreshFromSupabase()` that flips lead status to "Quote accepted"
- The toast surfacing on any page (not just dashboard) when the office user is online during acceptance

**What this section guarantees (the invariants that must remain true):**

1. **Customer can click Accept on their quote page.** The Accept button is rendered when the quote status is not yet 'accepted'.
2. **Acceptance updates the Supabase quote row** via PATCH with `status:'accepted'` and `acceptedAt:<ISO timestamp>`.
3. **Customer's page re-renders to show the thank-you message** ("Quote accepted! Thank you, [Name]!") immediately after acceptance.
4. **Office receives an email notification** at `move@caremoremoving.com` with subject `"Quote accepted - [Name] ($min - $max)"`.
5. **Email body includes the quote link** so office can view exactly what was accepted (e.g. `https://davidabram217.github.io/movedesk/quote.html?id=<publicId>`).
6. **Office lead status auto-flips** from "Estimate sent" / "Summary + rough quote" / "Need to send estimate" / "Estimate scheduled" to "Quote accepted" within 60 seconds.
7. **Status flip happens on any page**, not just the dashboard. The self-heal lives in `refreshFromSupabase()`.
8. **Status flip bumps `_statusChangedAt`** so the cloud-sync merge propagates the change to other devices/sessions.
9. **Self-heal is idempotent.** A lead already at "Quote accepted" or any later status (Booked, Completed) is not touched. Pre-acceptance states (`Estimate sent`, `Summary + rough quote`, `Need to send estimate`, `Estimate scheduled`) ARE bumpable.
10. **Toast surfaces** to the office user on the next render after acceptance is detected (🎉 [Name] accepted the quote).

**Tests that guard this section:**
- `/mnt/user-data/outputs/customer_acceptance_test.js` (21 assertions covering wiring + behavior simulation)

**To unlock:** *"I am unlocking the Customer Acceptance Single-Day Quote section because..."*

---

## Pending review (David is testing before locking)

_(none yet)_

---

## Change log

- **2026-05-15** — Locked "Build and Send — Single-Day Quote" section.
- **2026-05-15** — Locked "Customer Acceptance — Single-Day Quote" section (gaps fixed first: customer-accepted self-heal moved from `renderDashboard` to `refreshFromSupabase` so it works on any page; quote link added to office acceptance notification email).
