// Pre-render gate on the frame FILES themselves.
//
// `lint`/`check` validate a frame in isolation; the failures that actually ruin a
// render are cross-file and silent:
//   - the host's data-composition-id not matching the frame's own id and its
//     window.__timelines key -> the runtime waits 45 s per scene, then captures
//     static first frames, so the video is full length and completely dead
//   - data-duration not matching the storyboard slot -> scenes hold or blank early
//   - vw/vh units, a <style> left in <head>, a non-deterministic call, or a missing
//     font block -> each fails quietly rather than loudly
//
// This script exists so those never reach the renderer.
//
//   node tools/verify-frames.mjs
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const PROJ = cfg.proj;
const FRAMES = cfg.framesDir;
const cue = readJson(cfg.files.cueMap);
const sb = fs.readFileSync(cfg.files.storyboard, 'utf8');

// expected src per frame, from the storyboard
const srcByFrame = new Map();
for (const b of sb.split(/^## Frame /m).slice(1)) {
  const n = parseInt(b, 10);
  const m = /^- src: (.+)$/m.exec(b);
  if (Number.isFinite(n) && m) srcByFrame.set(n, m[1].trim());
}

const files = fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES).filter((f) => f.endsWith('.html')).sort() : [];
const results = [];
const noAccents = [];
const problems = [];

for (const f of files) {
  const num = parseInt(f, 10);
  const expectedId = 'f' + String(num).padStart(2, '0');
  const slot = cue.frames.find((c) => c.frame === num);
  const html = fs.readFileSync(path.join(FRAMES, f), 'utf8');
  const issues = [];

  // 1. id in all three places
  const rootId = (/data-composition-id="([^"]+)"/.exec(html) || [])[1];
  if (rootId !== expectedId) issues.push(`root data-composition-id is "${rootId}", expected "${expectedId}"`);
  if (!new RegExp(`HF\\.register\\(\\s*['"]${expectedId}['"]`).test(html)) issues.push(`HF.register('${expectedId}', …) not found`);
  const ids = [...html.matchAll(/data-composition-id="([^"]+)"/g)].map((m) => m[1]);
  if (new Set(ids).size > 1) issues.push(`more than one composition id in the file: ${[...new Set(ids)].join(', ')}`);

  // 2. duration matches the storyboard slot
  const dur = parseFloat((/data-duration="([\d.]+)"/.exec(html) || [])[1]);
  if (slot) {
    if (!Number.isFinite(dur)) issues.push('no data-duration on the root');
    else if (Math.abs(dur - slot.dur) > 0.02) issues.push(`data-duration ${dur} != storyboard slot ${slot.dur.toFixed(3)}`);
  }

  // 3. fonts
  const faceCount = (html.match(/@font-face/g) || []).length;
  if (faceCount !== 6) issues.push(`expected 6 @font-face blocks, found ${faceCount} (run tools/inject-fonts.mjs)`);
  if (html.includes('<!--HF_FONTS-->')) issues.push('unreplaced <!--HF_FONTS--> token');

  // 4. structural contract
  if (/<head>[\s\S]*?<style[\s\S]*?<\/head>/i.test(html)) issues.push('<style> found in <head> — it will be discarded at mount');
  if (!/<template>/.test(html)) issues.push('no <template> wrapper — a sub-composition must be templated');
  if (!html.includes('../lib/wheat.css')) issues.push('missing link to ../lib/wheat.css');
  if (!html.includes('assets/lib/gsap.min.js')) issues.push('missing local gsap script tag');
  if (!html.includes('../lib/wheat.js')) issues.push('missing ../lib/wheat.js script tag');

  // 5. determinism + unit rules
  if (/(^|[^a-zA-Z-])\d+(\.\d+)?vw\b/.test(html)) issues.push('uses vw units (cqw/cqh required)');
  if (/(^|[^a-zA-Z-])\d+(\.\d+)?vh\b/.test(html)) issues.push('uses vh units (cqw/cqh required)');
  if (/Math\.random\s*\(/.test(html)) issues.push('Math.random() — use HF.rng(seed)');
  if (/Date\.now\s*\(/.test(html)) issues.push('Date.now() — not deterministic');
  if (/crossorigin/.test(html)) issues.push('crossorigin attribute on media — lint rejects it');

  // 6. the reserved subtitle band must be present and used
  if (!/class="[^"]*\bband-sub\b[^"]*"/.test(html)) issues.push('no .band-sub element — subtitles must live in the reserved band');

  // 6b. an unterminated <title> silently destroys the whole frame: <title> is RCDATA, so
  // a lost "</title>" makes the parser treat the ENTIRE body as title text and the render
  // sees no root at all — while the markup on disk still looks perfect. Caught for real in
  // F11; tools/fix-titles.mjs repairs it.
  const titleLine = html.split('\n').find((l) => /<title>/i.test(l));
  if (titleLine && !/<title>[\s\S]*<\/title>/i.test(titleLine)) {
    issues.push('unterminated <title> (RCDATA swallows the body — run tools/fix-titles.mjs)');
  }

  // 7. accents file — an alignment AID, not a correctness requirement. It lets the
  // sound design be reconciled with the visuals per frame; frames built before the
  // requirement existed simply rely on the shared beat grid. Reported, not failed.
  const accentPath = path.join(cfg.hfDir, 'accents', `F${String(num).padStart(2, '0')}.json`);
  const hasAccents = fs.existsSync(accentPath);
  if (!hasAccents) noAccents.push(num);

  results.push({ frame: num, file: f, dur, expectedId, bytes: html.length, hasAccents, issues });
  for (const i of issues) problems.push(`F${num} (${f}): ${i}`);
}

// coverage against the storyboard
const missing = cue.frames.filter((c) => !files.some((f) => parseInt(f, 10) === c.frame)).map((c) => c.frame);

console.log(`checked ${results.length} frame file(s)\n`);
const clean = results.filter((r) => r.issues.length === 0);
console.log(`  clean: ${clean.length}/${results.length}`);
if (missing.length) console.log(`  not built yet: ${missing.join(', ')}`);
if (noAccents.length) console.log(`  no accents file (alignment aid only): ${noAccents.join(', ')}`);
for (const r of results.filter((x) => x.issues.length)) {
  console.log(`\n  F${r.frame} — ${r.issues.length} issue(s)`);
  for (const i of r.issues) console.log(`     - ${i}`);
}
console.log('');
if (problems.length) { console.log(`${problems.length} problem(s) across ${results.filter((r) => r.issues.length).length} frame(s)`); process.exitCode = 1; }
else if (!missing.length) console.log('all 33 frames pass the pre-render gate');
else console.log(`${results.length}/33 frames pass the pre-render gate`);

