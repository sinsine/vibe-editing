// Plans the scene grid — the step between the musical grid and STORYBOARD.md.
//
// Scene LENGTHS are chosen in bars, never in seconds, and every cut has to land on a bar
// line: that is what makes the film's cuts verifiable to within a frame, and it is the
// reason this script prints geometry instead of guessing a shot list.
//
//   - if <root>/scene-plan.json exists, it is the plan
//       [ { "frame": 1, "bars": 8, "title": "hook" }, ... ]   (bars are whole numbers)
//     and it is turned into exact cut times, snapped to bar lines by construction
//   - if it does not, the candidate grid is printed — every 2-bar and 4-bar boundary with
//     its absolute time — together with a suggested default plan of 2-bar scenes, so
//     whoever writes the storyboard can pick the lengths and save them as scene-plan.json
//
// Either way the result goes to audio/scene-grid.json, with the per-scene accent hits.
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const tm = readJson(cfg.files.timingMap);
const beat = tm.beat;
const bar = tm.bar;

const barTime = (k) => beat.offset + k * bar.duration;
const phraseBars = 8;
const phrase = phraseBars * bar.duration; // ~17.01 s

console.log(`beat ${beat.period}s (${beat.bpm} BPM) offset ${beat.offset}s | bar ${bar.duration}s | 8-bar phrase ${phrase.toFixed(3)}s`);
console.log(`track ${tm.duration}s = ${(tm.duration / bar.duration).toFixed(2)} bars = ${(tm.duration / phrase).toFixed(2)} phrases\n`);

// phrase boundaries
const phraseBounds = [];
for (let p = 0; ; p++) {
  const t = barTime(p * phraseBars);
  if (t > tm.duration) break;
  phraseBounds.push({ phrase: p, bar: p * phraseBars, t: +t.toFixed(3) });
}
console.log('8-bar phrase boundaries:');
console.log('  ' + phraseBounds.map((p) => `P${p}@${p.t}s`).join('  '));

// how close is each detected section to a phrase or 4-bar boundary?
console.log('\nsection -> grid match (nearest 4-bar boundary):');
const nearest4 = (t) => {
  const k = Math.round((t - beat.offset) / (bar.duration * 4));
  const bt = beat.offset + k * bar.duration * 4;
  return { boundaryBar: k * 4, t: bt, errMs: (t - bt) * 1000 };
};
for (const s of tm.sections ?? []) {
  const n = nearest4(s.t);
  console.log(`  section ${String(s.t).padStart(6)}s  ->  4-bar #${String(n.boundaryBar).padStart(3)} @ ${n.t.toFixed(3)}s   err ${n.errMs >= 0 ? '+' : ''}${n.errMs.toFixed(0)}ms`);
}

// ---- the candidate grid: every 2-bar boundary, flagged when it is also a 4- or 8-bar one ----
const lastBar = Math.max(0, Math.floor((tm.duration - beat.offset) / bar.duration));
const candidates = [];
for (let k = 2; k <= lastBar; k += 2) {
  candidates.push({
    bar: k,
    t: +barTime(k).toFixed(3),
    onFourBar: k % 4 === 0,
    onPhrase: k % phraseBars === 0,
  });
}

// ---- the plan: <root>/scene-plan.json, or a suggested default ----
const planPath = path.join(cfg.root, 'scene-plan.json');
const plan = readJson(planPath, { required: false });
if (plan !== null && !Array.isArray(plan)) {
  console.error(`${planPath} must be an array of { "frame", "bars", "title" } objects`);
  process.exit(2);
}
if (plan) {
  for (const [i, s] of plan.entries()) {
    if (!Number.isInteger(s.bars) || s.bars < 1) {
      console.error(`${planPath}: entry ${i + 1} (frame ${s.frame ?? '?'}) has bars=${JSON.stringify(s.bars)} — a scene length is a whole number of bars`);
      process.exit(2);
    }
  }
}

