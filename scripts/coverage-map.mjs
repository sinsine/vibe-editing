// Film-wide coverage map: is there ink in the display band when there should be?
//
// This is the check that would have caught F05 before the render. Sampling a long
// composition at a handful of whole-film midpoints (what `check --samples 9` does on a
// 161 s piece) can miss an entire broken scene — F05's rules were painting as
// transparent text for ~5 s and no gate noticed, because the gates sampled the film,
// not the frame.
//
// It walks the delivered MP4 once, at a fixed interval, and compares the display band's
// ink against what the storyboard says that frame should show. Frames whose `display:`
// line says 无大字 / 留白 / none are allowed to be empty; every other frame must show
// something.
//
//   node tools/coverage-map.mjs [--every 0.5] [--video <path>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';

const cfg = loadConfig();
const { ff } = ffmpegPaths();

const every = parseFloat((process.argv[process.argv.indexOf('--every') + 1]) || '0.5') || 0.5;
const vidArg = process.argv.indexOf('--video');
const video = vidArg >= 0 ? process.argv[vidArg + 1] : path.join(cfg.rendersDir, 'video.mp4');
if (!fs.existsSync(video)) { console.error(`no video at ${video} — render first`); process.exit(2); }

const cue = readJson(cfg.files.cueMap);
const sb = fs.readFileSync(cfg.files.storyboard, 'utf8');
const tm = readJson(cfg.files.timingMap);

