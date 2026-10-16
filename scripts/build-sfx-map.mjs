// Turns your `sfx-design.mjs` into a validated, beat-aligned cue map.
//
// The design module declares intent ("a whoosh on this cut", "a tick on this beat");
// this script does the arithmetic and refuses to let a cue be placed by guesswork:
//   - every cue is checked against the real length of its file (mediaStart included),
//     so nothing runs past its own cut or past the end of the track
//   - every cue is measured against the fitted grid and the report says how close it
//     lands. A whoosh is measured at its MIDPOINT (it is centred on a cut), a riser at
//     its END (it lands on the reveal), everything else at its attack.
//
// The reference film's design placed 43 cues this way: 8 whooshes on section changes,
// 1 riser into the climax, 31 hits/ticks/pings on visual accents, 3 long beds, gains
// -32…-10 dB. See references/06-sound.md.
//
//   node tools/build-sfx-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, readJson } from './lib/vibe-config.mjs';

const cfg = loadConfig();

const tm = readJson(cfg.files.timingMap);
const cueMap = readJson(cfg.files.cueMap);
const measured = readJson(cfg.files.sfxMeasured, { required: false });
if (!measured) {
  console.log('! audio/sfx-measured.json is missing — run: node tools/prep-sfx.mjs');
  console.log('  (the design needs real file lengths to validate cue durations)');
}
const lenByFile = new Map((measured?.files ?? []).map((f) => [f.file, f.duration]));

const { period, offset, bpm } = tm.beat;
const barDuration = tm.bar.duration;
const total = tm.duration;

const beat = (k) => offset + k * period;
const bar = (k) => offset + k * barDuration;
const beatAt = (t) => offset + Math.round((t - offset) / period) * period;
const barAt = (t) => offset + Math.round((t - offset) / barDuration) * barDuration;
const frame = (n) => cueMap.frames.find((f) => f.frame === n);
const len = (file) => lenByFile.get(file) ?? 0;

// ------------------------------------------------------------------ helpers
const cues = [];
const push = (o) => { cues.push({ mediaStart: 0, duration: null, ...o }); return cues[cues.length - 1]; };

const whoosh = (file, atCut, gainDb, note) => {
  const d = len(file);
  if (!d) { console.warn(`  ! unknown length for ${file} — run prep-sfx.mjs`); return null; }
  return push({ file, role: 'whoosh', time: +(atCut - d / 2).toFixed(4), duration: +d.toFixed(3), gainDb, note });
};
const hit = (file, atBeat, gainDb, note, mediaStart = 0) => {
  const d = len(file) - mediaStart;
  if (d <= 0) { console.warn(`  ! unknown length for ${file} — run prep-sfx.mjs`); return null; }
  return push({ file, role: 'hit', time: +atBeat.toFixed(4), duration: +d.toFixed(3), mediaStart, gainDb, note });
};
const riser = (file, atReveal, seconds, gainDb, note) => {
  const d = len(file);
  if (!d) { console.warn(`  ! unknown length for ${file} — run prep-sfx.mjs`); return null; }
  if (seconds > d) console.warn(`  ! riser wants ${seconds}s of ${file} but it is only ${d.toFixed(2)}s`);
  return push({
    file, role: 'riser', time: +(atReveal - seconds).toFixed(4), duration: +seconds.toFixed(3),
    mediaStart: +Math.max(0, d - seconds).toFixed(3), gainDb, note,
  });
};
const bed = (file, from, to, gainDb, note, mediaStart = 0) => {
  const d = len(file) - mediaStart;
  if (d <= 0) { console.warn(`  ! unknown length for ${file} — run prep-sfx.mjs`); return null; }
  return push({
    file, role: 'bed', time: +from.toFixed(4), duration: +Math.min(d, to - from).toFixed(3),
    mediaStart, gainDb, note,
  });
};

