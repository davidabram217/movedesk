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
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return src.slice(start, i);
}

// Mocks
global.window = {};
global.document = {
  createElement: () => { let s=''; return {get textContent(){return s;}, set textContent(v){s=v;}, get innerHTML(){return s;}, appendChild:()=>{}}; },
  getElementById: () => ({innerHTML:'', textContent:'', style:{}})
};
global.esc = function(s){const d=global.document.createElement('div');d.textContent=s||'';return d.innerHTML;};
global.fmtMoney = n => '$' + (Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
global.fmtDate = d => d || '';

// Create the office renderer as a callable function
const officeFnSrc = extractFn(indexHtml, 'renderQuoteHTML');
const officeRender = new Function('q', 'lead', officeFnSrc.replace(/^function renderQuoteHTML\s*\([^)]*\)\s*\{/, '').slice(0, -1));

// Create the customer renderer — note it writes to document.getElementById('quote-content').innerHTML
const customerFnSrc = extractFn(customerJs, 'renderQuote');
const customerFn = new Function('q', customerFnSrc.replace(/^function renderQuote\s*\([^)]*\)\s*\{/, '').slice(0, -1));

function renderCustomer(q) {
  let captured = '';
  global.document.getElementById = (id) => {
    if (id === 'quote-content') return { set innerHTML(v){captured=v;}, get innerHTML(){return captured;} };
    return {innerHTML:'',textContent:'',style:{}};
  };
  customerFn(q);
  return captured;
}

function extractKeyValues(html) {
  return {
    has_crew_3: /3 Movers|3 movers/.test(html),
    has_crew_5: /5 Movers|5 movers/.test(html),
    has_hrs_5_7: /5\s*[\u2013\-]\s*7\s*hrs/.test(html),
    has_hrs_6_8: /6\s*[\u2013\-]\s*8\s*hrs/.test(html),
    has_rate_225: /\$225\/hr/.test(html),
    has_rate_375: /\$375\/hr/.test(html),
    has_total_1125: /\$1,125/.test(html),
    has_total_2250: /\$2,250/.test(html)
  };
}

let pass=0, fail=0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

// SCENARIO A
console.log('SCENARIO A: Quote with 3 movers, 5-7 hrs, $225/hr, total $1,125-$1,575');
const quoteV1 = {
  id:'q1', publicId:'p1', status:'sent', customerName:'Alice', projectName:'Alice Move',
  moveType:'Local', size:'2 Bedroom', jobType:'single',
  days:[{date:'2026-06-15', crew:3, hrsMin:5, hrsMax:7, rate:225, arrivalStart:'8AM', arrivalEnd:'9AM',
         loads:[{address:'1 First St'}], unloads:[{address:'2 Second St'}]}],
  fees:[], totalMin:1125, totalMax:1575,
  notes:'Test notes', stipulations:'Test terms', sentBy:'John', estimateType:'Onsite'
};
const officeHtml1 = officeRender(quoteV1);
const customerHtml1 = renderCustomer(quoteV1);
const ok1 = extractKeyValues(officeHtml1);
const ck1 = extractKeyValues(customerHtml1);

check('Office shows 3 movers', ok1.has_crew_3);
check('Customer shows 3 movers', ck1.has_crew_3);
check('Office shows 5-7 hrs', ok1.has_hrs_5_7);
check('Customer shows 5-7 hrs', ck1.has_hrs_5_7);
check('Office shows $225/hr', ok1.has_rate_225);
check('Customer shows $225/hr', ck1.has_rate_225);
check('Office shows $1,125', ok1.has_total_1125);
check('Customer shows $1,125', ck1.has_total_1125);

// SCENARIO B: Same publicId/id, NEW values (resend scenario)
console.log('');
console.log('SCENARIO B: After resend with 5 movers, 6-8 hrs, $375/hr, total $2,250-$3,000');
const quoteV2 = JSON.parse(JSON.stringify(quoteV1));
quoteV2.days[0].crew = 5;
quoteV2.days[0].hrsMin = 6;
quoteV2.days[0].hrsMax = 8;
quoteV2.days[0].rate = 375;
quoteV2.totalMin = 2250;
quoteV2.totalMax = 3000;
const officeHtml2 = officeRender(quoteV2);
const customerHtml2 = renderCustomer(quoteV2);
const ok2 = extractKeyValues(officeHtml2);
const ck2 = extractKeyValues(customerHtml2);

check('Office shows 5 movers (new)', ok2.has_crew_5);
check('Customer shows 5 movers (new)', ck2.has_crew_5);
check('Office does NOT show 3 movers (old)', !ok2.has_crew_3);
check('Customer does NOT show 3 movers (old)', !ck2.has_crew_3);
check('Office shows 6-8 hrs', ok2.has_hrs_6_8);
check('Customer shows 6-8 hrs', ck2.has_hrs_6_8);
check('Office shows $375/hr', ok2.has_rate_375);
check('Customer shows $375/hr', ck2.has_rate_375);
check('Office shows $2,250', ok2.has_total_2250);
check('Customer shows $2,250', ck2.has_total_2250);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
