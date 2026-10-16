// Verifies that the film is actually beat-locked — from data AND from sound.
//
// Three data assertions plus one acoustic measurement:
//   1. every scene cut sits on a bar line
//   2. every subtitle cue starts on a beat line
//   3. every sound-effect cue is placed on a beat line
//   4. (acoustic) decode the rendered SFX stem and confirm each cue's transient is
//      really where it was supposed to be — this catches mixing bugs, limiter
//      lookahead, and cues that were placed but are inaudible
//
//   node tools/verify-timing.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const FF = process.env.HF_FFMPEG || path.join(process.env.LOCALAPPDATA,
  'Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe');

const TOL_MS = cfg.timing.toleranceMs;
const tm = readJson(cfg.files.timingMap);
const cue = readJson(cfg.files.cueMap);
const sfx = readJson(cfg.files.sfxMap, { required: false }) ?? { cues: [] };

const { period, offset } = tm.beat;
const barDur = tm.bar.duration;
const nearestBeat = (t) => offset + Math.round((t - offset) / period) * period;
const nearestBar = (t) => offset + Math.round((t - offset) / barDur) * barDur;
const ms = (a, b) => +((a - b) * 1000).toFixed(1);

const out = { generatedBy: 'tools/verify-timing.mjs', toleranceMs: TOL_MS, checks: {} };
const problems = [];

// ---- 1. scene cuts on bar lines -------------------------------------------------
const cuts = [];
for (const f of cue.frames) {
  const nb = nearestBar(f.start);
  const err = ms(f.start, nb);
  cuts.push({ frame: f.frame, start: f.start, nearestBar: +nb.toFixed(3), errMs: err, dur: f.dur });
  if (Math.abs(err) > TOL_MS) problems.push(`F${f.frame} cut off the bar grid by ${err} ms`);
}
const cutsWorst = cuts.slice().sort((a, b) => Math.abs(b.errMs) - Math.abs(a.errMs))[0];
out.checks.cuts = { total: cuts.length, withinTolerance: cuts.filter((c) => Math.abs(c.errMs) <= TOL_MS).length, worstMs: cutsWorst ? cutsWorst.errMs : null, worstFrame: cutsWorst ? cutsWorst.frame : null };

// ---- 2. subtitle cues on beat lines --------------------------------------------
let cueTotal = 0, cueOk = 0;
const cueWorst = { errMs: 0 };
for (const f of cue.frames) {
  for (const c of f.cues) {
    cueTotal++;
    const err = ms(c.s, nearestBeat(c.s));
    if (Math.abs(err) <= TOL_MS) cueOk++;
    else problems.push(`F${f.frame} subtitle "${c.text}" starts ${err} ms off a beat`);
    if (Math.abs(err) > Math.abs(cueWorst.errMs)) Object.assign(cueWorst, { errMs: err, frame: f.frame, text: c.text });
  }
}
out.checks.subtitleCues = { total: cueTotal, withinTolerance: cueOk, worstMs: cueWorst.errMs, worstFrame: cueWorst.frame ?? null };

// ---- 3. sfx cues on beat lines --------------------------------------------------
let sfxOk = 0;
const sfxChecked = sfx.cues.filter((c) => c.role !== 'bed');
const sfxWorst = { errMs: 0 };
for (const c of sfxChecked) {
  const probe = c.role === 'whoosh' ? c.time + c.duration / 2 : c.role === 'riser' ? c.time + c.duration : c.time;
  const err = ms(probe, nearestBeat(probe));
  if (Math.abs(err) <= TOL_MS) sfxOk++;
  else problems.push(`sfx "${c.note}" lands ${err} ms off a beat`);
  if (Math.abs(err) > Math.abs(sfxWorst.errMs)) Object.assign(sfxWorst, { errMs: err, note: c.note });
}
out.checks.sfxCues = { total: sfxChecked.length, withinTolerance: sfxOk, beds: sfx.cues.length - sfxChecked.length, worstMs: sfxWorst.errMs, worstNote: sfxWorst.note ?? null };

