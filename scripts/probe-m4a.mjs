// Minimal MP4/M4A container probe: duration, timescale, track layout.
// Used before FFmpeg is available so we can already plan the timeline.
import fs from 'node:fs';

const file = process.argv[2];
const buf = fs.readFileSync(file);

function walk(start, end, depth, path) {
  let off = start;
  const out = [];
  while (off + 8 <= end) {
    const size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    let header = 8;
    let realSize = size;
    if (size === 1) {
      realSize = Number(buf.readBigUInt64BE(off + 8));
      header = 16;
    } else if (size === 0) {
      realSize = end - off;
    }
    if (realSize < header || off + realSize > end) break;
    const node = { type, start: off, size: realSize, depth, path: path + '/' + type };
    out.push(node);
    const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts', 'mvex']);
    if (containers.has(type) && depth < 8) {
      out.push(...walk(off + header, off + realSize, depth + 1, node.path));
    }
    off += realSize;
  }
  return out;
}

const nodes = walk(0, buf.length, 0, '');
const byType = (t) => nodes.filter((n) => n.type === t);

const mvhd = byType('mvhd')[0];
let info = { file, bytes: buf.length };
if (mvhd) {
  const v = buf.readUInt8(mvhd.start + 8);
  const ts = v === 1 ? buf.readUInt32BE(mvhd.start + 28) : buf.readUInt32BE(mvhd.start + 20);
  const dur = v === 1 ? Number(buf.readBigUInt64BE(mvhd.start + 32)) : buf.readUInt32BE(mvhd.start + 24);
  info.timescale = ts;
  info.durationSec = dur / ts;
  info.durationRaw = dur;
}

info.tracks = byType('trak').map((t) => {
  const tkhd = nodes.find((n) => n.type === 'tkhd' && n.path.startsWith(t.path));
  const mdhd = nodes.find((n) => n.type === 'mdhd' && n.path.startsWith(t.path));
  const hdlr = nodes.find((n) => n.type === 'hdlr' && n.path.startsWith(t.path));
  const stsd = nodes.find((n) => n.type === 'stsd' && n.path.startsWith(t.path));
  const out = {};
  if (tkhd) {
    const v = buf.readUInt8(tkhd.start + 8);
    out.trackId = v === 1 ? buf.readUInt32BE(tkhd.start + 28) : buf.readUInt32BE(tkhd.start + 20);
  }
  if (mdhd) {
    const v = buf.readUInt8(mdhd.start + 8);
    const ts = v === 1 ? buf.readUInt32BE(mdhd.start + 28) : buf.readUInt32BE(mdhd.start + 20);
    const dur = v === 1 ? Number(buf.readBigUInt64BE(mdhd.start + 32)) : buf.readUInt32BE(mdhd.start + 24);
    out.mediaTimescale = ts;
    out.mediaDurationSec = dur / ts;
  }
  if (hdlr) out.handler = buf.toString('latin1', hdlr.start + 16, hdlr.start + 20);
  if (stsd) out.codec = buf.toString('latin1', stsd.start + 20, stsd.start + 24);
  return out;
});

const stts = nodes.filter((n) => n.type === 'stts');
if (stts.length) {
  const s = stts[0];
  const count = buf.readUInt32BE(s.start + 12);
  const samples = count ? buf.readUInt32BE(s.start + 16) : 0;
  info.sttsEntries = count;
  info.sttsFirstSampleCount = samples;
}

console.log(JSON.stringify(info, null, 2));
