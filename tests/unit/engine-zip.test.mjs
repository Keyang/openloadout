// The zip writer (app/zip.js): read the listing back out of the bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zip } from '../../app/zip.js';
import { readZip } from '../helpers/zip-read.mjs';

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

test('zip lists the right names and sizes and keeps the data', async () => {
  const files = [
    { name: 'a.txt', data: new TextEncoder().encode('hello') },
    { name: 'sounds/b.wav', data: new Uint8Array([1, 2, 3, 4, 5, 6, 7]) },
    { name: 'empty.bin', data: new Uint8Array(0) },
  ];
  const blob = zip(files);
  assert.equal(blob.type, 'application/zip');
  const got = readZip(await bytesOf(blob));
  assert.deepEqual(got.map((f) => [f.name, f.size]), [['a.txt', 5], ['sounds/b.wav', 7], ['empty.bin', 0]]);
  assert.equal(new TextDecoder().decode(got[0].data), 'hello');
  assert.deepEqual([...got[1].data], [1, 2, 3, 4, 5, 6, 7]);
});

test('zip stores the standard CRC-32 (check value of "123456789")', async () => {
  const got = readZip(await bytesOf(zip([{ name: 'x', data: new TextEncoder().encode('123456789') }])));
  assert.equal(got[0].crc, 0xcbf43926);
});

test('zip handles non-ASCII names', async () => {
  const got = readZip(await bytesOf(zip([{ name: 'sounds/clic (pâle).wav', data: new Uint8Array(2) }])));
  assert.equal(got[0].name, 'sounds/clic (pâle).wav');
});
