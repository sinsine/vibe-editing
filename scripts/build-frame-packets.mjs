// Builds one tightly-scoped packet per frame for the frame builders.
//
// A packet is everything needed to build exactly one frame and nothing else:
//   - the frame's authored storyboard block (copy, scene, registers, citations)
//   - its exact window, with every cue/beat/bar converted from film-absolute time
//     to the frame's own timeline time (a sub-composition starts at 0, not at the
//     film's 0), because getting this wrong is the single easiest way to break sync
//   - the data values the frame is allowed to print
//
// Output: .hyperframes/packets/FNN.md
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const PROJ = cfg.proj;
const OUTDIR = path.join(cfg.hfDir, 'packets');
fs.mkdirSync(OUTDIR, { recursive: true });

const cue = readJson(cfg.files.cueMap);
const tm = readJson(cfg.files.timingMap);
// optional: a theme may print no computed dataset at all
const opt = readJson(path.join(cfg.dataDir, 'optimal-stopping.json'), { required: false }) ?? { absent: true };
const life = readJson(path.join(cfg.dataDir, 'life-window.json'), { required: false }) ?? { absent: true };
const sb = fs.readFileSync(cfg.files.storyboard, 'utf8');

const { period, offset } = tm.beat;
const barDur = tm.bar.duration;

// split the storyboard into per-frame blocks
const blocks = new Map();
{
  const parts = sb.split(/^## Frame /m).slice(1);
  for (const p of parts) {
    const num = parseInt(p, 10);
    if (Number.isFinite(num)) blocks.set(num, '## Frame ' + p.trimEnd());
  }
}

const f3 = (n) => n.toFixed(3);
const written = [];

for (const f of cue.frames) {
  const T0 = f.start;
  const dur = f.dur;
  const to = (abs) => +(abs - T0).toFixed(3);

  // beats and bars that fall inside the frame, expressed in frame-local time
  const localBeats = [];
  for (let k = 0; ; k++) {
    const t = offset + k * period;
    if (t > f.end) break;
    if (t >= T0 - 1e-6) localBeats.push({ abs: +t.toFixed(3), local: to(t), k });
  }
  const localBars = [];
  for (let k = 0; ; k++) {
    const t = offset + k * barDur;
    if (t > f.end) break;
    if (t >= T0 - 1e-6) localBars.push({ abs: +t.toFixed(3), local: to(t), bar: k });
  }

  const cues = f.cues.map((c, i) => ({
    i: i + 1,
    text: c.text,
    inAbs: c.s,
    outAbs: c.e,
    inLocal: to(c.s),
    outLocal: to(c.e),
    seconds: +(c.e - c.s).toFixed(2),
  }));

  const block = blocks.get(f.frame) || `## Frame ${f.frame} — (missing from STORYBOARD.md)`;
  // the src lives in the storyboard block, not in cue-map.json
  const src = ((/^- src: (.+)$/m.exec(block) || [])[1] || `compositions/frames/${String(f.frame).padStart(2, '0')}-frame.html`).trim();
  const citesData = /data\.(optimal-stopping|life-window)/.test(block) || /data:/.test(block);

  const dataAppendix = citesData ? `
## Data this frame may print (verbatim — never recompute or round differently)

optimal-stopping.json
${JSON.stringify({
    oneOverE: opt.oneOverE,
    missRate: opt.missRate ?? undefined,
    peakN100: opt.peakN100,
    monteCarlo: { n: opt.monteCarlo?.n, trials: opt.monteCarlo?.trials, curve: opt.monteCarlo?.curve?.filter((r) => [1, 5, 10, 20, 30, 37, 38, 40, 50].includes(r.r)) },
  }, null, 2)}

life-window.json
${JSON.stringify({ headline: life.headline, windows: life.windows.map((w) => ({ label: w.label, from: w.from, to: w.to, span: w.span, observationYears: w.observationYears, observationEndsAgeDisplay: w.observationEndsAgeDisplay, termLabel: w.termLabel })) }, null, 2)}

Citation rule: \`+20%\` must always carry \`Iyengar, Wells & Schwartz (2006)\` beneath it in label type.
` : '';

  const packet = `# Packet — Frame ${f.frame}

${block}

---

## Timing (computed; do not hand-edit)

This frame is a sub-composition. **Its own timeline starts at 0**, but every cue and
accent below was authored against the film's absolute clock. Use the LOCAL numbers.

- film window: ${f3(f.start)} -> ${f3(f.end)} s   (duration **${dur}s**)
- root attribute: \`data-duration="${dur}"\`
- offset: \`const T0 = ${f3(f.start)}; const at = (abs) => Math.max(0, abs - T0);\`
- scene length: bars ${f.startBar}-${f.endBar}

### Subtitle cues (the ONLY text that goes in the subtitle band)

${cues.map((c) => `- cue ${c.i}: \`${c.text}\`\n  - film ${c.inAbs}-${c.outAbs}s  ->  **local ${c.inLocal} -> ${c.outLocal}s** (${c.seconds}s on screen)`).join('\n')}

### Musical grid inside this frame (place accents on these)

- beats (local s): ${localBeats.map((b) => b.local).join(', ')}
- bar lines (local s): ${localBars.map((b) => b.local).join(', ')}

Every display-type entrance, impact, and scene-internal accent must land on one of
those beat lines. The frame's first frame (local 0) is a bar line by construction.

${dataAppendix}
## Deliverable

Write exactly one file: \`${path.join(PROJ, src).replace(/\\/g, '/')}\`

Structure (a TEMPLATED sub-composition — this shape is load-bearing):

\`\`\`html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>F${String(f.frame).padStart(2, '0')} · ${(block.match(/^## Frame \d+ — (.+)$/m) || [, ''])[1]}</title></head>
  <body>
    <template>
      <!--HF_FONTS-->
      <link rel="stylesheet" href="../lib/wheat.css" />
      <style>/* frame-scoped only */</style>
      <div id="root" data-composition-id="f${String(f.frame).padStart(2, '0')}" data-width="1920" data-height="1080" data-duration="${dur}">
        ...
      </div>
      <script src="../../assets/lib/gsap.min.js"></script>
      <script src="../lib/wheat.js"></script>
      <script>/* HF.register('f${String(f.frame).padStart(2, '0')}, tl => { ... }) */</script>
    </template>
  </body>
</html>
\`\`\`

The composition id must be exactly \`f${String(f.frame).padStart(2, '0')}\` in all three
places (root attribute, HF.register key, and the host wiring in index.html).
`;

  const p = path.join(OUTDIR, `F${String(f.frame).padStart(2, '0')}.md`);
  fs.writeFileSync(p, packet);
  written.push(p);
}

console.log(`wrote ${written.length} packet(s) to ${OUTDIR}`);
console.log(written.slice(0, 3).map((p) => '  ' + path.basename(p)).join('\n'));
console.log(`  ... ${written.length} total`);
