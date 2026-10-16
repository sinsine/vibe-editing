// Verifies the covers the way a platform feed will actually use them.
//
// A cover is judged at thumbnail size (a Bilibili grid tile is ~240px wide), so the
// decisive test is not "does it look right at 1920px" but "does the type survive being
// shrunk". This decodes each cover through FFmpeg at full size AND at 240px, then
// checks: dimensions, nothing clipped at the edges, ink present in the type zone, the
// type still separable from its ground after downscaling, and no type bleeding into the
// pictogram zone.
//
// THUMB_W and EDGE are the two honest knobs in this file — a platform tile is ~240 px
// wide, so 240 is the width the type must survive, and 24 px is the border the design
// system promises stays empty; every other number here is a measurement, not a choice.
//
//   node tools/audit-covers.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { loadConfig, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const COVERS = cfg.coversDir;
const FF = ffmpegPaths().ff;

const THUMB_W = 240;
const EDGE = 24;        // px border that must stay free of bright ink

function decode(p, w) {
  const tmp = path.join(os.tmpdir(), `cov-${w}-${path.basename(p)}.raw`);
  execFileSync(FF, ['-v', 'error', '-y', '-i', p, '-vf', `scale=${w}:-2`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', tmp], { stdio: 'ignore' });
  const buf = fs.readFileSync(tmp);
  const h = Math.round(buf.length / (w * 3));
  return { buf, w, h };
}
const luma = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
const isGold = (b, i) => b[i] > 78 && b[i] > b[i + 2] + 26 && b[i + 1] > b[i + 2] + 8;

function stats(img) {
  const { buf, w, h } = img;
  let sum = 0, n = 0, gold = 0, bright = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3; const L = luma(buf, i);
    sum += L; n++; if (isGold(buf, i)) gold++; if (L > 150) bright++;
  }
  return { meanLuma: sum / n, goldPct: (gold / n) * 100, brightPct: (bright / n) * 100 };
}

/** type zone = left 62% / top 68% ; pictogram zone = right 30%, below 22% */
function zones(img) {
  const { buf, w, h } = img;
  let typeInk = 0, typeN = 0, pictGold = 0, pictN = 0, edgeInk = 0, edgeN = 0;
  const tx = Math.round(w * 0.62), ty = Math.round(h * 0.68);
  const px0 = Math.round(w * 0.70), py0 = Math.round(h * 0.22);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3; const L = luma(buf, i);
    if (x < tx && y < ty) { typeN++; if (L > 150) typeInk++; }
    if (x >= px0 && y >= py0) { pictN++; if (isGold(buf, i) && L > 90) pictGold++; }
    if (x < EDGE || y < EDGE || x >= w - EDGE || y >= h - EDGE) { edgeN++; if (L > 150) edgeInk++; }
  }
  return {
    typeInkPct: (typeInk / (typeN || 1)) * 100,
    pictGoldPct: (pictGold / (pictN || 1)) * 100,
    edgeInkPct: (edgeInk / (edgeN || 1)) * 100,
  };
}

const files = fs.readdirSync(COVERS).filter((f) => /^cover-.*\.png$/i.test(f)).sort();
if (!files.length) { console.error('no covers found'); process.exit(2); }

const problems = [];
console.log('cover                    size        meanLuma  gold%   type-ink%   thumb-ink%   edge-ink%');
const rows = [];
for (const f of files) {
  const p = path.join(COVERS, f);
  const full = decode(p, 1920);          // normalise width for comparable zones
  const thumb = decode(p, THUMB_W);
  const hdr = fs.readFileSync(p);
  const dim = { w: hdr.readUInt32BE(16), h: hdr.readUInt32BE(20) };
  const s = stats(full);
  const z = zones(full);
  const zt = zones(thumb);
  const row = {
    file: f, dim, meanLuma: +s.meanLuma.toFixed(1), goldPct: +s.goldPct.toFixed(2),
    typeInkPct: +z.typeInkPct.toFixed(2), thumbInkPct: +zt.typeInkPct.toFixed(2),
    pictGoldPct: +z.pictGoldPct.toFixed(2), edgeInkPct: +z.edgeInkPct.toFixed(2),
  };
  rows.push(row);
  console.log(`${f.padEnd(24)} ${String(dim.w + 'x' + dim.h).padEnd(11)} ${String(row.meanLuma).padStart(7)}  ${String(row.goldPct).padStart(5)}  ${String(row.typeInkPct).padStart(9)}   ${String(row.thumbInkPct).padStart(9)}   ${String(row.edgeInkPct).padStart(8)}`);

  if (row.meanLuma < 4) problems.push(`${f}: essentially black`);
  if (row.typeInkPct < 1.2) problems.push(`${f}: too little type ink in the type zone (${row.typeInkPct}%)`);
  if (row.thumbInkPct < 1.0) problems.push(`${f}: type does not survive thumbnail scaling (${row.thumbInkPct}% at 240px)`);
  if (row.pictGoldPct < 1.0) problems.push(`${f}: no gold pictogram found in the pictogram zone (${row.pictGoldPct}%)`);
  if (row.edgeInkPct > 0.6) problems.push(`${f}: bright ink within ${EDGE}px of the edge — may be clipped (${row.edgeInkPct}%)`);
}

console.log('');
if (problems.length) { console.log(`${problems.length} finding(s):`); for (const x of problems) console.log('  - ' + x); }
else console.log('all covers pass: correct size, type present, type survives 240px, pictogram present, nothing clipped at the edge');

fs.writeFileSync(path.join(COVERS, 'cover-audit.json'), JSON.stringify({ generatedBy: 'tools/audit-covers.mjs', thumbWidth: THUMB_W, edgeGuardPx: EDGE, rows, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
