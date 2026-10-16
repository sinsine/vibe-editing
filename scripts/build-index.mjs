// Builds videos/socrates-wheat-ear/index.html from the storyboard + cue map.
//
// The index is generated, never hand-edited: every frame's slot start/duration
// comes from audio/cue-map.json (itself derived from the beat grid), so a cut can
// only ever move by re-running tools/sync-storyboard-timings.mjs.
//
// Frames that do not exist on disk yet are reported and skipped, so the project
// stays renderable while it is being built up.
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const PROJ = cfg.proj;
const SB = cfg.files.storyboard;
const CUE = cfg.files.cueMap;
const OUT = cfg.files.index;
const TRACK = +(readJson(cfg.files.timingMap).duration.toFixed(3));

const cue = JSON.parse(fs.readFileSync(CUE, 'utf8'));
const sb = fs.readFileSync(SB, 'utf8');

// Frames land continuously from parallel builders; a frame that arrives after the
// last font-injection run would ship without @font-face and fail lint
// (font_family_without_font_face). So the index build always re-injects first.
{
  const { execFileSync } = await import('node:child_process');
  try {
    const out = execFileSync(process.execPath, [path.join(cfg.toolsDir, 'inject-fonts.mjs')], { encoding: 'utf8' });
    process.stdout.write(out.split('\n')[0] + '\n');
  } catch (e) {
    console.warn('font injection failed:', e.message);
  }
}

// frame number -> src path declared in the storyboard
const srcByFrame = new Map();
{
  const blocks = sb.split(/^## Frame /m).slice(1);
  for (const b of blocks) {
    const num = parseInt(b, 10);
    const m = /^- src: (.+)$/m.exec(b);
    if (Number.isFinite(num) && m) srcByFrame.set(num, m[1].trim());
  }
}

const present = [];
const missing = [];
for (const f of cue.frames) {
  const src = srcByFrame.get(f.frame);
  if (!src) { missing.push(`F${f.frame} (no src in storyboard)`); continue; }
  const abs = path.join(PROJ, src);
  if (!fs.existsSync(abs)) { missing.push(`F${f.frame} ${src}`); continue; }
  present.push({ ...f, src, id: 'f' + String(f.frame).padStart(2, '0') });
}

// Soundtrack: one pre-mixed master (tools/mix-soundtrack.mjs) rather than the raw
// BGM plus per-clip SFX. The BGM is a hot, heavily limited master (-10.3 LUFS,
// LRA 3.0), so it needed a real gain structure and a single limiter across the whole
// film; mixing it here also makes the result measurable after the fact.
// `<audio>` MUST have an id or the mixer silently drops it.
const MIX = path.relative(PROJ, cfg.files.mix).replace(/\\/g, '/');
const RAW_BGM = cfg.track ? 'assets/bgm/' + path.basename(cfg.trackPath) : null;
const audioSrc = fs.existsSync(cfg.files.mix) ? MIX : (RAW_BGM && fs.existsSync(path.join(PROJ, RAW_BGM)) ? RAW_BGM : null);

const clip = (f) => `      <div
        id="${f.id}"
        data-composition-id="${f.id}"
        data-composition-src="${f.src}"
        data-start="${f.start.toFixed(3)}"
        data-duration="${f.dur.toFixed(3)}"
        data-track-index="${f.frame}"
        data-width="1920"
        data-height="1080"
      ></div>`;

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>苏格拉底的麦穗 · The Wheat Ear Problem</title>
    <style>
      /* Base ground painted from frame.md's canvas colour so dark content never
         lands on the host body's default white. */
      html, body { margin: 0; padding: 0; height: 100%; background: #07070a; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #07070a; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="socrates-wheat-ear"
      data-start="0"
      data-width="1920"
      data-height="1080"
      data-duration="${TRACK}"
      data-no-timeline
    >
${present.map(clip).join('\n')}
${audioSrc ? `
      <!-- one pre-mixed soundtrack: BGM + every SFX cue, already mastered -->
      <audio
        id="soundtrack"
        src="${audioSrc}"
        data-start="0"
        data-duration="${TRACK}"
        data-track-index="90"
        data-volume="1"
      ></audio>` : '      <!-- soundtrack not staged: run tools/mix-soundtrack.mjs -->'}
    </div>
  </body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`index.html written: ${present.length} frame(s) wired, track ${TRACK}s`);
if (missing.length) {
  console.log(`\nnot built yet (${missing.length}):`);
  for (const m of missing) console.log('  - ' + m);
}
if (!audioSrc) console.log('!! no soundtrack staged — run tools/mix-soundtrack.mjs before rendering');
const total = present.reduce((s, f) => s + f.dur, 0);
console.log(`\nwired span: ${total.toFixed(2)}s of ${TRACK}s`);

