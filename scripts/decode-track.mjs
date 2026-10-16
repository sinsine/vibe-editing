// Step 1 of the pipeline: turn the delivered music file into something measurable.
//
// Two outputs, deliberately separate:
//   audio/track-info.json   the container facts (duration, codec, channels) — read by
//                           build-index.mjs to size the timeline and by the mix
//   audio/bgm-mono.wav      22.05 kHz mono PCM — what the analysis scripts actually read
//
// The decode is a downmix on purpose: pulse detection does not benefit from stereo or
// from 44.1 kHz, and mono halves the work in every later step.
//
//   node tools/decode-track.mjs [path-to-track]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, ffmpegPaths } from './lib/vibe-config.mjs';

const cfg = loadConfig();
const { ff, fp } = ffmpegPaths(cfg);

const track = process.argv[2] ? path.resolve(process.argv[2]) : cfg.trackPath;
if (!track || !fs.existsSync(track)) {
  console.error(`no track. Pass a path, or set "track" in ${cfg.configPath}\n  looked for: ${track}`);
  process.exit(2);
}
fs.mkdirSync(cfg.audioDir, { recursive: true });

const wav = path.join(cfg.audioDir, 'bgm-mono.wav');

console.log(`track: ${track}`);
const probe = execFileSync(fp, [
  '-v', 'error',
  '-show_entries', 'format=duration,size,bit_rate:format_tags=title,artist,album',
  '-show_entries', 'stream=index,codec_name,codec_type,sample_rate,channels,bit_rate',
  '-of', 'json', track,
], { encoding: 'utf8' });
const info = JSON.parse(probe);
const audio = (info.streams || []).find((s) => s.codec_type === 'audio');
if (!audio) { console.error('no audio stream in that file'); process.exit(2); }

const duration = parseFloat(info.format?.duration || '0');
const tags = info.format?.tags || {};

// Analysis decode. -vn drops any cover art; the format is what hit-map.mjs parses.
execFileSync(ff, ['-v', 'error', '-y', '-i', track, '-vn', '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', wav], { stdio: 'inherit' });

const report = {
  generatedBy: 'tools/decode-track.mjs',
  source: path.basename(track),
  sourcePath: track,
  duration: +duration.toFixed(3),
  codec: audio.codec_name,
  sampleRate: +audio.sample_rate,
  channels: audio.channels,
  bitrate: info.format?.bit_rate ? +info.format.bit_rate : (audio.bit_rate ? +audio.bit_rate : null),
  tags: Object.keys(tags).length ? tags : undefined,
  analysisWav: path.relative(cfg.root, wav).replace(/\\/g, '/'),
  analysisFormat: { sampleRate: 22050, channels: 1, codec: 'pcm_s16le' },
};
fs.writeFileSync(path.join(cfg.audioDir, 'track-info.json'), JSON.stringify(report, null, 2));

console.log(`
  duration   ${report.duration} s
  codec      ${report.codec} ${report.sampleRate} Hz ${report.channels}ch${report.bitrate ? ' @ ' + Math.round(report.bitrate / 1000) + ' kb/s' : ''}${tags.title ? `\n  title      ${tags.title}${tags.artist ? ' — ' + tags.artist : ''}` : ''}
  analysis   ${report.analysisWav}

next:  node tools/hit-map.mjs      # onsets + inter-onset-interval histogram
       node tools/timing-map.mjs    # fit the beat/bar grid and read the structure
`);
