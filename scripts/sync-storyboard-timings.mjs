// Injects exact timings into STORYBOARD.md and places every subtitle cue on a
// beat line with a duration proportional to its reading load.
//
// Why: the storyboard declares scene lengths in BARS (musical units) and cue text
// in plain words. Hand-writing 90 cue times invites drift; deriving them from the
// beat grid makes every cue reproducible and lets us audit reading speed.
//
// Write-back is a FULL REBUILD of each frame block (not in-place splicing), so it
// is idempotent and cannot misplace lines when earlier frames change length.
//   derived keys (regenerated every run): start, end, duration, cues
//   authored keys (never touched): everything else, including `bars`
//
// Usage:
//   node tools/sync-storyboard-timings.mjs           # write
//   node tools/sync-storyboard-timings.mjs --check    # report only, exit 1 on problems
import fs from 'node:fs';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const SB = cfg.files.storyboard;
const TM = cfg.files.timingMap;
const CHECK_ONLY = process.argv.includes('--check');

const tm = readJson(TM);
const { period, offset } = tm.beat;
const barDur = tm.bar.duration;
const TRACK_END = tm.duration;

const beatTime = (k) => offset + k * period;
const barTime = (n) => offset + n * barDur;
const nearestBeat = (t) => Math.round((t - offset) / period);

// reading load: CJK 1.0, latin/digit 0.5, punctuation 0.3, space 0.15
function load(text) {
  let w = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) w += 1;
    else if (/[a-zA-Z0-9]/.test(ch)) w += 0.5;
    else if (/\s/.test(ch)) w += 0.15;
    else w += 0.3;
  }
  return w;
}

const DERIVED = new Set(['start', 'end', 'duration', 'cues']);
const src = fs.readFileSync(SB, 'utf8');
const lines = src.split(/\r?\n/);

