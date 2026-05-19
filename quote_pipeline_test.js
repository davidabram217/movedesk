// Real end-to-end test of the quote send pipeline.
// Extracts the actual functions from index.html and runs them with mocked DOM + db.
// Verifies: what the customer would see at quote.html?id=PUBLIC_ID after a send.

const fs = require('fs');
const html = fs.readFileSync('/home/claude/index.html', 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{', 'g');
  const match = re.exec(html);
  if (!match) return null;
  const start = match.index;
  let i = start + match[0].length;
  let depth = 1;
  while (depth > 0 && i < html.length) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch; i++;
      while (i < html.length && html[i] !== q) {
        if (html[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return html.slice(start, i);
}

// ── DOM MOCK ──
// Simulates the inputs in the Quote Builder form so saveQuote can read from them
const formState = {};
global.document = {
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
  querySelector: () => null,
  createElement: () => ({ style: {}, classList:{add:()=>{}}, textContent:'', appendChild:()=>{}, remove:()=>{} })
};
global.window = {};
global.localStorage = { _: {}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=v;}, removeItem(k){delete this._[k];}};
global.setTimeout = (fn, ms) => { if(typeof fn==='function')return 0; };
global.clearTimeout = () => {};
global.uid = () => 't' + Math.random().toString(36).slice(2,10);
global.fmtMoney = n => '$' + (Number(n)||0);
global.fmtDate = d => d || '';

// db setup
global.db = { settings:{rateBase:225}, leads:[], quotes:[], bookedJobs:[], completedJobs:[], aiTraining:[] };
global._saveTimer = null;
global._qbAutoSaveTimer = null;
global._globalAutoSaveTimer = null;
global.currentQuoteId = null;
global.currentQuoteLeadId = null;
global.qbJobType = 'single';
global.qbDays = [];
global.qbFees = [];

// Stub functions saveQuote calls that we don't need
global.calcQbTotals = () => {
  // Compute totals from qbDays the same way the real one does
  let totalMin=0, totalMax=0, cashTotalMin=0, cashTotalMax=0;
  (qbDays||[]).forEach(d=>{
    const packMin = d.packCrew&&d.packRate&&d.packHrsMin ? (d.packHrsMin||0)*d.packRate : 0;
    const packMax = d.packCrew&&d.packRate&&d.packHrsMax ? (d.packHrsMax||0)*d.packRate : 0;
    if(d.flatRate){
      totalMin += (Number(d.flatPrice)||0) + packMin;
      totalMax += (Number(d.flatPrice)||0) + packMax;
    } else {
      totalMin += (d.hrsMin||0)*d.rate + packMin;
      totalMax += (d.hrsMax||0)*d.rate + packMax;
    }
  });
  return {totalMin, totalMax, cashTotalMin, cashTotalMax};
};
global.saveDB = () => { /* no-op for test */ };

// Now extract and eval the real saveQuote
eval(extractFn('saveQuote'));

// ── TEST HARNESS ──
let pass = 0, fail = 0;
const tests = [];
function test(name, fn) { tests.push({name, fn}); }
function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) throw new Error('  ' + (msg||'') + '\n    expected: ' + JSON.stringify(expected) + '\n    got:      ' + JSON.stringify(actual));
}
function run() {
  tests.forEach(t => {
    try {
      // Reset state between tests
      Object.keys(formState).forEach(k=>delete formState[k]);
      db.leads.length=0; db.quotes.length=0;
      currentQuoteId = null; currentQuoteLeadId = null;
      qbJobType='single'; qbDays.length=0; qbFees.length=0;
      t.fn();
      console.log('✓ ' + t.name);
      pass++;
    } catch(e) {
      console.log('✗ ' + t.name);
      console.log(e.message);
      fail++;
    }
  });
}

// ────────────────────────────────────────────────────────────
// SCENARIOS
// ────────────────────────────────────────────────────────────

test('SCENARIO 1: Fresh quote — what gets saved matches what was built', () => {
  // Setup: a lead and form state representing what a user filled in
  db.leads.push({id:'lead1', name:'Alice Test', email:'alice@test.com', date:'2026-06-15'});
  currentQuoteLeadId = 'lead1';
  qbJobType = 'single';
  qbDays = [{id:'d1', date:'2026-06-15', crew:3, hrsMin:5, hrsMax:7, rate:225, arrivalStart:'8:00 AM', arrivalEnd:'9:00 AM', loads:[{address:'A'}], unloads:[{address:'B'}]}];
  qbFees = [];
  formState['qb-project-name'] = 'Alice Move';
  formState['qb-sent-by'] = 'John';
  formState['qb-estimate-type'] = 'Onsite';
  formState['qb-notes'] = 'Lead notes from Alice';

  // User clicks Preview → saveQuote('draft', {force:true})
  const saved = saveQuote('draft', {force:true});

  // What the customer would see (via the saved record):
  assertEq(saved.days[0].crew, 3, 'Saved crew should be 3');
  assertEq(saved.days[0].rate, 225, 'Saved rate should be 225');
  assertEq(saved.days[0].hrsMin, 5, 'Saved hrsMin should be 5');
  assertEq(saved.days[0].hrsMax, 7, 'Saved hrsMax should be 7');
  assertEq(saved.totalMin, 1125, '5×225=1125');
  assertEq(saved.totalMax, 1575, '7×225=1575');
  assertEq(saved.notes, 'Lead notes from Alice');
  assertEq(saved.projectName, 'Alice Move');
});

test('SCENARIO 2: User edits crew+rate mid-build — final save reflects latest', () => {
  db.leads.push({id:'lead2', name:'Bob', email:'bob@test.com'});
  currentQuoteLeadId = 'lead2';
  qbDays = [{id:'d1', crew:2, hrsMin:2, hrsMax:4, rate:140, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  // First save (initial draft, like Preview was clicked)
  saveQuote('draft');
  
  // User now changes crew to 4 and rate to 300 (typed into form, which writes to qbDays via updateQbDay)
  qbDays[0].crew = 4;
  qbDays[0].rate = 300;
  qbDays[0].hrsMin = 4;
  qbDays[0].hrsMax = 6;
  
  // User clicks Open in Gmail → saveQuote('draft', {force:true})
  const saved2 = saveQuote('draft', {force:true});
  
  assertEq(saved2.days[0].crew, 4, 'New crew should be saved');
  assertEq(saved2.days[0].rate, 300, 'New rate should be saved');
  assertEq(saved2.totalMin, 4*300, 'totalMin should be 4×300=1200');
  assertEq(saved2.totalMax, 6*300, 'totalMax should be 6×300=1800');
});

test('SCENARIO 3: HARD LOCK — sent quote cannot be silently overwritten by autosave', () => {
  db.leads.push({id:'lead3', name:'Carol'});
  currentQuoteLeadId = 'lead3';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  // Save and send
  const sent = saveQuote('sent', {force:true});
  const sentTotalMin = sent.totalMin;
  
  // Now form gets mutated (e.g. user reopens quote builder, types something)
  qbDays[0].crew = 99;
  qbDays[0].rate = 9999;
  
  // qbAutoSave fires → calls saveQuote('draft') WITHOUT force
  const after = saveQuote('draft'); // no force — should be BLOCKED
  
  // The quote in db should still be the original sent version
  const inDb = db.quotes.find(q => q.id === sent.id);
  assertEq(inDb.totalMin, sentTotalMin, 'Sent quote totalMin must not change without force');
  assertEq(inDb.days[0].crew, 3, 'Sent quote crew must not change without force');
  assertEq(inDb.days[0].rate, 225, 'Sent quote rate must not change without force');
  assertEq(inDb.status, 'sent', 'Status must remain sent');
});

test('SCENARIO 4: RESEND — explicit force save DOES update a sent quote', () => {
  db.leads.push({id:'lead4', name:'Dave'});
  currentQuoteLeadId = 'lead4';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  // Original send
  const sent = saveQuote('sent', {force:true});
  const sentPublicId = sent.publicId;
  
  // User reopens, changes values, then resends
  qbDays[0].crew = 5;
  qbDays[0].rate = 375;
  qbDays[0].hrsMin = 6;
  qbDays[0].hrsMax = 8;
  
  // The send flow: saveQuote('sent', {force:true}) — this is what sendQuoteEmail now does
  const resent = saveQuote('sent', {force:true});
  
  // PublicId must be preserved (customer's link stays the same)
  assertEq(resent.publicId, sentPublicId, 'PublicId must be preserved on resend');
  // New values must be saved
  assertEq(resent.days[0].crew, 5, 'New crew should be saved on resend');
  assertEq(resent.days[0].rate, 375, 'New rate should be saved on resend');
  assertEq(resent.totalMin, 6*375, 'totalMin should reflect new values');
  // Customer link points at same publicId, gets new content
  const linkPointsTo = db.quotes.find(q => q.publicId === sentPublicId);
  assertEq(linkPointsTo.days[0].crew, 5, 'Customer link returns the resent crew');
  assertEq(linkPointsTo.days[0].rate, 375, 'Customer link returns the resent rate');
});

test('SCENARIO 5: Deep-clone — form mutations after save do NOT corrupt saved quote', () => {
  db.leads.push({id:'lead5', name:'Eve'});
  currentQuoteLeadId = 'lead5';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  const saved = saveQuote('draft', {force:true});
  const savedCrewAtMomentOfSave = saved.days[0].crew;
  
  // Now mutate qbDays as if user kept typing
  qbDays[0].crew = 999;
  qbDays[0].rate = 99999;
  
  // db.quotes should be untouched (deep clone protected it)
  const inDb = db.quotes.find(q => q.id === saved.id);
  assertEq(inDb.days[0].crew, savedCrewAtMomentOfSave, 'Mutating qbDays should not affect saved quote');
  assertEq(inDb.days[0].crew, 3, 'Should still be 3');
});

test('SCENARIO 6: PublicId stable across multiple saves', () => {
  db.leads.push({id:'lead6', name:'Frank'});
  currentQuoteLeadId = 'lead6';
  qbDays = [{id:'d1', crew:2, hrsMin:2, hrsMax:4, rate:140, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  const first = saveQuote('draft', {force:true});
  const firstPublicId = first.publicId;
  
  // Multiple subsequent saves
  qbDays[0].crew = 3;
  saveQuote('draft', {force:true});
  qbDays[0].rate = 200;
  saveQuote('draft', {force:true});
  const fourth = saveQuote('sent', {force:true});
  
  assertEq(fourth.publicId, firstPublicId, 'PublicId must stay the same across all saves');
});

test('SCENARIO 7: Multi-day quote — all days preserved correctly', () => {
  db.leads.push({id:'lead7', name:'Greta'});
  currentQuoteLeadId = 'lead7';
  qbJobType = 'multi';
  qbDays = [
    {id:'d1', date:'2026-06-15', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A1'}], unloads:[{address:'B1'}]},
    {id:'d2', date:'2026-06-16', crew:4, hrsMin:4, hrsMax:6, rate:300, loads:[{address:'A2'}], unloads:[{address:'B2'}]}
  ];
  
  const saved = saveQuote('sent', {force:true});
  
  assertEq(saved.jobType, 'multi');
  assertEq(saved.days.length, 2);
  assertEq(saved.days[0].crew, 3);
  assertEq(saved.days[1].crew, 4);
  assertEq(saved.days[1].rate, 300);
  // Total = (5×225 + 4×300) min, (7×225 + 6×300) max = 2325, 3375
  assertEq(saved.totalMin, 2325);
  assertEq(saved.totalMax, 3375);
});

test('SCENARIO 8: Fees included in saved quote', () => {
  db.leads.push({id:'lead8', name:'Henry'});
  currentQuoteLeadId = 'lead8';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  qbFees = [
    {id:'f1', label:'Fuel fee', amount:150, included:true, type:'fixed'},
    {id:'f2', label:'Materials', amount:75, included:true, type:'fixed'},
    {id:'f3', label:'Optional thing', amount:50, included:false, type:'fixed'}
  ];
  
  const saved = saveQuote('draft', {force:true});
  
  assertEq(saved.fees.length, 3, 'All fees saved (included flag set per fee)');
  assertEq(saved.fees[0].included, true);
  assertEq(saved.fees[2].included, false);
});

test('SCENARIO 9: _localEditedAt is bumped on every save', () => {
  db.leads.push({id:'lead9', name:'Ivy'});
  currentQuoteLeadId = 'lead9';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  const saved = saveQuote('draft', {force:true});
  if (!saved._localEditedAt) throw new Error('_localEditedAt should be set on save');
  // Must be a valid ISO timestamp
  if (!/^\d{4}-\d{2}-\d{2}T/.test(saved._localEditedAt)) throw new Error('Should be ISO format');
});

test('SCENARIO 10: status="sent" properly stamps sentAt', () => {
  db.leads.push({id:'lead10', name:'Jane'});
  currentQuoteLeadId = 'lead10';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  const saved = saveQuote('sent', {force:true});
  assertEq(saved.status, 'sent');
  if (!saved.sentAt) throw new Error('sentAt should be stamped when status=sent');
});

test('SCENARIO 11: createdAt preserved across saves (not overwritten)', () => {
  db.leads.push({id:'lead11', name:'Kim'});
  currentQuoteLeadId = 'lead11';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  const first = saveQuote('draft', {force:true});
  const firstCreatedAt = first.createdAt;
  
  // Wait a tick (simulated)
  qbDays[0].crew = 4;
  const second = saveQuote('sent', {force:true});
  
  assertEq(second.createdAt, firstCreatedAt, 'createdAt should NOT change on subsequent saves');
});

test('SCENARIO 12: Two quote-saves with the same currentQuoteId update the same record', () => {
  db.leads.push({id:'lead12', name:'Luke'});
  currentQuoteLeadId = 'lead12';
  qbDays = [{id:'d1', crew:3, hrsMin:5, hrsMax:7, rate:225, loads:[{address:'A'}], unloads:[{address:'B'}]}];
  
  const first = saveQuote('draft', {force:true});
  const firstId = first.id;
  assertEq(db.quotes.length, 1);
  
  // Mutate and save again
  qbDays[0].crew = 5;
  const second = saveQuote('sent', {force:true});
  
  assertEq(second.id, firstId, 'Should be same record ID');
  assertEq(db.quotes.length, 1, 'Should still be one record, not two');
  assertEq(db.quotes[0].days[0].crew, 5, 'The single record should have the latest values');
});

run();
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
