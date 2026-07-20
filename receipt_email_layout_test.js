// Guards the receipt/invoice against email-UNSAFE layout (CSS grid / flex).
//
// BACKGROUND (2026-07-15). The office preview and the emailed receipt looked different: the app
// used display:grid / display:flex for two-column layout, which renders fine in a browser but
// email clients (Gmail, Yahoo, Outlook) STRIP those properties and collapse everything to one
// stacked column. Reported: the customer's emailed receipt was single-column and mis-aligned vs
// the two-column office preview (same HTML, different renderer). No attachment needed — the fix is
// to build the layout with <table> instead, which every email client renders identically.
//
// This suite fails if any grid/flex layout returns to buildReceiptInvoiceHTML.
//
// Run: node receipt_email_layout_test.js index.html
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// Extract the receipt builder body.
function grab(sig){const i=src.indexOf(sig);if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';}
const fn=grab('function buildReceiptInvoiceHTML(j){');
check('buildReceiptInvoiceHTML found',!!fn);

// Strip line comments so the explanatory note ("...strip display:grid/flex...") doesn't count.
const code=fn.replace(/^\s*\/\/.*$/gm,'');

check('no display:grid in the receipt (email clients strip it)',!/display:grid/.test(code));
check('no display:flex in the receipt (email clients strip it)',!/display:flex/.test(code));
check('no grid-template-columns in the receipt',!/grid-template-columns/.test(code));

// The layout it DOES use must be table-based.
check('job details use a presentation table',/Job details[\s\S]{0,200}<table role="presentation"/.test(code));
check('the two-column job-detail cells use width="50%"',/<td width="50%"/.test(code));
check('the Total row uses a table, not flex',/Total<span[\s\S]{0,40}<\/td>/.test(code)||/<td[^>]*text-align:right[^>]*>Total/.test(code));
check('the header (title/date) uses a table',/RECEIPT[\s\S]{0,30}<\/div>[\s\S]{0,120}<td[^>]*align="right"/.test(code)||/<table role="presentation"[\s\S]{0,400}INVOICE':'RECEIPT'/.test(code));
check('payment rows use tables',/paymentsHtml.{0,120}<table role="presentation"/.test(src));

// The charges table was already a real <table> — make sure it still is.
check('charges are still a real table with Description/Amount headers',/<th[^>]*>Description<\/th>/.test(code)&&/<tbody>\$\{rows\}<\/tbody>/.test(code));

// Behavioural: job-detail cells pair two-per-row.
function buildDetails(j){
  const esc=s=>String(s==null?'':s);
  const cell=(l,v)=>`<td width="50%">${l}:${v}</td>`;
  const d=[];
  if(j.from)d.push(cell('Pick-up',esc(j.from)));
  if(j.to)d.push(cell('Drop-off',esc(j.to)));
  if(j.hours)d.push(cell('Time',j.hours));
  if(j.crew)d.push(cell('Crew leader',esc(j.crew)));
  let rows='';
  for(let i=0;i<d.length;i+=2)rows+=`<tr>${d[i]}${d[i+1]||'<td width="50%"></td>'}</tr>`;
  return rows;
}
const r=buildDetails({from:'A',to:'B',hours:'10.5',crew:'nubio'});
check('4 details -> 2 rows',(r.match(/<tr>/g)||[]).length===2);
check('odd count pads the last cell',(buildDetails({from:'A',to:'B',hours:'10.5'}).match(/<td width="50%"><\/td>/g)||[]).length===1);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
