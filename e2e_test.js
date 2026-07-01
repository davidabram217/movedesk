// End-to-end test: simulates the full user flow for both first-time send AND resend.
// Verifies: the data the customer sees at quote.html?id=PUBLIC_ID is EXACTLY what was previewed.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');
const customerJs = fs.readFileSync('/home/claude/quote-page.js', 'utf8');

function extractFn(src, name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{', 'g');
  const match = re.exec(src);
  if (!match) return null;
  const start = match.index;
  let i = start + match[0].length;
  let depth = 1;
  while (depth > 0 && i < src.length) {
    const ch = src[i];
    if (ch === '{') depth++; else if (ch === '}') depth--;
    else if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    } i++;
  }
  return src.slice(start, i);
}

// Mock DOM
const formState = {};
global.window = {};
global.document = {
  createElement: () => { let s=''; return {get textContent(){return s;}, set textContent(v){s=v;}, get innerHTML(){return s;}, appendChild:()=>{}}; },
  getElementById: (id) => ({
    get value() { return formState[id] || ''; },
    set value(v) { formState[id] = v; },
    classList: { add:()=>{}, remove:()=>{}, contains:()=>false },
    style: {},
    appendChild: () => {},
    querySelector: () => null,
    remove: () => {},
    textContent: '',
    innerHTML: ''
  }),
  body: { insertAdjacentHTML: () => {} },
  querySelector: () => null
};
global.localStorage = { _:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=v;}, removeItem(k){delete this._[k];}};
global.setTimeout = (fn, ms) => 0;
global.clearTimeout = () => {};
global.uid = () => 't' + Math.random().toString(36).slice(2,10);
global.fmtMoney = n => '$' + (Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
global.fmtDate = d => d || '';
global.esc = function(s){const d=global.document.createElement('div');d.textContent=s||'';return d.innerHTML;};
global.db = { settings:{rateBase:225}, leads:[], quotes:[], bookedJobs:[], completedJobs:[] };
global._saveTimer = null; global._qbAutoSaveTimer = null; global._globalAutoSaveTimer = null;
global.currentQuoteId = null; global.currentQuoteLeadId = null;
global.qbJobType = 'single'; global.qbDays = []; global.qbFees = [];
global.calcQbTotals = () => {
  let totalMin=0, totalMax=0;
  (qbDays||[]).forEach(d=>{
    const packMin=d.packCrew&&d.packRate&&d.packHrsMin?(d.packHrsMin||0)*d.packRate:0;
    const packMax=d.packCrew&&d.packRate&&d.packHrsMax?(d.packHrsMax||0)*d.packRate:0;
    if(d.flatRate){totalMin+=(Number(d.flatPrice)||0)+packMin;totalMax+=(Number(d.flatPrice)||0)+packMax;}
    else{totalMin+=(d.hrsMin||0)*d.rate+packMin;totalMax+=(d.hrsMax||0)*d.rate+packMax;}
  });
  return {totalMin, totalMax, cashTotalMin:0, cashTotalMax:0};
};
global.saveDB = () => {};

eval(extractFn(indexHtml, 'saveQuote'));
const officeFnSrc = extractFn(indexHtml, 'renderQuoteHTML');
const officeRender = new Function('q', 'lead', officeFnSrc.replace(/^function renderQuoteHTML\s*\([^)]*\)\s*\{/, '').slice(0, -1));

const customerFnSrc = extractFn(customerJs, 'renderQuote');
const customerFn = new Function('q', customerFnSrc.replace(/^function renderQuote\s*\([^)]*\)\s*\{/, '').slice(0, -1));
function renderCustomer(q) {
  let captured = '';
  const origGetById = global.document.getElementById;
  global.document.getElementById = (id) => {
    if (id === 'quote-content') return { set innerHTML(v){captured=v;}, get innerHTML(){return captured;} };
    return origGetById(id);
  };
  customerFn(q);
  global.document.getElementById = origGetById;
  return captured;
}

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name); if(info)console.log('    ' + info); fail++; }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('USER STORY 1: FIRST-TIME SEND — Customer must see correct quote');
console.log('═══════════════════════════════════════════════════════════');

