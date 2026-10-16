// Builds audio/hit-map.json — the timing bible for the composition.
//
// The track's metrical pulse is weak/ambiguous (autocorrelation peaks at several
// unrelated lags), so instead of trusting a single BPM we measure the actual
// inter-onset-interval distribution AND emit a ranked list of real transient
// hits. Scene changes and accent animations snap to those hits, which is
// verifiable to within a frame.
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const wavPath = process.argv[2] ?? path.join(cfg.audioDir, 'bgm-mono.wav');
const outPath = process.argv[3] ?? cfg.files.hitMap;
const raw = fs.readFileSync(wavPath);

function parseWav(buf) {
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('latin1', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === 'data') data = buf.subarray(body, body + size);
    off = body + size + (size % 2);
  }
  const n = Math.floor(data.length / 2 / fmt.channels);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = data.readInt16LE(i * 2) / 32768;
  return { sampleRate: fmt.sampleRate, samples: mono };
}
const { sampleRate, samples } = parseWav(raw);
const duration = samples.length / sampleRate;

// ---------- STFT -> band energies ----------
const N = 1024;
const HOP = 128; // 5.8 ms resolution at 22050 Hz
function makeFFT(n) {
  const levels = Math.log2(n) | 0;
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let x = i, r = 0; for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim; re[j] += tre; im[j] += tim;
        }
      }
    }
  };
}
const fft = makeFFT(N);
const win = new Float32Array(N);
for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);

const frames = Math.max(0, Math.floor((samples.length - N) / HOP) + 1);
const FR = sampleRate / HOP; // ~172.27 fps
const bins = N / 2;
const BANDS = 64;
const edges = [];
for (let b = 0; b <= BANDS; b++) {
  const f = 35 * Math.pow(12000 / 35, b / BANDS);
  edges.push(Math.min(bins - 1, Math.max(1, Math.round(f / (sampleRate / 2) * bins))));
}
const band = new Float32Array(frames * BANDS);
const re = new Float32Array(N), im = new Float32Array(N);
for (let t = 0; t < frames; t++) {
  const base = t * HOP;
  for (let i = 0; i < N; i++) { re[i] = samples[base + i] * win[i]; im[i] = 0; }
  fft(re, im);
  for (let b = 0; b < BANDS; b++) {
    let s = 0;
    const a = edges[b], e = Math.max(a + 1, edges[b + 1]);
    for (let k = a; k < e; k++) s += re[k] * re[k] + im[k] * im[k];
    band[t * BANDS + b] = Math.log1p(Math.sqrt(s / (e - a)) * 200);
  }
}

// ---------- onset detection function ----------
const odf = new Float32Array(frames);
for (let t = 1; t < frames; t++) {
  let s = 0;
  for (let b = 0; b < BANDS; b++) {
    const d = band[t * BANDS + b] - band[(t - 1) * BANDS + b];
    if (d > 0) s += d;
  }
  odf[t] = s;
}
// light smoothing (3 frames ~ 17 ms) then adaptive normalisation
const sm = new Float32Array(frames);
for (let t = 0; t < frames; t++) {
  let s = 0, c = 0;
  for (let k = Math.max(0, t - 1); k <= Math.min(frames - 1, t + 1); k++) { s += odf[k]; c++; }
  sm[t] = s / c;
}
let m = 0;
for (let t = 0; t < frames; t++) m += sm[t];
m /= frames || 1;
let v = 0;
for (let t = 0; t < frames; t++) v += (sm[t] - m) ** 2;
const sd = Math.sqrt(v / (frames || 1)) || 1;
const z = new Float32Array(frames);
for (let t = 0; t < frames; t++) z[t] = (sm[t] - m) / sd;

// ---------- peak picking ----------
const WIN = 21; // ~120 ms local window each side
const MIN_IOI = 0.07;
const peaks = [];
for (let t = 1; t < frames - 1; t++) {
  if (z[t] < z[t - 1] || z[t] < z[t + 1]) continue;
  let ls = 0, c = 0;
  for (let k = Math.max(0, t - WIN); k <= Math.min(frames - 1, t + WIN); k++) { ls += z[k]; c++; }
  const mu = ls / (c || 1);
  let lv = 0;
  for (let k = Math.max(0, t - WIN); k <= Math.min(frames - 1, t + WIN); k++) lv += (z[k] - mu) ** 2;
  const lsd = Math.sqrt(lv / (c || 1));
  if (z[t] < mu + 1.0 * lsd + 0.25) continue;
  peaks.push({ t: t / FR, z: z[t] });
}
peaks.sort((a, b) => b.z - a.z);
const kept = [];
for (const p of peaks) if (kept.every((k) => Math.abs(k.t - p.t) >= MIN_IOI)) kept.push(p);
kept.sort((a, b) => a.t - b.t);

