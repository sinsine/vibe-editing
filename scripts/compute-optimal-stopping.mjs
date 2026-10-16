// Independently verifies the optimal-stopping numbers a film is allowed to display, and
// emits the datasets the data-viz scenes animate.
//
// This is the worked example of the rule the whole pipeline runs on: every figure a film
// prints is computed, never invented. Copy it and replace the maths with whatever your
// theme actually needs to compute — nothing in the pipeline depends on these particular
// numbers, only on the fact that they were produced by a script rather than typed in.
//
//   node tools/compute-optimal-stopping.mjs [--n 100] [--trials 200000] [--seed 20241016]
//
// Output: data/optimal-stopping.json
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from './lib/vibe-config.mjs';
const cfg = loadConfig();

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
function intArg(name, fallback, min = -Infinity) {
  const raw = arg(name, null);
  const v = parseInt(raw ?? String(fallback), 10);
  if (!Number.isInteger(v) || v < min) {
    console.error(`--${name} must be an integer >= ${min} (got "${raw ?? fallback}")`);
    process.exit(2);
  }
  return v;
}
const N = intArg('n', 100, 2);
const TRIALS = intArg('trials', 200000, 1);
const SEED = intArg('seed', 20241016);

fs.mkdirSync(cfg.dataDir, { recursive: true });

// ---------- exact: P(success | r, n) ----------
// Reject the first r-1, then take the first candidate better than all seen.
// P = (r-1)/n * sum_{k=r}^{n} 1/(k-1)
function pSuccess(n, r) {
  if (r < 2) return 1 / n; // "take the first" degenerates to a random pick
  let s = 0;
  for (let k = r; k <= n; k++) s += 1 / (k - 1);
  return ((r - 1) / n) * s;
}

function bestR(n) {
  let best = { r: 1, p: 0 };
  for (let r = 1; r <= n; r++) {
    const p = pSuccess(n, r);
    if (p > best.p) best = { r, p };
  }
  return best;
}

const E = Math.E;
const table = [];
for (const n of [5, 10, 20, 50, 100, 500, 1000, 10000]) {
  const b = bestR(n);
  table.push({
    n,
    bestR: b.r,
    bestP: +b.p.toFixed(6),
    rOverN: +(b.r / n).toFixed(4),
    nOverE: +(n / E).toFixed(3),
    blindPickP: +(1 / n).toFixed(6),
    improvement: +(b.p / (1 / n)).toFixed(1),
    oneOverE: +(1 / E).toFixed(6),
  });
}
console.log('=== exact optimum, maximize P(pick the single best) ===');
console.log('     n   best r   r/n     P(win)     1/n        gain     n/e');
for (const t of table) {
  console.log(`  ${String(t.n).padStart(5)}  ${String(t.bestR).padStart(6)}  ${t.rOverN.toFixed(3)}  ${t.bestP.toFixed(4)}  ${t.blindPickP.toFixed(5)}  ${String(t.improvement).padStart(5)}x  ${t.nOverE.toFixed(1)}`);
}
console.log(`\n  1/e = ${(1 / E).toFixed(6)}   -> the limit of the optimal win probability`);
console.log(`  finite-n check: is bestR == round(n/e)?`);
for (const t of table) {
  console.log(`    n=${String(t.n).padStart(5)}  bestR=${String(t.bestR).padStart(5)}  round(n/e)=${Math.round(t.nOverE)}  ceil=${Math.ceil(t.nOverE)}  floor=${Math.floor(t.nOverE)}`);
}

