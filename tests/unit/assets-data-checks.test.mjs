// The quality bar's data checks (docs/data-sprites.md section 5, 'Quality bar ... new data checks (unused control,
// stamp out of frame, slot never painted, cost)'; build item B9, review round 2, issue 4). quality/data-checks.js
// dataChecks(sprite) looks at the draw lists a version 2 data sprite paints (engine/data-sprite.js dataFrameList) over
// its clips and frames, at the defaults, with each control moved, and with the controls together: every combination
// of the choices, toggles and sliders (each slider at its default, its ends and the turning points of its maps) when
// they fit, else every combination of the choices and toggles and then pairs with the sliders (at most MAX_LISTS lists
// in all), and quality/sprite.js checkSprite runs it on every sprite (review round 3, issue 4), so the build,
// check.mjs, the quality cache and loadout.check all get it. What each check covers, and who else covers part of it:
//   unused control      the validator refuses a control nothing names (catalog/sprite-schema.js); checkSprite errors on
//                       a control that changes no pixel ("never changes the picture"). Both proved here on a data sprite.
//   stamp out of frame  a stamp drawn wholly outside the frame (nothing of it shows): an error here. A stamp partly out
//                       is already checkSprite's "touches the frame edge".
//   slot never painted  the validator refuses a slot nothing names; here, a slot nothing drawn paints at any tested
//                       setting, by name or through a derived slot, a colour rule or a piece (named only under a `when`
//                       that never holds, or by a generator that draws nothing): an error when the search was complete,
//                       a warning when it was not.
//   cost                the most work any frame asks of the renderer (engine/draw-list.js listCost) against the frame's
//                       budget (workBudget), as metrics; a warning above half the budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import { dataChecks, MAX_LISTS } from '../../quality/data-checks.js';
import { runQuality } from '../../tools/lib/quality-run.mjs';
import fs from 'node:fs';
import { dataProject, coinDef, badgeDef, tuftDef } from '../helpers/data-sprites.mjs';

const make = (d) => { const r = makeDataSprite(d, { strict: true }); assert.ok(r.ok, r.errors.join('; ')); return r.sprite; };
const coinWith = (f) => { const d = coinDef(); f(d); return d; };
const STAMP = (at) => ({ kind: 'stamp', at, rows: ['aa', 'aa'], key: { a: 'gold' } });

test('the fixtures pass: no errors, no warnings, the cost measured', () => {
  for (const d of [coinDef(), badgeDef()]) {
    const r = dataChecks(make(d));
    assert.deepEqual(r.errors, [], d.id);
    assert.deepEqual(r.warnings, [], d.id);
    assert.ok(r.metrics.dataWork > 0 && r.metrics.dataWork < 0.5, `${d.id}: ${r.metrics.dataWork}`);
    assert.ok(r.metrics.dataPrimitives > 0);
    assert.ok(r.metrics.dataLists >= (d.id === 'coin' ? 8 * 4 : 2), `${d.id}: ${r.metrics.dataLists} lists`);
  }
});

test('stamp out of frame: a stamp wholly outside the frame is an error naming where', () => {
  const r = dataChecks(make(coinWith((d) => d.body.pictures.draw.splice(1, 0, STAMP([40, 40])))));
  assert.equal(r.errors.length, 1, r.errors.join('\n'));
  assert.match(r.errors[0], /stamp.*wholly outside the 32x32 frame/);
  assert.match(r.errors[0], /40,40\.\.42,42/);
  assert.match(r.errors[0], /idle frame 0/);
  // checkSprite runs the data checks too (review round 3, issue 4): its pixel checks alone could not see it, nothing of it is painted
  const viaBar = checkSprite(make(coinWith((d) => d.body.pictures.draw.splice(1, 0, STAMP([40, 40]))))).errors;
  assert.equal(viaBar.filter((e) => /wholly outside/.test(e)).length, 1, viaBar.join('\n'));
});

test('stamp out of frame: only at some settings is still an error, naming the setting', () => {
  const r = dataChecks(make(coinWith((d) => d.body.pictures.draw.splice(1, 0, { ...STAMP([-9, 4]), when: { sparkle: [false] } }))));
  assert.equal(r.errors.length, 1, r.errors.join('\n'));
  assert.match(r.errors[0], /sparkle: false/);
});

