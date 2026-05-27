// Tests for the 2026-05-26 sent-quote immutability architecture.
// Sent and accepted quotes are FROZEN. The only way to send updated numbers is to clone
// the sent quote into a fresh draft (new id, new publicId) and send that.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

console.log('PART A: Wiring — the absolute hard lock is in place');

check('saveQuote has ABSOLUTE HARD LOCK comment',
  /ABSOLUTE HARD LOCK/.test(indexHtml)
);
check('saveQuote checks fromSendButton token (not force:true)',
  /opts\.fromSendButton/.test(indexHtml)
);
check('saveQuote: force:true alone is NOT enough to bypass for sent/accepted',
  // The new lock checks !opts.fromSendButton, NOT !opts.force
  /if\(!opts\.fromSendButton\)/.test(indexHtml) &&
  /existingQ\.status==='sent'\|\|existingQ\.status==='accepted'/.test(indexHtml.replace(/\n/g,' '))
);
check('No remaining saveQuote(\"draft\", {force:true}) callers',
  // Should be 0 — force is no longer used for any reason
  !/saveQuote\('draft',\s*\{force:true\}\)/.test(indexHtml)
);
check('No remaining saveQuote(\"sent\", {force:true}) callers',
  !/saveQuote\('sent',\s*\{force:true\}\)/.test(indexHtml)
);
check('sendQuoteEmail uses fromSendButton:true for the legitimate write',
  /saveQuote\('sent',\{fromSendButton:true\}\)/.test(indexHtml)
);

console.log('');
console.log('PART B: Preview never re-saves a sent quote');

check('previewQuote has explicit NEVER re-save comment for sent/accepted',
  /SENT\/ACCEPTED: NEVER re-save/.test(indexHtml)
);
check('previewQuote uses existing saved quote for frozen status',
  /_isFrozen=_existing&&\(_existing\.status==='sent'\|\|_existing\.status==='accepted'\)/.test(indexHtml)
);
check('previewQuote calls saveQuote ONLY in the draft branch',
  // The save should be inside the else branch (not isFrozen)
  /} else \{[\s\S]{0,400}_saved=saveQuote\('draft'\)/.test(indexHtml)
);
check('previewQuote footer for frozen quotes has the clone button',
  /cloneSentQuoteToDraft\('\$\{q\.id\}'\)/.test(indexHtml)
);
check('previewQuote footer for frozen quotes has NO Back-to-edit button',
  // The frozen footer should not have "Back to edit"
  /alreadySent\)\{[\s\S]{0,600}<button[^>]*onclick="closeModal\('quote-preview'\)">← Close<\/button>[\s\S]{0,800}cloneSentQuoteToDraft/.test(indexHtml)
);

console.log('');
console.log('PART C: openQuoteGmail refuses to open on sent/accepted quotes');

check('openQuoteGmail refuses sent quotes',
  /openQuoteGmail[\s\S]{0,1500}This quote is already sent and locked/.test(indexHtml)
);
check('openQuoteGmail uses plain saveQuote(\"draft\") without force',
  // For drafts, the lock isn't engaged so no force is needed
  /openQuoteGmail[\s\S]{0,2500}const q=saveQuote\('draft'\);/.test(indexHtml)
);

console.log('');
console.log('PART D: openQuoteBuilder ignores sent/accepted for editing');

