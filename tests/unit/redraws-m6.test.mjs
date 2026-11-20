// Migration batch M6 (docs/data-sprites.md sections 7 and 9): the side-view characters redrawn as data on
// base:person-side keep what their code sprites showed. Written for the batch's second review, whose side-by-side renders
// found looks the first redraw lost: a staff across the wizard's face, a skeleton that fell over instead of collapsing,
// a rogue that threw and tossed nothing, a bandit with its club held out stiff. Each sprite is held against its frozen
// code copy (tests/fixtures/code-sprites/, codeSprite) at its defaults, frame by frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, cleanParams, renderFrame, frameSockets } from '../../engine/sprite.js';
import { col, ramp, farRamp } from '../../engine/color.js';
import { librarySprite, codeSprite } from '../helpers/library.mjs';

const IDS = ['knight', 'wizard', 'spear-goblin', 'bone-soldier', 'rogue-battler', 'road-bandit'];
const DATA = Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await librarySprite(id)])));
const CODE = Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await codeSprite(id)])));
const look = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const frames = (s, clip) => Array.from({ length: s.clips[clip].frames }, (_, f) => f);
const tones = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep]; };
const pixelsOf = (g, hexes) => { const want = new Set(hexes.map((h) => col(h))); const out = []; for (let i = 0; i < g.data.length; i++) if (want.has(g.data[i])) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
/** How much of two frames' drawn pixels are drawn in both: the overlap over the union of their silhouettes. */
function overlap(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.data.length; i++) { const p = a.data[i] >>> 24 ? 1 : 0, q = b.data[i] >>> 24 ? 1 : 0; both += p & q; either += p | q; }
  return either ? both / either : 1;
}

test('the data file is the library sprite, and the code copy is there to compare it with', () => {
  for (const id of IDS) {
    assert.ok(DATA[id].definition, `${id}: the library sprite is a data file`);
    assert.deepEqual(Object.keys(DATA[id].clips), Object.keys(CODE[id].clips), `${id}: the same clips`);
  }
});

test('each keeps its code sprite\'s silhouette, frame by frame, at its defaults', () => {
  for (const id of IDS) {
    const s = DATA[id], c = CODE[id];
    let sum = 0, n = 0, low = 1, where = '';
    for (const clip of Object.keys(s.clips)) for (const f of frames(s, clip)) {
      const o = overlap(renderFrame(c, clip, f, look(c)), renderFrame(s, clip, f, look(s)));
      sum += o; n++;
      if (o < low) { low = o; where = `${clip} ${f}`; }
    }
    // the first redraw stood every one of them on the Hero's poses: 0.63 to 0.72 for five of the six, 0.05 at the worst frame
    assert.ok(sum / n >= 0.74, `${id}: the silhouettes overlap ${(sum / n).toFixed(2)} on average`);
    assert.ok(low >= 0.4, `${id}: ${where} overlaps the code's only ${low.toFixed(2)}`);
  }
});

test('Wizard: standing, the staff passes in front of the face, never across it', () => {
  for (const s of [CODE.wizard, DATA.wizard]) for (const over of [{}, { staff: 'crook' }, { height: 1, build: 1, head: 1 }, { height: 0, build: 0, head: 0 }]) {
    const p = look(s, over);
    for (const clip of ['idle', 'talk']) for (const f of frames(s, clip)) {
      const g = renderFrame(s, clip, f, p), head = frameSockets(s, clip, f, p).head, R = 5;
      // the face: from the top of the head down a head's height, from its middle to its front
      const wood = pixelsOf(g, tones('#8a5a34')).filter(([x, y]) => y > head.y + 2 && y < head.y + 2 * R && x < head.x + R - 0.5 && x > head.x - R);
      assert.ok(wood.length <= 1, `${s.definition ? 'data' : 'code'} ${clip} ${f} ${JSON.stringify(over)}: ${wood.length} pixels of the staff across the face`);
    }
  }
});

