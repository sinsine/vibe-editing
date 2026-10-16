// Final timing map: fits an exact beat/bar grid to the detected onsets, tests
// 3/4 vs 4/4, and prints the loudness arc as text so the structure is readable
// without looking at a picture.
// Output: audio/timing-map.json
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const hitMap = readJson(process.argv[2] ?? cfg.files.hitMap);
const outPath = process.argv[3] ?? cfg.files.timingMap;

const hits = hitMap.hits; // [{t, z}]
const duration = hitMap.duration;
const energy = hitMap.energy; // 10 Hz, rel 0..1

// ---------- refine period + phase against the hits ----------
function gridScore(period, offset) {
  let s = 0, n = 0;
  for (let k = 0; ; k++) {
    const t = offset + k * period;
    if (t > duration) break;
    // nearest hit within +-45 ms
    let best = 0;
    for (const h of hits) {
      const d = Math.abs(h.t - t);
      if (d < 0.045) best = Math.max(best, h.z * (1 - d / 0.045));
      if (h.t > t + 0.05) break;
    }
    s += best;
    n++;
  }
  return n ? s / Math.sqrt(n) : 0;
}

let best = null;
for (let period = 0.50; period <= 0.56; period += 0.00005) {
  for (let off = 0; off < period; off += period / 60) {
    const sc = gridScore(period, off);
    if (!best || sc > best.score) best = { period, offset: off, score: sc };
  }
}
const period = best.period;
const bpm = 60 / period;

// ---------- beat grid + residuals ----------
const beats = [];
for (let k = 0; ; k++) {
  const t = best.offset + k * period;
  if (t > duration) break;
  let nearest = null;
  for (const h of hits) {
    const d = Math.abs(h.t - t);
    if (!nearest || d < nearest.d) nearest = { d, z: h.z, t: h.t };
  }
  beats.push({
    i: k,
    t: +t.toFixed(4),
    hit: nearest && nearest.d <= 0.05 ? nearest.t : null,
    errMs: nearest ? +((nearest.t - t) * 1000).toFixed(1) : null,
    strength: nearest && nearest.d <= 0.05 ? nearest.z : 0,
  });
}
const matched = beats.filter((b) => b.hit !== null);
const errs = matched.map((b) => Math.abs(b.errMs));
errs.sort((a, b) => a - b);
const medErr = errs.length ? errs[Math.floor(errs.length / 2)] : null;

// ---------- meter: 3 vs 4 ----------
function meterScore(m) {
  // average strength of each bar position; a real meter concentrates energy on beat 0
  const sums = new Array(m).fill(0);
  for (let k = 0; k < beats.length; k++) sums[k % m] += beats[k].strength;
  const mean = sums.reduce((a, b) => a + b, 0) / m;
  const top = Math.max(...sums);
  const others = sums.filter((s) => s !== top);
  const otherMean = others.reduce((a, b) => a + b, 0) / (others.length || 1);
  return { m, sums: sums.map((s) => +s.toFixed(1)), contrast: +((top - otherMean) / (mean || 1)).toFixed(3), topIndex: sums.indexOf(top) };
}
const meter3 = meterScore(3);
const meter4 = meterScore(4);
const meter = meter4.contrast >= meter3.contrast ? 4 : 3;

// phrase grid (bars of 4 or 3 beats)
const barBeats = meter;
const barDur = period * barBeats;
const bars = [];
for (let k = 0; ; k++) {
  const t = best.offset + k * barDur;
  if (t > duration) break;
  bars.push({ i: k, t: +t.toFixed(3), end: +(t + barDur).toFixed(3) });
}

// ---------- loudness arc as text ----------
function bars5s(step) {
  const out = [];
  for (let t0 = 0; t0 < duration; t0 += step) {
    const seg = energy.filter((e) => e.t >= t0 && e.t < t0 + step);
    const avg = seg.reduce((a, b) => a + b.rel, 0) / (seg.length || 1);
    const peak = seg.reduce((a, b) => Math.max(a, b.rel), 0);
    out.push({ t: +t0.toFixed(1), avg: +avg.toFixed(3), peak: +peak.toFixed(3) });
  }
  return out;
}

// ---------- onset density per 4 s ----------
const density = [];
for (let t0 = 0; t0 < duration; t0 += 4) {
  const c = hits.filter((h) => h.t >= t0 && h.t < t0 + 4).length;
  density.push({ t: +t0.toFixed(1), hitsPerSec: +(c / 4).toFixed(2) });
}

function sparkline(values, width = 64) {
  const chars = ' ▁▂▃▄▅▆▇█';
  const max = Math.max(...values) || 1;
  const step = values.length / width;
  let s = '';
  for (let i = 0; i < width; i++) {
    const v = values[Math.floor(i * step)] ?? 0;
    s += chars[Math.min(chars.length - 1, Math.round((v / max) * (chars.length - 1)))];
  }
  return s;
}

const arc = bars5s(2.5);
console.log(`period       ${period.toFixed(5)} s  ->  ${bpm.toFixed(2)} BPM`);
console.log(`offset       ${best.offset.toFixed(4)} s`);
console.log(`beats        ${beats.length}   bars(${barBeats}) ${bars.length}   beat dur ${period.toFixed(4)}s  bar dur ${barDur.toFixed(3)}s`);
console.log(`matched      ${matched.length}/${beats.length} beats carry a real transient; median |err| ${medErr} ms`);
console.log(`meter        ${meter}/4  (3: contrast ${meter3.contrast}, 4: contrast ${meter4.contrast})`);
console.log(`\nloudness arc (2.5 s buckets, 0..1):`);
console.log(`  0s    ${'|'}${sparkline(arc.map((a) => a.avg))}${'|'}  ${duration.toFixed(0)}s`);
console.log(`  avg   ${arc.filter((_, i) => i % 4 === 0).map((a) => `${a.t}:${a.avg.toFixed(2)}`).join(' ')}`);
console.log(`\nhit density (per 4 s):`);
console.log(`  ${'|'}${sparkline(density.map((d) => d.hitsPerSec))}${'|'}`);
console.log(`  ${density.map((d) => (d.t % 20 === 0 ? `${d.t}:${d.hitsPerSec}` : '')).filter(Boolean).join(' ')}`);

console.log('\nenergy peaks by 10 s region:');
for (let t0 = 0; t0 < duration; t0 += 10) {
  const seg = energy.filter((e) => e.t >= t0 && e.t < t0 + 10);
  const avg = seg.reduce((a, b) => a + b.rel, 0) / (seg.length || 1);
  const peak = seg.reduce((a, b) => Math.max(a, b.rel), 0);
  const bar = '█'.repeat(Math.round(avg * 40));
  console.log(`  ${String(t0).padStart(3)}-${String(t0 + 10).padStart(3)}s  avg ${avg.toFixed(2)}  peak ${peak.toFixed(2)}  ${bar}`);
}

const out = {
  duration,
  beat: { period: +period.toFixed(5), bpm: +bpm.toFixed(2), offset: +best.offset.toFixed(4), count: beats.length },
  meter,
  bar: { beats: barBeats, duration: +barDur.toFixed(4), count: bars.length },
  beats,
  bars,
  gridFit: { matchedBeats: matched.length, totalBeats: beats.length, medianAbsErrMs: medErr, meter3, meter4 },
  arc: bars5s(2.5),
  density,
  energy,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