test('slot never painted: a slot named only by a generator that draws nothing is an error', () => {
  // pickup.burst at amount 0 has not started: it names the slot (so the validator takes it) and paints nothing
  const d = coinWith((x) => {
    x.palette.push({ id: 'rim', label: 'Rim', default: '#884422', material: 'metal' });
    x.body.pictures.draw.splice(1, 0, { gen: 'pickup.burst', v: 1, on: 'coin', at: [0, 0], amount: 0, paint: 'rim', bright: 'rim', core: 'rim' });
  });
  const r = dataChecks(make(d));
  assert.equal(r.errors.length, 1, r.errors.join('\n'));
  assert.match(r.errors[0], /slot "rim" is never painted/);
});

test('slot never painted: a slot painted only when two toggles are both on is not flagged (every toggle on is tried)', () => {
  const d = coinWith((x) => {
    x.controls.splice(2, 0, { key: 'rimmed', kind: 'toggle', label: 'Rim', default: false });
    x.palette.push({ id: 'rim', label: 'Rim', default: '#884422', material: 'metal' });
    x.body.pictures.draw.splice(1, 0, { kind: 'ellipse', on: 'coin', at: [0, 0], r: [2, 2], paint: 'rim', when: { sparkle: [true], rimmed: [true] } });
  });
  const r = dataChecks(make(d));
  assert.deepEqual(r.errors, []);
});

test('unused control: the validator refuses one nothing names; checkSprite errors on one that changes nothing', () => {
  const named = makeDataSprite(coinWith((d) => d.controls.push({ key: 'unused', kind: 'range', label: 'Unused', lo: 'A', hi: 'B', default: 0.5 })), { strict: true });
  assert.equal(named.ok, false);
  assert.match(named.errors.join(' '), /Control "unused": nothing uses it/);
  const dead = make(coinWith((d) => {
    d.controls.push({ key: 'dull', kind: 'range', label: 'Dull', lo: 'A', hi: 'B', default: 0.5 });
    d.body.pictures.draw[0].r = [{ from: 'dull', map: [[0, 7], [1, 7]] }, { from: 'size', map: [[0, 5], [1, 9]] }];
  }));
  assert.ok(checkSprite(dead).errors.some((e) => /dull/i.test(e) && /does nothing|never changes the picture/.test(e)), checkSprite(dead).errors.join('\n'));
});

test('cost: above half the frame\'s work budget is a warning with the share', () => {
  const heavy = coinWith((d) => {
    d.size = [64, 64]; d.pivot = [32, 62];
    d.body.pictures.nodes[0].at = [32, 31];
    for (let i = 0; i < 60; i++) d.body.pictures.draw.splice(1, 0, { kind: 'ellipse', on: 'coin', at: [0, 0], r: [30, 30], paint: 'gold', shade: 1, light: 1, glow: true });
  });
  const made = makeDataSprite(heavy, { strict: true });
  if (!made.ok) { assert.match(made.errors.join(' '), /budget|cost/); return; }      // the validator refused it first: fine too
  const r = dataChecks(made.sprite);
  assert.ok(r.metrics.dataWork > 0.5, String(r.metrics.dataWork));
  assert.ok(r.warnings.some((w) => /work budget/.test(w)), r.warnings.join('\n'));
});

test('the quality runner adds the data checks to a data sprite\'s result', async () => {
  const bad = coinWith((d) => d.body.pictures.draw.splice(1, 0, STAMP([40, 40])));
  const root = dataProject({ data: { coin: bad, 'tuft-pot': tuftDef() }, pieces: true });
  const { results } = await runQuality({ root, sprites: undefined, sounds: [], workers: 2 });
  const coin = results.find((r) => r.id === 'coin'), tuft = results.find((r) => r.id === 'tuft-pot');
  assert.equal(coin.ok, false);
  assert.equal(coin.errors.filter((e) => /wholly outside/.test(e)).length, 1, `once, not twice: ${coin.errors.join('\n')}`);
  assert.equal(tuft.ok, true, tuft.errors.join('\n'));
  assert.ok(tuft.metrics.dataWork > 0);
});