const spec = plan ?? Array.from({ length: Math.floor(lastBar / 2) }, (_, i) => ({
  frame: i + 1,
  bars: 2,
  title: `scene-${String(i + 1).padStart(2, '0')}`,
}));

if (plan) {
  console.log(`\nscene-plan.json (${plan.length} scene(s)) — lengths are bars, cuts land on bar lines:`);
} else {
  console.log(`\ntrack holds ${lastBar} whole bars. candidate cut bars (2-bar grid; 4-bar and 8-bar boundaries marked):`);
  console.log('   bar      time     kind');
  for (const c of candidates) {
    const kind = c.onPhrase ? '8-bar (phrase)' : c.onFourBar ? '4-bar' : '2-bar';
    console.log(`  ${String(c.bar).padStart(4)}  ${c.t.toFixed(3).padStart(9)}s   ${kind}`);
  }
  console.log('\nno scene-plan.json — suggesting 2-bar scenes. Write <root>/scene-plan.json to choose');
  console.log('your own lengths, e.g. [{ "frame": 1, "bars": 8, "title": "hook" }, ...]:');
}

let cursor = 0;
const scenes = [];
for (const [i, s] of spec.entries()) {
  const startBar = cursor;
  const start = barTime(startBar);
  const end = barTime(startBar + s.bars);
  if (start > tm.duration) break;
  scenes.push({
    id: s.frame ?? i + 1,
    title: s.title ?? `scene-${String(i + 1).padStart(2, '0')}`,
    startBar,
    endBar: startBar + s.bars,
    start: +start.toFixed(3),
    end: +Math.min(end, tm.duration).toFixed(3),
    dur: +(Math.min(end, tm.duration) - start).toFixed(3),
  });
  cursor += s.bars;
}

console.log(`\nscene grid (bar-aligned${plan ? ', from scene-plan.json' : ', suggested 2-bar default'}):`);
console.log('  id  scene      startBar  start      end        dur     beats   bars');
for (const s of scenes) {
  const bs = Math.round((s.start - beat.offset) / beat.period);
  const be = Math.round((s.end - beat.offset) / beat.period);
  console.log(`  ${String(s.id).padStart(2)}  ${s.title.padEnd(10)} ${String(s.startBar).padStart(6)}  ${String(s.start).padStart(8)}  ${String(s.end).padStart(8)}  ${String(s.dur).padStart(6)}  ${String(be - bs).padStart(5)}  ${String(s.endBar - s.startBar).padStart(4)}`);
}

// per-scene accent candidates: strongest hits inside the scene, snapped to bars
const hits = readJson(cfg.files.hitMap).hits;
console.log('\nper-scene accent hits (top 6 by strength, snapped to nearest beat):');
for (const s of scenes) {
  const inScene = hits.filter((h) => h.t >= s.start && h.t < s.end).sort((a, b) => b.z - a.z).slice(0, 6).sort((a, b) => a.t - b.t);
  const snapped = inScene.map((h) => {
    const k = Math.round((h.t - beat.offset) / beat.period);
    const bt = beat.offset + k * beat.period;
    return `${bt.toFixed(2)}(${((h.t - bt) * 1000).toFixed(0)}ms)`;
  });
  console.log(`  ${String(s.id).padStart(2)} ${s.title.padEnd(10)} ${snapped.join(' ')}`);
}

const out = {
  generatedBy: 'tools/plan-scenes.mjs',
  beat,
  bar,
  phraseBars,
  phraseSeconds: +phrase.toFixed(4),
  phraseBoundaries: phraseBounds,
  lastBar,
  plan: plan ? path.basename(planPath) : null,
  candidates,
  scenes,
  totalScenes: scenes.length,
};
fs.writeFileSync(path.join(cfg.audioDir, 'scene-grid.json'), JSON.stringify(out, null, 2));
console.log('\nwrote ' + path.join(cfg.audioDir, 'scene-grid.json'));
