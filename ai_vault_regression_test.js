// Tests for the 2026-05-26 vault-regression blend in the AI quote builder.
// Verifies: (1) the regression fits correctly, (2) more vaults → more hours (monotonic),
// (3) fallback when insufficient data, (4) sanity guards reject bad fits.

const fs = require('fs');
const indexHtml = fs.readFileSync('/home/claude/index.html', 'utf8');

let pass = 0, fail = 0;
function check(name, condition, info) {
  if (condition) { console.log('✓ ' + name); pass++; }
  else { console.log('✗ ' + name + (info ? '\n  ' + info : '')); fail++; }
}

console.log('PART A: Wiring');
check('computeVaultRegression function defined', /function computeVaultRegression\(\)/.test(indexHtml));
check('Has MIN_JOBS threshold guard', /const MIN_JOBS=6/.test(indexHtml));
check('Rejects non-positive slope', /if\(slope<=0\)return null/.test(indexHtml));
check('Rejects negative intercept', /if\(intercept<0\)return null/.test(indexHtml));
check('Vault blend section present', /VAULT REGRESSION BLEND/.test(indexHtml));
check('Uses 65% vault weight', /VAULT_WEIGHT=0\.65/.test(indexHtml));
check('Falls back to neighborHours when no vaults/no fit', /adjustedHours=neighborHours/.test(indexHtml));
check('Crew-adjusts the regression prediction', /regCrewAdjusted=regBaseHours\*/.test(indexHtml));

console.log('');
console.log('PART B: Regression math (replicating computeVaultRegression)');

function fitRegression(data) {
  const valid = data.filter(j => j.actualHours && j.estimatedVaults && j.estimatedVaults > 0);
  if (valid.length < 6) return null;
  const xs = valid.map(j => j.estimatedVaults);
  const ys = valid.map(j => j.actualHours);
  const n = xs.length;
  const meanX = xs.reduce((a,b)=>a+b,0)/n;
  const meanY = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, den=0;
  for (let i=0;i<n;i++){ num += (xs[i]-meanX)*(ys[i]-meanY); den += (xs[i]-meanX)**2; }
  if (den === 0) return null;
  const slope = num/den;
  const intercept = meanY - slope*meanX;
  if (slope <= 0) return null;
  if (intercept < 0) return null;
  return { slope, intercept, n };
}

// David's actual data sample (from the diagnostic output)
const realData = [
  { estimatedVaults: 2, actualHours: 4.25 },
  { estimatedVaults: 3, actualHours: 6 },
  { estimatedVaults: 3, actualHours: 3.5 },
  { estimatedVaults: 3, actualHours: 4.75 },
  { estimatedVaults: 3, actualHours: 7.5 },
  { estimatedVaults: 4, actualHours: 7.5 },
  { estimatedVaults: 5, actualHours: 7.5 },
  { estimatedVaults: 5, actualHours: 6.5 },
  { estimatedVaults: 5, actualHours: 4.5 },
  { estimatedVaults: 6, actualHours: 9.25 },
  { estimatedVaults: 7, actualHours: 7.75 },
  { estimatedVaults: 8, actualHours: 8.75 },
  { estimatedVaults: 8, actualHours: 9.5 },
  { estimatedVaults: 9, actualHours: 8.75 },
  { estimatedVaults: 9, actualHours: 7.5 },
  { estimatedVaults: 11, actualHours: 12.25 },
  { estimatedVaults: 11, actualHours: 13 }
];

const reg = fitRegression(realData);
check('Regression fits on real data (17 jobs)', reg !== null);
check('Slope is positive (~0.76)', reg && reg.slope > 0.5 && reg.slope < 1.1, reg ? 'slope='+reg.slope.toFixed(2) : 'null');
check('Intercept is sensible (~3.0)', reg && reg.intercept > 1.5 && reg.intercept < 4.5, reg ? 'intercept='+reg.intercept.toFixed(2) : 'null');

console.log('');
console.log('PART C: Monotonicity — the core bug fix');

// Replicate the blend for a fixed crew/access so we isolate the vault effect
const crewRatios = {1:2.5,2:1.55,3:1.0,4:0.78,5:0.65,6:0.58,7:0.54,8:0.5};
function blendedHours(vaults, neighborHours, reg, men) {
  const accessHourDelta = 0; // hold constant
  if (reg && vaults) {
    const regBase = reg.intercept + reg.slope * vaults;
    const regCrewAdj = regBase * ((crewRatios[men]||1.0)/(crewRatios[3]||1.0)) + accessHourDelta;
    const W = 0.65;
    return regCrewAdj * W + neighborHours * (1-W);
  }
  return neighborHours;
}

// Hold neighbor estimate + crew constant, sweep vaults up. Hours must never decrease.
const fixedNeighbor = 6.0;
const men = 3;
let prevHours = -1;
let monotonic = true;
let detail = [];
for (let v = 2; v <= 12; v++) {
  const h = blendedHours(v, fixedNeighbor, reg, men);
  detail.push(v + 'v→' + h.toFixed(2) + 'h');
  if (h < prevHours - 0.001) { monotonic = false; }
  prevHours = h;
}
check('Hours are MONOTONIC as vaults increase (never decreases)', monotonic, detail.join('  '));

// Specifically the reported bug: 3 vaults vs 5 vaults — 5 must be >= 3
const h3 = blendedHours(3, fixedNeighbor, reg, men);
const h5 = blendedHours(5, fixedNeighbor, reg, men);
check('5 vaults >= 3 vaults (the original bug case)', h5 >= h3, '3v='+h3.toFixed(2)+' 5v='+h5.toFixed(2));
check('5 vaults is meaningfully MORE than 3 (not just equal)', h5 > h3 + 0.5, '3v='+h3.toFixed(2)+' 5v='+h5.toFixed(2));

console.log('');
console.log('PART D: Fallback behavior');

// Fewer than 6 jobs → no regression → pure neighbor estimate
const sparse = realData.slice(0, 4);
const sparseReg = fitRegression(sparse);
check('Sparse data (<6 jobs) → regression returns null', sparseReg === null);
check('With null regression, blendedHours returns neighbor estimate unchanged',
  blendedHours(5, 6.0, null, 3) === 6.0);

// No vaults input → pure neighbor even if regression exists
check('No vault count → neighbor estimate (regression not applied)',
  blendedHours(null, 6.0, reg, 3) === 6.0);

// Negative-slope data → rejected
const badData = [
  { estimatedVaults: 2, actualHours: 12 },
  { estimatedVaults: 4, actualHours: 10 },
  { estimatedVaults: 6, actualHours: 8 },
  { estimatedVaults: 8, actualHours: 6 },
  { estimatedVaults: 10, actualHours: 4 },
  { estimatedVaults: 12, actualHours: 2 }
];
check('Negative-slope data → regression rejected (returns null)', fitRegression(badData) === null);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