// ---- review round 3, issue 1: 'slot never painted' must see every way a slot is painted --------------------------
// It used to count only the plain slot names in a frame's draw list, so a slot that feeds a derived slot, one painted
// through a colour rule or a piece's colour map, and one painted only when two choices move together were all false
// errors, and the design's own first-slice redraws (coin, crate) failed the bar.
const FIX = new URL('../fixtures/v2/pictures/', import.meta.url);
const fixture = (id) => JSON.parse(fs.readFileSync(new URL(`${id}.json`, FIX), 'utf8'));
const neverPainted = (r) => [...r.errors, ...r.warnings].filter((m) => /never painted|not seen painted/.test(m));
const RIM = { id: 'rim', label: 'Rim', default: '#884422', material: 'metal' };
const DOT = (paint, extra = {}) => ({ kind: 'ellipse', on: 'coin', at: [0, 0], r: [2, 2], paint, ...extra });

test('the first slice (tests/fixtures/v2/pictures: coin, crate, icons-food) passes the data checks and checkSprite: no slot flagged', () => {
  for (const id of ['coin', 'crate', 'icons-food']) {
    const s = make(fixture(id));
    const r = dataChecks(s);
    assert.deepEqual(r.errors, [], id);
    assert.deepEqual(neverPainted(r), [], id);
    assert.ok(r.metrics.dataLists > 0 && r.metrics.dataLists <= MAX_LISTS, `${id}: ${r.metrics.dataLists}`);
    // icons-food is searched completely (every combination, sliders included, every frame), so "no error" there is not a
    // downgrade to a warning; coin and crate have too many combinations once their sliders are in them (review round 4)
    if (id === 'icons-food') assert.equal(r.metrics.dataComplete, true, id);
    assert.deepEqual(checkSprite(s).errors, [], id);
  }
});

test('slot never painted: a slot read only by a painted derived slot (palette derive) is painted', () => {
  const r = dataChecks(make(coinWith((d) => {
    d.palette.push(RIM, { id: 'rim-dark', material: 'metal', derive: { rule: 'tone', of: 'rim', by: -0.3 } });
    d.body.pictures.draw.splice(1, 0, DOT('rim-dark'));
  })));
  assert.deepEqual(neverPainted(r), []);
  assert.deepEqual(r.errors, []);
});

test('slot never painted: a slot painted only through a colour rule in a paint is painted', () => {
  const r = dataChecks(make(coinWith((d) => {
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, DOT({ rule: 'tone', of: 'rim', by: 0.2 }));
  })));
  assert.deepEqual(neverPainted(r), []);
  assert.deepEqual(r.errors, []);
});

test('slot never painted: a slot painted only through a piece\'s colour map, as a tone, is painted', async () => {
  const d = tuftDef();
  d.body.pictures.draw[1].paint = { hair: 'hair.dark' };
  const root = dataProject({ data: { 'tuft-pot': d }, pieces: true });
  // drawn by the scratch project's own engine (with its pieces/), so checked by its own copy of the data checks
  const { loadDataSprite } = await import('../../tools/lib/assets.mjs');
  const own = await import(new URL(`file://${root}/quality/data-checks.js`).href);
  const r = own.dataChecks(await loadDataSprite(root, `${root}/sprites/tuft-pot.json`));
  assert.ok(r.metrics.dataLists > 0, 'it was looked at');
  assert.deepEqual(neverPainted(r), []);
  assert.deepEqual(r.errors, []);
});

test('slot never painted: a slot painted only in a stamp\'s key or a band\'s stops is painted', () => {
  for (const prim of [
    { kind: 'stamp', on: 'coin', at: [-1, -1], rows: ['ab', 'ba'], key: { a: 'gold', b: 'rim.dark' } },
    { kind: 'bands', area: { kind: 'rect', at: [10, 10], size: [6, 6] }, stops: ['gold', 'rim'] }]) {
    const r = dataChecks(make(coinWith((d) => { d.palette.push(RIM); d.body.pictures.draw.splice(1, 0, prim); })));
    assert.deepEqual(neverPainted(r), [], prim.kind);
  }
});

test('slot never painted: a slot painted only when two choices both move is not flagged (choices are tried together)', () => {
  const r = dataChecks(make(coinWith((d) => {
    d.controls.splice(1, 0,
      { key: 'face', kind: 'choice', label: 'Face', options: ['plain', 'star', 'moon'], default: 'plain' },
      { key: 'metal', kind: 'choice', label: 'Metal', options: ['gold', 'silver', 'copper'], default: 'gold' });
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, DOT('rim', { when: { face: ['moon'], metal: ['copper'] } }));
  })));
  assert.deepEqual(neverPainted(r), []);
  assert.deepEqual(r.errors, []);
});