test('Skeleton: Collapse ends as a low heap of bones with the skull on top, as the code\'s does', () => {
  for (const over of [{}, { shield: 'none', weapon: 'none' }, { height: 1, thickness: 1, head: 1 }, { headgear: 'horned' }]) {
    const s = DATA['bone-soldier'], c = CODE['bone-soldier'], p = look(s, over), q = look(c, over);
    for (const f of [5, 6, 7]) {
      const b = renderFrame(s, 'die', f, p).bounds(), a = renderFrame(c, 'die', f, q).bounds();
      assert.ok(b.y1 - b.y0 <= a.y1 - a.y0 + 3, `die ${f} ${JSON.stringify(over)}: the heap is ${b.y1 - b.y0 + 1} px tall, the code's ${a.y1 - a.y0 + 1}`);
    }
    // the skull is the top of the heap: the highest bone-coloured pixels are near the heap's middle, not at an end
    const g = renderFrame(s, 'die', 7, p), box = g.bounds();
    const bone = pixelsOf(g, tones(p.body));
    const top = Math.min(...bone.map(([, y]) => y)), atTop = bone.filter(([, y]) => y === top).map(([x]) => x);
    const mid = atTop.reduce((m, x) => m + x, 0) / atTop.length;
    assert.ok(mid > box.x0 + 4 && mid < box.x1 - 4, `die 7 ${JSON.stringify(over)}: the top of the heap is at x ${mid.toFixed(1)}, in ${box.x0}..${box.x1}`);
  }
});

test('Rogue: the throw sends a knife out of the far hand and the victory tosses the dagger into the air', () => {
  const s = DATA['rogue-battler'], p = look(s), metal = [...tones('#c2c9d6'), '#ffffff'];
  // shoot frame 1: steel well in front of the far hand (the knife has left it)
  const off = frameSockets(s, 'shoot', 1, p).offhand, flying = pixelsOf(renderFrame(s, 'shoot', 1, p), metal).filter(([x]) => x > off.x + 4);
  assert.ok(flying.length >= 3, `shoot 1: ${flying.length} pixels of a knife in front of the far hand`);
  // victory: on some frame the dagger is high above the near hand, and it is back in the hand at the start
  const up = frames(s, 'victory').map((f) => { const h = frameSockets(s, 'victory', f, p).hand; return pixelsOf(renderFrame(s, 'victory', f, p), metal).filter(([, y]) => y < h.y - 9).length; });
  assert.ok(Math.max(...up) >= 4, `victory: no dagger in the air (${up.join(', ')})`);
  assert.equal(up[0], 0, 'victory 0: the dagger is in the hand');
  // daggers: one in each hand, the far one drawn at the far hand (in the far side's darker tones)
  const g = renderFrame(s, 'idle', 0, p), fh = frameSockets(s, 'idle', 0, p).offhand, far = farRamp('#c2c9d6');
  assert.ok(pixelsOf(g, [...metal, far.light, far.base, far.dark]).filter(([x, y]) => Math.hypot(x + 0.5 - fh.x, y + 0.5 - fh.y) < 6).length >= 3, 'idle: no dagger at the far hand');
});

test('Bandit: the club hangs low at rest, and the steal holds the coin bag up in the far hand', () => {
  const s = DATA['road-bandit'], c = CODE['road-bandit'], p = look(s), q = look(c);
  for (const f of frames(s, 'idle')) {
    const h = frameSockets(s, 'idle', f, p).hand, hc = frameSockets(c, 'idle', f, q).hand;
    assert.ok(Math.hypot(h.x - hc.x, h.y - hc.y) < 3, `idle ${f}: the club hand is at ${h.x.toFixed(1)},${h.y.toFixed(1)}, the code's at ${hc.x.toFixed(1)},${hc.y.toFixed(1)}`);
    // and the club points where the code's does (the first redraw held it out level, 0.9 of a radian off)
    assert.ok(Math.abs(h.angle - hc.angle) < 0.25, `idle ${f}: the club points at ${h.angle.toFixed(2)}, the code's at ${hc.angle.toFixed(2)}`);
  }
  const shown = frames(s, 'steal').filter((f) => {
    const o = frameSockets(s, 'steal', f, p).offhand;
    return pixelsOf(renderFrame(s, 'steal', f, p), tones('#e6c96a')).filter(([x, y]) => Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y) < 5).length >= 4;
  });
  assert.ok(shown.length >= 2 && shown.every((f) => f >= 4), `steal: the bag is shown in the far hand on frames ${shown.join(', ')}`);
});

