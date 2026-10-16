// Scaffolds a working project for this skill.
//
// Creates the layout, writes vibe.config.json, probes the machine for usable fonts
// (the one genuinely machine-specific input the pipeline needs), initialises the
// HyperFrames project, drops in the templates and the starter visual library, and
// prints the exact next command.
//
//   node tools/init-project.mjs --dir <workdir> --slug <project-slug> --track <music file> [options]
//
// Options
//   --title "<working title>"       goes into BRIEF.md as a starting point
//   --platforms bilibili,douyin     which publishing assets to produce
//   --fps 30                        frame rate (24/25/30/50/60)
//   --no-copy-tools                 do not copy the scripts into <workdir>/tools
//
// Safe to re-run: existing files are never overwritten unless --force is passed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));       // <skill>/scripts
const SKILL = path.dirname(HERE);                                 // <skill>
const TEMPLATES = path.join(SKILL, 'templates');

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes('--' + name);
const FORCE = has('force');

const dirArg = arg('dir');
if (!dirArg) {
  console.error('usage: node tools/init-project.mjs --dir <workdir> --slug <project-slug> --track <music file>');
  process.exit(2);
}
const ROOT = path.resolve(dirArg);
const slug = arg('slug');
if (!slug) { console.error('--slug is required (kebab-case, e.g. sunk-cost-explained)'); process.exit(2); }
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.error(`--slug must be kebab-case: "${slug}"`); process.exit(2); }

const trackArg = arg('track');
const fps = parseInt(arg('fps', '30'), 10);
const platforms = (arg('platforms', 'bilibili,douyin')).split(',').map((s) => s.trim()).filter(Boolean);

function write(rel, content, { binary = false } = {}) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p) && !FORCE) { console.log(`  skip (exists)  ${rel}`); return false; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, binary ? undefined : 'utf8');
  console.log(`  write          ${rel}`);
  return true;
}
function copy(src, rel) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p) && !FORCE) { console.log(`  skip (exists)  ${rel}`); return false; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.copyFileSync(src, p);
  console.log(`  copy           ${rel}`);
  return true;
}

console.log(`init-project -> ${ROOT}\n`);
fs.mkdirSync(ROOT, { recursive: true });
for (const d of ['audio', 'data', 'videos']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });

// ---------------------------------------------------------------- fonts
// The pipeline needs real font FILES (it subsets them and inlines @font-face), so
// init has to resolve family name -> file path. On Windows the font registry gives
// exactly that mapping; elsewhere fc-list does.
function probeFonts() {
  const found = [];   // { family, file, bold:boolean }
  const add = (family, file) => {
    if (!file) return;
    const abs = path.isAbsolute(file) ? file : path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', file);
    if (fs.existsSync(abs)) found.push({ family, file: abs });
  };
  try {
    if (process.platform === 'win32') {
      for (const hive of [
        'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
        'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
      ]) {
        let out = '';
        try { out = execFileSync('reg', ['query', hive], { encoding: 'utf8' }); } catch { continue; }
        for (const line of out.split(/\r?\n/)) {
          const m = /^\s{4}(.+?)\s{4}(REG_SZ)\s{4}(.+?)\s*$/.exec(line);
          if (!m) continue;
          const family = m[1].replace(/\s*\((TrueType|OpenType)\)\s*$/i, '').trim();
          add(family, m[3].trim());
        }
      }
      // user-installed fonts live outside the registry value's default dir
      const userFonts = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts');
      if (fs.existsSync(userFonts)) {
        for (const f of fs.readdirSync(userFonts)) {
          if (/\.(ttf|otf|ttc)$/i.test(f)) found.push({ family: f.replace(/\.[^.]+$/, ''), file: path.join(userFonts, f) });
        }
      }
    } else {
      const out = execFileSync('fc-list', ['--format', '%{family}|%{file}\n'], { encoding: 'utf8' });
      for (const line of out.split('\n')) {
        const [fams, file] = line.split('|');
        if (!file) continue;
        for (const fam of (fams || '').split(',')) add(fam.trim(), file.trim());
      }
    }
  } catch (e) {
    console.log(`  ! font probe failed (${e.message}); edit "fonts" in vibe.config.json by hand`);
  }
  return found;
}

const fonts = probeFonts();
console.log(`  probed ${fonts.length} font file(s)`);

// preference order per role: CJK-capable families first, then Latin, then mono
const CANDIDATES = {
  display: [/HarmonyOS Sans SC Black/i, /Noto Sans SC Black/i, /Source Han Sans.*Heavy/i, /Microsoft YaHei UI? Bold/i, /SimHei/i, /PingFang SC/i],
  sans: [/HarmonyOS Sans SC Medium/i, /Noto Sans SC Medium/i, /Microsoft YaHei/i, /PingFang SC/i, /Noto Sans SC$/i],
  sansRegular: [/HarmonyOS Sans SC$/i, /Noto Sans SC$/i, /Microsoft YaHei/i, /DengXian/i, /PingFang SC/i],
  serif: [/Noto Serif SC SemiBold/i, /Source Han Serif.*SemiBold/i, /Noto Serif SC$/i, /Songti SC/i, /SimSun/i],
  mono: [/Consolas/i, /JetBrains Mono/i, /IBM Plex Mono/i, /Cascadia Mono/i, /Menlo/i, /monospace/i],
  monoBold: [/Consolas Bold/i, /JetBrains Mono.*Bold/i, /Cascadia Mono SemiBold/i, /Courier New Bold/i],
};
const pick = (pats) => {
  for (const p of pats) {
    const hit = fonts.find((f) => p.test(f.family) && /\.(ttf|otf)$/i.test(f.file));
    if (hit) return hit;
  }
  return null;
};
const faceList = [];
const CSS = { display: 'WheatDisplay', sans: 'WheatSans', sansRegular: 'WheatSansRegular', serif: 'WheatSerif', mono: 'WheatMono', monoBold: 'WheatMonoBold' };
for (const [role, pats] of Object.entries(CANDIDATES)) {
  const hit = pick(pats);
  if (hit) faceList.push({ css: CSS[role], role, family: hit.family, file: hit.file });
  else console.log(`  ! no font found for role "${role}" — set it by hand in vibe.config.json`);
}

