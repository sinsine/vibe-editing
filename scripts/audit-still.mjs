// Programmatic visual audit of rendered stills — the substitute for looking at them.
//
// Decodes a PNG through FFmpeg into raw RGB (file to file, no pipes), then measures
// the things an eye would catch and a linter cannot: is the frame actually lit? is
// there ink where the subtitle band is? did anything intrude into the reserved band?
// is content sitting in the top-left corner, which is the signature of CSS that never
// applied? are highlights blown?
//
// The reserved band rows come from vibe.config.json when the stills live inside a
// project; on any other folder of PNGs the built-in 1080p rows are used and the run says
// so. Every threshold and verdict below is fixed — only the rows move.
//
// Usage:
//   node tools/audit-still.mjs <still.png> [more.png ...]
//   node tools/audit-still.mjs --json <dir-or-file> ...
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { findRoot, loadConfig, ffmpegPaths } from './lib/vibe-config.mjs';

const FF = ffmpegPaths().ff;

const W = 480, H = 270;               // analysis resolution (1080p -> 1/4)
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const inputs = args.filter((a) => !a.startsWith('--'));

// Is there a project here? findRoot() answers that without throwing, because this script
// is also legitimately run on a folder of PNGs that has nothing to do with a film.
const root = findRoot();
const cfg = root ? loadConfig(root) : null;
if (!cfg) {
  // keep stdout parseable when --json, but never stay silent about which rows were used
  const why = 'no vibe.config.json found — using the built-in 1080p band rows';
  if (asJson) console.error(why); else console.log(why);
}

// gather PNGs (a directory expands to its *.png, skipping contact sheets)
const files = [];
for (const inp of inputs) {
  if (!fs.existsSync(inp)) { console.error(`missing: ${inp}`); continue; }
  if (fs.statSync(inp).isDirectory()) {
    for (const f of fs.readdirSync(inp).sort()) if (f.toLowerCase().endsWith('.png')) files.push(path.join(inp, f));
  } else files.push(inp);
}
if (!files.length) { console.error('no PNG inputs'); process.exit(2); }

const tmp = path.join(os.tmpdir(), 'hf-audit.raw');

function decode(p) {
  execFileSync(FF, ['-v', 'error', '-y', '-i', p, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', tmp], { stdio: 'ignore' });
  const buf = fs.readFileSync(tmp);
  if (buf.length < W * H * 3) throw new Error(`short decode for ${p}: ${buf.length}`);
  return buf;
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const isGold = (r, g, b) => r > 78 && r > b + 26 && g > b + 8 && r >= g - 6;

// band rows, in canvas pixels -> analysis rows. The four reserved bands are the film's
// layout law and come from the config; the bottom row is whatever is left below the
// subtitle band.
const CANVAS_H = cfg ? cfg.height : 1080;
const BANDS = cfg
  ? {
      chrome: cfg.bands.chrome,
      display: cfg.bands.display,
      gap: cfg.bands.gap,
      subtitle: cfg.bands.subtitle,
      bottom: [cfg.bands.subtitle[1], cfg.height],
    }
  : {
      chrome: [60, 120],
      display: [140, 842],
      gap: [842, 872],
      subtitle: [872, 1024],
      bottom: [1024, 1080],
    };
const row = (y) => Math.max(0, Math.min(H - 1, Math.round((y / CANVAS_H) * H)));

function analyse(p) {
  const buf = decode(p);
  const px = (x, y) => { const i = (y * W + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };

  let sum = 0, nonBlack = 0, gold = 0, blown = 0;
  let comY = 0, comW = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = px(x, y);
      const L = luma(r, g, b);
      sum += L;
      if (L > 12) nonBlack++;
      if (isGold(r, g, b)) gold++;
      if (L > 250) blown++;
      comY += L * y; comW += L;
    }
  }
  const n = W * H;

  // edge density per band = mean |gradient| (detects text/ink, ignores smooth gradients)
  const bandEdge = {};
  const bandInk = {};
  for (const [name, [y0, y1]] of Object.entries(BANDS)) {
    const a = row(y0), b = row(y1);
    let e = 0, c = 0, ink = 0;
    for (let y = a; y < b; y++) {
      for (let x = 1; x < W - 1; x++) {
        const L0 = luma(...px(x, y));
        e += Math.abs(L0 - luma(...px(x - 1, y))) + Math.abs(L0 - luma(...px(x + 1, y)));
        if (L0 > 60) ink++;
        c++;
      }
    }
    bandEdge[name] = +(e / (c || 1)).toFixed(3);
    bandInk[name] = +((ink / (c || 1)) * 100).toFixed(3);
  }

  // top-left quadrant: the "CSS never applied" tell
  let tlEdge = 0, tlC = 0;
  for (let y = 0; y < Math.round(H * 0.25); y++) {
    for (let x = 1; x < Math.round(W * 0.4) - 1; x++) {
      const L0 = luma(...px(x, y));
      tlEdge += Math.abs(L0 - luma(...px(x - 1, y))) + Math.abs(L0 - luma(...px(x + 1, y)));
      tlC++;
    }
  }

  // column histogram of gold — is the accent actually placed?
  const goldCols = new Array(12).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y);
    if (isGold(r, g, b)) goldCols[Math.min(11, Math.floor((x / W) * 12))]++;
  }

  return {
    file: path.basename(p),
    meanLuma: +(sum / n).toFixed(2),
    litFrac: +((nonBlack / n) * 100).toFixed(2),
    goldFrac: +((gold / n) * 100).toFixed(3),
    blownFrac: +((blown / n) * 100).toFixed(3),
    brightnessComY: +((comY / (comW || 1) / H) * 100).toFixed(1),
    bandEdge, bandInk,
    topLeftEdge: +(tlEdge / (tlC || 1)).toFixed(2),
    goldCols,
  };
}

