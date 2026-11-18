// wav.js — 16-bit PCM WAV encoder. Takes one Float32Array (mono) or an array
// of channels ([left, right]). Returns an ArrayBuffer.
export function encodeWav(input, sampleRate) {
  const chans = Array.isArray(input) ? input : [input], C = chans.length, frames = chans[0].length;
  const n = frames * C, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, C, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2 * C, true);
  v.setUint16(32, 2 * C, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < C; c++) {
    const x = chans[c][i], s = x < -1 ? -1 : x > 1 ? 1 : x;
    v.setInt16(44 + (i * C + c) * 2, Math.round(s * 32767), true);
  }
  return buf;
}