// ---------- Monte Carlo verification of the exact formula ----------
function simulate(n, r, trials, rng) {
  let wins = 0;
  let pctSum = 0;
  let top10 = 0;
  for (let t = 0; t < trials; t++) {
    // random permutation of 0..n-1 where 0 = best (rank 1 = best)
    const perm = new Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    let pick = -1;
    let bestSeen = Infinity;
    for (let i = 0; i < n; i++) {
      if (i < r - 1) {
        bestSeen = Math.min(bestSeen, perm[i]);
        continue;
      }
      if (perm[i] < bestSeen) { pick = perm[i]; break; }
      bestSeen = Math.min(bestSeen, perm[i]);
    }
    if (pick === -1) pick = perm[n - 1];
    if (pick === 0) wins++;
    // percentile: best=100, worst=0
    pctSum += 100 * (1 - pick / (n - 1));
    if (pick <= Math.floor(n * 0.1) - 1) top10++;
  }
  return { winRate: wins / trials, meanPercentile: pctSum / trials, top10Rate: top10 / trials };
}

// deterministic RNG (mulberry32) so results are reproducible
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The reference film sampled these fourteen r values at n=100; the same fractions
// generalise the table to any --n without changing it at the default.
const CURVE_FRACTIONS = [0.01, 0.05, 0.10, 0.20, 0.30, 0.37, 0.38, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
const R_LIST = [...new Set(CURVE_FRACTIONS.map((f) => Math.max(1, Math.min(N, Math.round(f * N)))))].sort((a, b) => a - b);

const rng = mulberry32(SEED);
console.log(`\n=== Monte Carlo, n=${N}, ${TRIALS} trials ===`);
console.log('     r     r/n    P(win) sim   P(win) exact   mean pct   P(top 10%)');
const curve = [];
for (const r of R_LIST) {
  const s = simulate(N, r, TRIALS, rng);
  const exact = pSuccess(N, r);
  curve.push({ r, rOverN: +(r / N).toFixed(3), winSim: +s.winRate.toFixed(4), winExact: +exact.toFixed(4), meanPercentile: +s.meanPercentile.toFixed(1), top10Rate: +s.top10Rate.toFixed(4) });
  console.log(`  ${String(r).padStart(4)}  ${(r / N).toFixed(2)}   ${s.winRate.toFixed(4)}        ${exact.toFixed(4)}        ${s.meanPercentile.toFixed(1)}      ${s.top10Rate.toFixed(4)}`);
}

// ---------- the full win-rate curve for this n (for the chart scene) ----------
const fullCurve = [];
for (let r = 1; r <= N; r++) fullCurve.push({ r, p: +pSuccess(N, r).toFixed(5) });
const peak = fullCurve.reduce((a, b) => (b.p > a.p ? b : a));

// ---------- satisficing: expected percentile by r (mean over r) ----------
// the interesting contrast: chasing "the best" is not the same as getting a good one
console.log(`\n=== n=${N} summary ===`);
console.log(`  optimal threshold r* = ${peak.r} (${((peak.r / N) * 100).toFixed(0)}%), P(best) = ${peak.p.toFixed(4)} ~ 1/e = ${(1 / E).toFixed(4)}`);
console.log(`  blind random pick    = ${(1 / N).toFixed(4)}`);
console.log(`  even optimally, you miss the best ${((1 - peak.p) * 100).toFixed(1)}% of the time`);

const out = {
  generatedBy: 'tools/compute-optimal-stopping.mjs',
  n: N,
  trials: TRIALS,
  seed: SEED,
  exactTable: table,
  oneOverE: +(1 / E).toFixed(6),
  monteCarlo: { n: N, trials: TRIALS, rngSeed: SEED, curve },
  fullCurveN100: fullCurve,
  peakN100: peak,
  fullCurve,
  peak,
  notes: [
    'P(success|r,n) = ((r-1)/n) * sum_{k=r..n} 1/(k-1)',
    'optimal r/n -> 1/e as n grows; optimal success probability -> 1/e = 0.3679',
    'Monte Carlo uses a seeded mulberry32 PRNG for reproducibility',
    'fullCurveN100 / peakN100 are the key names the packet builder reads; they describe --n (default 100)',
  ],
};
fs.writeFileSync(path.join(cfg.dataDir, 'optimal-stopping.json'), JSON.stringify(out, null, 2));
console.log('\nwrote ' + path.join(cfg.dataDir, 'optimal-stopping.json'));
