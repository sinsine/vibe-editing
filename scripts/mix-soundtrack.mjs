// Renders the film's soundtrack: the user's BGM plus every designed SFX cue, mixed
// once into a single master.
//
// Why pre-mix instead of placing clips in the composition: the BGM is a hot master
// (-10.3 LUFS, LRA 3.0), so the bed needs a real gain structure and the whole thing
// needs one limiter. Mixing here also makes the result measurable — the script
// re-measures the finished master and reports where its transients land, which is
// the acoustic proof that the sound design is beat-locked.
//
//   node tools/mix-soundtrack.mjs            # mix
//   node tools/mix-soundtrack.mjs --measure  # measure the existing master only
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const ROOT = cfg.proj;
const FF = process.env.HF_FFMPEG || path.join(process.env.LOCALAPPDATA,
  'Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe');
const FP = FF.replace(/ffmpeg\.exe$/, 'ffprobe.exe');

const BGM = cfg.trackPath;
const SFXDIR = cfg.preppedDir;
const OUTDIR = cfg.audioAssetsDir;
fs.mkdirSync(OUTDIR, { recursive: true });
const MIX = path.join(OUTDIR, 'mix.wav');
const STEM = path.join(OUTDIR, 'sfx-stem.wav');

const map = readJson(cfg.files.sfxMap, { required: false }) ?? { cues: [] };
const TRACK_LEN = readJson(cfg.files.timingMap).duration;

// gain structure — the bed carries the film, SFX sit under it except at the accents.
// The BGM is an already-limited loud master (LRA 3.0), so there is deliberately NO
// compressor here: compressing it again only pumps. High-pass + a gentle low-mid dip
// + a safety limiter is the whole master chain.
const BGM_DB = +-(process.env.BGM_DB ?? Math.abs(cfg.sound.bgmGainDb));
const SFX_TRIM = +(process.env.SFX_TRIM ?? cfg.sound.sfxTrimDb);   // lifts every non-bed cue together
// attack=1 ms + level=disabled: with the default 5 ms attack and auto-levelling a
// transient slipped through to 0 dBFS. This keeps the ceiling honest.
const MASTER = 'highpass=f=28,equalizer=f=190:width_type=q:w=1:g=-1.2,'
  + 'alimiter=limit=0.82:attack=1:release=30:level=disabled,aresample=48000';

function build({ withBgm }) {
  const inputs = [];
  const chains = [];
  let idx = 0;

  if (withBgm) {
    inputs.push('-i', BGM);
    chains.push(`[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,volume=${BGM_DB}dB[bed]`);
    idx = 1;
  }

  const cueLabels = [];
  for (let i = 0; i < map.cues.length; i++) {
    const c = map.cues[i];
    const file = path.join(SFXDIR, c.file);
    if (!fs.existsSync(file)) { console.warn(`  ! missing ${c.file}, cue skipped`); continue; }
    inputs.push('-i', file);
    const ms = Math.round(c.mediaStart * 1000);
    const dur = (c.duration ?? 2).toFixed(3);
    const delayMs = Math.round(c.time * 1000);
    const label = `s${i}`;
    const gain = +(c.gainDb + (c.role === 'bed' ? 0 : SFX_TRIM)).toFixed(2);
    chains.push(
      `[${idx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,` +
      `atrim=start=${(ms / 1000).toFixed(3)}:duration=${dur},asetpts=N/SR/TB,` +
      `volume=${gain}dB,adelay=${delayMs}|${delayMs}[${label}]`
    );
    cueLabels.push(`[${label}]`);
    idx++;
  }

  if (cueLabels.length) {
    chains.push(`${cueLabels.join('')}amix=inputs=${cueLabels.length}:normalize=0:dropout_transition=0[sfx]`);
  }

  let mixed;
  if (withBgm) mixed = cueLabels.length ? '[bed][sfx]amix=inputs=2:normalize=0:dropout_transition=0[mixed]' : '[bed]anull[mixed]';
  else mixed = cueLabels.length ? '[sfx]anull[mixed]' : null;
  if (mixed) chains.push(mixed);

  const fc = chains.join(';') + (mixed ? `;[mixed]${MASTER},atrim=0:${TRACK_LEN.toFixed(3)}[out]` : '');
  return { inputs, fc };
}

