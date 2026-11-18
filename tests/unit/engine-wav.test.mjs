// WAV writer header, mono and stereo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../../sound/wav.js';

const text = (v, o, n) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)));

test('mono header: RIFF/WAVE, PCM, 1 channel, 16 bit', () => {
  const buf = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 44100);
  const v = new DataView(buf);
  assert.equal(buf.byteLength, 44 + 4 * 2);
  assert.equal(text(v, 0, 4), 'RIFF'); assert.equal(text(v, 8, 4), 'WAVE');
  assert.equal(text(v, 12, 4), 'fmt '); assert.equal(text(v, 36, 4), 'data');
  assert.equal(v.getUint32(4, true), 36 + 8);
  assert.equal(v.getUint16(20, true), 1);          // PCM
  assert.equal(v.getUint16(22, true), 1);          // channels
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(28, true), 44100 * 2);  // byte rate
  assert.equal(v.getUint16(32, true), 2);          // block align
  assert.equal(v.getUint16(34, true), 16);         // bits
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(v.getInt16(44 + 2, true), 16384);
  assert.equal(v.getInt16(44 + 4, true), -16383);
  assert.equal(v.getInt16(44 + 6, true), 32767);
});

test('stereo header and interleaving', () => {
  const buf = encodeWav([new Float32Array([1, 0]), new Float32Array([-1, 0.5])], 22050);
  const v = new DataView(buf);
  assert.equal(buf.byteLength, 44 + 2 * 2 * 2);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 22050);
  assert.equal(v.getUint32(28, true), 22050 * 4);
  assert.equal(v.getUint16(32, true), 4);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getInt16(44, true), 32767);       // left of frame 0
  assert.equal(v.getInt16(46, true), -32767);      // right of frame 0
  assert.equal(v.getInt16(50, true), 16384);       // right of frame 1
});

test('samples beyond +-1 are clipped', () => {
  const v = new DataView(encodeWav(new Float32Array([3, -3]), 8000));
  assert.equal(v.getInt16(44, true), 32767);
  assert.equal(v.getInt16(46, true), -32767);
});