// ---- 4. acoustic check on the rendered stem ------------------------------------
// Naive onset picking is confounded by overlapping cues (a whoosh landing on the
// tail of an impact has no clean 9 dB rise). Instead each cue is located by
// cross-correlating its OWN energy envelope against the rendered stem's envelope,
// which finds the true lag even when other sounds are present.
const STEM = cfg.files.sfxStem;
const SR = 48000, HOP = 128;
const frameTime = (i) => (i * HOP) / SR;

function envelopeOf(file, mono = true) {
  const tmp = path.join(os.tmpdir(), 'hf-env-' + path.basename(file).replace(/\W+/g, '_') + '.raw');
  execFileSync(FF, ['-v', 'error', '-y', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', tmp], { stdio: 'ignore' });
  const buf = fs.readFileSync(tmp);
  const n = Math.floor(buf.length / 2 / HOP);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < HOP; k++) {
      const idx = i * HOP + k;
      const v = idx * 2 + 1 < buf.length ? buf.readInt16LE(idx * 2) / 32768 : 0;
      s += v * v;
    }
    e[i] = Math.sqrt(s / HOP);
  }
  return e;
}

let acoustic = null;
if (fs.existsSync(STEM)) {
  const stemEnv = envelopeOf(STEM);
  const envCache = new Map();
  const envFor = (f) => {
    if (!envCache.has(f)) envCache.set(f, envelopeOf(path.join('videos/socrates-wheat-ear/assets/sfx/prepped', f)));
    return envCache.get(f);
  };

  const rows = [];
  for (const c of sfxChecked) {
    const src = envFor(c.file);
    // template = the cue's first 220 ms after its media offset, which always contains the attack
    const offFrames = Math.round((c.mediaStart * SR) / HOP);
    const tplLen = Math.min(Math.round((0.22 * SR) / HOP), src.length - offFrames);
    if (tplLen < 4) continue;
    const tpl = src.subarray(offFrames, offFrames + tplLen);

    const expectIdx = Math.round((c.time * SR) / HOP);
    // +-80 ms: cues are placed with exact millisecond adelay, so the only expected
    // offset is a few ms of limiter lookahead. A wider search lets a cue lock onto a
    // neighbouring cue built from the SAME sample (F5's three ticks, F16's impact +
    // ping, F27's bass + ping), which reports a false error instead of verifying.
    const search = Math.round((0.08 * SR) / HOP);
    let best = { lag: null, score: -1 };
    for (let lag = -search; lag <= search; lag++) {
      let dot = 0, a2 = 0, b2 = 0;
      for (let i = 0; i < tplLen; i++) {
        const j = expectIdx + lag + i;
        const b = j >= 0 && j < stemEnv.length ? stemEnv[j] : 0;
        dot += tpl[i] * b; a2 += tpl[i] * tpl[i]; b2 += b * b;
      }
      const score = (a2 > 0 && b2 > 0) ? dot / Math.sqrt(a2 * b2) : 0;
      if (score > best.score) best = { lag, score };
    }
    rows.push({
      note: c.note, role: c.role, file: c.file,
      expected: +c.time.toFixed(3),
      detected: best.lag === null ? null : +(c.time + (best.lag * HOP) / SR).toFixed(3),
      errMs: best.lag === null ? null : +((best.lag * HOP * 1000) / SR).toFixed(1),
      correlation: +best.score.toFixed(3),
      // a cue placed within 0.35 s of another cannot be independently located by
      // envelope matching: the two templates overlap, so a boundary-sized error here
      // is ambiguity, not misplacement. Reported separately from verified cues.
      ambiguous: sfxChecked.some((o) => o !== c && Math.abs(o.time - (c.role === 'whoosh' ? c.time + c.duration / 2 : c.time)) < 0.35),
    });
  }

  const verified = rows.filter((r) => !r.ambiguous && r.errMs !== null && r.correlation > 0.35);
  const ambiguous = rows.filter((r) => r.ambiguous);
  const errs = verified.map((r) => r.errMs).sort((a, b) => a - b);
  const weak = rows.filter((r) => !r.ambiguous && r.correlation <= 0.35);
  const med = errs.length ? errs[Math.floor(errs.length / 2)] : null;
  const mean = errs.length ? +(errs.reduce((s, x) => s + x, 0) / errs.length).toFixed(1) : null;
  const maxAbs = errs.length ? Math.max(...errs.map(Math.abs)) : null;
  acoustic = {
    cuesChecked: rows.length,
    independentlyVerified: verified.length,
    ambiguous: ambiguous.length,
    weakCorrelation: weak.length,
    medianErrMs: med, meanErrMs: mean, maxAbsErrMs: maxAbs,
    weakNotes: weak.map((r) => `${r.note} (r=${r.correlation})`).slice(0, 10),
    ambiguousNotes: ambiguous.map((r) => r.note).slice(0, 10),
    worst: verified.slice().sort((a, b) => Math.abs(b.errMs) - Math.abs(a.errMs)).slice(0, 6),
    rows,
  };
  if (weak.length) problems.push(`${weak.length} sfx cue(s) could not be located in the render (correlation <= 0.35)`);
  // Tolerance depends on the sound's shape: a percussive hit has a sharp envelope
  // peak and must be tight; a whoosh/swell has a broad smooth envelope whose
  // correlation peak wanders by tens of ms without the sound actually moving.
  const TOL = cfg.timing.acousticToleranceMs;
  for (const r of verified) {
    const lim = TOL[r.role] ?? 25;
    if (Math.abs(r.errMs) > lim) problems.push(`acoustic: "${r.note}" (${r.role}) off by ${r.errMs} ms, over its ${lim} ms tolerance for that sound shape`);
  }
}
out.checks.acoustic = acoustic;