test('slot never painted: when every combination of the choices could not be tried, an unpainted slot is a warning, not an error', () => {
  const opts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const r = dataChecks(make(coinWith((d) => {
    for (const k of ['c1', 'c2', 'c3', 'c4']) {
      d.controls.splice(1, 0, { key: k, kind: 'choice', label: k, options: opts, default: 'a' });
      d.body.pictures.draw.splice(1, 0, DOT('gold', { when: { [k]: ['h'] } }));
    }
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, { gen: 'pickup.burst', v: 1, on: 'coin', at: [0, 0], amount: 0, paint: 'rim', bright: 'rim', core: 'rim' });
  })));
  assert.deepEqual(r.errors.filter((e) => /rim/.test(e)), []);
  assert.equal(neverPainted(r).length, 1, [...r.errors, ...r.warnings].join('\n'));
  assert.match(r.warnings.join('\n'), /slot "rim" is not seen painted/);
});

// ---- review round 3, issue 3: the work is bounded --------------------------------------------------------------
test('the data checks build at most MAX_LISTS frame lists, however many clips and settings a sprite has', () => {
  const opts = Array.from({ length: 24 }, (_, i) => `o${i}`);
  const d = coinWith((x) => {
    for (let k = 0; k < 6; k++) {
      x.controls.splice(1, 0, { key: `c${k}`, kind: 'choice', label: `C${k}`, options: opts, default: 'o0' });
      x.body.pictures.draw.splice(1, 0, DOT('gold', { when: { [`c${k}`]: ['o23'] } }));
    }
    for (let c = 0; c < 30; c++) x.clips[`clip${c}`] = { frames: 8, fps: 8, keys: [{ t: 0, root: [0, 0] }, { t: 1, root: [0, -1] }] };
  });
  const t0 = Date.now();
  const r = dataChecks(make(d));
  assert.ok(r.metrics.dataLists > 0 && r.metrics.dataLists <= MAX_LISTS, String(r.metrics.dataLists));
  assert.ok(Date.now() - t0 < 20_000, `${Date.now() - t0} ms`);
});

// ---- review round 4 (B9b), issues 1 and 2 -------------------------------------------------------------------------
// A slider moves a generator's argument through a binding, and only its end (or a turning point of its map) paints a
// slot, and only with a toggle moved too. The sliders used to be tried at their ends only with everything else at its
// default, yet the search still counted as complete, so this was a false 'never painted' ERROR.
const BURST = (amount, when) => ({ gen: 'pickup.burst', v: 1, on: 'coin', at: [0, 0], amount, paint: 'rim', bright: 'rim', core: 'rim', ...(when ? { when } : {}) });

test('slot never painted: a slot a slider paints only at its end, with a toggle moved too, is not flagged', () => {
  const r = dataChecks(make(coinWith((d) => {
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, BURST({ from: 'size', map: [[0, 0], [0.9, 0], [1, 1]] }, { sparkle: [false] }));
  })));
  assert.deepEqual(neverPainted(r), [], [...r.errors, ...r.warnings].join('\n'));
  assert.deepEqual(r.errors, []);
});

test('slot never painted: a slot a slider paints only at a turning point inside its map is not flagged', () => {
  const r = dataChecks(make(coinWith((d) => {
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, BURST({ from: 'size', map: [[0, 0], [0.3, 0.6], [0.4, 0], [1, 0]] }, { sparkle: [false] }));
  })));
  assert.deepEqual(neverPainted(r), [], [...r.errors, ...r.warnings].join('\n'));
});

test('slot never painted: with the sliders in the combinations, an unpainted slot is still an error when the search was complete', () => {
  // the slider drives the burst, but its map is 0 everywhere: no setting paints rim
  const r = dataChecks(make(coinWith((d) => {
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, BURST({ from: 'size', map: [[0, 0], [1, 0]] }, { sparkle: [false] }));
  })));
  assert.equal(r.metrics.dataComplete, true);
  assert.equal(r.errors.length, 1, r.errors.join('\n'));
  assert.match(r.errors[0], /slot "rim" is never painted/);
  assert.match(r.errors[0], /every combination of the choices, toggles and sliders/);
});

test('slot never painted: a slot read only as the second slot of a colour rule (mix ... with) is painted', () => {
  const r = dataChecks(make(coinWith((d) => {
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, DOT({ rule: 'mix', of: 'gold', with: 'rim', amount: 0.5 }));
  })));
  assert.deepEqual(neverPainted(r), []);
  assert.deepEqual(r.errors, []);
});

