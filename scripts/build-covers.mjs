// Renders the publishing covers at every requested ratio.
//
// Three decisions worth knowing before you change anything:
//
// 1. Covers are rendered by headless Chrome straight from standalone HTML, NOT through
//    the film project. A cover is a different canvas size; mounting it in index.html
//    would either extend the film's duration or pollute its timeline.
// 2. The film's own subset fonts are base64-inlined and its pictogram builder is inlined
//    from `wheat.js`, so a cover cannot silently fall back to a system font and the
//    artwork is literally the same drawing as the film's.
// 3. The HTML is written to an ASCII temp path first. A project path containing CJK
//    characters inside a file:// URL is a needless source of failure.
//
// Copy comes from `<root>/cover-copy.json`; nothing theme-specific lives in this file.
//
//   node tools/build-covers.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, readJson, findChrome } from './lib/vibe-config.mjs';

const cfg = loadConfig();
const copy = readJson(cfg.files.coverCopy, { required: false });
if (!copy) {
  console.error(`missing ${cfg.files.coverCopy}`);
  console.error('copy templates/cover-copy.json there and fill in the number, title and hook.');
  process.exit(2);
}

const TEMP = path.join(os.tmpdir(), 'vibe-covers');
fs.mkdirSync(TEMP, { recursive: true });
fs.mkdirSync(cfg.coversDir, { recursive: true });
const CHROME = findChrome();

// ---------------------------------------------------------------- inline assets
const faceCss = (cfg.fonts || []).map((f) => {
  if (!f.file || !fs.existsSync(f.file)) return '';
  if (!/\.woff2?$/i.test(f.file)) return '';       // only the generated subsets are inlineable
  const b64 = fs.readFileSync(f.file).toString('base64');
  return `@font-face{font-family:'${f.css}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:400 900;font-style:normal;font-display:block;}`;
}).join('\n');
if (!faceCss) {
  console.error(`no subset fonts found in ${cfg.fontsDir}`);
  console.error('run: node tools/build-fonts.mjs   (the covers inline those woff2 files)');
  process.exit(2);
}
const wheatJsPath = path.join(cfg.libDir, 'wheat.js');
const wheatJs = fs.existsSync(wheatJsPath)
  ? fs.readFileSync(wheatJsPath, 'utf8')
  : 'window.HF={ear:function(){return document.createElement("span")},dust:function(){return document.createElement("div")}};';

const SIZES = copy.sizes || [
  { id: '16x9', w: 1920, h: 1080, note: '16:9' },
  { id: '4x3', w: 1440, h: 1080, note: '4:3' },
  { id: '3x4', w: 1080, h: 1440, note: '3:4' },
];