// Reset
formState['qb-project-name'] = 'Sample Move';
formState['qb-sent-by'] = 'John';
formState['qb-estimate-type'] = 'Onsite';
formState['qb-notes'] = 'Customer wants 2 BR move';
db.leads.push({id:'lead-first', name:'First Time Customer', email:'first@test.com', date:'2026-06-20'});
currentQuoteLeadId = 'lead-first';

// Step 1: User fills in the form
qbDays = [{id:'d1', date:'2026-06-20', crew:3, hrsMin:5, hrsMax:7, rate:225,
           arrivalStart:'8:00 AM', arrivalEnd:'9:00 AM',
           loads:[{address:'100 Main St'}], unloads:[{address:'200 Oak Ave'}]}];

// Step 2: User clicks Preview → saveQuote('draft', {force:true})
const previewSave = saveQuote('draft', {force:true});
const previewHtml = officeRender(previewSave);
check('Preview shows the entered values', /3 Movers/.test(previewHtml) && /\$225\/hr/.test(previewHtml));
check('Preview total: $1,125 – $1,575', /\$1,125/.test(previewHtml) && /\$1,575/.test(previewHtml));

// Step 3: User clicks "Open in Gmail" → saveQuote('draft', {force:true}) [stays in form, no edits]
const gmailSave = saveQuote('draft', {force:true});
check('Open in Gmail save matches preview save', gmailSave.totalMin === previewSave.totalMin);
check('PublicId stable', gmailSave.publicId === previewSave.publicId);

// Step 4: User clicks Send → sendQuoteEmail does saveQuote('sent', {force:true})
const sentSave = saveQuote('sent', {force:true});
check('Sent quote stamped as sent', sentSave.status === 'sent');
check('sentAt timestamp set', !!sentSave.sentAt);

// Step 5: Customer clicks link → fetches db.quotes[X] → renders with renderQuote
const inDb = db.quotes.find(q => q.publicId === sentSave.publicId);
const customerHtml = renderCustomer(inDb);
check('Customer link points to right quote', !!inDb);
check('Customer sees 3 Movers', /3 Movers/.test(customerHtml));
check('Customer sees 5 – 7 hrs', /5\s*[\u2013\-]\s*7\s*hrs/.test(customerHtml));
check('Customer sees $225/hr', /\$225\/hr/.test(customerHtml));
check('Customer sees $1,125', /\$1,125/.test(customerHtml));

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('USER STORY 2: RESEND via CLONE — original stays frozen, clone carries new numbers');
console.log('═══════════════════════════════════════════════════════════');

// Under the 2026-05-26 architecture the sent quote is FROZEN. To send corrected numbers the
// user clicks "New from this", which clones the sent quote into a FRESH draft (new id + new
// publicId) and sends that. The original quote and its customer link are never mutated.
const frozen = db.quotes.find(q => q.id === sentSave.id);
console.log('  [Original sent quote: ' + frozen.days[0].crew + ' Movers @ $' + frozen.days[0].rate + '/hr, link ' + frozen.publicId + ']');

// The user edits the form intending to change the numbers...
qbDays[0].crew = 5;
qbDays[0].hrsMin = 6;
qbDays[0].hrsMax = 8;
qbDays[0].rate = 375;

// Step 1: autosave (no force) AND a plain force save both CANNOT touch the frozen sent quote.
saveQuote('draft');            // autosave, no force → blocked
saveQuote('draft', {force:true}); // force alone → still blocked (only fromSendButton writes)
saveQuote('sent', {force:true});  // force alone → still blocked
const stillFrozen = db.quotes.find(q => q.id === sentSave.id);
check('Frozen: sent quote unchanged after autosave + force (still 3 Movers)', stillFrozen.days[0].crew === 3);
check('Frozen: sent quote rate unchanged (still $225)', stillFrozen.days[0].rate === 225);
check('Frozen: blocked writes create NO duplicate', db.quotes.filter(q => q.publicId === sentSave.publicId).length === 1);