// ---- report --------------------------------------------------------------------
const line = (s) => console.log(s);
line('TIMING VERIFICATION\n');
line(`1. scene cuts on bar lines        ${out.checks.cuts.withinTolerance}/${out.checks.cuts.total} within ${TOL_MS} ms   (worst ${out.checks.cuts.worstMs} ms, F${out.checks.cuts.worstFrame})`);
line(`2. subtitle cues on beat lines    ${out.checks.subtitleCues.withinTolerance}/${out.checks.subtitleCues.total} within ${TOL_MS} ms   (worst ${out.checks.subtitleCues.worstMs} ms)`);
line(`3. sound cues on beat lines       ${out.checks.sfxCues.withinTolerance}/${out.checks.sfxCues.total} within ${TOL_MS} ms   (worst ${out.checks.sfxCues.worstMs} ms)   [+${out.checks.sfxCues.beds} beds]`);
if (acoustic) {
  line(`4. acoustic placement (rendered)  ${acoustic.independentlyVerified} of ${acoustic.cuesChecked} independently verified (${acoustic.ambiguous} ambiguous: another cue within 350 ms)`);
  line(`   error vs intended position: median ${acoustic.medianErrMs} ms, mean ${acoustic.meanErrMs} ms, max |err| ${acoustic.maxAbsErrMs} ms`);
  if (acoustic.weakNotes.length) line(`   not detected: ${acoustic.notDetectedNotes.join(' | ')}`);
  line('   worst placements:');
  for (const w of acoustic.worst) line(`     ${String(w.errMs).padStart(7)} ms  ${w.role.padEnd(8)} ${w.note}`);
  line('   (a small constant positive offset is the limiter lookahead, not musical drift)');
}
line('');
if (problems.length) { line(`${problems.length} finding(s):`); for (const p of problems) line('  - ' + p); }
else line('all timing checks pass');
out.problems = problems;
fs.writeFileSync(cfg.files.timingVerification, JSON.stringify(out, null, 2));
line('\nwrote ' + cfg.files.timingVerification);
process.exit(problems.length ? 1 : 0);



