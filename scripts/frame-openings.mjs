// Detects frames whose OPENING pose is wrong.
//
// The failure this catches: a `fromTo` renders its "from" state at timeline-build
// time, so a frame with two pairs on one property can open holding a LATER step's
// state. The visible symptom is a subtitle — or any later reveal — already on screen
// in the first instants of a frame, before its first cue is due.
//
// The test is empirical, not static: snapshot every frame ~60 ms after its cut, and
// flag any frame that shows subtitle ink while its first cue is not due yet.
//
//   node tools/frame-openings.mjs --times                 # print the snapshot times
//   node tools/frame-openings.mjs --check <snapshot-dir>  # analyse the stills
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const FF = process.env.HF_FFMPEG || path.join(process.env.LOCALAPPDATA,
  'Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe');

const PROBE = 0.06;            // seconds after the cut
const DUE_SLACK = 0.25;        // a cue this soon after the cut may legitimately be up
// "Showing" means actual TEXT, not scenery. Subtitle glyphs are paper (#f2ece0, ~230
// luma); a wheat field crossing the same band peaks near 98. A 60-luma threshold
// therefore reported the field as a subtitle — measured in F10, whose opening band is
// 4.9% above 60 but 0.000% above 120. Only ink above TEXT_LUMA counts.
const TEXT_LUMA = 150;
const INK_LIMIT = 0.25;        // % of the subtitle band that must be text-bright to count

const cue = readJson(cfg.files.cueMap);
const frames = cue.frames.map((f) => ({
  frame: f.frame,
  probeAt: +(f.start + PROBE).toFixed(3),
  firstCueLocal: f.cues.length ? +(f.cues[0].s - f.start).toFixed(3) : null,
}));

const args = process.argv.slice(2);
if (args.includes('--times') || args.length === 0) {
  console.log(frames.map((f) => f.probeAt).join(','));
  process.exit(0);
}

const dir = args[args.indexOf('--check') + 1];
if (!dir || !fs.existsSync(dir)) { console.error('pass --check <snapshot-dir>'); process.exit(2); }

const W = 480, H = 270;
const tmp = path.join(os.tmpdir(), 'hf-open.raw');
function bandInk(png, y0, y1) {
  execFileSync(FF, ['-v', 'error', '-y', '-i', png, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', tmp], { stdio: 'ignore' });
  const buf = fs.readFileSync(tmp);
  const a = Math.round((y0 / 1080) * H), b = Math.round((y1 / 1080) * H);
  let ink = 0, n = 0;
  for (let y = a; y < b; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const L = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      if (L > TEXT_LUMA) ink++;
      n++;
    }
  }
  return +((ink / (n || 1)) * 100).toFixed(3);
}

// match stills to frames by the timestamp in the filename (at-<t>s.png / frame-NN-at-<t>s.png)
const stills = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f) && /at-/.test(f));
const findings = [];
const rows = [];
for (const f of frames) {
  const still = stills.find((s) => {
    const m = /at-([\d.]+)s\.png$/i.exec(s);
    return m && Math.abs(parseFloat(m[1]) - f.probeAt) < 0.02;
  });
  if (!still) continue;
  const ink = bandInk(path.join(dir, still), cfg.bands.subtitle[0], cfg.bands.subtitle[1]);
  const showingEarly = ink > INK_LIMIT;
  const notDueYet = f.firstCueLocal === null || f.firstCueLocal > DUE_SLACK;
  rows.push({ frame: f.frame, probeAt: f.probeAt, firstCueLocal: f.firstCueLocal, subtitleInkPct: ink, flagged: showingEarly && notDueYet });
  if (showingEarly && notDueYet) {
    findings.push(`F${f.frame}: subtitle ink ${ink}% at t+${PROBE}s but its first cue is not due until local ${f.firstCueLocal}s — the frame is opening in a later state (check for fromTo pairs missing immediateRender:false)`);
  }
}

console.log(`checked ${rows.length} frame opening(s)\n`);
console.log('  frame   probeAt   firstCue(local)   subtitleInk%   verdict');
for (const r of rows) {
  console.log(`  F${String(r.frame).padStart(2)}    ${String(r.probeAt).padStart(7)}   ${String(r.firstCueLocal ?? '—').padStart(14)}   ${String(r.subtitleInkPct).padStart(12)}   ${r.flagged ? 'FLAGGED' : 'ok'}`);
}
console.log('');
if (findings.length) { console.log(`${findings.length} finding(s):`); for (const x of findings) console.log('  - ' + x); }
else console.log('every frame opens in its correct initial pose');
process.exit(findings.length ? 1 : 0);

