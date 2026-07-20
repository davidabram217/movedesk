// Guards that the typed draft message actually reaches the customer.
//
// BACKGROUND (2026-07-15). The customer received the formatted receipt but NOT the body the office
// typed in the draft. Cause: sendReceiptInvoice passes htmlBody (the receipt); the email service's
// receipt template renders html_content but not the separate `message` field — so the typed note
// was invisible. FIX: the typed message is prepended INTO html_content, above the receipt, as an
// intro. Empty notes add nothing; the note is HTML-escaped.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

check('receipt send builds an _intro from the typed body',/const _intro=\(body\|\|''\)\.trim\(\)/.test(src));
check('the intro is prepended to the receipt html',/const htmlBody=_intro\+_receiptHtml/.test(src));
check('the typed body is HTML-escaped',/escHtml\(body\)\.replace\(\/\\n\/g,'<br>'\)/.test(src));
check('an empty body adds no intro',/\.trim\(\)\s*\?[\s\S]{0,400}:\s*''/.test(src));
check('the receipt html itself is still built',/const _receiptHtml=buildReceiptInvoiceHTML\(j\)/.test(src));
check('htmlBody (intro+receipt) is passed to sendEmail',/sendEmail\(to,OFFICE_EMAIL,subject,body,htmlBody\)/.test(src));

// Behavioural model
const escHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function build(body,receipt){
  const intro=(body||'').trim()?'<div class="i">'+escHtml(body).replace(/\n/g,'<br>')+'</div>':'';
  return intro+receipt;
}
const R='<RCPT/>';
check('typed note appears above the receipt',build('Thank you!',R)==='<div class="i">Thank you!</div>'+R);
check('newlines become <br>',build('a\nb',R).includes('a<br>b'));
check('empty/whitespace note -> receipt only',build('   ',R)===R && build('',R)===R && build(null,R)===R);
check('html in the note is escaped, not injected',build('<script>x</script>',R).includes('&lt;script&gt;'));
check('receipt always present regardless of note',build('hi',R).includes('<RCPT/>')&&build('',R).includes('<RCPT/>'));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
