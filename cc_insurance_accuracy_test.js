// Guard: credit-card surcharge + add-on insurance excluded from quote-accuracy comparison
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

// Structural
check('helper computes ccFee from feeCC',/const ccFee=Number\(j\.feeCC\)\|\|0;/.test(script));
check('helper computes insurance from feeInsurance',/const insurance=Number\(j\.feeInsurance\)\|\|0;/.test(script));
check('helper subtracts addOns in non-cash path',/compareTotal:Math\.max\(0,realJobValue-addOns\)/.test(script));
check('helper subtracts addOns in cash path',/compareTotal:Math\.max\(0,regularEquiv-addOns\)/.test(script));
check('AI box renders add-on exclusion note',/excludes <strong>'\+fmtMoney\(_cmp\.addOns\)/.test(script));

// Behavioral: extract getQuoteCompareTotal and exercise it
const start=script.indexOf('function getQuoteCompareTotal(j){');
const end=script.indexOf('function uid(',start);
const src=script.slice(start,end);
let getQuoteCompareTotal;
try{ getQuoteCompareTotal=eval('('+src.replace('function getQuoteCompareTotal','function')+')'); }
catch(e){ check('helper extracts/evaluates',false); }

if(getQuoteCompareTotal){
  // Quote was ~$1500; customer paid $1500 move + $100 insurance + $54 card fee = $1654 total
  const a=getQuoteCompareTotal({total:1654,feeCC:54,feeInsurance:100});
  check('add-ons stripped: $1654 total -> $1500 compared',a.compareTotal===1500);
  check('reports addOns total',a.addOns===154);
  check('actualPaid still reflects full charge',a.actualPaid===1654);

  // Genuine overrun (no add-ons) is NOT masked
  const b=getQuoteCompareTotal({total:1800,feeCC:0,feeInsurance:0});
  check('real overrun unaffected: $1800 stays $1800',b.compareTotal===1800);

  // Insurance only (paid by cash, so no card fee), cash-rate normalization still applies
  const c=getQuoteCompareTotal({total:1500,paidCashRate:true,quotedRate:200,cashRate:180,hours:5,feeCC:0,feeInsurance:100});
  // regularEquiv = 1500 - (5*180) + (5*200) = 1600; minus 100 insurance = 1500
  check('cash-rate + insurance add-on: compares at $1500',c.compareTotal===1500);
  check('cash path still flags paidCash',c.paidCash===true);

  // No fee fields at all -> behaves like before (no subtraction)
  const d=getQuoteCompareTotal({total:1200});
  check('no add-on fields: total unchanged ($1200)',d.compareTotal===1200&&d.addOns===0);
}

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
