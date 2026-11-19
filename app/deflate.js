// Raw deflate (RFC 1951) for the bag's links (docs/studio.md section 6, studio item S8). A studio sprite travels in the
// bag's link as data, and a typical one is 7-10 KB of JSON: over LINK_LIMIT as plain base64, about a third of it
// deflated. Making a link uses the browser's CompressionStream('deflate-raw') where there is one (deflateRawAsync) and
// the small writer below otherwise, or where the caller cannot wait (deflateRaw: one block, fixed codes, a hash chain
// for matches). Reading one always uses the reader below, synchronous and the same in every browser, with a cap on
// what the data may grow into, so a crafted link cannot make the page build gigabytes.
// Pure: no DOM and no Node imports; runs in the browser and in Node.

/** The most bytes inflateRaw makes by default (a link holds at most a few studio sprites of 64 KB each). */
export const MAX_INFLATE = 4 * 1024 * 1024;

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// ---- writing ---------------------------------------------------------------------------------------------------

const reverse = (code, len) => { let r = 0; for (let i = 0; i < len; i++) { r = (r << 1) | (code & 1); code >>= 1; } return r; };
/** The fixed literal/length code of symbol s (RFC 1951 3.2.6), bit-reversed for writing: [bits, length]. */
const FIXED_LIT = Array.from({ length: 288 }, (_, s) => {
  const [code, len] = s < 144 ? [0x30 + s, 8] : s < 256 ? [0x190 + s - 144, 9] : s < 280 ? [s - 256, 7] : [0xc0 + s - 280, 8];
  return [reverse(code, len), len];
});
const lenSym = (n) => { let i = 0; while (i < 28 && LBASE[i + 1] <= n) i++; return i; };
const distSym = (d) => { let i = 0; while (i < 29 && DBASE[i + 1] <= d) i++; return i; };

/** Deflates bytes to raw deflate in one fixed-code block, synchronously (no CompressionStream needed). Arguments: bytes (Uint8Array). */
export function deflateRaw(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const n = src.length;
  let out = new Uint8Array(Math.max(64, n + (n >> 3) + 16)), pos = 0, acc = 0, nbits = 0;
  const put = (value, len) => {
    acc |= value << nbits; nbits += len;
    while (nbits >= 8) {
      if (pos >= out.length) { const grown = new Uint8Array(out.length * 2); grown.set(out); out = grown; }
      out[pos++] = acc & 255; acc >>>= 8; nbits -= 8;
    }
  };
  const lit = (s) => { const [c, l] = FIXED_LIT[s]; put(c, l); };
  put(1, 1); put(1, 2);                              // the last block, fixed codes
  const WINDOW = 32768, HASH = 1 << 15, CHAIN = 64;
  const head = new Int32Array(HASH).fill(-1), prev = new Int32Array(Math.max(1, n));
  const hashAt = (i) => ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & (HASH - 1);
  const insert = (i) => { if (i + 2 < n) { const h = hashAt(i); prev[i] = head[h]; head[h] = i; } };
  let i = 0;
  while (i < n) {
    let best = 0, bestDist = 0;
    if (i + 2 < n) {
      let j = head[hashAt(i)], tries = CHAIN;
      while (j >= 0 && i - j <= WINDOW && tries-- > 0) {
        let l = 0;
        const max = Math.min(258, n - i);
        while (l < max && src[j + l] === src[i + l]) l++;
        if (l > best) { best = l; bestDist = i - j; if (l === max) break; }
        j = prev[j];
      }
    }
    if (best >= 3) {
      const ls = lenSym(best), ds = distSym(bestDist);
      lit(257 + ls); if (LEXT[ls]) put(best - LBASE[ls], LEXT[ls]);
      put(reverse(ds, 5), 5); if (DEXT[ds]) put(bestDist - DBASE[ds], DEXT[ds]);
      for (let k = 0; k < best; k++) insert(i + k);
      i += best;
    } else { lit(src[i]); insert(i); i++; }
  }
  lit(256);
  if (nbits > 0) put(0, 8 - nbits);
  return out.slice(0, pos);
}

/** Deflates bytes to raw deflate with the browser's CompressionStream when it has one, else with deflateRaw. Arguments: bytes (Uint8Array). */
export async function deflateRawAsync(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof CompressionStream === 'function' && typeof Response === 'function' && typeof Blob === 'function') {
    try {
      const stream = new Blob([src]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* a browser without 'deflate-raw': the plain writer below */ }
  }
  return deflateRaw(src);
}

