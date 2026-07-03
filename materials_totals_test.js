// Guards the Completed-page "Standard materials" / "Packing materials" revenue totals.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// Structural: the two reduces + two stat cards exist in renderCompleted
check('computes standard-materials total (feeMaterials sum)',/const tsm=jobs\.reduce\(\(s,j\)=>s\+\(Number\(j\.feeMaterials\)\|\|0\),0\)/.test(src));
check('computes packing-materials total (feePackMaterials sum)',/const tpm=jobs\.reduce\(\(s,j\)=>s\+\(Number\(j\.feePackMaterials\)\|\|0\),0\)/.test(src));
check('renders a Standard materials stat card',/Standard materials<\/div><div class="stat-value">\$\{fmtMoney\(tsm\)\}/.test(src));
check('renders a Packing materials stat card',/Packing materials<\/div><div class="stat-value">\$\{fmtMoney\(tpm\)\}/.test(src));

// Behavioral: the summing logic totals each bucket correctly and respects a filtered subset
const jobs=[
  {feeMaterials:40,feePackMaterials:100},
  {feeMaterials:25,feePackMaterials:0},
  {feeMaterials:0,feePackMaterials:250},
  {feeMaterials:'',feePackMaterials:''},           // blanks ignored
  {feeMaterials:60},                                // missing packing
];
const tsm=jobs.reduce((s,j)=>s+(Number(j.feeMaterials)||0),0);
const tpm=jobs.reduce((s,j)=>s+(Number(j.feePackMaterials)||0),0);
check('standard materials total = 125',tsm===125);
check('packing materials total = 350',tpm===350);
// filtered subset (e.g. one crew) totals only that subset
const subset=jobs.slice(0,2);
check('subset standard total = 65',subset.reduce((s,j)=>s+(Number(j.feeMaterials)||0),0)===65);
check('subset packing total = 100',subset.reduce((s,j)=>s+(Number(j.feePackMaterials)||0),0)===100);

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
