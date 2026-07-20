// Guards the receipt/invoice "editable draft before send" flow.
//
// BACKGROUND (2026-07-15). Hitting Send on a receipt fired sendEmail(j.email||'', OFFICE_EMAIL,...)
// immediately, with no chance to review. When j.email was blank (common on repeat/imported jobs),
// `to` was empty and only the office CC actually received it — reported as "it emailed our move
// account, not the customer". Also, the send passed no htmlBody, so the formatted receipt wasn't
// attached.
//
// FIX: Send now opens an editable draft (To / Subject / Body, office always CC'd). The customer
// email is prefilled from the job, or shown blank with a warning if missing, and is REQUIRED before
// the real send. A second "Send now" button does the actual send, WITH the formatted receipt as
// htmlBody, and persists a newly-typed email back onto the job.
//
// Run: node receipt_draft_test.js index.html
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// ── Modal has the draft panel + fields ──
check('draft panel exists',/id="ri-draft-panel"/.test(src));
check('draft has an editable To field',/id="ri-draft-to"/.test(src));
check('draft has an editable Subject field',/id="ri-draft-subject"/.test(src));
check('draft has an editable Body field',/id="ri-draft-body"/.test(src));
check('draft shows a missing-email warning',/id="ri-draft-to-warn"/.test(src));
check('draft shows the office CC line',/id="ri-draft-cc"/.test(src));

// ── The Send button opens the draft; a separate confirm button actually sends ──
check('"Send" button opens the draft (not a direct send)',/id="ri-send-btn" onclick="openReceiptDraft\(\)"/.test(src));
check('a separate "Send now" confirm button calls sendReceiptInvoice',/id="ri-confirm-btn"[^>]*onclick="sendReceiptInvoice\(\)"/.test(src));
check('a Back button returns to preview',/id="ri-back-btn"[^>]*onclick="riBackToPreview\(\)"/.test(src));

// ── openReceiptDraft prefills correctly ──
check('openReceiptDraft is defined',/function openReceiptDraft\(\)\{/.test(src));
check('prefills To from the job email',/ri-draft-to'\)\.value=j\.email\|\|''/.test(src));
check('prefills CC with the office email',/ri-draft-cc'\)\.textContent=OFFICE_EMAIL/.test(src));
check('shows the warning only when the job has no email',/ri-draft-to-warn'\)\.style\.display=j\.email\?'none':'block'/.test(src));

// ── sendReceiptInvoice: reads edited fields, requires a To, attaches the receipt, CCs office ──
check('reads the edited To field',/const to=\(document\.getElementById\('ri-draft-to'\)\.value\|\|''\)\.trim\(\)/.test(src));
check('reads the edited Subject field',/document\.getElementById\('ri-draft-subject'\)\.value/.test(src));
check('reads the edited Body field',/document\.getElementById\('ri-draft-body'\)\.value/.test(src));
check('REQUIRES a customer email (blocks empty send)',/if\(!to\)\{[\s\S]{0,200}return;/.test(src));
check('attaches the formatted receipt as htmlBody',/const htmlBody=buildReceiptInvoiceHTML\(j\);/.test(src)&&/sendEmail\(to,OFFICE_EMAIL,subject,body,htmlBody\)/.test(src));
check('office is CC\u2019d on the send',/sendEmail\(to,OFFICE_EMAIL,/.test(src));
check('persists a newly-typed email back onto the job',/if\(!j\.email\)\{ j\.email=to; saveDB\(\); \}/.test(src));

// ── Modal resets to preview mode on open (no stale draft showing) ──
check('opening the receipt resets to preview mode',/buildReceiptInvoiceHTML\(j\);\s*riBackToPreview\(\);/.test(src));
check('riBackToPreview hides the draft + restores the Send button',
  /function riBackToPreview\(\)\{[\s\S]*ri-draft-panel'\)\.style\.display='none'[\s\S]*ri-send-btn'\)\.style\.display=''/.test(src));

// ── The old behaviour is gone ──
check('no longer sends immediately with j.email||\'\'',!/sendEmail\(j\.email\|\|'',OFFICE_EMAIL/.test(src));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
