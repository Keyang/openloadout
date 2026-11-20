// The five backgrounds redrawn as data (migration batch M10, M10b) hold to the look of the code sprites they replaced.
// Each layer of each data file is drawn beside the frozen code sprite (tests/fixtures/code-sprites/<id>.js, through
// tests/helpers/library.mjs codeSprite), EVERY FRAME of the layer, at every time of day crossed with: the defaults,
// each slider at both ends, each other choice option, each switch flipped, each colour swatch, every slider at its low
// end and every slider at its high end (docs/data-sprites.md section 7: default, all low, all high and every choice),
// and black, white and three other colours off the swatches on each colour control.
// A pixel is off when any channel differs by more than 30, or one of the two is see-through and the other not (the
// measure of the M10 reviews); the share of pixels that differ AT ALL is held to the same worst ceiling (M10b review,
// issue 4: the dungeon's stone courses had moved in a tone within 30 of the wall, and the starfield's rings and sunlit
// band were a few steps off the code's tones at skies off the swatches; both now drawn as the code drew them).
//
// The colours are named exactly (stand.apart@1 and the other layers colour rules, worked out at every setting; review
// of M10 round 3: bg-forest at Night with a Hills swatch drew its trees sea-green where the code drew them dark navy),
// and the shapes are ported (clouds placed as the code placed them, edge.band@1 and tufts@1), so what is left is a few
// pixels: stars, the forest's bushes, the castle's moon, the field's trees and the torches' flames (under 1% of a layer
// at every setting). CEILINGS are what each layer measured when M10b was built, a little over: a redraw that gets
// closer lowers its ceiling, one that drifts further fails here. DRIFT=1 prints each layer's worst settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { librarySprite, codeSprite, librarySpriteFile } from '../helpers/library.mjs';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';

// [mean share off over the settings and frames, worst one's share off], in % of the layer's pixels
const CEILINGS = {
  'bg-forest': { far: [0.25, 0.7], mid: [0.05, 0.05], near: [0.45, 0.6] },
  'bg-starfield': { far: [0.05, 0.05], mid: [0.1, 0.15], near: [0.45, 0.65] },
  'bg-castle': { far: [0.25, 0.65], mid: [0.05, 0.05], near: [0.05, 0.05] },
  'bg-battle-field': { far: [0.25, 0.8], mid: [0.3, 0.3], near: [0.05, 0.05] },
  'bg-battle-dungeon': { far: [0.05, 0.05], mid: [0.25, 0.6], near: [0.05, 0.05] },
};

/** Colours tried on every colour control besides its swatches: black, white and three a person might pick. */
const OFF_SWATCH = ['#000000', '#ffffff', '#f0f0f0', '#f3842c', '#3a7bd5'];

/** The settings to compare at: [name, overrides], every time of day crossed with every one-move setting and all low and all high. */
function settings(sprite) {
  const P = Object.entries(sprite.params);
  const time = P.find(([k, d]) => k === 'time' && d.kind === 'choice');
  const times = time ? time[1].options.map((x) => (typeof x === 'object' ? x.value : x)) : [null];
  const moves = [['default', {}]];
  const lo = {}, hi = {};
  for (const [k, d] of P) {
    if (k === 'time' || k === 'speed') continue;
    if (d.kind === 'range') { moves.push([`${k}=${d.min}`, { [k]: d.min }], [`${k}=${d.max}`, { [k]: d.max }]); lo[k] = d.min; hi[k] = d.max; }
    if (d.kind === 'choice') for (const x of d.options) { const v = typeof x === 'object' ? x.value : x; if (v !== d.def) moves.push([`${k}=${v}`, { [k]: v }]); }
    if (d.kind === 'toggle') moves.push([`${k}=${!d.def}`, { [k]: !d.def }]);
    // every swatch, and colours off the swatches: black, white and three others (review of M10b, issue 4: at the swatches
    // the dungeon's stone courses were a tone too close to the wall for the measure to see that they had moved)
    if (d.kind === 'color') for (const sw of [...(d.swatches ?? []), ...OFF_SWATCH]) if (sw !== d.def) moves.push([`${k}=${sw}`, { [k]: sw }]);
  }
  if (Object.keys(lo).length) moves.push(['all low', lo], ['all high', hi]);
  return times.flatMap((t) => moves.map(([name, q]) => (t === null ? [name, q] : [`${t} ${name}`, { ...q, time: t }])));
}

/** The share (%) of pixels off between two RGBA byte arrays; with `exact`, of pixels that differ at all. */
function offShare(a, b, exact = false) {
  const tol = exact ? 0 : 30;
  let off = 0;
  for (let i = 0; i < a.length; i += 4) {
    if ((a[i + 3] > 0) !== (b[i + 3] > 0)) { off++; continue; }
    if (a[i + 3] === 0) continue;
    if (Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol) off++;
  }
  return (100 * off) / (a.length / 4);
}

/**
 * The colours one drawing has that the other has not: every colour covering at least `least` (%) of either layer must be
 * within 30 in each channel of a colour the other draws (on at least a twentieth of a percent). Shapes that differ move
 * pixels between colours both draw; a tone worked out wrong (the forest's trees sea-green where the code drew them dark
 * navy) is a colour the code never draws. Returns ['code #rrggbb (share %)' | 'data #rrggbb (share %)', ...].
 */
