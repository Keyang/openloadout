// Reads a stored (uncompressed) .zip such as the ones the site makes. Used by unit and browser tests.
// readZip(bytes: Uint8Array) -> [{ name, size, crc, data }] in the order of the central directory.
export function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip: no end-of-zip record');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out = [], dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), size = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), off = v.getUint32(p + 42, true);
    if (method !== 0) throw new Error('zip entry is compressed; the reader only handles stored entries');
    if (v.getUint32(off, true) !== 0x04034b50) throw new Error('bad local header');
    const start = off + 30 + v.getUint16(off + 26, true);
    out.push({ name: dec.decode(bytes.slice(p + 46, p + 46 + nl)), size, crc, data: bytes.slice(start, start + size) });
    p += 46 + nl + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}