// ---------- parse: frontmatter, frames (heading + meta + narrative) ----------
const out = { head: [], frames: [] };
let i = 0;
// leading frontmatter + html comment + intro prose, up to the first frame heading
while (i < lines.length && !/^## Frame /.test(lines[i])) { out.head.push(lines[i]); i++; }
let cur = null;
let pendingBlanks = [];
let seenNarrative = false;
for (; i < lines.length; i++) {
  const l = lines[i];
  const h = /^## Frame (\d+)/.exec(l);
  if (h) {
    cur = { num: +h[1], heading: l, meta: [], narrative: [] };
    out.frames.push(cur);
    pendingBlanks = [];
    seenNarrative = false;
    continue;
  }
  if (!cur) continue;
  const m = /^- ([A-Za-z][\w-]*):(.*)$/.exec(l);
  if (l.trim() === '') {
    // a blank line must NOT end the metadata block — frames put a blank between
    // the heading and the key list, and between the keys and the prose
    if (seenNarrative) cur.narrative.push(l);
    else pendingBlanks.push(l);
    continue;
  }
  if (m && !seenNarrative) {
    cur.meta.push({ key: m[1], raw: l });
    continue;
  }
  // first real prose line: flush the pending blanks into the narrative
  if (!seenNarrative) {
    cur.narrative.push(...pendingBlanks);
    pendingBlanks = [];
    seenNarrative = true;
  }
  cur.narrative.push(l);
}
// trim trailing blank narrative lines into a single separator
for (const f of out.frames) {
  while (f.narrative.length && f.narrative[f.narrative.length - 1].trim() === '') f.narrative.pop();
}

// ---------- timings from bars ----------
for (const f of out.frames) {
  const bars = f.meta.find((m) => m.key === 'bars');
  if (!bars) throw new Error(`Frame ${f.num} has no bars: line`);
  const vo = f.meta.find((m) => m.key === 'voiceover');
  const [a, b] = bars.raw.split(':')[1].trim().split(/[–-]/).map((s) => parseFloat(s.trim()));
  f.startBar = a; f.endBar = b;
  f.start = barTime(a);
  f.end = Math.min(barTime(b), TRACK_END);
  f.dur = f.end - f.start;
  f.cueTexts = vo ? vo.raw.split(':').slice(1).join(':').split('｜').map((s) => s.trim()).filter(Boolean) : [];
  if (!f.cueTexts.length) throw new Error(`Frame ${f.num} has no voiceover cues`);
}

// ---------- place cues: starts on rising beats, ends from reading-load share ----------
const report = [];
const problems = [];
for (const f of out.frames) {
  const lead = 0.10, tail = 0.18, MIN_GAP = 0.08;
  const w0 = f.start + lead, w1 = f.end - tail;
  const avail = Math.max(0.4, w1 - w0);
  const loads = f.cueTexts.map(load);
  const totalLoad = loads.reduce((s, x) => s + x, 0) || 1;

  // ideal boundaries (proportional to reading load)
  const ideal = [];
  let acc = 0;
  for (let n = 0; n < f.cueTexts.length; n++) {
    const share = loads[n] / totalLoad;
    const d = avail * share - (n < f.cueTexts.length - 1 ? MIN_GAP : 0);
    ideal.push({ s: w0 + (acc / totalLoad) * avail, d: Math.max(0.5, d) });
    acc += loads[n];
  }

  // PASS 1 — starts snapped to strictly rising beat lines
  const starts = [];
  let lastK = -1;
  for (let n = 0; n < ideal.length; n++) {
    let k = nearestBeat(ideal[n].s);
    let s = beatTime(k);
    while (s < ideal[n].s - 1e-9) { k += 1; s = beatTime(k); }
    if (n === 0 && s > w0 + period) { k = nearestBeat(w0); s = beatTime(k); if (s < f.start) { k += 1; s = beatTime(k); } }
    if (k <= lastK) { k = lastK + 1; s = beatTime(k); }
    lastK = k;
    starts.push(+s.toFixed(3));
  }

  // PASS 2 — ends clamped by the next start and the window
  f.placed = [];
  for (let n = 0; n < ideal.length; n++) {
    const s = starts[n];
    const isLast = n === ideal.length - 1;
    let e = isLast ? w1 : Math.min(s + ideal[n].d, starts[n + 1] - MIN_GAP, w1);
    if (e <= s + 0.3) e = Math.min(s + 0.3, w1);
    f.placed.push({ s: +s.toFixed(2), e: +e.toFixed(2), text: f.cueTexts[n] });
  }

  for (const c of f.placed) {
    const d = c.e - c.s;
    const l = load(c.text);
    const cps = l / d;
    report.push({ frame: f.num, start: c.s, end: c.e, dur: +d.toFixed(2), load: +l.toFixed(1), cps: +cps.toFixed(2), text: c.text });
    if (cps > 6.5) problems.push({ frame: f.num, cps: +cps.toFixed(2), dur: +d.toFixed(2), text: c.text, kind: 'too fast' });
    if (d < 1.2) problems.push({ frame: f.num, cps: +cps.toFixed(2), dur: +d.toFixed(2), text: c.text, kind: 'too short' });
  }
}

// ---------- report ----------
const totalDur = out.frames.reduce((s, f) => s + f.dur, 0);
console.log(`frames ${out.frames.length}   total ${totalDur.toFixed(2)}s   track ${TRACK_END.toFixed(2)}s   avg scene ${(totalDur / out.frames.length).toFixed(2)}s`);
console.log(`scene lengths: ${out.frames.map((f) => f.dur.toFixed(2)).join(', ')}`);
console.log('\nreading-speed report (chars/sec; target <= 6.5)');
for (const r of report) {
  const flag = r.cps > 6.5 ? '  <-- FAST' : r.dur < 1.2 ? '  <-- SHORT' : '';
  console.log(`  F${String(r.frame).padStart(2)}  ${String(r.start).padStart(7)}-${String(r.end).padStart(7)} (${String(r.dur).padStart(5)}s)  ${String(r.cps).padStart(5)} cps  ${r.text}${flag}`);
}
const cpsAll = report.map((r) => r.cps).sort((a, b) => a - b);
console.log(`\ncps: min ${cpsAll[0].toFixed(2)}  median ${cpsAll[Math.floor(cpsAll.length / 2)].toFixed(2)}  max ${cpsAll[cpsAll.length - 1].toFixed(2)}`);
if (problems.length) {
  console.log(`\n${problems.length} problem cue(s):`);
  for (const p of problems) console.log(`  F${p.frame} ${p.kind}  ${p.cps} cps over ${p.dur}s — ${p.text}`);
} else {
  console.log('\nno reading-speed problems');
}

if (CHECK_ONLY) process.exit(problems.length ? 1 : 0);

// ---------- rebuild the file ----------
const outLines = [...out.head];
for (const f of out.frames) {
  outLines.push(f.heading, '');
  const fmt = (n) => n.toFixed(3);
  const derived = [
    `- start: ${fmt(f.start)}`,
    `- end: ${fmt(f.end)}`,
    `- duration: ${f.dur.toFixed(2)}s`,
  ];
  const cueLine = '- cues: ' + f.placed.map((c) => `${c.s}–${c.e} ${c.text}`).join(' · ');
  const meta = f.meta.filter((m) => !DERIVED.has(m.key));
  let placedBars = false;
  for (const m of meta) {
    outLines.push(m.raw);
    if (m.key === 'bars') { outLines.push(...derived); placedBars = true; }
  }
  if (!placedBars) outLines.push(...derived);
  outLines.push(cueLine, '');
  // self-healing: drop any stale derived line that a previous buggy run left
  // inside the prose section, so re-running always converges on a clean file
  const narrative = f.narrative.filter((l) => !/^- (start|end|duration|cues):/.test(l));
  while (narrative.length && narrative[0].trim() === '') narrative.shift();
  outLines.push(...narrative, '');
}
// collapse a possible trailing blank run to exactly one newline at EOF
while (outLines.length > 1 && outLines[outLines.length - 1].trim() === '' && outLines[outLines.length - 2].trim() === '') outLines.pop();

fs.writeFileSync(SB, outLines.join('\n'));
console.log(`\nwrote ${SB}`);

fs.writeFileSync(cfg.files.cueMap, JSON.stringify({
  generatedBy: 'tools/sync-storyboard-timings.mjs',
  beat: { period, offset, bpm: tm.beat.bpm },
  barDuration: barDur,
  frames: out.frames.map((f) => ({
    frame: f.num, start: +f.start.toFixed(3), end: +f.end.toFixed(3), dur: +f.dur.toFixed(3),
    startBar: f.startBar, endBar: f.endBar, cues: f.placed,
  })),
}, null, 2));
console.log('wrote ' + cfg.files.cueMap);