// Per-ratio geometry. The concept is identical; only the scale and the stack change,
// so a cover never has to be re-designed per platform.
function layoutFor(w, h) {
  const ratio = w / h;
  if (ratio < 1) {
    return { pad: 84, num: 300, pct: 128, title: 96, hook: 44, kicker: 24, gap1: 24, gap2: 36, gap3: 20, earH: 520, earRight: 40, earBottom: -26, vertical: 'top' };
  }
  if (ratio < 1.4) {
    return { pad: 92, num: 240, pct: 106, title: 82, hook: 38, kicker: 22, gap1: 22, gap2: 32, gap3: 18, earH: 620, earRight: -30, earBottom: -30, vertical: 'center' };
  }
  const k = Math.min(w / 1920, h / 1080);
  return {
    pad: Math.round(118 * k), num: Math.round(300 * k), pct: Math.round(132 * k),
    title: Math.round(100 * k), hook: Math.round(44 * k), kicker: Math.round(26 * k),
    gap1: Math.round(26 * k), gap2: Math.round(40 * k), gap3: Math.round(22 * k),
    earH: Math.round(760 * k), earRight: Math.round(96 * k), earBottom: Math.round(-40 * k),
    vertical: 'center',
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function hookHtml(text, emphasis) {
  const t = esc(text);
  if (!emphasis) return t;
  const e = esc(emphasis);
  return t.includes(e) ? t.replace(e, `<em>${e}</em>`) : t;
}

function coverHtml(w, h) {
  const L = layoutFor(w, h);
  const earW = Math.round(L.earH * 0.35);
  const blockW = Math.max(320, w - L.pad * 2 - earW - Math.round(40 * (w / 1920)));
  const blockPos = L.vertical === 'top' ? `top:${L.pad}px` : 'top:50%;transform:translateY(-50%)';
  return `<!doctype html>
<html lang="${esc(cfg.language || 'zh-CN')}"><head><meta charset="UTF-8"><title>cover ${w}x${h}</title>
<style>
${faceCss}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:#07070a}
.stage{position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:'WheatSansRegular',sans-serif}
.pool{position:absolute;left:50%;top:50%;width:${Math.round(w * 0.86)}px;height:${Math.round(h * 0.92)}px;
  transform:translate(-50%,-50%);margin-left:${L.vertical === 'top' ? '8%' : '16%'};margin-top:${L.vertical === 'top' ? '26%' : '-6%'};
  background:radial-gradient(closest-side,rgba(224,180,92,.34) 0%,rgba(176,126,46,.18) 36%,rgba(92,63,19,.08) 64%,rgba(7,7,10,0) 100%);
  filter:blur(2px)}
.rays{position:absolute;inset:0;overflow:hidden}
.ray{position:absolute;top:-30%;width:9%;height:160%;transform-origin:50% 0;
  background:linear-gradient(to bottom,rgba(251,241,210,.10),rgba(224,180,92,.05) 45%,rgba(7,7,10,0));filter:blur(26px)}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse 80% 74% at 46% 46%,rgba(0,0,0,0) 36%,rgba(0,0,0,.74) 100%)}
.grain{position:absolute;inset:0;opacity:.045;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>")}
.dust{position:absolute;inset:0;overflow:hidden}
.dust i{position:absolute;border-radius:50%;background:#f2d992;display:block}
.block{position:absolute;left:${L.pad}px;${blockPos};width:${blockW}px;display:flex;flex-direction:column}
.kicker{font-family:'WheatMonoBold',monospace;font-size:${L.kicker}px;letter-spacing:.18em;color:#b07e2e;text-transform:uppercase}
.num{font-family:'WheatMonoBold',monospace;font-size:${L.num}px;line-height:1;letter-spacing:-.02em;margin-top:${L.gap1}px;
  background:linear-gradient(178deg,#fbf1d2 0%,#e0b45c 44%,#b07e2e 78%,#f2d992 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 26px rgba(224,180,92,.34))}
.num .pct{font-size:${L.pct}px}
.rule{width:${Math.round(w * 0.16)}px;height:2px;margin-top:${L.gap2}px;background:linear-gradient(to right,rgba(242,217,146,.95),rgba(176,126,46,.25))}
.title{font-family:'WheatDisplay',sans-serif;font-size:${L.title}px;line-height:1.16;letter-spacing:.005em;color:#f2ece0;margin-top:${L.gap2}px}
.hook{font-family:'WheatSans',sans-serif;font-size:${L.hook}px;line-height:1.5;letter-spacing:.01em;color:#a79c88;margin-top:${L.gap3}px}
.hook em{font-style:normal;color:#e0b45c}
</style></head>
<body>
<div class="stage">
  <div class="pool"></div>
  <div class="rays"><div class="ray" style="left:26%;transform:rotate(-19deg)"></div><div class="ray" style="left:56%;transform:rotate(-11deg);opacity:.7"></div></div>
  <div id="earhost"></div>
  <div class="dust" id="dust"></div>
  <div class="vig"></div>
  <div class="grain"></div>
  <div class="block">
    ${copy.kicker ? `<div class="kicker">${esc(copy.kicker)}</div>` : ''}
    ${copy.number ? `<div class="num">${esc(copy.number)}${copy.unit ? `<span class="pct">${esc(copy.unit)}</span>` : ''}</div>` : ''}
    <div class="rule"></div>
    ${copy.title ? `<div class="title">${esc(copy.title)}</div>` : ''}
    ${copy.hook ? `<div class="hook">${hookHtml(copy.hook, copy.hookEmphasis)}</div>` : ''}
  </div>
</div>
<script>${wheatJs}</script>
<script>
(function(){
  var host = document.getElementById('earhost');
  var ear = HF.ear({ h: ${L.earH}, state: 'gold', grains: 7, glow: true });
  ear.style.position = 'absolute';
  ear.style.right = '${L.earRight}px';
  ear.style.bottom = '${L.earBottom}px';
  host.appendChild(ear);
  document.getElementById('dust').appendChild(HF.dust({ count: 26, seed: 707, minR: 1, maxR: 4, opacity: .85 }));
})();
</script>
</body></html>`;
}

function pngSize(p) {
  const b = fs.readFileSync(p);
  if (b.slice(1, 4).toString('latin1') !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

console.log(`chrome: ${CHROME}\n`);
const built = [];
for (const s of SIZES) {
  const htmlPath = path.join(TEMP, `cover-${s.id}.html`);
  const pngPath = path.join(TEMP, `cover-${s.id}.png`);
  fs.writeFileSync(htmlPath, coverHtml(s.w, s.h), 'utf8');
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${s.w},${s.h}`, '--virtual-time-budget=4000',
    `--screenshot=${pngPath}`, 'file:///' + htmlPath.replace(/\\/g, '/'),
  ], { stdio: 'ignore', timeout: 120000 });
  if (!fs.existsSync(pngPath)) { console.error(`  x ${s.id}: no screenshot produced`); process.exitCode = 1; continue; }
  const dim = pngSize(pngPath);
  const ok = dim && dim.w === s.w && dim.h === s.h;
  const dest = path.join(cfg.coversDir, `cover-${s.id}.png`);
  fs.copyFileSync(pngPath, dest);
  fs.copyFileSync(htmlPath, path.join(cfg.coversDir, `cover-${s.id}.html`));
  console.log(`  ${ok ? 'ok' : '!!'} cover-${s.id}.png  ${dim ? dim.w + 'x' + dim.h : '?'}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB   ${s.note ?? ''}`);
  if (!ok) process.exitCode = 1;
  built.push({ id: s.id, file: `covers/cover-${s.id}.png`, w: s.w, h: s.h, note: s.note, bytes: fs.statSync(dest).size });
}
fs.writeFileSync(path.join(cfg.coversDir, 'covers.json'), JSON.stringify({ generatedBy: 'tools/build-covers.mjs', chrome: CHROME, covers: built }, null, 2));
console.log(`\n${built.length} cover(s) -> ${cfg.coversDir}\nnext: node tools/audit-covers.mjs`);