function run(graph, out) {
  const args = ['-v', 'error', '-y', ...graph.inputs, '-filter_complex', graph.fc, '-map', '[out]',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', out];
  execFileSync(FF, args, { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 28 });
}

function probeLoudness(file) {
  const o = execFileSync(FF, ['-v', 'info', '-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return o;
}

function measureOnly(file) {
  // Two traps live in this one function, both of which made the delivery gate report
  // "fine" while measuring nothing:
  //  1. ebur128 and volumedetect write to STDERR — execFileSync returns stdout only,
  //     so every field came back null. Hence spawnSync, reading both streams.
  //  2. plain `ebur128` prints NO peak line at all. You must ask for it:
  //     `peak=true` gives the inter-sample true peak, `peak=sample` the sample peak.
  //     True peak is the delivery metric; sample peak is what volumedetect reports.
  const r = spawnSync(FF, ['-v', 'info', '-i', file, '-filter_complex',
    'ebur128=peak=true:framelog=quiet,volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  const o = `${r.stdout || ''}\n${r.stderr || ''}`;
  const I = /I:\s*(-?[\d.]+)\s*LUFS/.exec(o);
  const LRA = /LRA:\s*(-?[\d.]+)\s*LU/.exec(o);
  // anchor on the "True peak:" header so the sample-peak line cannot be mistaken for it
  const tp = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/.exec(o);
  const sp = /Sample peak:\s*\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/.exec(o);
  const mean = /mean_volume:\s*(-?[\d.]+)/.exec(o);
  const max = /max_volume:\s*(-?[\d.]+)/.exec(o);
  const dur = parseFloat(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }));
  return {
    duration: +dur.toFixed(3),
    integratedLufs: I ? +parseFloat(I[1]).toFixed(2) : null,
    lra: LRA ? +parseFloat(LRA[1]).toFixed(2) : null,
    truePeakDb: tp ? +parseFloat(tp[1]).toFixed(2) : null,
    samplePeakDb: sp ? +parseFloat(sp[1]).toFixed(2) : (max ? +parseFloat(max[1]).toFixed(2) : null),
    meanDb: mean ? +parseFloat(mean[1]).toFixed(2) : null,
    maxDb: max ? +parseFloat(max[1]).toFixed(2) : null,
  };
}

if (process.argv.includes('--measure')) {
  console.log(JSON.stringify({ mix: measureOnly(MIX), stem: measureOnly(STEM) }, null, 2));
  process.exit(0);
}

console.log(`mixing ${map.cues.length} cue(s) + BGM (bed ${BGM_DB} dB) ...`);
run(build({ withBgm: true }), MIX);
run(build({ withBgm: false }), STEM);

const mixM = measureOnly(MIX);
const stemM = measureOnly(STEM);
console.log('\nmaster   ', JSON.stringify(mixM));
console.log('sfx stem ', JSON.stringify(stemM));

const report = { generatedBy: 'tools/mix-soundtrack.mjs', bgmGainDb: BGM_DB, masterChain: MASTER, cues: map.cues.length, mix: mixM, sfxStem: stemM };
fs.writeFileSync(cfg.files.mixReport, JSON.stringify(report, null, 2));

// sanity gates.
// Note the shape of these: a measurement that FAILED now fails the gate. The earlier
// version only checked `!== null`, so a broken regex meant the true-peak gate silently
// passed for the whole project — a gate that never gated is worse than no gate.
const problems = [];
if (Math.abs(mixM.duration - TRACK_LEN) > 0.35) problems.push(`mix length ${mixM.duration}s vs track ${TRACK_LEN}s`);
if (mixM.truePeakDb === null) problems.push('true peak could not be measured — the delivery ceiling is unverified (check the ffmpeg build supports ebur128=peak=true)');
else if (mixM.truePeakDb > -1.0) problems.push(`true peak ${mixM.truePeakDb} dBTP is above the -1.0 dBTP delivery ceiling`);
if (mixM.integratedLufs === null) problems.push('integrated loudness could not be measured');
else {
  const tgt = cfg.sound.targetLufs;
  if (Math.abs(mixM.integratedLufs - tgt) > 2.5) problems.push(`integrated loudness ${mixM.integratedLufs} LUFS is more than 2.5 LU from the ${tgt} LUFS target`);
}
if (problems.length) { console.log('\nfindings:'); for (const p of problems) console.log('  - ' + p); process.exitCode = 1; }
else console.log(`\nmix gates pass  (${mixM.integratedLufs} LUFS, true peak ${mixM.truePeakDb} dBTP, sample peak ${mixM.samplePeakDb} dBFS)`);