// Step 2: "New from this" → cloneSentQuoteToDraft makes a fresh draft (simulated inline here:
// deep-clone + new id + new publicId + status draft, exactly as the real function does).
const clone = JSON.parse(JSON.stringify(frozen));
clone.id = 'clone-' + frozen.id;
clone.publicId = 'p-clone-2';
clone.status = 'draft';
clone.sentAt = '';
clone.acceptedAt = null;
clone.clonedFromQuoteId = frozen.id;
db.quotes.push(clone);
currentQuoteId = clone.id;                 // now editing the CLONE, not the sent quote
currentQuoteLeadId = clone.leadId || 'lead-first';

// Step 3: user sends the clone. The ONLY authorized writer passes fromSendButton:true.
const sentClone = saveQuote('sent', {fromSendButton:true});
check('Clone send: status=sent', sentClone.status === 'sent');
check('Clone gets a NEW publicId (different customer link)', sentClone.publicId !== sentSave.publicId);
check('Clone carries the corrected numbers (5 Movers)', sentClone.days[0].crew === 5);

// Step 4: the ORIGINAL customer link still returns the ORIGINAL quote, unchanged.
const oldLink = db.quotes.find(q => q.publicId === sentSave.publicId);
const oldHtml = renderCustomer(oldLink);
check('Old link STILL shows original 3 Movers (frozen)', /3 Movers/.test(oldHtml));
check('Old link does NOT show the new 5 Movers', !/5 Movers/.test(oldHtml));

// Step 5: the NEW clone link shows the corrected quote.
const newLink = db.quotes.find(q => q.publicId === sentClone.publicId);
const customerHtml2 = renderCustomer(newLink);
check('New link shows corrected 5 Movers', /5 Movers/.test(customerHtml2));
check('New link shows 6 – 8 hrs', /6\s*[\u2013\-]\s*8\s*hrs/.test(customerHtml2));
check('New link shows $375/hr', /\$375\/hr/.test(customerHtml2));
check('New link shows new total $2,250', /\$2,250/.test(customerHtml2));

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('USER STORY 3: AUTOSAVE RACE — even with autosave firing, customer sees right values');
console.log('═══════════════════════════════════════════════════════════');

// Reset
db.quotes.length = 0;
qbDays = [{id:'d1', date:'2026-06-25', crew:2, hrsMin:3, hrsMax:5, rate:140,
           loads:[{address:'A'}], unloads:[{address:'B'}]}];
db.leads.push({id:'lead-race', name:'Race Customer'});
currentQuoteLeadId = 'lead-race';
currentQuoteId = null;

// First save creates the record
const initial = saveQuote('draft', {force:true});

// Now: user edits, autosave fires multiple times, finally clicks Send
qbDays[0].crew = 4; saveQuote('draft'); // autosave (no force)
qbDays[0].crew = 5; saveQuote('draft'); // autosave (no force)
qbDays[0].crew = 6; saveQuote('draft'); // autosave (no force)

const beforeFinal = db.quotes.find(q => q.id === initial.id);
check('Autosaves during editing reach DB (status was draft)', beforeFinal.days[0].crew === 6);

// User then clicks Send → 'sent' force-save
qbDays[0].crew = 7; // final tweak before send
const sentRace = saveQuote('sent', {force:true});
check('Final send captures latest form state', sentRace.days[0].crew === 7);

// After send, lock kicks in. Try autosave with status sent → should NOT change
qbDays[0].crew = 999;
saveQuote('draft'); // no force — should be blocked because status is 'sent'
const afterSentAutosave = db.quotes.find(q => q.id === initial.id);
check('Autosave AFTER send is blocked by hard lock', afterSentAutosave.days[0].crew === 7);
check('Status remains sent after blocked autosave', afterSentAutosave.status === 'sent');

const customerHtml3 = renderCustomer(afterSentAutosave);
check('Customer sees the FINAL pre-send values (7 movers)', /7 Movers/.test(customerHtml3));
check('Customer does NOT see post-send mutation (999)', !/999/.test(customerHtml3));

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('═══════════════════════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);