// ---------------------------------------------------------------- the track
let trackRel = null;
if (trackArg) {
  const src = path.resolve(trackArg);
  if (!fs.existsSync(src)) { console.error(`track not found: ${src}`); process.exit(2); }
  // keep the project self-contained: copy it in rather than pointing outside
  const inside = src.startsWith(ROOT + path.sep);
  if (inside) trackRel = path.relative(ROOT, src).replace(/\\/g, '/');
  else {
    const dest = path.join(ROOT, path.basename(src));
    if (fs.existsSync(dest) && !FORCE) { console.log(`  skip (exists)  ${path.basename(src)}`); }
    else { fs.copyFileSync(src, dest); console.log(`  copy           ${path.basename(src)}`); }
    trackRel = path.basename(src);
  }
}

// ---------------------------------------------------------------- config
const config = {
  _comment: 'vibe.config.json — the only project-specific file the tooling reads. See references/00-intake.md.',
  slug,
  title: arg('title', ''),
  track: trackRel,
  fps,
  width: 1920,
  height: 1080,
  language: arg('language', 'zh-CN'),
  platforms,
  fonts: faceList.map((f) => ({ css: f.css, file: f.file.replace(/\\/g, '/'), role: f.role, family: f.family })),
  charsetExtra: '',
};
write('vibe.config.json', JSON.stringify(config, null, 2) + '\n');

// ---------------------------------------------------------------- tools
if (!has('no-copy-tools')) {
  const sameDir = path.resolve(HERE) === path.resolve(path.join(ROOT, 'tools'));
  if (sameDir) console.log('  (scripts already live in ./tools)');
  else {
    fs.mkdirSync(path.join(ROOT, 'tools', 'lib'), { recursive: true });
    for (const f of fs.readdirSync(HERE)) {
      const src = path.join(HERE, f);
      if (fs.statSync(src).isDirectory()) {
        for (const g of fs.readdirSync(src)) copy(path.join(src, g), path.join('tools', f, g));
      } else copy(src, path.join('tools', f));
    }
  }
}

// ---------------------------------------------------------------- hyperframes project
const projRel = path.join('videos', slug);
if (fs.existsSync(path.join(ROOT, projRel, 'hyperframes.json'))) {
  console.log(`  skip (exists)  ${projRel}/hyperframes.json`);
} else {
  console.log(`\n  initialising the HyperFrames project (this downloads the CLI on first use)...`);
  try {
    execFileSync('npx', ['--yes', 'hyperframes', 'init', projRel, '--non-interactive', '--example=blank'], {
      cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
    });
  } catch (e) {
    console.log(`  ! hyperframes init failed: ${e.message}`);
    console.log('    create the project by hand, or re-run after fixing the network/CLI');
  }
}

// ---------------------------------------------------------------- templates
copy(path.join(TEMPLATES, 'frame.md'), path.join(projRel, 'frame.md'));
copy(path.join(TEMPLATES, 'BUILD-RULES.md'), path.join(projRel, '.hyperframes', 'BUILD-RULES.md'));
copy(path.join(TEMPLATES, 'BRIEF.md'), path.join(projRel, 'BRIEF.md'));
copy(path.join(TEMPLATES, 'STORYBOARD.md'), path.join(projRel, 'STORYBOARD.md'));
copy(path.join(TEMPLATES, 'PUBLISH.md'), path.join(projRel, 'PUBLISH.md'));
copy(path.join(TEMPLATES, 'sfx-design.mjs'), 'sfx-design.mjs');
copy(path.join(TEMPLATES, 'cover-copy.json'), 'cover-copy.json');

// starter visual library: the dark-and-gold system this skill was distilled from
const libDir = path.join(projRel, 'compositions', 'lib');
for (const f of ['wheat.css', 'wheat.js']) {
  const src = path.join(TEMPLATES, f);
  if (fs.existsSync(src)) copy(src, path.join(libDir, f));
}
fs.mkdirSync(path.join(ROOT, projRel, 'compositions', 'frames'), { recursive: true });

// ---------------------------------------------------------------- next steps
const missing = [];
if (!trackRel) missing.push('no music track: pass --track <file>, or set "track" in vibe.config.json');
if (faceList.length < 6) missing.push(`only ${faceList.length}/6 font roles resolved — check "fonts" in vibe.config.json`);

console.log(`
────────────────────────────────────────────────────────────────
next steps

  1. fill in the brief
       ${path.join(projRel, 'BRIEF.md')}
     then the design spec (the template has TODO markers)
       ${path.join(projRel, 'frame.md')}

  2. make the music measurable, then derive the grid
       node tools/decode-track.mjs
       node tools/hit-map.mjs
       node tools/timing-map.mjs

  3. plan the scenes on the bar grid, write STORYBOARD.md, then
       node tools/sync-storyboard-timings.mjs      # derives every cue time; gates reading speed
       node tools/build-frame-packets.mjs          # one packet per frame
       node tools/build-index.mjs                  # wires frames + soundtrack (injects fonts first)

  4. sound, verification, render, publish — see SKILL.md for the full order
────────────────────────────────────────────────────────────────`);
if (missing.length) { console.log('\nbefore you start:'); for (const m of missing) console.log('  ! ' + m); }
