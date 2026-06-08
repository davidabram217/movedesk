// Quote phone-number addition test
// Run: node quote_phone_test.js  (expects ./index.html and ./quote-page.js)
const fs=require('fs'),vm=require('vm');
let pass=0,fail=0;
function check(n,c){if(c)pass++;else{fail++;console.log('  ❌ '+n);}}

const idx=fs.readFileSync('index.html','utf8');
const script=idx.slice(idx.indexOf('<script>')+8,idx.lastIndexOf('</script>'));
const qp=fs.readFileSync('quote-page.js','utf8');

// --- wiring ---
check('saveQuote persists customerPhone',/leadId:currentQuoteLeadId,\s*customerName:l\?l\.name:'',\s*customerEmail:l\?l\.email:'',\s*customerPhone:l\?l\.phone:'',/.test(script));
check('renderQuoteHTML draws phone under name (guarded)',/Prepared for \$\{esc\(q\.customerName\)\}<\/div>`:''\}\s*\$\{q\.customerPhone\?`<div style="font-size:13px;color:#9e9b94;margin-top:3px">\$\{esc\(q\.customerPhone\)\}<\/div>`:''\}/.test(script));
check('renderQuote (customer) draws phone under name (guarded)',/Prepared for '\+esc\(q\.customerName\)\+'<\/div>':''\)\+\s*\(q\.customerPhone\?'<div style="font-size:13px;color:#9e9b94;margin-top:3px">'\+esc\(q\.customerPhone\)\+'<\/div>':''\)/.test(qp));

// --- behavior: render both, compare the phone fragment ---
let captured='';
function makeEl(isOut){let _t='';return{set textContent(v){_t=String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');},get textContent(){return _t;},set innerHTML(v){_t=v;if(isOut)captured=v;},get innerHTML(){return _t;},style:{},appendChild(){},disabled:false};}
const doc={createElement:()=>makeEl(false),getElementById:id=>makeEl(id==='quote-content'),head:{appendChild(){}}};
global.document=doc;global.window={location:{search:''}};
function extract(src,name){const m=new RegExp('function\\s+'+name+'\\s*\\(').exec(src);let i=src.indexOf('{',m.index),d=0,s=false,sc='',t=false,e=false;for(let p=i;p<src.length;p++){const c=src[p];if(e){e=false;continue;}if(c==='\\'){e=true;continue;}if(s){if(c===sc)s=false;continue;}if(t){if(c==='`')t=false;continue;}if(c==='"'||c==="'"){s=true;sc=c;continue;}if(c==='`'){t=true;continue;}if(c==='{')d++;else if(c==='}'){d--;if(d===0)return src.slice(m.index,p+1);}}}
const ctx={document:doc,Number,Date,String,Array,Object,console};vm.createContext(ctx);
vm.runInContext(extract(script,'renderQuoteHTML'),ctx);
eval(qp.replace(/\nloadQuote\(\);\s*$/,'\n'));

const base={jobType:'single',status:'draft',publicId:'p',id:'i',days:[{date:'2026-07-15',crew:3,hrsMin:4,hrsMax:6,rate:225,loads:[{address:'A'}],unloads:[{address:'B'}]}],fees:[],totalMin:900,totalMax:1350};
const withPhone=Object.assign({},base,{customerName:'Jane Doe',customerPhone:'(415) 555-0123'});
const noPhone=Object.assign({},base,{customerName:'Jane Doe'});
const PHONE_DIV='color:#9e9b94;margin-top:3px">(415) 555-0123</div>';

const office1=ctx.renderQuoteHTML(withPhone,{name:'Jane Doe',phone:'(415) 555-0123'});
renderQuote(withPhone);const cust1=captured;
check('office shows phone',office1.includes(PHONE_DIV));
check('customer shows phone',cust1.includes(PHONE_DIV));
check('phone fragment identical in both',office1.includes(PHONE_DIV)&&cust1.includes(PHONE_DIV));

// parity of the HEADER region (where the phone lives) after normalizing pre-existing
// cosmetic diffs (inter-tag whitespace + middot encoding). The live Accept button and
// other body differences are intentional and out of scope for this change.
const norm=s=>s.replace(/>\s+</g,'><').replace(/\s+/g,' ').replace(/&middot;/g,'\u00b7').trim();
const header=s=>{const n=norm(s);const cut=n.indexOf('Move Details');return cut>0?n.slice(0,cut):n;};
check('header region (with phone) identical in both renderers',header(office1)===header(cust1));

// legacy quote with no phone -> no phone div, no crash
const office2=ctx.renderQuoteHTML(noPhone,{name:'Jane Doe'});
captured='';renderQuote(noPhone);const cust2=captured;
check('office: no phone div when phone absent',!office2.includes('margin-top:3px"'));
check('customer: no phone div when phone absent',!cust2.includes('margin-top:3px"'));
check('legacy still renders name',office2.includes('Prepared for Jane Doe')&&cust2.includes('Prepared for Jane Doe'));

console.log('\n═══════════════════════════════════════');
console.log('RESULTS: '+pass+' passed, '+fail+' failed');
if(!fail)console.log('ALL TESTS PASSED ✅');
console.log('═══════════════════════════════════════');
process.exit(fail?1:0);