// ---- the third review of M6: what a setting or a part shows, measured against the code copy ----------------------
/** Pixels that differ between two settings of one frame. */
const changed = (s, clip, f, a, b) => { const x = renderFrame(s, clip, f, look(s, a)), y = renderFrame(s, clip, f, look(s, b)); let n = 0; for (let i = 0; i < x.data.length; i++) if (x.data[i] !== y.data[i]) n++; return n; };
/** The data sprite changes at least `share` of the pixels the code sprite changes between two settings, frame by frame. */
function keepsChange(id, frames, a, b, share, what) {
  for (const [clip, f] of frames) {
    const c = changed(CODE[id], clip, f, a, b), d = changed(DATA[id], clip, f, a, b);
    assert.ok(c > 0, `${id} ${clip} ${f}: the code changes something for ${what}`);
    assert.ok(d >= share * c, `${id} ${clip} ${f}: ${what} changes ${d} pixels; the code changes ${c}`);
  }
}

test('Rogue: the long scarf streams out behind as the code\'s does, and Scarf and Length show it', () => {
  // the second redraw drew a stub under the arm: long vs none idle 0 36 of the code's 78, walk 20 of 72, run 11 of 62
  keepsChange('rogue-battler', [['idle', 0], ['walk', 0], ['run', 0], ['run', 2], ['victory', 2]], { scarf: 'long' }, { scarf: 'none' }, 0.6, 'Scarf long vs none');
  keepsChange('rogue-battler', [['idle', 0], ['walk', 0], ['run', 0]], { scarf: 'short' }, { scarf: 'none' }, 0.45, 'Scarf short vs none');
  keepsChange('rogue-battler', [['idle', 0], ['walk', 0], ['run', 0]], { scarfLength: 0.65 }, { scarfLength: 1.35 }, 0.6, 'Length short vs long');
  // and it streams: running, the cloth reaches further back from the neck than standing
  const reach = (clip) => { const s = DATA['rogue-battler'], p = look(s), g = renderFrame(s, clip, 0, p), n = renderFrame(s, clip, 0, look(s, { scarf: 'none' })); let far = 99; for (let i = 0; i < g.data.length; i++) if (g.data[i] !== n.data[i]) far = Math.min(far, i % g.w); return frameSockets(s, clip, 0, p).head.x - far; };
  assert.ok(reach('run') >= reach('idle') + 3, `the scarf streams back running (${reach('run')} px behind the head) more than standing (${reach('idle')})`);
});

test('Goblin: the three noses are the code\'s noses, the long one at full length', () => {
  // the second redraw's noses hardly differed: stub vs long 8 of the code's 24, stub vs hooked 23 of 40, long vs hooked 18 of 37
  for (const [a, b] of [['stub', 'long'], ['stub', 'hooked'], ['long', 'hooked']]) keepsChange('spear-goblin', [['idle', 0], ['walk', 2]], { nose: a }, { nose: b }, 0.75, `Nose ${a} vs ${b}`);
  // the long nose reaches as far in front of the face as the code's
  const tip = (s) => { const p = look(s, { nose: 'long' }), g = renderFrame(s, 'idle', 0, p), n = renderFrame(s, 'idle', 0, look(s, { nose: 'stub' })); let x = 0; for (let i = 0; i < g.data.length; i++) if (g.data[i] !== n.data[i] && g.data[i] >>> 24) x = Math.max(x, i % g.w); return x - frameSockets(s, 'idle', 0, p).head.x; };
  assert.ok(Math.abs(tip(DATA['spear-goblin']) - tip(CODE['spear-goblin'])) <= 1, `the long nose ends ${tip(DATA['spear-goblin'])} px in front of the head; the code's ${tip(CODE['spear-goblin'])}`);
});