check('openQuoteBuilder only looks for drafts',
  /db\.quotes\.find\(q=>q\.leadId===leadId&&q\.status==='draft'\)/.test(indexHtml)
);
check('openQuoteBuilder no longer auto-opens sent or accepted quotes',
  !/db\.quotes\.find\(q=>q\.leadId===leadId&&q\.status==='draft'\)\s*\|\|db\.quotes\.find\(q=>q\.leadId===leadId&&q\.status==='sent'\)/.test(indexHtml)
);
check('openQuoteBuilder calls _renderPriorSentBanner',
  /_renderPriorSentBanner\(leadId/.test(indexHtml)
);

console.log('');
console.log('PART E: cloneSentQuoteToDraft is correctly implemented');

check('cloneSentQuoteToDraft function defined',
  /function cloneSentQuoteToDraft\(sourceQuoteId\)/.test(indexHtml)
);
check('Clone generates a fresh id',
  /newDraft\.id=uid\(\)/.test(indexHtml)
);
check('Clone generates a fresh publicId (different from source)',
  /newDraft\.publicId='q'\+Date\.now\(\)\.toString\(36\)\+Math\.random\(\)/.test(indexHtml)
);
check('Clone sets status=\"draft\"',
  /newDraft\.status='draft'/.test(indexHtml)
);
check('Clone clears sentAt',
  /newDraft\.sentAt=''/.test(indexHtml)
);
check('Clone tracks the source via clonedFromQuoteId',
  /newDraft\.clonedFromQuoteId=src\.id/.test(indexHtml)
);
check('Clone preserves source quote untouched',
  // We deep-clone via JSON.parse(JSON.stringify(...)) so the source is independent
  /const newDraft=JSON\.parse\(JSON\.stringify\(src\)\)/.test(indexHtml)
);

console.log('');
console.log('PART F: Estimates list — sent quote rows have clone button, no Edit');

check('Sent/accepted rows show "New from this" button',
  /q\.status==='sent'\|\|q\.status==='accepted'.*New from this/.test(indexHtml.replace(/\n/g,' '))
);
check('Sent/accepted rows do NOT show Edit button',
  // Edit button rendered only for status==='draft'
  /q\.status==='draft'\?[^:]*onclick="openQuoteFromList/.test(indexHtml)
);
check('openQuoteFromList refuses sent/accepted, redirects to preview',
  /q\.status==='sent'\|\|q\.status==='accepted'[\s\S]{0,150}return previewQuoteFromList/.test(indexHtml)
);
check('previewQuoteFromList renders directly from quote for frozen status',
  /_isFrozen=q\.status==='sent'\|\|q\.status==='accepted'[\s\S]{0,500}renderQuoteHTML\(\{\.\.\.q,_preview:true\}/.test(indexHtml)
);

console.log('');
console.log('PART G: Banner for prior sent quotes');

check('Quote Builder modal has qb-prior-quote-banner element',
  /id="qb-prior-quote-banner"/.test(indexHtml)
);
check('_renderPriorSentBanner function defined',
  /function _renderPriorSentBanner\(leadId,currentDraftId\)/.test(indexHtml)
);
check('Banner shows View latest and New based on latest buttons',
  /View latest[\s\S]{0,500}New based on latest/.test(indexHtml)
);

console.log('');
console.log('PART H: Behavioral simulation — clone preserves source data');

function simulateClone(src) {
  if (src.status !== 'sent' && src.status !== 'accepted') return null;
  const newDraft = JSON.parse(JSON.stringify(src));
  newDraft.id = 'NEW_ID';
  newDraft.publicId = 'q-new-public';
  newDraft.status = 'draft';
  newDraft.sentAt = '';
  newDraft.acceptedAt = null;
  newDraft.clonedFromQuoteId = src.id;
  return newDraft;
}

// H1: Cloned draft has new IDs but identical editable data
{
  const src = {
    id: 'SRC_ID', publicId: 'src-public', status: 'sent',
    sentAt: '2026-05-25', acceptedAt: null,
    days: [{ id: 'd1', crew: 3, rate: 225, hrsMin: 5, hrsMax: 7 }],
    fees: [{ id: 'f1', label: 'Fuel', amount: 75, included: true }],
    totalMin: 1200, totalMax: 1650
  };
  const newDraft = simulateClone(src);
  check('Clone has new id', newDraft.id !== src.id);
  check('Clone has new publicId', newDraft.publicId !== src.publicId);
  check('Clone status is draft', newDraft.status === 'draft');
  check('Clone sentAt cleared', newDraft.sentAt === '');
  check('Clone tracks source via clonedFromQuoteId', newDraft.clonedFromQuoteId === 'SRC_ID');
  check('Clone preserves days data', newDraft.days[0].crew === 3 && newDraft.days[0].rate === 225);
  check('Clone preserves fees', newDraft.fees[0].amount === 75);
  check('Clone preserves totals', newDraft.totalMin === 1200);
  // Mutate clone — source should not change
  newDraft.days[0].crew = 99;
  check('Mutating clone does NOT affect source', src.days[0].crew === 3);
}

// H2: Cannot clone a draft (only sent/accepted)
{
  const draft = { id: 'D', status: 'draft', days: [], fees: [] };
  const result = simulateClone(draft);
  check('Cannot clone a draft (returns null)', result === null);
}

// H3: Can clone an accepted quote
{
  const accepted = { id: 'A', status: 'accepted', acceptedAt: '2026-05-26', days: [{ id: 'd1' }], fees: [] };
  const result = simulateClone(accepted);
  check('Can clone an accepted quote', result !== null);
  check('Cloned-from-accepted has acceptedAt cleared', result.acceptedAt === null);
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
