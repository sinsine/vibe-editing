// Shared configuration for every script in this skill.
//
// The scripts were originally written for one film, with paths baked in. This module
// is the single place that makes them portable: every script asks for paths here
// instead of hard-coding them, and the only thing that varies per project is
// `<root>/vibe.config.json`.
//
// Layout this module assumes (created by scripts/init-project.mjs):
//
//   <root>/
//     vibe.config.json          <- the only project-specific file the tooling reads
//     <track>.m4a               <- the music, as delivered by the user
//     audio/                    <- analysis output, sfx, mix
//     data/                     <- computed datasets the film is allowed to print
//     sfx-design.mjs            <- the sound design (content, written per project)
//     cover-copy.json           <- the cover's text (content, written per project)
//     tools/                    <- these scripts
//     videos/<slug>/            <- the HyperFrames project
//
// Reading config never throws on a missing optional key: defaults are supplied so a
// half-filled config still runs, and `loadConfig` reports which files are absent
// rather than failing deep inside a later step.
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_NAME = 'vibe.config.json';

/** Remove a leading UTF-8 BOM (U+FEFF) — Windows tooling writes them routinely. */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const DEFAULTS = {
  fps: 30,
  width: 1920,
  height: 1080,
  language: 'zh-CN',
  platforms: ['bilibili', 'douyin'],
  // the reserved vertical bands, in canvas pixels. These are the film's layout law:
  // see references/03-design-system.md. Override only if you change the canvas.
  bands: {
    chrome: [60, 120],
    display: [140, 842],
    gap: [842, 872],
    subtitle: [872, 1024],
  },
  // cue legality gates, used by sync-storyboard-timings.mjs
  cue: { maxCharsPerSecond: 6.5, minSeconds: 1.2, minGapSeconds: 0.08 },
  // timing verification tolerance, used by verify-timing.mjs
  timing: { toleranceMs: 15, acousticToleranceMs: { hit: 25, whoosh: 80, riser: 80 } },
  // sound defaults, used by mix-soundtrack.mjs
  sound: { bgmGainDb: -4, sfxTrimDb: 3.5, targetLufs: -14 },
};

/** Walk up from `start` until a directory containing vibe.config.json is found. */
export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, CONFIG_NAME))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function deepMerge(base, over) {
  if (over === undefined || over === null) return base;
  if (Array.isArray(over)) return over;
  if (typeof over !== 'object') return over;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in out && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])
      ? deepMerge(out[k], v)
      : v;
  }
  return out;
}

/**
 * Load the project config and resolve every path to absolute form.
 * Throws only when no config can be found at all — that is a real setup error.
 */
