// Test helper: reads a PNG written by tools/png.mjs (8-bit RGBA, filter 0, no interlace).
import zlib from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** -> { w, h, rgba: Buffer } ; throws on anything that is not a valid PNG. */
export function readPNG(buf) {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG: bad signature');
  let o = 8, w = 0, h = 0, colourType = -1;
  const idat = [];
  let ended = false;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const body = buf.subarray(o + 8, o + 8 + len);
    const crc = buf.readUInt32BE(o + 8 + len);
    if ((zlib.crc32(buf.subarray(o + 4, o + 8 + len)) >>> 0) !== crc) throw new Error(`bad CRC in ${type}`);
    if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); colourType = body[9]; }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') { ended = true; break; }
    o += 12 + len;
  }
  if (!ended) throw new Error('PNG has no IEND chunk');
  if (colourType !== 6) throw new Error(`expected RGBA (colour type 6), got ${colourType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    if (raw[y * (w * 4 + 1)] !== 0) throw new Error('unexpected PNG filter');
    raw.copy(rgba, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1));
  }
  return { w, h, rgba };
}

export const opaqueCount = ({ rgba }) => { let n = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) n++; return n; };
