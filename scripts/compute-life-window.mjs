// Turns the abstract 1/e threshold into an age, which is the number the video
// wants the viewer to remember. Every value here is derived, not asserted:
//   observation window ends at  from + (1/e) * (to - from)
//
// Like compute-optimal-stopping.mjs this is a worked example of the rule "every figure is
// computed, never invented": the windows are the film's own input, so they live in
// vibe.config.json ("lifeWindows"), and a theme about anything else should replace this
// script — and its maths — with whatever it is actually about.
//
//   node tools/compute-life-window.mjs
//
// Output: data/life-window.json
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const oneOverE = 1 / Math.E;      // 0.3678794412
const missRate = 1 - oneOverE;    // 0.6321205588

// Defaults match templates/vibe.config.json: a window is the viewer's own input, not a
// fact, and the film says so on screen.
const DEFAULT_WINDOWS = [
  { id: 'decade', label: '18–28 岁', from: 18, to: 28, note: '十年，最常见的“择偶窗口”直觉' },
  { id: 'university', label: '大学四年', from: 18, to: 22, note: '只算本科在校的四年' },
  { id: 'twelve', label: '18–30 岁', from: 18, to: 30, note: '十二年' },
];
const windows = Array.isArray(cfg.lifeWindows) && cfg.lifeWindows.length ? cfg.lifeWindows : DEFAULT_WINDOWS;
for (const w of windows) {
  if (!Number.isFinite(w.from) || !Number.isFinite(w.to) || w.to <= w.from) {
    console.error(`lifeWindows entry "${w.id ?? w.label ?? '?'}" needs numbers with from < to (got ${w.from} .. ${w.to}) — fix it in ${cfg.configPath}`);
    process.exit(2);
  }
}

fs.mkdirSync(cfg.dataDir, { recursive: true });

const rows = windows.map((w) => {
  const span = w.to - w.from;
  const switchAge = w.from + oneOverE * span;
  // which academic year does that land in? (assume birthday-neutral: 18.0 = 大一开学)
  const yearIndex = Math.floor(switchAge - 18); // 0=大一, 1=大二, 2=大三, 3=大四
  const yearNames = ['大一', '大二', '大三', '大四'];
  const year = yearIndex >= 0 && yearIndex < 4 ? yearNames[yearIndex] : null;
  const termInYear = switchAge - 18 - yearIndex; // 0..1 through that year
  return {
    ...w,
    span,
    observationEndsAge: +switchAge.toFixed(2),
    observationEndsAgeDisplay: switchAge.toFixed(1),
    academicYear: year,
    termLabel: year ? `${year}${termInYear < 0.5 ? '上学期' : '下学期'}` : null,
    observationYears: +(oneOverE * span).toFixed(2),
  };
});

console.log(`1/e = ${oneOverE.toFixed(6)}   miss rate 1 - 1/e = ${missRate.toFixed(6)} (${(missRate * 100).toFixed(1)}%)\n`);
console.log('window              range      span   observe   switch point');
for (const r of rows) {
  console.log(`  ${r.label.padEnd(14)} ${String(r.from).padStart(2)}-${String(r.to).padStart(2)}岁   ${String(r.span).padStart(2)}年   ${String(r.observationYears).padStart(4)}年   ${r.observationEndsAgeDisplay} 岁  (${r.termLabel ?? '—'})`);
}

const primary = rows.find((r) => r.id === 'decade') ?? rows[0];
console.log(`\nheadline number for the video: ${primary.observationEndsAgeDisplay} 岁  = ${primary.termLabel}`);
console.log(`screen line: “37% 的观察期，在 ${primary.observationEndsAgeDisplay} 岁结束 —— 也就是${primary.academicYear}。”`);

fs.writeFileSync(path.join(cfg.dataDir, 'life-window.json'), JSON.stringify({
  generatedBy: 'tools/compute-life-window.mjs',
  oneOverE: +oneOverE.toFixed(10),
  missRate: +missRate.toFixed(10),
  assumptions: [
    'observation phase ends at from + (1/e) x (to - from)',
    'the window (from/to) is the viewer’s own input, not a fact — the video says so on screen',
    'academic-year mapping assumes a birthday-neutral start at 18.0',
  ],
  windows: rows,
  headline: {
    age: primary.observationEndsAgeDisplay,
    term: primary.termLabel,
    line: `37% 的观察期，在 ${primary.observationEndsAgeDisplay} 岁结束`,
  },
}, null, 2));
console.log('\nwrote ' + path.join(cfg.dataDir, 'life-window.json'));