// ---- reading ---------------------------------------------------------------------------------------------------

/** A canonical Huffman table from code lengths: { counts, symbols } as the decoder walks it. */
function table(lengths) {
  const counts = new Uint16Array(16), offs = new Uint16Array(16), symbols = new Uint16Array(lengths.length);
  for (const l of lengths) counts[l]++;
  counts[0] = 0;
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbols[offs[lengths[s]]++] = s;
  return { counts, symbols };
}
let FIXED = null;
const fixedTables = () => (FIXED ??= {
  lit: table(Array.from({ length: 288 }, (_, s) => (s < 144 ? 8 : s < 256 ? 9 : s < 280 ? 7 : 8))),
  dist: table(new Array(30).fill(5)),
});

/**
 * Inflates raw deflate bytes; throws on data that is not deflate or that would grow past maxBytes.
 * Arguments: bytes (Uint8Array), maxBytes (default MAX_INFLATE).
 */
export function inflateRaw(bytes, maxBytes = MAX_INFLATE) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let pos = 0, acc = 0, nbits = 0;
  let out = new Uint8Array(Math.min(maxBytes, Math.max(1024, src.length * 4))), len = 0;
  const bad = (why) => { throw new Error(`not deflate data: ${why}`); };
  const bits = (k) => {
    while (nbits < k) { if (pos >= src.length) bad('it ends too soon'); acc |= src[pos++] << nbits; nbits += 8; }
    const v = acc & ((1 << k) - 1);
    acc >>>= k; nbits -= k;
    return v;
  };
  const room = (k) => {
    if (len + k > maxBytes) throw new Error(`the data grows to more than ${maxBytes} bytes`);
    if (len + k > out.length) { const grown = new Uint8Array(Math.min(maxBytes, Math.max(len + k, out.length * 2))); grown.set(out.subarray(0, len)); out = grown; }
  };
  const decode = (t) => {
    let code = 0, first = 0, index = 0;
    for (let l = 1; l < 16; l++) {
      code |= bits(1);
      const count = t.counts[l];
      if (code - first < count) return t.symbols[index + code - first];
      index += count; first += count; first <<= 1; code <<= 1;
    }
    return bad('a code that is not in its table');
  };
  let last = 0;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      acc = 0; nbits = 0;                              // to the next whole byte
      if (pos + 4 > src.length) bad('it ends too soon');
      const n = src[pos] | (src[pos + 1] << 8), nn = src[pos + 2] | (src[pos + 3] << 8);
      pos += 4;
      if ((n ^ 0xffff) !== nn) bad('a stored block with a broken length');
      if (pos + n > src.length) bad('it ends too soon');
      room(n); out.set(src.subarray(pos, pos + n), len); len += n; pos += n;
      continue;
    }
    let lit, dist;
    if (type === 1) ({ lit, dist } = fixedTables());
    else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
      const clt = table(cl), lengths = [];
      while (lengths.length < hlit + hdist) {
        const s = decode(clt);
        if (s < 16) lengths.push(s);
        else if (s === 16) { if (!lengths.length) bad('a repeat with nothing before it'); const p = lengths[lengths.length - 1]; for (let r = bits(2) + 3; r > 0; r--) lengths.push(p); }
        else for (let r = s === 17 ? bits(3) + 3 : bits(7) + 11; r > 0; r--) lengths.push(0);
      }
      if (lengths.length > hlit + hdist) bad('too many code lengths');
      lit = table(lengths.slice(0, hlit)); dist = table(lengths.slice(hlit));
    } else bad('an unknown block type');
    for (;;) {
      const s = decode(lit);
      if (s < 256) { room(1); out[len++] = s; continue; }
      if (s === 256) break;
      const li = s - 257;
      if (li >= 29) bad('a length code out of range');
      const n = LBASE[li] + bits(LEXT[li]);
      const di = decode(dist);
      if (di >= 30) bad('a distance code out of range');
      const d = DBASE[di] + bits(DEXT[di]);
      if (d > len) bad('a distance back past the start');
      room(n);
      for (let k = 0; k < n; k++) { out[len] = out[len - d]; len++; }
    }
  } while (!last);
  return out.slice(0, len);
}