test('Skeleton: the skull faces the viewer with two lit sockets, the blade is bright metal, and the collapse lets the sword fall forward', () => {
  const lit = (s, clip, f) => pixelsOf(renderFrame(s, clip, f, look(s)), tones('#4fd8ee'));
  for (const s of [CODE['bone-soldier'], DATA['bone-soldier']]) {
    // two sockets: the lit pixels make two groups a column apart (a profile has one)
    const xs = [...new Set(lit(s, 'idle', 0).map(([x]) => x))].sort((a, b) => a - b);
    const groups = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1).length;
    assert.equal(groups, 2, `${s.definition ? 'data' : 'code'}: the lit eye pixels make ${groups} groups (columns ${xs.join(', ')})`);
  }
  // the edge is the brightest metal: the code paints the blade with the metal's light tone and lighter
  const bright = (s, clip, f) => pixelsOf(renderFrame(s, clip, f, look(s)), [ramp('#a8806a').light]).length;
  for (const [clip, f] of [['idle', 0], ['walk', 2], ['attack', 3]]) assert.ok(bright(DATA['bone-soldier'], clip, f) >= 0.6 * bright(CODE['bone-soldier'], clip, f), `${clip} ${f}: ${bright(DATA['bone-soldier'], clip, f)} pixels of bright metal; the code ${bright(CODE['bone-soldier'], clip, f)}`);
  // let go in the collapse, the sword turns forward and down as the code's does, level by frame 3
  for (const f of [1, 2, 3]) {
    const a = frameSockets(CODE['bone-soldier'], 'die', f, look(CODE['bone-soldier'])).hand.angle, b = frameSockets(DATA['bone-soldier'], 'die', f, look(DATA['bone-soldier'])).hand.angle;
    assert.ok(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= 0.3, `die ${f}: the sword points ${b.toFixed(2)} rad; the code's ${a.toFixed(2)}`);
  }
});

test('Bandit: a band across the brow with the hair above, a short tunic over the trousers, a rope belt and a coin bag', () => {
  const B = 'road-bandit', count = (s, clip, f, hexes, below = -99) => { const p = look(s), h = frameSockets(s, clip, f, p).head; return pixelsOf(renderFrame(s, clip, f, p), hexes).filter(([, y]) => y >= h.y + below).length; };
  const against = (what, clip, f, hexes, share, below) => { const c = count(CODE[B], clip, f, hexes, below), d = count(DATA[B], clip, f, hexes, below); assert.ok(c > 0 && d >= share * c, `${clip} ${f}: ${d} pixels of ${what}; the code ${c}`); };
  const near = (what, clip, f, hexes, pred, slack) => { const n = (s) => { const p = look(s), h = frameSockets(s, clip, f, p).head; return pixelsOf(renderFrame(s, clip, f, p), hexes).filter(([x, y]) => pred(y - h.y)).length; }; const c = n(CODE[B]), d = n(DATA[B]); assert.ok(Math.abs(d - c) <= slack, `${clip} ${f}: ${d} pixels of ${what}; the code ${c}`); };
  // the bandana is a band, not a cap: the top of the head is hair, the cloth only across the brow (the second redraw: 39 of the code's 12)
  near('bandana cloth over the crown', 'idle', 0, tones('#8e3a4a'), (dy) => dy < 3, 4);
  // the tunic is short, over the trousers: as much cloth below the waist as the code's (the second redraw's long skirt: 81 of 51), its hem on the same row
  for (const [clip, f] of [['idle', 0], ['walk', 2]]) near('tunic below the waist', clip, f, tones('#8e3a4a'), (dy) => dy >= 16, 6);
  const hem = (s) => Math.max(...pixelsOf(renderFrame(s, 'idle', 0, look(s)), tones('#8e3a4a')).map(([, y]) => y));
  assert.ok(Math.abs(hem(DATA[B]) - hem(CODE[B])) <= 1, `the tunic's hem is on row ${hem(DATA[B])}; the code's on ${hem(CODE[B])}`);
  // the belt is a two-row rope across the waist (the mask is the same colour, so below the face only)
  against('rope belt', 'idle', 0, tones('#bfa068'), 0.6, 13);
  // the coin bag is a pouch, not a dot
  const bag = (s) => [4, 5, 6].reduce((n, f) => n + count(s, 'steal', f, tones('#e6c96a')), 0);
  assert.ok(bag(DATA[B]) >= 0.7 * bag(CODE[B]), `steal: ${bag(DATA[B])} pixels of coin bag; the code ${bag(CODE[B])}`);
});
