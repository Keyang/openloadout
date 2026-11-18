// The whole music library, every track found in sounds/: no two tracks share a chord order or a tune
// (docs/style-guide.md, section 12). A new track that repeats another fails here at once, whoever wrote it and
// whenever; nothing has to be added to this file for a new track.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOUNDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sounds');
const node = (p, id) => p.nodes.find((n) => n.id === id);
const nums = (s) => { let prev = 0; return String(s).replace(/\|/g, ' ').trim().split(/\s+/).map((x) => (prev = x === '_' ? prev : Number(x))); };
const flat = (s) => String(s).replace(/[|\s]/g, '');
const LOOP = 128;   // 16th notes in the 8-bar loop every track repeats

/** Every music track in sounds/ that says its chords (root and third rows) and its tune (lS and lG rows). */
const tracks = fs.readdirSync(SOUNDS).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(SOUNDS, f), 'utf8')))
  .filter((p) => p.category === 'music' && p.loop);

/** The chord of every bar of the loop, counted from the first bar's root: "0m 0m 8M 10M ..." (root, then minor, major or the third and fifth). */
function chordOrder(p) {
  const root = node(p, 'root'), third = node(p, 'third'), fifth = node(p, 'fifth');
  if (!root || !third) return null;
  const at = (row, step) => { if (!row) return 7; const v = nums(row.steps), every = row.every || 1; return v[Math.floor(step / every) % v.length]; };
  const out = [], home = at(root, 0);
  for (let bar = 0; bar < LOOP / 16; bar++) {
    const s = bar * 16, t = at(third, s), f = at(fifth, s);
    out.push(`${(((at(root, s) - home) % 12) + 12) % 12}${t === 3 && f === 7 ? 'm' : t === 4 && f === 7 ? 'M' : `(${t},${f})`}`);
  }
  return out.join(' ');
}
/** The tune as the steps between its notes, so a copy in another key is still the same tune. */
function moves(p) {
  const s = node(p, 'lS'), g = node(p, 'lG');
  if (!s || !g) return null;
  const notes = nums(s.steps), gate = flat(g.steps), hit = notes.filter((_, i) => gate[i] !== '.');
  return hit.slice(1).map((x, i) => x - hit[i]);
}
/** The rhythm of every bar of the tune that has more than one note (a bar that is one held note belongs to nobody). */
function busyBars(p) {
  const g = flat(node(p, 'lG').steps), out = [];
  for (let i = 0; i < g.length; i += 16) { const bar = g.slice(i, i + 16).replace(/[xo]/g, 'X'); if (bar.replace(/\./g, '').length > 1) out.push(bar); }
  return [...new Set(out)];
}
function longestSharedRun(a, b) {
  let best = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { let k = 0; while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++; if (k > best) best = k; }
  return best;
}
const pairs = [];
for (let a = 0; a < tracks.length; a++) for (let b = a + 1; b < tracks.length; b++) pairs.push([tracks[a], tracks[b]]);

test('the library is found by looking in sounds/, and every track says its chords and its tune', () => {
  assert.ok(tracks.length >= 6, `found ${tracks.map((p) => p.id).join(', ')}`);
  for (const id of ['battle-theme', 'thornwood-overworld', 'hearthvale-village', 'hearthvale-battle', 'derelict-run', 'derelict-boss']) assert.ok(tracks.some((p) => p.id === id), `${id} is in sounds/`);
  for (const p of tracks) {
    assert.ok(chordOrder(p), `${p.id}: no root and third rows (use chords() from the kit), so its chord order cannot be compared`);
    assert.ok(moves(p), `${p.id}: no lS and lG rows (use melody('l', ...) from the kit), so its tune cannot be compared`);
    assert.ok(moves(p).length >= 8, `${p.id}: a tune of ${moves(p).length + 1} notes`);
  }
});

test('no two tracks share a chord order, over the whole loop', () => {
  for (const [a, b] of pairs) {
    assert.notEqual(chordOrder(a), chordOrder(b), `${a.id} and ${b.id} have the same chord order (${chordOrder(a)}, counted from the first bar's root). Give the newer one a chord order of its own`);
  }
});

test('no two tracks share a tune, or a long stretch of one', () => {
  for (const [a, b] of pairs) {
    const ma = moves(a), mb = moves(b);
    assert.notEqual(ma.join(' '), mb.join(' '), `${a.id} and ${b.id} have the same tune`);
    // eight notes in a row that move the same way are a borrowed phrase (a scale run of seven is the most two
    // tracks of the library share today)
    const run = longestSharedRun(ma, mb);
    assert.ok(run < 7, `${a.id} and ${b.id}: ${run + 1} notes in a row move the same way`);
  }
});

test('no two tunes share their rhythms: at most one bar with the same rhythm', () => {
  for (const [a, b] of pairs) {
    const shared = busyBars(a).filter((bar) => busyBars(b).includes(bar));
    assert.ok(shared.length <= 1, `${a.id} and ${b.id}: ${shared.length} bars of the tune have the same rhythm (${shared.join(' ')})`);
  }
});