// What each frame is allowed to show. A frame whose `display:` line describes SMALL
// type — a chrome-band label, a corner reading, a hairline axis with one numeral — is
// not expected to fill the display band, and a low ink figure there is correct.
//
// This is a reading of the storyboard's own wording, so it is deliberately generous:
// getting it wrong in the strict direction invents defects (it flagged an axis frame
// and a top-edge label as "never paints"), whereas getting it wrong in the generous
// direction only moves a frame into the review list.
const SMALL_TYPE = /无大字|留白|^none\b|no display|上缘|小字|小读数|轴上|右上角|左下角|右下角|左上角|角标/i;
const expectEmpty = new Map();
for (const b of sb.split(/^## Frame /m).slice(1)) {
  const n = parseInt(b, 10);
  if (!Number.isFinite(n)) continue;
  const line = (/^- display: (.+)$/m.exec(b) || [])[1] || '';
  expectEmpty.set(n, SMALL_TYPE.test(line));
}

const [y0, y1] = cfg.bands.display;
const tmp = path.join(os.tmpdir(), 'coverage.raw');
const W = 640, H = Math.round((cfg.height / cfg.width) * W);

/** ink% and accent% inside the display band, for one frame of the video */
function probe(t) {
  execFileSync(ff, ['-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1',
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', tmp], { stdio: 'ignore' });
  const b = fs.readFileSync(tmp);
  const a = Math.round((y0 / cfg.height) * H), z = Math.round((y1 / cfg.height) * H);
  let ink = 0, n = 0, bright = 0;
  for (let y = a; y < z; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const L = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
      if (L > 60) ink++;
      if (L > 140) bright++;
      n++;
    }
  }
  return { inkPct: (ink / n) * 100, brightPct: (bright / n) * 100 };
}

const frameAt = (t) => cue.frames.find((f) => t >= f.start && t < f.start + f.dur);

console.log(`scanning ${video} every ${every}s over ${tm.duration}s\n`);
const rows = [];
for (let t = 0; t < tm.duration; t = +(t + every).toFixed(3)) {
  const f = frameAt(t);
  if (!f) continue;
  const p = probe(t);
  rows.push({ t, frame: f.frame, ...p });
}

// a frame is "blank" over a stretch if it never reaches a readable amount of ink
const MIN_INK = 0.35;     // % of the display band; below this, essentially nothing is on screen
const perFrame = new Map();
for (const r of rows) {
  if (!perFrame.has(r.frame)) perFrame.set(r.frame, []);
  perFrame.get(r.frame).push(r);
}

// A frame may legitimately show nothing in the display band for its first seconds —
// that is a build-up, and most frames in a well-paced film have one. What separates a
// build-up from a broken frame is the builder's own declaration of when its accents
// land. So when `.hyperframes/accents/FNN.json` exists, compare against it; without it,
// report the shape and let a human judge. (This is exactly why the accent files are a
// required deliverable for every frame — see references/07-frames.md.)
function accentsFor(n) {
  const p = path.join(cfg.hfDir, 'accents', `F${String(n).padStart(2, '0')}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const defects = [];   // a frame that contradicts its own declaration, or never paints
const review = [];    // ambiguous: low ink, no declaration to check it against

console.log('frame  samples  maxInk%   firstInk   shape                verdict');
for (const f of cue.frames) {
  const rs = perFrame.get(f.frame) || [];
  if (!rs.length) continue;

  const maxInk = Math.max(...rs.map((r) => r.inkPct));
  const blanks = rs.filter((r) => r.inkPct < MIN_INK);
  const allowed = expectEmpty.get(f.frame) === true;
  const firstInkRow = rs.find((r) => r.inkPct >= MIN_INK);
  const firstInk = firstInkRow ? +(firstInkRow.t - f.start).toFixed(2) : null;

  // leading blanks, then content — the shape of a build-up
  const lastBlank = blanks.length ? blanks[blanks.length - 1].t : null;
  const leading = blanks.filter((r) => firstInkRow === undefined || r.t < firstInkRow.t).length;
  const shape = blanks.length === 0 ? 'full'
    : firstInkRow === undefined ? 'never paints'
    : lastBlank !== null && lastBlank <= (firstInkRow?.t ?? 0) ? 'build-up'
    : 'interrupted';

  let verdict = 'ok';
  if (allowed && maxInk < MIN_INK) verdict = 'ok (declared empty)';
  else if (maxInk < MIN_INK) {
    verdict = 'NEVER PAINTS';
    defects.push(`F${f.frame}: the display band never reaches ${MIN_INK}% ink (max ${maxInk.toFixed(3)}%) and the storyboard does not declare this frame empty`);
  } else {
    // The only non-fuzzy contradiction is a declared DISPLAY-TEXT accent with no ink
    // after it. `accents[].text === true` is what makes that decidable; the free-text
    // `what` field is for humans and must not be parsed.
    //
    // Without that field all we can see is "blank early, content later", which is also
    // exactly what a well-paced build-up looks like. Measured on the reference film: a
    // pixel-only version of this rule flagged 9 frames, of which 8 were designed
    // build-ups (an axis, a small top-right reading, a chrome-band label) and 1 was a
    // genuine defect. A gate with that false-positive rate is worse than none, so
    // anything not decidable is reported for review instead of asserted.
    const acc = accentsFor(f.frame);
    const textAccents = acc?.accents?.filter((a) => a.text === true) ?? [];
    const early = textAccents.filter((a) => a.localS <= f.dur * 0.25);
    if (textAccents.length && firstInk !== null) {
      const firstText = Math.min(...textAccents.map((a) => a.localS));
      if (firstInk - firstText > 1.2) {
        verdict = 'LATE vs declaration';
        defects.push(`F${f.frame}: first display-text accent is declared at ${firstText}s but the band stays blank until ${firstInk}s — the frame contradicts its own accents/F${String(f.frame).padStart(2, '0')}.json`);
      }
    } else if (early.length) {
      verdict = 'review (unmarked accents)';
      review.push(`F${f.frame}: ${early.length} accent(s) declared early but none marked text:true, so a blank display band cannot be judged automatically`);
    } else if (shape === 'interrupted' && !acc) {
      verdict = 'review (un-reveals)';
      review.push(`F${f.frame}: ink appears, then the band goes blank again (${blanks.map((b) => b.t).join(', ')}s) and there is no accents file to check the intent against`);
    }
  }
  console.log(`${String(f.frame).padStart(4)}  ${String(rs.length).padStart(7)}  ${maxInk.toFixed(3).padStart(7)}   ${String(firstInk ?? '-').padStart(8)}   ${shape.padEnd(18)}  ${verdict}`);
}

fs.writeFileSync(path.join(cfg.audioDir, 'coverage-map.json'), JSON.stringify({
  generatedBy: 'tools/coverage-map.mjs', video, everySeconds: every, minInkPct: MIN_INK,
  note: 'build-up (blank early, content later) is normal pacing; only a frame that contradicts its accents declaration, un-reveals, or never paints is a defect',
  rows, defects, review,
}, null, 2));

console.log('');
if (defects.length) { console.log(`${defects.length} defect(s):`); for (const d of defects) console.log('  - ' + d); }
else console.log('no frame contradicts what it declared');
if (review.length) {
  console.log(`\n${review.length} frame(s) worth a human look (no accents file to check against):`);
  for (const r of review) console.log('  - ' + r);
}
process.exit(defects.length ? 1 : 0);