const results = files.map((f) => {
  try { return analyse(f); } catch (e) { return { file: path.basename(f), error: e.message }; }
});

// ---------- verdicts ----------
const problems = [];
for (const r of results) {
  if (r.error) { problems.push(`${r.file}: ${r.error}`); continue; }
  if (r.meanLuma < 1.2) problems.push(`${r.file}: frame is essentially black (meanLuma ${r.meanLuma})`);
  if (r.litFrac < 1.0) problems.push(`${r.file}: almost nothing lit (litFrac ${r.litFrac}%)`);
  if (r.blownFrac > 6) problems.push(`${r.file}: blown highlights (${r.blownFrac}% above 250)`);
  if (r.topLeftEdge > 6) problems.push(`${r.file}: heavy detail top-left (${r.topLeftEdge}) — possible unstyled content`);
  if (r.bandEdge.subtitle < 0.35 && r.bandInk.subtitle < 0.25) problems.push(`${r.file}: no detectable subtitle ink in the reserved band`);
  // The gap band y842-872 must not carry TEXT or bright graphics, but a dim pictorial
  // layer (a wheat silhouette under the subtitle scrim) legitimately crosses it, so
  // the test is on bright ink, not on edge energy.
  if (r.bandInk.gap > 1.0) problems.push(`${r.file}: bright content in the gap band y842-872 (ink ${r.bandInk.gap}%)`);
}

if (asJson) {
  console.log(JSON.stringify({ results, problems }, null, 2));
} else {
  console.log(`audited ${results.length} still(s) at ${W}x${H}\n`);
  for (const r of results) {
    if (r.error) { console.log(`${r.file}  ERROR ${r.error}`); continue; }
    console.log(`${r.file}`);
    console.log(`  meanLuma ${String(r.meanLuma).padStart(6)}   lit ${String(r.litFrac).padStart(5)}%   gold ${String(r.goldFrac).padStart(6)}%   blown ${r.blownFrac}%   comY ${r.brightnessComY}%`);
    console.log(`  edge  chrome ${String(r.bandEdge.chrome).padStart(5)}  display ${String(r.bandEdge.display).padStart(5)}  gap ${String(r.bandEdge.gap).padStart(5)}  subtitle ${String(r.bandEdge.subtitle).padStart(5)}  bottom ${r.bandEdge.bottom}`);
    console.log(`  ink%  chrome ${String(r.bandInk.chrome).padStart(5)}  display ${String(r.bandInk.display).padStart(5)}  gap ${String(r.bandInk.gap).padStart(5)}  subtitle ${String(r.bandInk.subtitle).padStart(5)}  bottom ${r.bandInk.bottom}`);
    console.log(`  topLeftEdge ${r.topLeftEdge}   gold by column [${r.goldCols.join(',')}]`);
  }
  console.log(problems.length ? `\n${problems.length} finding(s):\n  - ${problems.join('\n  - ')}` : '\nno findings');
}
process.exit(problems.length ? 1 : 0);
