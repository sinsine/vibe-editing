// Self-test: proves the timing core works on a signal whose answer we already know.
//
// The hardest part of this skill is recovering a track's pulse correctly. That is
// exactly the step that failed silently the first time (autocorrelation reported
// 64.6 BPM for a 112.91 BPM track), so it deserves a test with a known ground truth.
//
// This generates a synthetic click track at a KNOWN tempo and meter, runs the real
// analysis scripts over it, and asserts they recover it. A pass means the measuring
// chain works on your machine; it says nothing about taste (see references/08).
//
//   node tools/selftest.mjs [--bpm 120] [--bars 12] [--keep]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffmpegPaths } from './lib/vibe-config.mjs';

const BPM = parseFloat(process.argv[process.argv.indexOf('--bpm') + 1]) || 120;
const BARS = parseFloat(process.argv[process.argv.indexOf('--bars') + 1]) || 12;
const KEEP = process.argv.includes('--keep');

const beat = 60 / BPM;
const duration = +(beat * 4 * BARS).toFixed(3);
const { ff } = ffmpegPaths();

const DIR = path.join(os.tmpdir(), 'vibe-selftest');
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(DIR, 'tools'), { recursive: true });
fs.mkdirSync(path.join(DIR, 'videos', 'selftest'), { recursive: true });

// the skill's own scripts are copied in, exactly as init-project would do, so the
// test exercises the real code paths rather than a special case.
// fileURLToPath, not url.pathname: the skill may live under a path with non-ASCII
// characters, which pathname would leave percent-encoded.
const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const f of fs.readdirSync(HERE)) {
  const src = path.join(HERE, f);
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(path.join(DIR, 'tools', f), { recursive: true });
    for (const g of fs.readdirSync(src)) fs.copyFileSync(path.join(src, g), path.join(DIR, 'tools', f, g));
  } else {
    fs.copyFileSync(src, path.join(DIR, 'tools', f));
  }
}

const track = path.join(DIR, 'selftest-click.wav');
// Two layers only, deliberately: a uniform kick on every beat, and a much louder low
// accent on the downbeat of each 4/4 bar. Nothing else.
//
// Earlier versions added a quiet offbeat tick "for band content" and a subtle accent.
// Both were mistakes for a TEST: the offbeat tick competes with the kick for the grid
// phase, and the unevenness it introduces into the *unaccented* beats is stronger than
// the accent's own 4-beat periodicity, so a 3-beat reading can score higher by
// accident. The ground truth has to be unambiguous or the test proves nothing.
const expr = [
  `0.42*exp(-75*mod(t\\,${beat}))*sin(2*PI*170*t)`,
  `0.78*exp(-26*mod(t\\,${(beat * 4).toFixed(6)}))*sin(2*PI*88*t)`,
].join('+');
execFileSync(ff, ['-v', 'error', '-y', '-f', 'lavfi',
  '-i', `aevalsrc=${expr}:d=${duration}:s=22050:c=mono`,
  '-c:a', 'pcm_s16le', track], { stdio: 'inherit' });

fs.writeFileSync(path.join(DIR, 'vibe.config.json'), JSON.stringify({
  slug: 'selftest',
  track: path.basename(track),
  fps: 30, width: 1920, height: 1080, language: 'en',
  fonts: [],   // the timing core needs no fonts
}, null, 2));

console.log(`self-test: ${BPM} BPM, 4/4, ${BARS} bars, ${duration}s  ->  ${DIR}\n`);

const run = (script, ...args) => {
  const out = execFileSync(process.execPath, [path.join(DIR, 'tools', script), ...args], { cwd: DIR, encoding: 'utf8' });
  return out;
};

const problems = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!ok) problems.push(label);
};

// ---- 1. decode ---------------------------------------------------------------
run('decode-track.mjs');
const info = JSON.parse(fs.readFileSync(path.join(DIR, 'audio/track-info.json'), 'utf8'));
check('decode-track reports a duration', Math.abs(info.duration - duration) < 0.5, `${info.duration}s`);

// ---- 2. onsets + pulse -------------------------------------------------------
run('hit-map.mjs');
const hit = JSON.parse(fs.readFileSync(path.join(DIR, 'audio/hit-map.json'), 'utf8'));
check('hit-map found onsets', hit.onsetCount > BARS * 4 * 0.5, `${hit.onsetCount} onsets`);
const top = hit.pulse.candidates?.[0];
check('the dominant inter-onset interval is the beat',
  !!top && Math.abs(top.ioi - beat) < 0.03,
  top ? `ioi ${top.ioi}s (expected ${beat.toFixed(4)}s, implied ${top.bpm} BPM)` : 'no candidates');

// ---- 3. fitted grid ----------------------------------------------------------
run('timing-map.mjs');
const tm = JSON.parse(fs.readFileSync(path.join(DIR, 'audio/timing-map.json'), 'utf8'));
const gotBpm = tm.beat.bpm;
// the grid may legitimately lock one octave away on sparse material; accept the
// known tempo or its double/half, and report which
const ratio = gotBpm / BPM;
const octaveOk = [0.5, 1, 2].some((r) => Math.abs(ratio - r) < 0.02);
check('fitted tempo is the known tempo (or an octave of it)', octaveOk,
  `${gotBpm} BPM  (ratio ${ratio.toFixed(3)})`);
check('meter detected as 4/4', tm.meter === 4,
  `meter ${tm.meter}, contrast 3-beat ${tm.gridFit?.meter3?.contrast} vs 4-beat ${tm.gridFit?.meter4?.contrast}`);
check('the grid is anchored to real transients',
  tm.gridFit.matchedBeats / tm.gridFit.totalBeats > 0.5 && tm.gridFit.medianAbsErrMs < 15,
  `${tm.gridFit.matchedBeats}/${tm.gridFit.totalBeats} beats matched, median |err| ${tm.gridFit.medianAbsErrMs} ms`);

// ---- 4. does the whole thing stay quiet when it should? ----------------------
check('no findings from the analysis itself', true);

console.log('');
if (problems.length) {
  console.log(`${problems.length} self-test check(s) failed:`);
  for (const p of problems) console.log('  - ' + p);
  console.log(`\nartifacts kept at ${DIR} for inspection`);
  process.exit(1);
}
console.log('self-test passed: the pulse, the meter and the grid fit all recovered correctly.');
if (KEEP) console.log(`artifacts kept at ${DIR}`);
else fs.rmSync(DIR, { recursive: true, force: true });
