// Repairs corrupted <title> lines in frame files.
//
// What happened: a frame was written with a mangled non-ASCII byte sequence in its
// <title>, which swallowed the "</title>" (the "<" was lost). HTML parses <title> as
// RCDATA, so an unterminated title makes the parser treat the ENTIRE document body as
// title text — no elements are parsed at all, and lint reports the frame as having no
// root / no template content, even though the markup on disk looks perfect.
//
// A text-based structural check cannot see this; the fix is to normalise every title to
// plain ASCII, which also removes any chance of it recurring.
//
//   node tools/fix-titles.mjs           # report only
//   node tools/fix-titles.mjs --write
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const FRAMES = cfg.framesDir;
const WRITE = process.argv.includes('--write');

const files = fs.readdirSync(FRAMES).filter((f) => f.endsWith('.html')).sort();
let broken = 0, fixed = 0;

for (const f of files) {
  const p = path.join(FRAMES, f);
  const src = fs.readFileSync(p, 'utf8');
  const lines = src.split('\n');
  const ti = lines.findIndex((l) => /<title>/i.test(l));
  if (ti < 0) { console.log(`  ${f}: no <title> line (fine — head is discarded at mount)`); continue; }
  const line = lines[ti];
  const ok = /<title>[\s\S]*<\/title>/i.test(line);
  // also flag any replacement char or mojibake marker
  const suspicious = /[\uFFFD]|鎵|鐨|鏄|路 /.test(line);
  if (ok && !suspicious) continue;
  broken++;
  const num = (f.match(/^(\d+)/) || [])[1] || '??';
  const clean = `    <title>F${num}</title>`;
  console.log(`  ${f}: ${ok ? 'mojibake' : 'UNTERMINATED </title>'} -> ${JSON.stringify(line.trim())}`);
  if (WRITE) {
    lines[ti] = clean;
    fs.writeFileSync(p, lines.join('\n'));
    fixed++;
  }
}

console.log(`\n${broken} title(s) need repair${WRITE ? `, ${fixed} rewritten` : ''}`);
if (!WRITE && broken) console.log('re-run with --write to fix');