// ------------------------------------------------------------------ run the design
const designPath = cfg.files.sfxDesign;
let designNotes = '';
if (!fs.existsSync(designPath)) {
  console.log(`! no sound design at ${designPath}`);
  console.log('  copy templates/sfx-design.mjs there, or ship the film with music only');
} else {
  const mod = await import(pathToFileURL(designPath).href + '?t=' + Date.now());
  if (typeof mod.default !== 'function') throw new Error(`${designPath} must default-export a function`);
  const result = mod.default({
    frames: cueMap.frames, frame, beat, bar, beatAt, barAt, len,
    grid: { bpm, period, offset, barDuration, totalBeats: tm.beat.count, totalBars: tm.bar.count },
    whoosh, hit, riser, bed,
  });
  // a design may also return cues directly, for full manual control
  if (result && Array.isArray(result.cues) && result.cues.length) {
    for (const c of result.cues) cues.push({ mediaStart: 0, duration: null, ...c });
  }
  designNotes = result?.notes ?? '';
}

// ------------------------------------------------------------------ validate
const problems = [];
for (const c of cues) {
  const available = len(c.file) - c.mediaStart;
  if (!len(c.file)) problems.push(`${c.note}: ${c.file} is not in the prepped set`);
  else if (c.duration > available + 0.02) problems.push(`${c.note}: wants ${c.duration}s of ${c.file} but only ${available.toFixed(2)}s remain after mediaStart ${c.mediaStart}`);
  if (c.time < 0) problems.push(`${c.note}: negative start ${c.time}`);
  if (c.time + (c.duration ?? 0) > total + 0.05) problems.push(`${c.note}: runs past the end of the track`);
}

// ------------------------------------------------------------------ beat alignment
const beatErr = [];
for (const c of cues) {
  if (c.role === 'bed') continue;
  const probe = c.role === 'whoosh' ? c.time + c.duration / 2
    : c.role === 'riser' ? c.time + c.duration
    : c.time;
  const nb = beatAt(probe);
  beatErr.push({ note: c.note, role: c.role, probe: +probe.toFixed(3), nearestBeat: +nb.toFixed(3), errMs: +((probe - nb) * 1000).toFixed(1) });
}

const out = {
  generatedBy: 'tools/build-sfx-map.mjs',
  design: path.basename(designPath),
  notes: designNotes || undefined,
  beat: { bpm, period, offset, barDuration },
  note: 'all times are absolute film seconds; roles determine placement physics',
  count: cues.length,
  cues,
};
fs.writeFileSync(cfg.files.sfxMap, JSON.stringify(out, null, 2));

const byRole = {};
for (const c of cues) byRole[c.role] = (byRole[c.role] || 0) + 1;
console.log(`${cues.length} sfx cue(s) designed`);
if (cues.length) {
  console.log('  by role: ' + Object.entries(byRole).map(([k, v]) => `${k} ${v}`).join(', '));
  const gains = cues.map((c) => c.gainDb).filter((g) => typeof g === 'number');
  if (gains.length) console.log(`  gain range: ${Math.min(...gains)} .. ${Math.max(...gains)} dB`);
}

if (beatErr.length) {
  const worst = beatErr.slice().sort((a, b) => Math.abs(b.errMs) - Math.abs(a.errMs)).slice(0, 6);
  const within = beatErr.filter((b) => Math.abs(b.errMs) <= 15).length;
  console.log('\nfurthest cues from a beat line (whooshes at their midpoint, risers at their end):');
  for (const w of worst) console.log(`  ${String(w.errMs).padStart(7)} ms  ${w.role.padEnd(8)} ${w.note}`);
  console.log(`\n${within}/${beatErr.length} cues land within 15 ms of a beat line`);
}

fs.writeFileSync(path.join(cfg.audioDir, 'sfx-beat-alignment.json'), JSON.stringify({
  generatedBy: 'tools/build-sfx-map.mjs',
  within15ms: beatErr.filter((b) => Math.abs(b.errMs) <= 15).length,
  total: beatErr.length,
  entries: beatErr,
}, null, 2));

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else if (cues.length) {
  console.log('\nall cues validate; next: node tools/mix-soundtrack.mjs');
}
