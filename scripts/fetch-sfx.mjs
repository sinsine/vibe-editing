// Catalogues free sound effects that are reachable from this network.
//
// Source: mixkit.co (Mixkit Free License — free for commercial use, no attribution
// required). Openverse is unreachable here; freesound's API needs a token. The
// licence for every file actually used is recorded in audio/sfx-licenses.json so the
// delivery can state it honestly rather than calling it CC0.
//
//   node tools/fetch-sfx.mjs catalogue            # scrape categories -> audio/sfx-catalog.json
//   node tools/fetch-sfx.mjs download <id> [id...]  # fetch chosen ids -> assets/sfx/
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig, readJson, ffmpegPaths } from './lib/vibe-config.mjs';
const cfg = loadConfig();

const CATALOG = cfg.files.sfxCatalog;
const PROJ = cfg.proj;
const SFXDIR = cfg.sfxDir;

const CATEGORIES = [
  'whoosh', 'transition', 'impact', 'click', 'notification', 'technology',
  'game', 'win', 'cartoon', 'horror', 'nature', 'foley', 'clock', 'magic',
  'swoosh', 'riser', 'cinematic', 'drums', 'bell', 'coin', 'paper', 'wood',
  'wind', 'ambient', 'ui', 'button', 'error', 'success', 'alarm', 'beep',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function parseItems(html) {
  const out = [];
  // parse per item container so the title/duration that FOLLOW the preview URL
  // are attributed to the right sound
  const chunks = html.split('class="item-grid__item"').slice(1);
  for (const c of chunks) {
    const idm = /active_storage\/sfx\/(\d+)\/\1-preview\.mp3/.exec(c);
    if (!idm) continue;
    const id = idm[1];
    const t = /class="item-grid-card__title">([\s\S]{0,200}?)<\/h2>/.exec(c);
    const d = /data-test-id="duration">\s*([\d:]+)\s*</.exec(c);
    const tags = [...c.matchAll(/class="meta-links__link"[^>]*>([^<]{1,40})<\/a>/g)].map((m) => m[1].trim());
    out.push({
      id,
      title: t ? t[1].replace(/\s+/g, ' ').trim() : null,
      duration: d ? d[1] : null,
      tags,
      preview: `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`,
      wave: `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-waveform.json`,
      page: `https://mixkit.co/free-sound-effects/download/${id}/`,
    });
  }
  return out;
}

async function catalogue() {
  const all = new Map();
  for (const c of CATEGORIES) {
    const url = `https://mixkit.co/free-sound-effects/${c}/`;
    try {
      const html = await get(url);
      const items = parseItems(html);
      for (const it of items) {
        if (!all.has(it.id)) all.set(it.id, { ...it, category: c });
        else if (!all.get(it.id).category) all.get(it.id).category = c;
      }
      console.log(`  ${c.padEnd(14)} ${String(items.length).padStart(3)} item(s)`);
    } catch (e) {
      console.log(`  ${c.padEnd(14)} -- ${e.message}`);
    }
  }
  const list = [...all.values()];
  fs.writeFileSync(CATALOG, JSON.stringify({
    source: 'mixkit.co',
    license: 'Mixkit Free License — free for commercial use, no attribution required',
    licenseUrl: 'https://mixkit.co/license/#sfxFree',
    fetchedNote: 'preview mp3s; the download page serves the same asset',
    count: list.length,
    items: list,
  }, null, 2));
  console.log(`\n${list.length} item(s) -> ${CATALOG}`);
  // a quick title index to pick from
  const byCat = {};
  for (const it of list) (byCat[it.category] ||= []).push(`${it.id}:${it.title || '?'}`);
  for (const [c, v] of Object.entries(byCat)) console.log(`\n[${c}] ${v.slice(0, 18).join(' | ')}`);
}

async function download(ids) {
  fs.mkdirSync(SFXDIR, { recursive: true });
  const cat = fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : { items: [] };
  const byId = new Map(cat.items.map((i) => [i.id, i]));
  const licPath = cfg.files.sfxLicenses;
  const lic = fs.existsSync(licPath) ? JSON.parse(fs.readFileSync(licPath, 'utf8')) : { source: cat.source, license: cat.license, licenseUrl: cat.licenseUrl, files: [] };
  for (const id of ids) {
    const meta = byId.get(id) || { id, title: null, preview: `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3` };
    const r = await fetch(meta.preview, { headers: { 'user-agent': UA } });
    if (!r.ok) { console.log(`  ${id} -- HTTP ${r.status}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const slug = (meta.title || 'sfx').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sfx';
    const name = `${id}-${slug}.mp3`;
    fs.writeFileSync(path.join(SFXDIR, name), buf);
    lic.files = lic.files.filter((f) => f.id !== id).concat([{
      id, file: `assets/sfx/${name}`, title: meta.title, bytes: buf.length,
      source: meta.preview, page: meta.page, license: cat.license, licenseUrl: cat.licenseUrl,
    }]);
    console.log(`  ok ${name}  ${(buf.length / 1024).toFixed(1)} KB  ${meta.title || ''}`);
  }
  fs.writeFileSync(licPath, JSON.stringify(lic, null, 2));
  console.log(`\nlicence ledger -> ${licPath} (${lic.files.length} file(s))`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'catalogue') await catalogue();
else if (cmd === 'download') await download(rest);
else { console.log('usage: node tools/fetch-sfx.mjs catalogue | download <id...>'); process.exit(2); }