// ---------- inter-onset-interval histogram (the real pulse) ----------
const ioiHist = new Float32Array(2001); // 0-2 s in 1 ms bins
for (let i = 0; i < kept.length; i++) {
  for (let j = i + 1; j < kept.length && kept[j].t - kept[i].t <= 2.0; j++) {
    const ioi = kept[j].t - kept[i].t;
    const w = Math.min(kept[i].z, kept[j].z);
    ioiHist[Math.round(ioi * 1000)] += w;
  }
}
// smooth the histogram a little (perceptual tolerance)
const ioiSm = new Float32Array(ioiHist.length);
for (let i = 0; i < ioiHist.length; i++) {
  let s = 0;
  for (let k = Math.max(0, i - 12); k <= Math.min(ioiHist.length - 1, i + 12); k++) s += ioiHist[k];
  ioiSm[i] = s;
}
const ioiCand = [];
for (let i = 60; i < 1600; i++) {
  if (ioiSm[i] > ioiSm[i - 1] && ioiSm[i] >= ioiSm[i + 1]) ioiCand.push({ ioi: i / 1000, bpm: 60 / (i / 1000), score: ioiSm[i] });
}
ioiCand.sort((a, b) => b.score - a.score);
const ioiTop = [];
for (const c of ioiCand) {
  if (ioiTop.every((t) => Math.abs(t.ioi - c.ioi) > 0.035)) ioiTop.push(c);
  if (ioiTop.length >= 8) break;
}
// also score the integer subdivisions of the leading candidate
const ioiReport = ioiTop.map((c) => ({ ioi: +c.ioi.toFixed(3), bpm: +c.bpm.toFixed(2), score: +(c.score / (ioiTop[0].score || 1)).toFixed(3) }));

// ---------- ranked hits for the composition ----------
const HIT_MIN_GAP = 0.28;
const byStrength = [...kept].sort((a, b) => b.z - a.z);
const hits = [];
for (const p of byStrength) {
  if (hits.every((h) => Math.abs(h.t - p.t) >= HIT_MIN_GAP)) hits.push({ t: +p.t.toFixed(3), z: +p.z.toFixed(2) });
}
hits.sort((a, b) => a.t - b.t);

// ---------- energy curve at 10 Hz ----------
const EHOP = Math.round(FR / 10);
const energy = [];
let eMax = 0;
for (let f = 0; f < frames; f += EHOP) {
  let s = 0, c = 0;
  for (let k = f; k < Math.min(frames, f + EHOP); k++) {
    let e = 0;
    for (let b = 0; b < BANDS; b++) e += band[k * BANDS + b];
    s += e; c++;
  }
  const val = s / (c || 1);
  eMax = Math.max(eMax, val);
  energy.push({ t: +(f / FR).toFixed(2), e: +val.toFixed(3) });
}
for (const p of energy) p.rel = +(p.e / (eMax || 1)).toFixed(3);

// ---------- sections from band novelty + energy steps ----------
const BSEC = 0.5;
const bf = Math.round(BSEC * FR);
const blocks = Math.floor(frames / bf);
const feat = [];
for (let b = 0; b < blocks; b++) {
  const v2 = new Float32Array(BANDS);
  for (let t = b * bf; t < (b + 1) * bf && t < frames; t++) for (let k = 0; k < BANDS; k++) v2[k] += band[t * BANDS + k];
  for (let k = 0; k < BANDS; k++) v2[k] /= bf;
  feat.push(v2);
}
const nov = new Float32Array(blocks);
for (let b = 4; b < blocks - 4; b++) {
  let d = 0;
  for (let k = 0; k < BANDS; k++) {
    let a = 0, c = 0;
    for (let t = b - 4; t < b; t++) { a += feat[t][k]; c++; }
    a /= c;
    let c2 = 0, d2 = 0;
    for (let t = b; t < b + 4; t++) { d2 += feat[t][k]; c2++; }
    d2 /= c2;
    d += Math.abs(d2 - a);
  }
  nov[b] = d;
}
let nMax = 0;
for (let b = 0; b < blocks; b++) nMax = Math.max(nMax, nov[b]);
const secCand = [];
for (let b = 3; b < blocks - 3; b++) {
  if (nov[b] > nov[b - 1] && nov[b] >= nov[b + 1] && nov[b] / nMax > 0.22) secCand.push({ t: +(b * BSEC).toFixed(2), strength: +(nov[b] / nMax).toFixed(3) });
}
const sections = [];
for (const c of secCand) if (sections.every((s) => Math.abs(s.t - c.t) >= 3.5)) sections.push(c);

const out = {
  source: wavPath,
  duration: +duration.toFixed(3),
  resolution: { odfFps: +FR.toFixed(2), odfStepMs: +(1000 / FR).toFixed(2) },
  pulse: { candidates: ioiReport, note: 'IOI histogram peaks; weak metrical periodicity — prefer hit-locked timing' },
  onsetCount: kept.length,
  hits,
  sections,
  energy,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

// ---------- console report ----------
console.log(`duration      ${out.duration}s`);
console.log(`onsets        ${kept.length} (${(kept.length / out.duration).toFixed(1)}/s)`);
console.log(`hits kept     ${hits.length} (min gap ${HIT_MIN_GAP}s)`);
console.log('\n-- IOI / pulse candidates (ioi s, implied bpm, rel score) --');
for (const c of ioiReport) console.log(`   ${String(c.ioi).padStart(6)}s  ${String(c.bpm).padStart(7)} BPM   ${c.score}`);
console.log('\n-- strongest 30 hits --');
console.log('   ' + [...hits].sort((a, b) => b.z - a.z).slice(0, 30).map((h) => `${h.t}(${h.z})`).join('  '));
console.log('\n-- sections --');
console.log('   ' + sections.map((s) => `${s.t}(${s.strength})`).join('  '));
const eSorted = [...energy].sort((a, b) => b.rel - a.rel);
console.log('\n-- loudest moments --');
console.log('   ' + eSorted.slice(0, 12).map((e) => `${e.t}(${e.rel})`).join('  '));
console.log('\n-- quietest moments (after 5s) --');
console.log('   ' + [...energy].filter((e) => e.t > 5).sort((a, b) => a.rel - b.rel).slice(0, 8).map((e) => `${e.t}(${e.rel})`).join('  '));
