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
check('Computes meanAbsErr (residual) in regression', /const meanAbsErr=sumAbsErr\/n/.test(indexHtml));
check('Spread uses regression meanAbsErr (not neighbor percentiles) when reg is in play',
  /spreadHrs=_vaultReg\.meanAbsErr/.test(indexHtml)
);

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

function fitRegressionWithResiduals(data) {
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
  let sumAbsErr = 0;
  for (let i=0;i<n;i++){ sumAbsErr += Math.abs(ys[i] - (intercept + slope*xs[i])); }
  return { slope, intercept, n, meanAbsErr: sumAbsErr/n };
}

const regWithMAE = fitRegressionWithResiduals(realData);
check('Regression now returns meanAbsErr', regWithMAE && regWithMAE.meanAbsErr > 0);
check('MAE is in expected range (~1.1 hrs for real data)',
  regWithMAE && regWithMAE.meanAbsErr > 0.7 && regWithMAE.meanAbsErr < 1.5,
  regWithMAE ? 'MAE='+regWithMAE.meanAbsErr.toFixed(2) : 'null');

// Replicate the FULL blend including the new MAE-based spread
const crewRatios = {1:2.5,2:1.55,3:1.0,4:0.78,5:0.65,6:0.58,7:0.54,8:0.5};
function fullEstimate(vaults, neighborHours, reg, men) {
  const accessHourDelta = 0;
  let adjustedHours, usedReg = false;
  if (reg && vaults) {
    const regBase = reg.intercept + reg.slope * vaults;
    const regCrewAdj = regBase * ((crewRatios[men]||1.0)/(crewRatios[3]||1.0)) + accessHourDelta;
    const W = 0.65;
    adjustedHours = regCrewAdj * W + neighborHours * (1-W);
    usedReg = true;
  } else {
    adjustedHours = neighborHours;
  }
  let p25, p75;
  if (usedReg) {
    const crewFactor = (crewRatios[men]||1.0)/(crewRatios[3]||1.0);
    const spreadHrs = reg.meanAbsErr * crewFactor;
    p25 = Math.max(1, adjustedHours - spreadHrs);
    p75 = adjustedHours + spreadHrs;
  } else {
    p25 = neighborHours * 0.85;
    p75 = neighborHours * 1.15;
  }
  return { mid: adjustedHours, p25, p75 };
}

// Sweep vaults — BOTH p25 (low end) AND p75 (high end) must be monotonic
const fixedNeighbor = 6.0;
const men = 3;
let prevMid = -Infinity, prevP25 = -Infinity, prevP75 = -Infinity;
let monotonicMid = true, monotonicP25 = true, monotonicP75 = true;
let detail = [];
for (let v = 2; v <= 12; v++) {
  const r = fullEstimate(v, fixedNeighbor, regWithMAE, men);
  detail.push(v+'v→'+r.p25.toFixed(1)+'-'+r.p75.toFixed(1));
  if (r.mid < prevMid - 0.001) monotonicMid = false;
  if (r.p25 < prevP25 - 0.001) monotonicP25 = false;
  if (r.p75 < prevP75 - 0.001) monotonicP75 = false;
  prevMid = r.mid; prevP25 = r.p25; prevP75 = r.p75;
}
check('MIDPOINT is monotonic across vault sweep', monotonicMid);
check('LOW END (p25) is monotonic — never decreases', monotonicP25, detail.join('  '));
check('HIGH END (p75) is monotonic — never decreases', monotonicP75, detail.join('  '));

// The exact bug case: 3 vaults vs 5 vaults
const r3 = fullEstimate(3, fixedNeighbor, regWithMAE, men);
const r5 = fullEstimate(5, fixedNeighbor, regWithMAE, men);
check('5 vaults: low end >= 3 vaults low end (was the original bug)', r5.p25 >= r3.p25,
  '3v='+r3.p25.toFixed(2)+' 5v='+r5.p25.toFixed(2));
check('5 vaults: HIGH end >= 3 vaults HIGH end (the second-pass bug)', r5.p75 >= r3.p75,
  '3v='+r3.p75.toFixed(2)+' 5v='+r5.p75.toFixed(2));
check('5 vaults: midpoint meaningfully > 3 vaults midpoint', r5.mid > r3.mid + 0.5);

// Spread width is consistent (not jittery)
const spreads = [];
for (let v = 2; v <= 12; v++) {
  const r = fullEstimate(v, fixedNeighbor, regWithMAE, men);
  spreads.push(r.p75 - r.p25);
}
const minSpread = Math.min(...spreads);
const maxSpread = Math.max(...spreads);
check('Spread width is constant across vault counts (no jitter)',
  Math.abs(maxSpread - minSpread) < 0.01,
  'min='+minSpread.toFixed(2)+' max='+maxSpread.toFixed(2));

console.log('');
console.log('PART D: Fallback behavior');

// Fewer than 6 jobs → no regression → pure neighbor estimate
const sparse = realData.slice(0, 4);
const sparseReg = fitRegressionWithResiduals(sparse);
check('Sparse data (<6 jobs) → regression returns null', sparseReg === null);
check('With null regression, fullEstimate returns neighbor estimate unchanged',
  fullEstimate(5, 6.0, null, 3).mid === 6.0);

// No vaults input → pure neighbor even if regression exists
check('No vault count → neighbor estimate (regression not applied)',
  fullEstimate(null, 6.0, regWithMAE, 3).mid === 6.0);

// Negative-slope data → rejected
const badData = [
  { estimatedVaults: 2, actualHours: 12 },
  { estimatedVaults: 4, actualHours: 10 },
  { estimatedVaults: 6, actualHours: 8 },
  { estimatedVaults: 8, actualHours: 6 },
  { estimatedVaults: 10, actualHours: 4 },
  { estimatedVaults: 12, actualHours: 2 }
];
check('Negative-slope data → regression rejected (returns null)', fitRegressionWithResiduals(badData) === null);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(fail > 0 ? 1 : 0);
