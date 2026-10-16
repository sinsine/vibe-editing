// Prepares the sound effects for the mix: trims leading silence, applies short
// edge fades so cues never click, peak-normalises, and converts to 48 kHz stereo
// WAV (what the renderer's mixer wants).
//
// Also measures each result — duration, peak, RMS, spectral centroid, attack time —
// so cues can be placed by physics rather than by title: a "whoosh" is placed so its
// mid-point lands on the cut, an "impact" so its attack lands on the beat.
//
//   node tools/prep-sfx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const FF = process.env.HF_FFMPEG || path.join(process.env.LOCALAPPDATA,
  'Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe');
const FP = FF.replace(/ffmpeg\.exe$/, 'ffprobe.exe');

const SRC = cfg.sfxDir;
const OUT = cfg.preppedDir;
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.mp3')).sort();
if (!files.length) { console.error(`no mp3 in ${SRC}`); process.exit(2); }

function ffprobe(p) {
  const out = execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

// astats reports on STDERR. Reading only stdout (execFileSync's return value) yields
// an empty string, so every peak/RMS/centroid field silently came back null — the
// file still "measured" fine, it just measured nothing. spawnSync, both streams.
function measure(p) {
  const r = spawnSync(FF, ['-v', 'info', '-i', p, '-af', 'astats=metadata=1:reset=0,aspectralstats=measure=centroid', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

const rows = [];
for (const f of files) {
  const inPath = path.join(SRC, f);
  const base = f.replace(/\.mp3$/, '');
  const outPath = path.join(OUT, base + '.wav');

  // trim leading/trailing silence, fade 8 ms at both ends, normalise peak to -3.5 dB
  const af = [
    'silenceremove=start_periods=1:start_duration=0.005:start_threshold=-50dB:detection=peak',
    'areverse',
    'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-50dB:detection=peak',
    'areverse',
    'afade=t=in:st=0:d=0.008',
    'aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000',
    'dynaudnorm=f=200:g=5:p=0.9:m=10',
    'alimiter=limit=0.85',
  ].join(',');

  execFileSync(FF, ['-v', 'error', '-y', '-i', inPath, '-af', af, '-c:a', 'pcm_s16le', outPath], { stdio: 'ignore' });

  const dur = ffprobe(outPath);
  const stats = measure(outPath);
  const peak = /Peak level dB:\s*(-?[\d.]+)/.exec(stats);
  const rms = /RMS level dB:\s*(-?[\d.]+)/.exec(stats);
  const centroid = /Centroid:\s*([\d.]+)/.exec(stats);

  // attack: time from start until the envelope first reaches 90% of peak
  let attack = null;
  try {
    const env = execFileSync(FF, ['-v', 'error', '-i', outPath, '-af', 'astats=metadata=1:reset=0.005,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const vals = [...env.matchAll(/Peak_level=(-?[\d.]+|inf)/g)].map((m) => (m[1] === '-inf' ? -120 : parseFloat(m[1])));
    if (vals.length) {
      const max = Math.max(...vals);
      const idx = vals.findIndex((v) => v >= max - 0.9);
      attack = +(idx * 0.005).toFixed(3);
    }
  } catch { /* attack is a nicety, not a requirement */ }

  rows.push({
    file: path.basename(outPath),
    src: f,
    duration: +dur.toFixed(3),
    peakDb: peak ? +parseFloat(peak[1]).toFixed(2) : null,
    rmsDb: rms ? +parseFloat(rms[1]).toFixed(2) : null,
    centroidHz: centroid ? Math.round(parseFloat(centroid[1])) : null,
    attackSec: attack,
  });
}

rows.sort((a, b) => a.file.localeCompare(b.file));
console.log('prepped SFX (48 kHz stereo WAV, silence-trimmed, peak-normalised)\n');
console.log('  file                                              dur    peak    rms   centroid  attack');
for (const r of rows) {
  console.log(`  ${r.file.padEnd(48)} ${String(r.duration).padStart(6)} ${String(r.peakDb).padStart(6)} ${String(r.rmsDb).padStart(6)} ${String(r.centroidHz).padStart(9)}  ${r.attackSec === null ? '  n/a' : String(r.attackSec).padStart(5)}`);
}
fs.writeFileSync(cfg.files.sfxMeasured, JSON.stringify({ generatedBy: 'tools/prep-sfx.mjs', note: 'place transients by attackSec; centroid separates whoosh (broad) from tick (high) from impact (low)', files: rows }, null, 2));
console.log('\nwrote ' + cfg.files.sfxMeasured + ' (' + rows.length + ' files)');