// ---- review round 5 (B9b), issue 1: the discrete combinations are searched in full even when the sliders do not fit --
// With the sliders in the one product, crate's 3 x 3 x 2 x 4 x 3 = 216 combinations went over MAX_COMBOS, and the
// search fell straight to pairs: a slot painted only when three discrete controls are set together (style pot, bands
// off, stamp star) was never seen, and the author was told to take it out of the palette. The choices', toggles' and
// named values' own product (3 x 2 x 4 = 24) fits, so it is tried in full before the pairs with the sliders.
test('slot never painted: a slot crate paints only when three discrete controls are set together is seen (every discrete combination is tried)', () => {
  const d = fixture('crate');
  d.palette.push(RIM);
  d.body.pictures.draw.push({ kind: 'rect', on: 'crate', at: [-2, -10], size: [3, 3], paint: 'rim', when: { style: ['pot'], bands: [false], mark: ['star'] } });
  const r = dataChecks(make(d));
  assert.deepEqual(neverPainted(r), [], [...r.errors, ...r.warnings].join('\n'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.metrics.dataDiscrete, true, JSON.stringify(r.metrics));
  assert.equal(r.metrics.dataComplete, false);
});

test('the first slice: every discrete combination of coin, crate and icons-food is tried', () => {
  for (const id of ['coin', 'crate', 'icons-food']) assert.equal(dataChecks(make(fixture(id))).metrics.dataDiscrete, true, id);
});

test('slot never painted: when the discrete combinations do not fit either, the warning says pairs', () => {
  const d = fixture('crate');
  d.palette.push(RIM);
  d.body.pictures.draw.push({ kind: 'rect', on: 'crate', at: [-2, -10], size: [3, 3], paint: 'rim', when: { style: ['pot'], c1: ['f'], c2: ['f'] } });
  // two more 6-option choices make the discrete product 24 x 36 = 864, over MAX_COMBOS
  for (const k of ['c1', 'c2']) {
    d.controls.splice(1, 0, { key: k, kind: 'choice', label: k, options: ['a', 'b', 'c', 'd', 'e', 'f'], default: 'a' });
    d.body.pictures.draw.push({ kind: 'rect', on: 'crate', at: [0, -4], size: [1, 1], paint: 'wood', when: { [k]: ['f'] } });
  }
  const c = dataChecks(make(d));
  assert.equal(c.metrics.dataDiscrete, false);
  assert.equal(c.metrics.dataComplete, false);
  assert.deepEqual(c.errors.filter((e) => /rim/.test(e)), []);
  assert.match(c.warnings.join('\n'), /slot "rim" is not seen painted .*pairs/);
});

// ---- review round 5 (B9b), issue 3: a slider read without a map --------------------------------------------------
// A bare { from } hands the slider's raw value to a generator, where a threshold may sit anywhere inside the range, so
// trying the default and the ends cannot be a complete search: an unpainted slot is a warning, not an error.
test('slot never painted: a slider read through a bare { from } makes the search incomplete (a warning, not an error)', () => {
  const r = dataChecks(make(coinWith((d) => {
    d.palette.push(RIM);
    d.body.pictures.draw.splice(1, 0, { gen: 'pickup.burst', v: 1, on: 'coin', at: [0, 0], amount: { from: 'size' }, paint: 'gold', bright: 'gold', core: 'gold' });
    d.body.pictures.draw.splice(1, 0, BURST({ from: 'size', map: [[0, 0], [1, 0]] }, { sparkle: [false] }));
  })));
  assert.equal(r.metrics.dataComplete, false);
  assert.deepEqual(r.errors.filter((e) => /rim/.test(e)), [], r.errors.join('\n'));
  assert.match(r.warnings.join('\n'), /slot "rim" is not seen painted/);
});

// A { from, pick } on a slider cannot happen: the validator refuses it (a slider is bound with a map), so a pick has
// no turning points to find. Proved here, so the checks above need not handle it.
test('a slider bound with { from, pick } is refused by the validator', () => {
  const d = coinWith((x) => { x.palette.push(RIM); x.body.pictures.draw.splice(1, 0, BURST({ from: 'size', pick: { 0.25: 0.5 } }, { sparkle: [false] })); });
  const r = makeDataSprite(d, { strict: true });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /bound to the slider "size" with pick/);
});