function colourFaults(a, b, least = 0.5) {
  const count = (x) => { const m = new Map(); for (let i = 0; i < x.length; i += 4) if (x[i + 3]) { const c = (x[i] << 16) | (x[i + 1] << 8) | x[i + 2]; m.set(c, (m.get(c) ?? 0) + 1); } return m; };
  const A = count(a), B = count(b), n = a.length / 4;
  const near = (c, d) => [16, 8, 0].every((sh) => Math.abs(((c >> sh) & 255) - ((d >> sh) & 255)) <= 30);
  const out = [];
  for (const [mine, theirs, who] of [[A, B, 'code'], [B, A, 'data']]) {
    const there = [...theirs].filter(([, k]) => (100 * k) / n >= 0.05).map(([c]) => c);
    for (const [c, k] of mine) if ((100 * k) / n >= least && !there.some((d) => near(c, d))) out.push(`${who} #${c.toString(16).padStart(6, '0')} (${((100 * k) / n).toFixed(1)}%)`);
  }
  return out;
}

/** One layer, data beside code, at every setting and frame: rows [name, share off, colour faults (colours covering `least` % or more)]. */
function layerRows(code, data, clip, sets, least = 0.5) {
  const frames = code.clips[clip]?.frames ?? 1;
  assert.equal(data.clips[clip]?.frames ?? 1, frames, `${clip}: the same number of frames`);
  const rows = [];
  for (const [name, q] of sets) {
    const pc = cleanParams(code, { ...defaultParams(code), ...q }), pd = cleanParams(data, { ...defaultParams(data), ...q });
    for (let f = 0; f < frames; f++) {
      const a = renderFrame(code, clip, f, pc).bytes(), b = renderFrame(data, clip, f, pd).bytes();
      rows.push([frames > 1 ? `${name} #${f}` : name, offShare(a, b), colourFaults(a, b, least), offShare(a, b, true)]);
    }
  }
  return rows;
}

for (const [id, layers] of Object.entries(CEILINGS)) {
  test(`${id}: every layer and frame, at every time of day crossed with every setting one move away, all low and all high, stays within its drift from the code sprite`, async () => {
    assert.equal(librarySpriteFile(id), `sprites/${id}.json`, `${id} is a data file`);
    const code = await codeSprite(id), data = await librarySprite(id);
    assert.deepEqual(Object.keys(data.clips), Object.keys(code.clips), 'the same layers');
    const sets = settings(code);
    assert.ok(sets.length >= 15, `${sets.length} settings`);
    for (const [clip, [meanCap, worstCap]] of Object.entries(layers)) {
      const rows = layerRows(code, data, clip, sets);
      const mean = rows.reduce((s, r) => s + r[1], 0) / rows.length, worst = rows.reduce((m, r) => (r[1] > m[1] ? r : m));
      const exact = rows.reduce((m, r) => (r[3] > m[3] ? r : m));
      if (process.env.DRIFT) console.log(`${id} ${clip}: ${rows.length} renders, mean ${mean.toFixed(2)}%, worst ${worst[0]} ${worst[1].toFixed(2)}%, differing at all at most ${exact[3].toFixed(2)}% (${exact[0]}) | ${rows.filter((r) => r[1] > meanCap + 0.5).slice(0, 12).map((r) => `${r[0]} ${r[1].toFixed(1)}`).join(', ')}`);
      const wrong = rows.filter((r) => r[2].length);
      if (process.env.DRIFT && wrong.length) console.log(`${id} ${clip}: colour faults ${wrong.slice(0, 8).map((r) => `${r[0]}: ${r[2].join(', ')}`).join(' | ')}`);
      assert.deepEqual(wrong.map((r) => `${r[0]}: ${r[2].join(', ')}`), [], `${id} ${clip}: every colour the code draws is drawn in that colour`);
      assert.ok(mean <= meanCap, `${id} ${clip}: ${mean.toFixed(2)}% of pixels off on average (ceiling ${meanCap}%)`);
      assert.ok(worst[1] <= worstCap, `${id} ${clip}: ${worst[1].toFixed(2)}% off at ${worst[0]} (ceiling ${worstCap}%)`);
      // and pixels that differ at all, by any amount, are held to the same ceiling: a shape moved in a tone near its
      // neighbour's, or a tone a few steps off, is not hidden by the 30 of the measure (review of M10b, issue 4)
      assert.ok(exact[3] <= worstCap, `${id} ${clip}: ${exact[3].toFixed(2)}% of pixels differ at all at ${exact[0]} (ceiling ${worstCap}%)`);
    }
  });
}

test('bg-forest at night with each Hills swatch draws the trees, bushes and hills in the code\'s colours (review of M10, round 3)', async () => {
  const code = await codeSprite('bg-forest'), data = await librarySprite('bg-forest');
  const sets = code.params.land.swatches.map((sw) => [`night land=${sw}`, { time: 'night', land: sw }]);
  for (const clip of ['mid', 'near']) {
    // every colour that covers a tenth of a percent of the layer, not only the big ones
    for (const [name, share, faults] of layerRows(code, data, clip, sets, 0.1)) {
      assert.ok(share <= 0.6, `${clip} ${name}: ${share.toFixed(2)}% off`);
      assert.deepEqual(faults, [], `${clip} ${name}: colours drawn wrong`);
    }
  }
});
