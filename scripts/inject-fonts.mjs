// Injects the @font-face block into every frame, inline.
//
// Why inline and not a <link>: the renderer's compiler scans the composition HTML
// for @font-face to build its deterministic font mapping. A linked stylesheet is
// invisible to that scan, so the compiler warns "No deterministic font mapping for:
// WheatDisplay" and cannot guarantee the webfont is loaded before a frame is
// captured. Inlining the block removes the warning and makes font loading waitable.
//
// Workers write `<!--HF_FONTS-->` where the block belongs; this script replaces it.
// Idempotent: an already-injected block is replaced, not duplicated.
//
//   node tools/inject-fonts.mjs
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const PROJ = cfg.proj;
const FRAMES = cfg.framesDir;
const SRC_CSS = path.join(cfg.fontsDir, 'fonts.css');
const TOKEN = '<!--HF_FONTS-->';

// frames live two levels below the project root, so the font URLs need ../../assets
const css = fs.readFileSync(SRC_CSS, 'utf8')
  .replace(/url\(['"]?\.\//g, "url('../../assets/fonts/");
const block = '<style>\n' + css + '</style>';

const files = fs.readdirSync(FRAMES).filter((f) => f.endsWith('.html')).sort();
let injected = 0, already = 0, untouched = 0;

for (const f of files) {
  const p = path.join(FRAMES, f);
  let html = fs.readFileSync(p, 'utf8');
  const hadBlock = /@font-face/.test(html);
  if (html.includes(TOKEN)) {
    html = html.replace(TOKEN, block);
    fs.writeFileSync(p, html);
    injected++;
    continue;
  }
  if (hadBlock) {
    // replace whichever <style> block already carries the @font-face set, so a
    // font rebuild can never leave a stale subset behind in an older frame.
    // Re-running with unchanged fonts rewrites identical bytes — count that as
    // up-to-date, not as "left alone".
    const re = /<style>[\s\S]*?@font-face[\s\S]*?<\/style>/;
    if (re.test(html)) {
      const next = html.replace(re, block);
      if (next !== html) fs.writeFileSync(p, next);
      already++;
      continue;
    }
  }
  untouched++;
}

console.log(`fonts: ${files.length} frame file(s) — injected ${injected}, refreshed ${already}, no token ${untouched}`);
if (untouched) console.log(`  (files without ${TOKEN} and without an existing block were left alone)`);