export function loadConfig(start = process.cwd()) {
  const root = findRoot(start);
  if (!root) {
    throw new Error(
      `no ${CONFIG_NAME} found in ${path.resolve(start)} or any parent directory.\n` +
      `Run: node tools/init-project.mjs --dir <workdir> --slug <project-slug> --track <music-file>`
    );
  }
  // Strip a UTF-8 BOM before parsing. PowerShell's `Set-Content -Encoding utf8` and
  // several Windows editors write one, and JSON.parse rejects a leading U+FEFF with a
  // syntax error that points at the first character — which reads as "my JSON is
  // broken" rather than "my file has a BOM".
  const raw = JSON.parse(stripBom(fs.readFileSync(path.join(root, CONFIG_NAME), 'utf8')));
  const cfg = deepMerge(DEFAULTS, raw);

  if (!cfg.slug) throw new Error(`${CONFIG_NAME} is missing "slug" (the HyperFrames project folder name)`);

  cfg.root = root;
  cfg.configPath = path.join(root, CONFIG_NAME);
  cfg.proj = path.join(root, 'videos', cfg.slug);
  cfg.toolsDir = path.join(root, 'tools');
  cfg.audioDir = path.join(root, 'audio');
  cfg.dataDir = path.join(root, 'data');
  cfg.framesDir = path.join(cfg.proj, 'compositions', 'frames');
  cfg.libDir = path.join(cfg.proj, 'compositions', 'lib');
  cfg.hfDir = path.join(cfg.proj, '.hyperframes');
  cfg.fontsDir = path.join(cfg.proj, 'assets', 'fonts');
  cfg.sfxDir = path.join(cfg.proj, 'assets', 'sfx');
  cfg.preppedDir = path.join(cfg.sfxDir, 'prepped');
  cfg.audioAssetsDir = path.join(cfg.proj, 'assets', 'audio');
  cfg.coversDir = path.join(cfg.proj, 'covers');
  cfg.rendersDir = path.join(cfg.proj, 'renders');
  cfg.trackPath = cfg.track ? path.resolve(root, cfg.track) : null;

  // frequently-read analysis files
  cfg.files = {
    hitMap: path.join(cfg.audioDir, 'hit-map.json'),
    timingMap: path.join(cfg.audioDir, 'timing-map.json'),
    cueMap: path.join(cfg.audioDir, 'cue-map.json'),
    sfxMap: path.join(cfg.audioDir, 'sfx-map.json'),
    sfxCatalog: path.join(cfg.audioDir, 'sfx-catalog.json'),
    sfxLicenses: path.join(cfg.audioDir, 'sfx-licenses.json'),
    sfxMeasured: path.join(cfg.audioDir, 'sfx-measured.json'),
    mixReport: path.join(cfg.audioDir, 'mix-report.json'),
    timingVerification: path.join(cfg.audioDir, 'timing-verification.json'),
    storyboard: path.join(cfg.proj, 'STORYBOARD.md'),
    brief: path.join(cfg.proj, 'BRIEF.md'),
    frameSpec: path.join(cfg.proj, 'frame.md'),
    index: path.join(cfg.proj, 'index.html'),
    sfxDesign: path.join(root, 'sfx-design.mjs'),
    coverCopy: path.join(root, 'cover-copy.json'),
    mix: path.join(cfg.audioAssetsDir, 'mix.wav'),
    sfxStem: path.join(cfg.audioAssetsDir, 'sfx-stem.wav'),
  };

  return cfg;
}

/** Read a JSON file, or return null with a printed note instead of throwing. */
export function readJson(p, { required = true } = {}) {
  if (!fs.existsSync(p)) {
    if (required) throw new Error(`missing ${p} — run the earlier pipeline stage that produces it`);
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** The ffmpeg/ffprobe pair. PATH first, then the winget install location. */
export function ffmpegPaths(cfg = null) {
  const explicit = process.env.HF_FFMPEG;
  const candidates = [];
  if (explicit) candidates.push(explicit);
  // winget's Gyan.FFmpeg build, by far the most common Windows install
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const pkg = path.join(local, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(pkg)) {
      for (const d of fs.readdirSync(pkg)) {
        if (!/ffmpeg/i.test(d)) continue;
        const inner = path.join(pkg, d);
        for (const sub of fs.readdirSync(inner)) {
          const bin = path.join(inner, sub, 'bin', 'ffmpeg.exe');
          if (fs.existsSync(bin)) candidates.push(bin);
        }
      }
    }
  }
  candidates.push('ffmpeg');           // last resort: rely on PATH
  const ff = candidates.find((c) => c === 'ffmpeg' || fs.existsSync(c));
  if (!ff) throw new Error('ffmpeg not found. Install it (winget install --id Gyan.FFmpeg -e) or set HF_FFMPEG');
  return { ff, fp: ff === 'ffmpeg' ? 'ffprobe' : ff.replace(/ffmpeg\.exe$/i, 'ffprobe.exe') };
}

/** The headless Chrome the HyperFrames renderer already downloaded. */
export function findChrome() {
  if (process.env.HF_CHROME) return process.env.HF_CHROME;
  const base = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'hyperframes', 'chrome');
  if (!fs.existsSync(base)) throw new Error(`no headless Chrome cache at ${base} — run the HyperFrames CLI once`);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { const r = walk(p); if (r) return r; }
      else if (/chrome-headless-shell(\.exe)?$/i.test(e.name)) return p;
    }
    return null;
  };
  const p = walk(base);
  if (!p) throw new Error(`no chrome-headless-shell under ${base}`);
  return p;
}

/** Print a one-line header so every script's output is attributable. */
export function banner(script, cfg) {
  console.log(`[${script}] project=${cfg.slug} root=${cfg.root}`);
}
