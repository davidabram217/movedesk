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

1. **Customer sees the preview content.** What appears in the office Preview and what the customer sees at quote.html?id=... are byte-for-byte equivalent for the same quote object.

2. **`saveQuote` deep-clones days and fees on every save.** Form mutations after a save cannot reach back and corrupt the saved record. The line `_frozenDays=JSON.parse(JSON.stringify(qbDays||[]))` and the equivalent for fees must remain in place.

3. **`saveQuote` enforces a hard lock on sent/accepted quotes.** The block that returns early when `existingQ.status==='sent'||existingQ.status==='accepted'` and `!opts.force` must remain at the top of `saveQuote`. This prevents autosaves, stray timers, and refresh merges from silently overwriting a sent quote.

4. **`saveQuote` bumps `_localEditedAt` on every save.** This timestamp is used by the cloud-sync merge to recognise local edits as fresh and prevents stale cloud data from overwriting them.

5. **`sendQuoteEmail` re-snapshots from current form state before pushing to Supabase.** It calls `saveQuote('sent',{force:true})` first so the latest form values are captured, regardless of what happened between Open in Gmail and Send.

6. **`sendQuoteEmail` cancels all autosave timers.** Both `_qbAutoSaveTimer` and `_globalAutoSaveTimer` must be cleared so a queued autosave cannot fire after the send completes.

7. **`previewQuote` and `openQuoteGmail` pass `{force:true}` to `saveQuote`.** This allows explicit user actions to overwrite a sent quote's saved record (so Resend works) while the hard lock still blocks accidental writes.

8. **Quote merge in `refreshFromSupabase` respects `_localEditedAt`.** The block under `table==='quotes'&&local&&rec` prevents stale cloud data from overwriting freshly-edited local quotes during the 60-second refresh.

9. **PublicId is stable across resends.** The customer's link does not change when a quote is updated; only its content does.

10. **One quote per lead, latest wins.** When opening the Quote Builder for a lead, the existing quote is loaded (draft → sent → accepted precedence) rather than creating a new one. The customer's single link always points to the latest version. This is the agreed behavior, not a bug.

**Tests that guard this section (all must pass before any change ships):**

- `/mnt/user-data/outputs/quote_pipeline_test.js` — 12 assertions on `saveQuote` in isolation. Verifies deep-clone, hard lock, force-flag, publicId stability, multi-day, fees, timestamps.
- `/mnt/user-data/outputs/customer_view_test.js` — 18 assertions comparing office `renderQuoteHTML` vs customer `renderQuote` for two different quote configurations. Verifies they produce identical critical content.
- `/mnt/user-data/outputs/e2e_test.js` — 33 assertions simulating three real user stories: first-time send, resend, and autosave race. Verifies the customer can never receive content different from what was previewed.

**Total: 63 assertions. Run all three before shipping any change that could touch this section.**

**To unlock:** David must say *"I am unlocking the Build and Send Single-Day Quote section because..."*

---

## Pending review (David is testing before locking)

_(none yet)_

---

## Change log

- **2026-05-15** — Locked "Build and Send — Single-Day Quote" section.
