// Guards the customer receipt/invoice line items.
//
// BACKGROUND (2026-07-15, reported via Alexandra Russell). The receipt itemized only some charges:
// packing materials (feePackMaterials), the credit-card surcharge (feeCC) and custom misc charges
// (miscCharges) were stored on the completed job but NEVER rendered. Result: a card-paid receipt's
// line items summed to LESS than "Total charged" — Alexandra's showed Labour $1,575 + Fuel $50 =
// $1,625 but a total of $1,839 (missing $151.50 packing + $62 surcharge). The receipt only read
// feeMaterials, not feePackMaterials, so packing vanished; and there was no surcharge line at all.
//
// FIX: receipt now renders Packing materials, misc charges, and the CC surcharge, so the itemized
// charges reconcile to the total.
//
// Run: node receipt_detail_test.js index.html
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// ── Structural: the receipt builder renders the previously-missing lines ──
check('receipt renders Packing materials (feePackMaterials)',/addRow\('Packing materials',j\.feePackMaterials\)/.test(src));
check('receipt renders misc charges',/j\.miscCharges\.forEach/.test(src)&&/addRow\(m\.label\|\|'Additional charge',m\.amount\)/.test(src));
check('receipt renders the credit-card surcharge (feeCC)',/addRow\('Credit card surcharge \(3\.5%\)',j\.feeCC\)/.test(src));
check('the surcharge line sits AFTER the Yelp discount (before the total)',
  src.indexOf("Yelp discount")<src.indexOf("Credit card surcharge (3.5%)',j.feeCC"));
check('existing lines still present (Materials/Fuel/Parking/COI/Insurance/Dump/Damage)',
  /addRow\('Materials',j\.feeMaterials\)/.test(src)&&/addRow\('Fuel fee',j\.feeFuel\)/.test(src)&&
  /addRow\('Parking permits',j\.feeParkingPermit\)/.test(src)&&/addRow\('COI fee',j\.feeCOI\)/.test(src)&&
  /addRow\('Insurance',j\.feeInsurance\)/.test(src)&&/addRow\('Dump fee',j\.feeDump\)/.test(src)&&
  /addRow\('Damage\/claim',j\.feeDamage\)/.test(src));

// ── Behavioural: itemized lines reconcile to the stored total ──
// Model addRow's "skip zero/empty" behaviour + the exact line set the receipt now renders.
function receiptLineSum(j){
  const rows=[];
  const addRow=(label,amount)=>{ if(!amount||Number(amount)===0)return; rows.push([label,Number(amount)]); };
  // labour
  addRow('Labour',j.feeLabour||(j.hours&&j.hourlyRateCharged?j.hours*j.hourlyRateCharged:0));
  addRow('Materials',j.feeMaterials);
  addRow('Packing materials',j.feePackMaterials);
  addRow('Fuel fee',j.feeFuel);
  addRow('Parking permits',j.feeParkingPermit);
  addRow('COI fee',j.feeCOI);
  addRow('Insurance',j.feeInsurance);
  addRow('Dump fee',j.feeDump);
  addRow('Damage/claim',j.feeDamage);
  if(Array.isArray(j.miscCharges))j.miscCharges.forEach(m=>{if(m&&Number(m.amount)>0)addRow(m.label||'Additional charge',m.amount);});
  let sum=rows.reduce((s,r)=>s+r[1],0);
  if(j.feeYelp&&Number(j.feeYelp)>0)sum-=Number(j.feeYelp);  // discount subtracts
  addRow('Credit card surcharge (3.5%)',j.feeCC);
  if(j.feeCC&&Number(j.feeCC)>0)sum+=Number(j.feeCC);
  return Math.round(sum*100)/100;
}

// Alexandra Russell — the reported case
const alex={feeLabour:1575,feePackMaterials:151.5,feeMaterials:0,feeFuel:50,feeCC:62.5,miscCharges:[],feeYelp:0,total:1839};
check('Alexandra: itemized lines reconcile to $1,839',receiptLineSum(alex)===alex.total);
check('Alexandra: packing materials no longer dropped',receiptLineSum(alex)-receiptLineSum(Object.assign({},alex,{feePackMaterials:0}))===151.5);
check('Alexandra: surcharge no longer dropped',receiptLineSum(alex)-receiptLineSum(Object.assign({},alex,{feeCC:0}))===62.5);

// Cash job (no surcharge) still reconciles
const cash={feeLabour:1200,feeFuel:80,feeMaterials:40,feeCC:0,miscCharges:[],total:1320};
check('cash job reconciles with no surcharge line',receiptLineSum(cash)===cash.total);

// Misc charge appears and counts
const misc={feeLabour:1000,feeCC:0,miscCharges:[{label:'Piano handling',amount:250}],total:1250};
check('misc charge is itemized and summed',receiptLineSum(misc)===1250);

// Yelp discount still subtracts correctly
const yelp={feeLabour:1000,feeFuel:100,feeYelp:50,feeCC:0,miscCharges:[],total:1050};
check('yelp discount reconciles (subtracts)',receiptLineSum(yelp)===yelp.total);

// A fully-loaded job
const full={feeLabour:2000,feeMaterials:75,feePackMaterials:120,feeFuel:90,feeParkingPermit:40,
  feeCOI:25,feeInsurance:60,feeDump:0,feeDamage:0,feeCC:0,
  miscCharges:[{label:'Long carry',amount:150}],feeYelp:0,total:2560};
check('fully-loaded job reconciles',receiptLineSum(full)===full.total);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
